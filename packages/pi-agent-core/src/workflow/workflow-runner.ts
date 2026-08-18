import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { ControlPlane, type ControlPlaneOptions } from "../control/control-plane.js";
import {
  createWorkflowResult,
  type RunRecord,
  type WorkflowMeta,
  type WorkflowPhase,
  type WorkflowResult,
} from "../types.js";
import { ScriptLinter } from "./script-linter.js";
import { WorkerRuntime, type WorkflowRuntimeContext } from "./worker-runtime.js";

export interface WorkflowRunnerOptions {
  controlPlane?: ControlPlane | ControlPlaneOptions;
  defaultTimeoutMs?: number;
}

export interface WorkflowRunOptions {
  name?: string;
  description?: string;
  phases?: string[];
  cwd?: string;
  initialState?: Record<string, unknown>;
  timeoutMs?: number;
  signal?: AbortSignal;
  onPhaseChange?: (phase: WorkflowPhase) => void;
  onRunStart?: (record: RunRecord) => void;
  onRunComplete?: (record: RunRecord) => void;
}

/**
 * WorkflowRunner coordinates the end-to-end execution of JS multi-agent workflows,
 * managing script linting, phase lifecycles, concurrency, cancellation, and metrics.
 */
export class WorkflowRunner extends EventEmitter {
  public readonly controlPlane: ControlPlane;
  public readonly defaultTimeoutMs: number;

  constructor(options?: WorkflowRunnerOptions) {
    super();

    if (options?.controlPlane instanceof ControlPlane) {
      this.controlPlane = options.controlPlane;
    } else {
      this.controlPlane = new ControlPlane(options?.controlPlane);
    }

    this.defaultTimeoutMs = options?.defaultTimeoutMs ?? 600_000; // 10 minutes default for multi-phase workflows
  }

  /**
   * Run a workflow script string.
   */
  public async runScript(
    scriptText: string,
    options?: WorkflowRunOptions
  ): Promise<WorkflowResult> {
    const linterResult = ScriptLinter.validate(scriptText);

    const meta: WorkflowMeta = {
      name:
        options?.name ??
        linterResult.meta?.name ??
        `workflow_${Date.now().toString(36)}`,
      description:
        options?.description ?? linterResult.meta?.description,
      phases:
        options?.phases ?? linterResult.meta?.phases ?? [],
    };

    const result = createWorkflowResult(meta);

    if (!linterResult.valid) {
      result.status = "failed";
      result.error = `Script linting failed:\n${linterResult.errors.join("\n")}`;
      result.completedAt = Date.now();
      result.durationMs = result.completedAt - result.startedAt;
      this.emit("workflow:error", result, new Error(result.error));
      return result;
    }

    const abortController = new AbortController();
    let isTimedOut = false;
    const timeoutMs = options?.timeoutMs ?? this.defaultTimeoutMs;

    // Attach caller's signal if provided
    let callerAbortListener: (() => void) | undefined;
    if (options?.signal) {
      if (options.signal.aborted) {
        abortController.abort();
      } else {
        callerAbortListener = () => abortController.abort();
        options.signal.addEventListener("abort", callerAbortListener, { once: true });
      }
    }

    // Set timeout timer
    let timer: NodeJS.Timeout | undefined;
    if (timeoutMs > 0 && timeoutMs < Number.POSITIVE_INFINITY) {
      timer = setTimeout(() => {
        isTimedOut = true;
        abortController.abort();
      }, timeoutMs);
    }

    const context: WorkflowRuntimeContext = {
      controlPlane: this.controlPlane,
      result,
      signal: abortController.signal,
      cwd: options?.cwd,
      state: options?.initialState ? { ...options.initialState } : {},
      logs: [],
      onPhaseChange: (phase) => {
        this.emit("phase:change", phase, result);
        options?.onPhaseChange?.(phase);
      },
      onRunStart: (record) => {
        this.emit("run:start", record, result);
        options?.onRunStart?.(record);
      },
      onRunComplete: (record) => {
        this.emit("run:complete", record, result);
        options?.onRunComplete?.(record);
      },
    };

    this.emit("workflow:start", result);

    try {
      const output = await WorkerRuntime.execute(scriptText, context);

      result.status = "completed";
      result.output = output;
      result.completedAt = Date.now();
      result.durationMs = result.completedAt - result.startedAt;

      this.emit("workflow:complete", result);
      return result;
    } catch (err: any) {
      result.completedAt = Date.now();
      result.durationMs = result.completedAt - result.startedAt;

      if (isTimedOut) {
        result.status = "failed";
        result.error = `Workflow timed out after ${timeoutMs}ms`;
      } else if (abortController.signal.aborted || options?.signal?.aborted) {
        result.status = "aborted";
        result.error = "Workflow execution aborted";
      } else {
        result.status = "failed";
        result.error = err?.message || String(err);
      }

      this.emit("workflow:error", result, err);
      return result;
    } finally {
      if (timer) clearTimeout(timer);
      if (options?.signal && callerAbortListener) {
        options.signal.removeEventListener("abort", callerAbortListener);
      }
    }
  }

  /**
   * Run a workflow script loaded from a file path.
   */
  public async runFile(
    filePath: string,
    options?: WorkflowRunOptions
  ): Promise<WorkflowResult> {
    const content = await readFile(filePath, "utf-8");
    const name = options?.name; // allow script meta to take precedence if options.name is not explicitly passed
    return this.runScript(content, { ...options, name });
  }
}

/**
 * Convenience helper to run a workflow script.
 */
export async function runWorkflow(
  script: string,
  options?: WorkflowRunOptions & { controlPlane?: ControlPlane }
): Promise<WorkflowResult> {
  const runner = new WorkflowRunner({ controlPlane: options?.controlPlane });
  return runner.runScript(script, options);
}
