import { EventEmitter } from "node:events";
import type {
  RunRecord,
  RunState,
  RunStatus,
  TokenUsage,
  ToolCallRecord,
} from "../types.js";

export interface StateChangeEvent {
  runId: string;
  previousState: RunState;
  previousStatus: RunStatus;
  state: RunState;
  status: RunStatus;
  record: RunRecord;
}

export interface ProgressUpdateEvent {
  runId: string;
  record: RunRecord;
  turns?: number;
  tokens?: TokenUsage;
  toolCall?: ToolCallRecord;
}

export class RunLifecycle extends EventEmitter {
  public readonly record: RunRecord;

  constructor(record: RunRecord) {
    super();
    this.record = record;
  }

  get state(): RunState {
    return this.record.state;
  }

  get status(): RunStatus {
    return this.record.status;
  }

  get id(): string {
    return this.record.id;
  }

  private ensureNotDone(action: string): void {
    if (this.record.state === "DONE") {
      throw new Error(
        `Cannot transition from DONE state (${this.record.status}) for action: ${action} on run ${this.record.id}`
      );
    }
  }

  private transition(newState: RunState, newStatus: RunStatus): void {
    const prevSta = this.record.state;
    const prevSt = this.record.status;

    this.record.state = newState;
    this.record.status = newStatus;

    if (newState === "DONE" && !this.record.completedAt) {
      this.record.completedAt = Date.now();
      this.record.durationMs = Math.max(
        0,
        this.record.completedAt - this.record.startedAt
      );
    }

    this.emit("status", newStatus);
    this.emit("stateChange", {
      runId: this.record.id,
      previousState: prevSta,
      previousStatus: prevSt,
      state: newState,
      status: newStatus,
      record: this.record,
    } satisfies StateChangeEvent);
  }

  /**
   * Transition PENDING -> RUNNING
   */
  public start(): RunRecord {
    this.ensureNotDone("start");
    if (!this.record.startedAt) {
      this.record.startedAt = Date.now();
    }
    this.transition("RUNNING", "running");
    return this.record;
  }

  /**
   * Update turns, tokens, tool calls or other progress metrics
   */
  public updateProgress(update: {
    turns?: number;
    tokens?: TokenUsage;
    toolCall?: ToolCallRecord;
    thought?: string;
    output?: string;
    lastLine?: string;
  }): RunRecord {
    if (update.turns !== undefined) {
      this.record.turns = update.turns;
    }
    if (update.tokens !== undefined) {
      this.record.tokens = update.tokens;
    }
    if (update.output !== undefined) {
      this.record.output = update.output;
    }
    if (update.thought !== undefined) {
      this.record.thought = update.thought;
    }
    if (update.lastLine !== undefined) {
      this.record.lastLine = update.lastLine;
    }
    if (update.toolCall) {
      if (!this.record.toolCalls) {
        this.record.toolCalls = [];
      }
      const calls = this.record.toolCalls;
      const open = calls.length > 0 ? calls[calls.length - 1] : undefined;
      // A runner reports tool start and tool end as two updates for the same
      // call; the end carries the result and must fill the open entry rather
      // than append a duplicate.
      if (
        update.toolCall.result !== undefined &&
        open !== undefined &&
        open.result === undefined &&
        open.tool === update.toolCall.tool
      ) {
        open.result = update.toolCall.result;
      } else {
        calls.push(update.toolCall);
      }
      this.record.lastToolName = update.toolCall.tool;
    }

    this.record.lastActivityAt = Date.now();

    this.emit("update", {
      runId: this.record.id,
      record: this.record,
      turns: update.turns,
      tokens: update.tokens,
      toolCall: update.toolCall,
    } satisfies ProgressUpdateEvent);

    return this.record;
  }

  /**
   * Adopt tool calls reported by a runner that only surfaces them at the end
   * of execution. Keeps whatever was already streamed live if it is richer.
   */
  public mergeToolCalls(toolCalls?: ToolCallRecord[]): void {
    if (!toolCalls || toolCalls.length === 0) return;
    if ((this.record.toolCalls?.length ?? 0) >= toolCalls.length) return;
    this.record.toolCalls = toolCalls;
    this.record.lastToolName = toolCalls[toolCalls.length - 1]?.tool;
  }

  /**
   * Transition to completed (DONE)
   */
  public complete(result?: {
    output?: string;
    turns?: number;
    tokens?: TokenUsage;
    verdict?: "PASS" | "FAIL" | "PARTIAL" | string;
    diff?: string;
    artifacts?: string[];
  }): RunRecord {
    this.ensureNotDone("complete");

    if (result?.output !== undefined) {
      this.record.output = result.output;
    }
    if (result?.turns !== undefined) {
      this.record.turns = result.turns;
    }
    if (result?.tokens !== undefined) {
      this.record.tokens = result.tokens;
    }
    if (result?.verdict !== undefined) {
      this.record.verdict = result.verdict;
    }
    if (result?.diff !== undefined) {
      this.record.diff = result.diff;
    }
    if (result?.artifacts !== undefined) {
      this.record.artifacts = result.artifacts;
    }

    this.transition("DONE", "completed");
    return this.record;
  }

  /**
   * Transition to failed (DONE)
   */
  public fail(error: string, exitCode = 1): RunRecord {
    this.ensureNotDone("fail");
    this.record.error = error;
    this.record.exitCode = exitCode;
    this.transition("DONE", "failed");
    return this.record;
  }

  /**
   * Transition to aborted (DONE)
   */
  public abort(reason = "Execution aborted"): RunRecord {
    this.ensureNotDone("abort");
    this.record.error = reason;
    this.transition("DONE", "aborted");
    return this.record;
  }

  /**
   * Transition to time_limited (DONE)
   */
  public timeout(timeoutMs: number): RunRecord {
    this.ensureNotDone("timeout");
    this.record.error = `Subagent execution timed out after ${timeoutMs}ms`;
    this.transition("DONE", "time_limited");
    return this.record;
  }

  /**
   * Transition to budget_limited (DONE)
   */
  public budgetExceeded(turns: number): RunRecord {
    this.ensureNotDone("budgetExceeded");
    this.record.turns = turns;
    this.record.error = `Turn budget of ${this.record.turnBudget} exceeded (reached ${turns} turns)`;
    this.transition("DONE", "budget_limited");
    return this.record;
  }
}
