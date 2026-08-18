import { EventEmitter } from "node:events";
import type { ControlPlane } from "../control/control-plane.js";
import {
  createRunRecord,
  type ExecutionOptions,
  type RunRecord,
  type WorkflowMeta,
  type WorkflowPhase,
  type WorkflowResult,
} from "../types.js";

export interface WorkflowRuntimeContext {
  controlPlane: ControlPlane;
  result: WorkflowResult;
  signal?: AbortSignal;
  cwd?: string;
  state?: Record<string, unknown>;
  logs?: string[];
  onPhaseChange?: (phase: WorkflowPhase) => void;
  onRunStart?: (record: RunRecord) => void;
  onRunComplete?: (record: RunRecord) => void;
}

export type AgentTaskInput =
  | string
  | ExecutionOptions
  | ({
      agent: string;
      prompt?: string;
      task?: string;
      template?: (prevOutput: string) => string;
    } & Record<string, unknown>);

/**
 * WorkerRuntime provides the sandboxed execution environment and global orchestration
 * primitives (`agent`, `parallel`, `pipeline`, `phase`, `state`, `console`, `sleep`).
 */
export class WorkerRuntime extends EventEmitter {
  /**
   * Helper to normalize flexible agent task inputs into ExecutionOptions
   */
  public static normalizeAgentOptions(
    nameOrOptions: string | ExecutionOptions | Record<string, unknown>,
    taskOrOptions?: string | Partial<ExecutionOptions> | Record<string, unknown>,
    extraOptions?: Partial<ExecutionOptions>
  ): ExecutionOptions {
    if (typeof nameOrOptions === "object" && nameOrOptions !== null) {
      const obj = nameOrOptions as Record<string, unknown>;
      const prompt = (obj.prompt ?? obj.task ?? "") as string;
      const agent = (obj.agent ?? obj.name ?? "worker") as string;
      return {
        agent,
        prompt,
        ...obj,
        ...(extraOptions ?? {}),
      } as ExecutionOptions;
    }

    const agentName = String(nameOrOptions);

    if (typeof taskOrOptions === "string") {
      return {
        agent: agentName,
        prompt: taskOrOptions,
        ...(extraOptions ?? {}),
      };
    }

    if (typeof taskOrOptions === "object" && taskOrOptions !== null) {
      const obj = taskOrOptions as Record<string, unknown>;
      const prompt = (obj.prompt ?? obj.task ?? "") as string;
      return {
        agent: agentName,
        prompt,
        ...obj,
        ...(extraOptions ?? {}),
      } as ExecutionOptions;
    }

    return {
      agent: agentName,
      prompt: "",
      ...(extraOptions ?? {}),
    };
  }

