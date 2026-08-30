import { spawn } from "node:child_process";
import {
  type AgentDefinition,
  type ExecutionOptions,
  type RunRecord,
  createRunRecord,
} from "../types.js";
import type { AgentRunner, SpawnFunction, SpawnResult } from "./runner-interface.js";

/** Count tool_permission_denial signals anywhere in the JSON envelope. */
export function countPermissionDenials(json: unknown): number {
  let count = 0;
  const visit = (node: unknown, depth: number) => {
    if (depth > 12 || node === null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (
        (key === "tool_permission_denials" || key === "permission_denials") &&
        Array.isArray(value)
      ) {
        count += value.length;
      } else {
        visit(value, depth + 1);
      }
    }
  };
  visit(json, 0);
  return count;
}

export interface ClaudeRunnerOptions {
  binaryPath?: string;
  spawnFn?: SpawnFunction;
}

export class ClaudeRunner implements AgentRunner {
  readonly runtime = "claude" as const;
  private binaryPath: string;
  private spawnFn?: SpawnFunction;

  constructor(options?: ClaudeRunnerOptions) {
    this.binaryPath = options?.binaryPath ?? "claude";
    this.spawnFn = options?.spawnFn;
  }

  buildArgs(
    agent: AgentDefinition,
    options: ExecutionOptions
  ): string[] {
    const args: string[] = ["-p", options.prompt, "--output-format", "json"];

    const model = options.model ?? agent.model;
    if (model) {
      args.push("--model", model);
    }

    if (agent.systemPrompt) {
      args.push("--append-system-prompt", agent.systemPrompt);
    }

    // Headless runs have no interactive permission dialog; default to
    // acceptEdits (allow reads, auto-accept edits) unless the agent opts out
    // via params.permissionMode (e.g. "default" or "plan").
    const permissionMode =
      (agent.params?.permissionMode as string | undefined) ??
      (options.env?.CLAUDE_PERMISSION_MODE as string | undefined) ??
      "acceptEdits";
    args.push("--permission-mode", permissionMode);

    return args;
  }

  private async defaultSpawn(
    cmd: string,
    args: string[],
    options?: {
      cwd?: string;
      env?: Record<string, string>;
      signal?: AbortSignal;
      timeout?: number;
    }
  ): Promise<SpawnResult> {
    return new Promise((resolve, reject) => {
      const proc = spawn(cmd, args, {
        cwd: options?.cwd,
        env: options?.env,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (d) => {
        stdout += d.toString();
      });

      proc.stderr.on("data", (d) => {
        stderr += d.toString();
      });

      const onAbort = () => {
        try {
          proc.kill("SIGTERM");
        } catch {
          // ignore
        }
        reject(new DOMException("Execution was aborted", "AbortError"));
      };

      if (options?.signal) {
        if (options.signal.aborted) {
          onAbort();
          return;
        }
        options.signal.addEventListener("abort", onAbort, { once: true });
      }

      proc.on("error", reject);
      proc.on("close", (code) => {
        if (options?.signal) {
          options.signal.removeEventListener("abort", onAbort);
        }
        resolve({
          stdout,
          stderr,
          exitCode: code ?? 0,
        });
      });
    });
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
      runtime: "claude",
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

    const args = this.buildArgs(agent, options);
    const spawnExecutor = this.spawnFn ?? this.defaultSpawn.bind(this);

    try {
      onUpdate?.(`Spawning Claude CLI (${agent.name})...`);

      const spawnRes = await spawnExecutor(this.binaryPath, args, {
        cwd: options.cwd,
        env: {
          ...(process.env as Record<string, string>),
          ...(options.env ?? {}),
        },
        signal: activeSignal,
        timeout: options.timeout ?? agent.timeout,
      });

      record.exitCode = spawnRes.exitCode;

      let output = "";
      let inputTokens = 0;
      let outputTokens = 0;
      let parsedJson = false;

      try {
        const json = JSON.parse(spawnRes.stdout) as Record<string, unknown>;
        parsedJson = true;
        if (typeof json.result === "string" && json.result.trim().length > 0) {
          output = json.result;
        } else {
          // JSON envelope without a usable result field: derive a readable
          // summary instead of dumping the raw session JSON as the report.
          const parts: string[] = [];
          if (typeof json.subtype === "string") parts.push(`subtype: ${json.subtype}`);
          if (typeof json.is_error === "boolean" && json.is_error) {
            parts.push("claude reported an error");
          }
          const denials = countPermissionDenials(json);
          if (denials > 0) {
            parts.push(`${denials} tool call(s) denied by permission mode`);
          }
          output =
            parts.length > 0
              ? `Claude run finished without a final report. ${parts.join("; ")}.`
              : "Claude run finished without a final report.";
        }
        if (json.usage && typeof json.usage === "object") {
          const u = json.usage as Record<string, unknown>;
          inputTokens = typeof u.input_tokens === "number" ? u.input_tokens : 0;
          outputTokens = typeof u.output_tokens === "number" ? u.output_tokens : 0;
        }
      } catch {
        output = spawnRes.stdout.trim();
      }
      if (spawnRes.exitCode !== 0 && !parsedJson) {
        output = spawnRes.stdout.trim();
      }

      record.output = output;
      record.turns = 1;
      record.tokens = {
        input: inputTokens,
        output: outputTokens,
        total: inputTokens + outputTokens || Math.ceil(output.length / 4),
      };

      if (spawnRes.exitCode !== 0) {
        record.status = "failed";
        record.error = spawnRes.stderr.trim() || `Claude exited with code ${spawnRes.exitCode}`;
      } else {
        record.status = "completed";
      }

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
