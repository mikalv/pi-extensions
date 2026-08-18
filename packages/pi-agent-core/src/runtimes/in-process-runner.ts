import {
  type AgentDefinition,
  type ExecutionOptions,
  type RunRecord,
  type TokenUsage,
  createRunRecord,
} from "../types.js";
import type { AgentRunner } from "./runner-interface.js";

export interface InProcessExecutionResult {
  output: string;
  turns?: number;
  tokens?: Partial<TokenUsage>;
  verdict?: "PASS" | "FAIL" | "PARTIAL" | string;
  diff?: string;
  artifacts?: string[];
}

export type InProcessExecutor = (
  agent: AgentDefinition,
  options: ExecutionOptions,
  signal?: AbortSignal,
  onUpdate?: (chunk: string) => void
) => Promise<InProcessExecutionResult>;

export interface InProcessRunnerOptions {
  executor?: InProcessExecutor;
}

export class InProcessRunner implements AgentRunner {
  readonly runtime = "pi-inprocess" as const;
  private customExecutor?: InProcessExecutor;

  constructor(options?: InProcessRunnerOptions) {
    this.customExecutor = options?.executor;
  }

  async execute(
    agent: AgentDefinition,
    options: ExecutionOptions,
    signal?: AbortSignal,
    onUpdate?: (chunk: string) => void
  ): Promise<RunRecord> {
    const record = createRunRecord({
      agent: agent.name,
      prompt: options.prompt,
      runtime: "pi-inprocess",
      depth: options.depth ?? 0,
      parentRunId: options.parentRunId,
      turnBudget: options.turnBudget ?? agent.turnBudget,
      replayKey: options.replayKey,
    });

    const activeSignal = signal ?? options.signal;

    if (activeSignal?.aborted) {
      record.status = "aborted";
      record.state = "DONE";
      record.error = "Execution was aborted";
      record.completedAt = Date.now();
      record.durationMs = record.completedAt - record.startedAt;
      return record;
    }

    record.status = "running";
    record.state = "RUNNING";

    try {
      if (this.customExecutor) {
        const res = await this.customExecutor(
          agent,
          options,
          activeSignal,
          onUpdate
        );

        record.output = res.output;
        record.turns = res.turns ?? 1;
        if (res.tokens) {
          record.tokens = {
            input: res.tokens.input ?? 0,
            output: res.tokens.output ?? 0,
            cacheRead: res.tokens.cacheRead ?? 0,
            cacheWrite: res.tokens.cacheWrite ?? 0,
            total:
              res.tokens.total ??
              (res.tokens.input ?? 0) + (res.tokens.output ?? 0),
          };
        }
        record.verdict = res.verdict;
        record.diff = res.diff;
        record.artifacts = res.artifacts;
      } else {
        // Built-in lightweight in-process execution fallback
        const promptLines = [
          agent.systemPrompt ? `[SYSTEM: ${agent.systemPrompt}]` : null,
          `[AGENT: ${agent.name}]`,
          options.prompt,
        ]
          .filter(Boolean)
          .join("\n\n");

        onUpdate?.(`Executing ${agent.name} in-process...`);

        // Check cancellation before returning
        if (activeSignal?.aborted) {
          throw new DOMException("Execution was aborted", "AbortError");
        }

        record.output = `Executed ${agent.name} (in-process): Completed "${options.prompt.slice(0, 100)}"`;
        record.turns = 1;
        record.tokens = {
          input: Math.ceil(promptLines.length / 4),
          output: Math.ceil(record.output.length / 4),
          total:
            Math.ceil(promptLines.length / 4) +
            Math.ceil(record.output.length / 4),
        };
      }

      record.status = "completed";
      record.state = "DONE";
      record.completedAt = Date.now();
      record.durationMs = record.completedAt - record.startedAt;
    } catch (err: unknown) {
      record.state = "DONE";
      record.completedAt = Date.now();
      record.durationMs = record.completedAt - record.startedAt;

      const isAbort =
        (err instanceof DOMException && err.name === "AbortError") ||
        (err instanceof Error && err.message.toLowerCase().includes("abort")) ||
        activeSignal?.aborted;

      if (isAbort) {
        record.status = "aborted";
        record.error = "Execution was aborted";
      } else {
        record.status = "failed";
        record.error = err instanceof Error ? err.message : String(err);
      }
    }

    return record;
  }
}
