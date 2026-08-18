import { EventEmitter } from "node:events";
import { createRuntimeRunner } from "../runtimes/runtime-factory.js";
import type { AgentRunner } from "../runtimes/runner-interface.js";
import {
  createRunRecord,
  DEFAULT_SUBAGENT_TIMEOUT_MS,
  MAX_RECURSION_DEPTH,
  validateAgentDefinition,
  validateExecutionOptions,
  type AgentDefinition,
  type ExecutionOptions,
  type RunRecord,
  type RunUpdate,
} from "../types.js";
import { ConcurrencyPool, type ConcurrencyPoolOptions } from "./concurrency-pool.js";
import { ReplayCache, type ReplayCacheOptions } from "./replay-cache.js";
import { RunLifecycle } from "./state-machine.js";
import { SteeringManager } from "./steer-channel.js";

export interface ControlPlaneOptions {
  concurrencyPool?: ConcurrencyPool | ConcurrencyPoolOptions;
  steeringManager?: SteeringManager;
  replayCache?: ReplayCache | ReplayCacheOptions;
  enableReplayCache?: boolean;
  runnerResolver?: (agent: AgentDefinition) => AgentRunner;
  defaultTimeoutMs?: number;
}

interface ActiveRunEntry {
  id: string;
  record: RunRecord;
  lifecycle: RunLifecycle;
  runner: AgentRunner;
  abortController: AbortController;
  options: ExecutionOptions;
  startedAt: number;
}

export class ControlPlane extends EventEmitter {
  public readonly pool: ConcurrencyPool;
  public readonly steering: SteeringManager;
  public readonly replayCache: ReplayCache;
  public readonly enableReplayCache: boolean;
  private readonly runnerResolver: (agent: AgentDefinition) => AgentRunner;
  private readonly defaultTimeoutMs: number;

  private activeRuns = new Map<string, ActiveRunEntry>();
  private allRuns = new Map<string, RunRecord>();

  constructor(options?: ControlPlaneOptions) {
    super();

    if (options?.concurrencyPool instanceof ConcurrencyPool) {
      this.pool = options.concurrencyPool;
    } else {
      this.pool = new ConcurrencyPool(options?.concurrencyPool);
    }

    this.steering = options?.steeringManager ?? new SteeringManager();

    if (options?.replayCache instanceof ReplayCache) {
      this.replayCache = options.replayCache;
    } else {
      this.replayCache = new ReplayCache(options?.replayCache);
    }

    this.enableReplayCache = Boolean(options?.enableReplayCache);
    this.runnerResolver = options?.runnerResolver ?? createRuntimeRunner;
    this.defaultTimeoutMs =
      options?.defaultTimeoutMs ?? DEFAULT_SUBAGENT_TIMEOUT_MS;
  }

