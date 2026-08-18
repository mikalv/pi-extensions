import { spawn } from "node:child_process";
import {
  type AgentDefinition,
  type ExecutionOptions,
  type RunRecord,
  createRunRecord,
} from "../types.js";
import type { AgentRunner, SpawnFunction, SpawnResult } from "./runner-interface.js";

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

      let output = spawnRes.stdout.trim();
      let inputTokens = 0;
      let outputTokens = 0;

      try {
        const json = JSON.parse(spawnRes.stdout) as Record<string, unknown>;
        if (typeof json.result === "string") {
          output = json.result;
        }
        if (json.usage && typeof json.usage === "object") {
          const u = json.usage as Record<string, unknown>;
          inputTokens = typeof u.input_tokens === "number" ? u.input_tokens : 0;
          outputTokens = typeof u.output_tokens === "number" ? u.output_tokens : 0;
        }
      } catch {
        // use raw output
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