  /**
   * Execute a workflow script inside the configured runtime context.
   */
  public static async execute(
    script: string,
    context: WorkflowRuntimeContext
  ): Promise<unknown> {
    const { controlPlane, result, signal, cwd } = context;
    const logs = context.logs ?? [];
    context.logs = logs;
    const state = context.state ?? {};
    context.state = state;

    let activePhaseName: string | undefined;

    // Helper to finish the currently active phase
    const finishActivePhase = (status: "completed" | "failed", error?: string) => {
      if (!activePhaseName) return;
      const current = result.phases.find((p) => p.name === activePhaseName);
      if (current && current.status === "running") {
        current.status = status;
        current.completedAt = Date.now();
        current.durationMs = current.startedAt
          ? current.completedAt - current.startedAt
          : 0;
        if (error) current.error = error;
        context.onPhaseChange?.(current);
      }
      activePhaseName = undefined;
    };

    // 1. Primitive: phase(name, fn?)
    const phase = async (
      name: string,
      fn?: () => Promise<unknown> | unknown
    ): Promise<unknown> => {
      if (signal?.aborted) {
        throw new Error("Workflow aborted");
      }

      // If switching to a new phase declaratively
      if (!fn) {
        finishActivePhase("completed");
        activePhaseName = name;

        let target = result.phases.find((p) => p.name === name);
        if (!target) {
          target = { name, status: "running", startedAt: Date.now() };
          result.phases.push(target);
        } else {
          target.status = "running";
          target.startedAt = Date.now();
        }
        context.onPhaseChange?.(target);
        return;
      }

      // Block-scoped phase execution: phase("name", async () => { ... })
      finishActivePhase("completed");
      activePhaseName = name;

      let target = result.phases.find((p) => p.name === name);
      if (!target) {
        target = { name, status: "running", startedAt: Date.now() };
        result.phases.push(target);
      } else {
        target.status = "running";
        target.startedAt = Date.now();
      }
      context.onPhaseChange?.(target);

      try {
        const out = await fn();
        target.status = "completed";
        target.completedAt = Date.now();
        target.durationMs = target.startedAt
          ? target.completedAt - target.startedAt
          : 0;
        activePhaseName = undefined;
        context.onPhaseChange?.(target);
        return out;
      } catch (err: any) {
        target.status = "failed";
        target.completedAt = Date.now();
        target.durationMs = target.startedAt
          ? target.completedAt - target.startedAt
          : 0;
        target.error = err?.message || String(err);
        activePhaseName = undefined;
        context.onPhaseChange?.(target);
        throw err;
      }
    };

    // 2. Primitive: agent(nameOrOptions, taskOrOptions, options)
    const agent = async (
      nameOrOptions: string | ExecutionOptions | Record<string, unknown>,
      taskOrOptions?: string | Partial<ExecutionOptions> | Record<string, unknown>,
      extraOptions?: Partial<ExecutionOptions>
    ): Promise<RunRecord> => {
      if (signal?.aborted) {
        throw new Error("Workflow aborted");
      }

      const execOptions = WorkerRuntime.normalizeAgentOptions(
        nameOrOptions,
        taskOrOptions,
        extraOptions
      );

      // Inherit workflow environment & signal
      if (!execOptions.signal && signal) {
        execOptions.signal = signal;
      }
      if (!execOptions.cwd && cwd) {
        execOptions.cwd = cwd;
      }

      const runRecord = await controlPlane.dispatch(execOptions);
      result.runs.push(runRecord);
      context.onRunComplete?.(runRecord);

      return runRecord;
    };

    // 3. Primitive: parallel(tasks)
    const parallel = async (tasks: AgentTaskInput[]): Promise<RunRecord[]> => {
      if (signal?.aborted) {
        throw new Error("Workflow aborted");
      }
      if (!Array.isArray(tasks) || tasks.length === 0) {
        return [];
      }

      return await Promise.all(
        tasks.map((task) => {
          const opts = WorkerRuntime.normalizeAgentOptions(task);
          return agent(opts);
        })
      );
    };

    // 4. Primitive: pipeline(tasks)
    const pipeline = async (tasks: AgentTaskInput[]): Promise<RunRecord[]> => {
      if (signal?.aborted) {
        throw new Error("Workflow aborted");
      }
      if (!Array.isArray(tasks) || tasks.length === 0) {
        return [];
      }

      const results: RunRecord[] = [];
      let previousOutput = "";

      for (const task of tasks) {
        if (signal?.aborted) {
          throw new Error("Workflow aborted");
        }

        let opts: ExecutionOptions;
        if (typeof task === "object" && task !== null && typeof (task as any).template === "function") {
          const raw = task as any;
          const prompt = raw.template(previousOutput);
          opts = WorkerRuntime.normalizeAgentOptions({ ...raw, prompt });
        } else {
          opts = WorkerRuntime.normalizeAgentOptions(task);
          if (opts.prompt.includes("{{prev}}") || opts.prompt.includes("{{output}}")) {
            opts.prompt = opts.prompt
              .replace(/\{\{prev\}\}/g, previousOutput)
              .replace(/\{\{output\}\}/g, previousOutput);
          }
        }

        const run = await agent(opts);
        results.push(run);
        previousOutput = run.output || "";
      }

      return results;
    };

    // 5. Primitive: sleep(ms)
    const sleep = (ms: number): Promise<void> => {
      return new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
          return reject(new Error("Workflow aborted"));
        }

        const timer = setTimeout(() => {
          signal?.removeEventListener("abort", onAbort);
          resolve();
        }, ms);

        const onAbort = () => {
          clearTimeout(timer);
          reject(new Error("Workflow aborted"));
        };

        signal?.addEventListener("abort", onAbort, { once: true });
      });
    };

    // 6. Primitive: custom console logger
    const customConsole = {
      log: (...args: unknown[]) => {
        const line = args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ");
        logs.push(`[LOG] ${line}`);
      },
      info: (...args: unknown[]) => {
        const line = args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ");
        logs.push(`[INFO] ${line}`);
      },
      warn: (...args: unknown[]) => {
        const line = args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ");
        logs.push(`[WARN] ${line}`);
      },
      error: (...args: unknown[]) => {
        const line = args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ");
        logs.push(`[ERROR] ${line}`);
      },
    };

    // 7. Primitives: steer & abort
    const steer = (runId: string, message: string) => {
      controlPlane.steer(runId, message);
    };

    const abort = (runId: string) => {
      return controlPlane.abort(runId);
    };

    try {
      // Build asynchronous function wrapper with injected globals
      const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
      const runnerFn = new AsyncFunction(
        "agent",
        "parallel",
        "pipeline",
        "phase",
        "state",
        "console",
        "sleep",
        "steer",
        "abort",
        `"use strict";\n${script}`
      );

      const workflowOutput = await runnerFn(
        agent,
        parallel,
        pipeline,
        phase,
        state,
        customConsole,
        sleep,
        steer,
        abort
      );

      finishActivePhase("completed");
      return workflowOutput;
    } catch (err: any) {
      finishActivePhase("failed", err?.message || String(err));
      throw err;
    }
  }
}