  /**
   * Dispatch an agent execution through the control plane.
   */
  public async dispatch(
    rawOptions: ExecutionOptions,
    customAgentDef?: AgentDefinition
  ): Promise<RunRecord> {
    const valOptions = validateExecutionOptions(rawOptions);
    if (!valOptions.valid || !valOptions.options) {
      throw new Error(
        `Invalid execution options: ${valOptions.errors.join("; ")}`
      );
    }
    const options = valOptions.options;

    // Check recursion depth guardrail
    const depth = options.depth ?? 0;
    if (depth > MAX_RECURSION_DEPTH) {
      throw new Error(
        `Exceeded max recursion depth of ${MAX_RECURSION_DEPTH} (requested depth: ${depth}). Prevented delegation cycle.`
      );
    }

    // Resolve AgentDefinition
    let agentDef: AgentDefinition;
    if (customAgentDef) {
      agentDef = customAgentDef;
    } else if (typeof options.agent === "object") {
      agentDef = options.agent;
    } else {
      agentDef = {
        name: options.agent,
        description: `Subagent ${options.agent}`,
        runtime: options.runtime ?? "pi-inprocess",
        model: options.model,
        thinking: options.thinking,
        tools: options.tools,
        turnBudget: options.turnBudget,
        timeout: options.timeout,
      };
    }

    const valAgent = validateAgentDefinition(agentDef);
    if (!valAgent.valid || !valAgent.agent) {
      throw new Error(`Invalid agent definition: ${valAgent.errors.join("; ")}`);
    }
    const validatedAgent = valAgent.agent;

    // Check Replay Cache for idempotency / recovery
    const replayKey =
      options.replayKey ??
      (this.enableReplayCache
        ? this.replayCache.computeKey(validatedAgent.name, options.prompt, {
            model: validatedAgent.model,
            runtime: validatedAgent.runtime,
          })
        : undefined);

    if (replayKey) {
      const cached = this.replayCache.get(replayKey);
      if (cached && cached.status === "completed") {
        this.emit("cache_hit", { replayKey, runId: cached.id });
        return cached;
      }
    }

    // Initialize RunRecord and Lifecycle
    const initialRecord = createRunRecord({
      agent: validatedAgent.name,
      prompt: options.prompt,
      runtime: validatedAgent.runtime,
      depth,
      parentRunId: options.parentRunId,
      turnBudget: validatedAgent.turnBudget ?? options.turnBudget,
      replayKey,
    });

    const lifecycle = new RunLifecycle(initialRecord);
    const runner = this.runnerResolver(validatedAgent);

    const abortController = new AbortController();
    if (options.signal) {
      options.signal.addEventListener("abort", () => {
        abortController.abort(options.signal?.reason);
      });
    }

    const runEntry: ActiveRunEntry = {
      id: initialRecord.id,
      record: initialRecord,
      lifecycle,
      runner,
      abortController,
      options,
      startedAt: Date.now(),
    };

    this.activeRuns.set(initialRecord.id, runEntry);
    this.allRuns.set(initialRecord.id, initialRecord);

    this.emit("run_started", {
      runId: initialRecord.id,
      agent: validatedAgent.name,
      prompt: options.prompt,
      depth,
    });
    this.emit("run:start", {
      runId: initialRecord.id,
      agent: validatedAgent.name,
      prompt: options.prompt,
      depth,
    });

    const timeoutMs = options.timeout ?? this.defaultTimeoutMs;
    let timeoutTimer: ReturnType<typeof setTimeout> | undefined;

    return this.pool.run(async () => {
      try {
        lifecycle.start();

        if (timeoutMs > 0) {
          timeoutTimer = setTimeout(() => {
            abortController.abort(
              new Error(`Subagent timed out after ${timeoutMs}ms`)
            );
            lifecycle.timeout(timeoutMs);
          }, timeoutMs);
        }

        const handleProgressUpdate = (chunk: string) => {
          this.emit("run_update", {
            runId: initialRecord.id,
            chunk,
          });
          this.emit("run:update", {
            runId: initialRecord.id,
            chunk,
          });

          if (options.onUpdate) {
            const update: RunUpdate = {
              runId: initialRecord.id,
              status: lifecycle.status,
              turns: lifecycle.record.turns,
              lastMessage: chunk,
              tokens: lifecycle.record.tokens,
            };
            options.onUpdate(update);
          }
        };

        const resultRecord = await runner.execute(
          validatedAgent,
          options,
          abortController.signal,
          handleProgressUpdate
        );

        if (lifecycle.state !== "DONE") {
          if (resultRecord.status === "completed") {
            lifecycle.complete({
              output: resultRecord.output,
              turns: resultRecord.turns,
              tokens: resultRecord.tokens,
              verdict: resultRecord.verdict,
              diff: resultRecord.diff,
              artifacts: resultRecord.artifacts,
            });
          } else if (resultRecord.status === "aborted") {
            lifecycle.abort(resultRecord.error);
          } else if (resultRecord.status === "failed") {
            lifecycle.fail(resultRecord.error || "Execution failed", resultRecord.exitCode ?? 1);
          } else if (resultRecord.status === "time_limited") {
            lifecycle.timeout(timeoutMs);
          } else if (resultRecord.status === "budget_limited") {
            lifecycle.budgetExceeded(resultRecord.turns);
          } else {
            lifecycle.complete({ output: resultRecord.output });
          }
        }

        if (replayKey && lifecycle.status === "completed") {
          this.replayCache.set(replayKey, lifecycle.record);
        }

        this.emit("run_completed", lifecycle.record);
        this.emit("run:complete", lifecycle.record);
        return lifecycle.record;
      } catch (err: unknown) {
        if (lifecycle.state !== "DONE") {
          const errorMsg =
            err instanceof Error ? err.message : String(err);
          if (
            abortController.signal.aborted ||
            errorMsg.toLowerCase().includes("aborted")
          ) {
            lifecycle.abort(errorMsg);
            this.emit("run_aborted", lifecycle.record);
          } else {
            lifecycle.fail(errorMsg);
            this.emit("run_failed", lifecycle.record);
          }
        }
        return lifecycle.record;
      } finally {
        if (timeoutTimer) {
          clearTimeout(timeoutTimer);
        }
        this.activeRuns.delete(initialRecord.id);
        this.steering.clear(initialRecord.id);
        this.allRuns.set(initialRecord.id, lifecycle.record);
        this.emit("run_finished", lifecycle.record);
        this.emit("run:done", lifecycle.record);
      }
    }, abortController.signal);
  }

  /**
   * Abort an active run by runId.
   */
  public abort(runId: string, reason = "Terminated by user"): boolean {
    const entry = this.activeRuns.get(runId);
    if (!entry) {
      return false;
    }

    entry.abortController.abort(new Error(reason));
    if (entry.lifecycle.state !== "DONE") {
      entry.lifecycle.abort(reason);
    }
    return true;
  }

  /**
   * Inject live steering message into running subagent.
   */
  public steer(runId: string, message: string): boolean {
    return this.steering.steer(runId, message);
  }

  /**
   * Get pending steering messages for run.
   */
  public getPendingSteering(runId: string): string[] {
    return this.steering.getPending(runId);
  }

  /**
   * Consume pending steering messages for run.
   */
  public consumeSteering(runId: string): string[] {
    return this.steering.consume(runId);
  }

  /**
   * Get single run record by ID (active or completed).
   */
  public getRun(runId: string): RunRecord | undefined {
    return this.allRuns.get(runId) ?? this.activeRuns.get(runId)?.record;
  }

  /**
   * List all currently running subagent records.
   */
  public listActiveRuns(): RunRecord[] {
    return Array.from(this.activeRuns.values()).map((e) => e.record);
  }

  /**
   * Alias for listActiveRuns().
   */
  public getActiveRuns(): RunRecord[] {
    return this.listActiveRuns();
  }

  /**
   * List all tracked runs.
   */
  public listAllRuns(): RunRecord[] {
    return Array.from(this.allRuns.values());
  }

  /**
   * Return telemetry and control plane statistics.
   */
  public stats() {
    return {
      pool: this.pool.stats,
      activeCount: this.activeRuns.size,
      totalRuns: this.allRuns.size,
      cachedRuns: this.replayCache.size,
    };
  }
}
