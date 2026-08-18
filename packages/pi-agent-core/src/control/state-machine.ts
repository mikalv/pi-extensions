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
    if (update.toolCall) {
      if (!this.record.toolCalls) {
        this.record.toolCalls = [];
      }
      this.record.toolCalls.push(update.toolCall);
    }

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
