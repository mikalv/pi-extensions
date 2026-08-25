import { spawn } from "node:child_process";
import {
  type AgentDefinition,
  type ExecutionOptions,
  type RunRecord,
  type ToolCallRecord,
  createRunRecord,
} from "../types.js";
import type { AgentRunner, SpawnFunction, SpawnResult } from "./runner-interface.js";

export interface SubprocessRunnerOptions {
  binaryPath?: string;
  spawnFn?: SpawnFunction;
}

export interface ParsedStreamResult {
  output: string;
  turns: number;
  tokens: {
    input: number;
    output: number;
    cacheRead?: number;
    cacheWrite?: number;
    total: number;
  };
  toolCalls?: ToolCallRecord[];
  verdict?: string;
  error?: string;
}

export class SubprocessRunner implements AgentRunner {
  readonly runtime = "pi-subprocess" as const;
  private binaryPath: string;
  private spawnFn?: SpawnFunction;

  constructor(options?: SubprocessRunnerOptions) {
    this.binaryPath = options?.binaryPath ?? "pi";
    this.spawnFn = options?.spawnFn;
  }

  requiresWorktree(
    agent: AgentDefinition,
    options: ExecutionOptions
  ): boolean {
    if (options.worktree !== undefined) {
      return Boolean(options.worktree);
    }
    return Boolean(agent.worktree);
  }

  buildArgs(
    agent: AgentDefinition,
    options: ExecutionOptions
  ): string[] {
    const args: string[] = ["--mode", "json"];

    const model = options.model ?? agent.model;
    if (model) {
      args.push("--models", model);
    }

    const thinking = options.thinking ?? agent.thinking;
    if (thinking !== undefined) {
      args.push("--thinking", String(thinking));
    }

    const tools = options.tools ?? agent.tools;
    if (tools && tools.length > 0) {
      args.push("--tools", tools.join(","));
    }

    if (agent.systemPrompt) {
      args.push("--append-system-prompt", agent.systemPrompt);
    }

    args.push("-p", options.prompt);
    return args;
  }

  buildEnv(
    agent: AgentDefinition,
    options: ExecutionOptions
  ): Record<string, string> {
    const depth = options.depth ?? 0;
    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      PI_SUBAGENT: "1",
      PI_SUBAGENT_DEPTH: String(depth),
      PI_RECURSION_DEPTH_HEADER: `Depth: ${depth}/10`,
      ...(options.env ?? {}),
    };

    if (options.parentRunId) {
      env.PI_PARENT_RUN_ID = options.parentRunId;
    }

    if (agent.name) {
      env.PI_AGENT_NAME = agent.name;
    }

    return env;
  }

  parseStreamOutput(
    raw: string,
    onEvent?: (ev: unknown) => void
  ): ParsedStreamResult {
    const lines = raw.split("\n");
    let output = "";
    let turns = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let cacheRead = 0;
    let cacheWrite = 0;
    const toolCalls: ToolCallRecord[] = [];
    let isStructured = false;
    let error: string | undefined;
    let verdict: string | undefined;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const ev = JSON.parse(trimmed) as Record<string, unknown>;
        isStructured = true;
        onEvent?.(ev);

        if (ev.type === "turn_start" || ev.type === "turn") {
          turns = typeof ev.turn === "number" ? ev.turn : turns + 1;
        } else if (ev.type === "message" || ev.type === "assistant") {
          const content = typeof ev.content === "string" ? ev.content : "";
          if (content) {
            output = content;
          }
        } else if (ev.type === "tool_call" || ev.type === "tool") {
          toolCalls.push({
            tool: String(ev.tool ?? "unknown"),
            args: ev.args,
            result: ev.result,
            timestamp: Date.now(),
          });
        } else if (ev.type === "done" || ev.type === "finish") {
          if (typeof ev.output === "string") {
            output = ev.output;
          }
          if (typeof ev.turns === "number") {
            turns = ev.turns;
          }
          if (ev.usage && typeof ev.usage === "object") {
            const u = ev.usage as Record<string, unknown>;
            inputTokens = typeof u.input === "number" ? u.input : typeof u.input_tokens === "number" ? u.input_tokens : inputTokens;
            outputTokens = typeof u.output === "number" ? u.output : typeof u.output_tokens === "number" ? u.output_tokens : outputTokens;
            cacheRead = typeof u.cacheRead === "number" ? u.cacheRead : cacheRead;
            cacheWrite = typeof u.cacheWrite === "number" ? u.cacheWrite : cacheWrite;
          }
          if (typeof ev.verdict === "string") {
            verdict = ev.verdict;
          }
        } else if (ev.type === "error") {
          error = String(ev.message ?? ev.error ?? "Subprocess error");
        }
      } catch {
        // Plain text line
        if (!isStructured) {
          output = output ? `${output}\n${line}` : line;
        }
      }
    }

    const total = inputTokens + outputTokens;
    return {
      output: output || raw.trim(),
      turns: Math.max(1, turns),
      tokens: {
        input: inputTokens,
        output: outputTokens,
        cacheRead,
        cacheWrite,
        total: total || Math.ceil((output.length || raw.length) / 4),
      },
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      verdict,
      error,
    };
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

      let timeoutId: NodeJS.Timeout | undefined;
      if (options?.timeout && options.timeout > 0) {
        timeoutId = setTimeout(() => {
          try {
            proc.kill("SIGKILL");
          } catch {
            // ignore
          }
          reject(new Error(`Execution timed out after ${options.timeout}ms`));
        }, options.timeout);
      }

      proc.on("error", (err) => {
        if (timeoutId) clearTimeout(timeoutId);
        reject(err);
      });

      proc.on("close", (code) => {
        if (timeoutId) clearTimeout(timeoutId);
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
      runtime: "pi-subprocess",
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
    const env = this.buildEnv(agent, options);
    const spawnExecutor = this.spawnFn ?? this.defaultSpawn.bind(this);

    try {
      onUpdate?.(`Spawning ${this.binaryPath} (${agent.name})...`);

      const spawnRes = await spawnExecutor(this.binaryPath, args, {
        cwd: options.cwd,
        env,
        signal: activeSignal,
        timeout: options.timeout ?? agent.timeout,
      });

      record.exitCode = spawnRes.exitCode;
      const parsed = this.parseStreamOutput(spawnRes.stdout, (ev) => {
        if (typeof ev === "object" && ev !== null) {
          const rec = ev as Record<string, unknown>;
          if (typeof rec.content === "string") {
            onUpdate?.(rec.content);
          }
        }
      });

      record.output = parsed.output;
      record.turns = parsed.turns;
      record.tokens = parsed.tokens;
      record.toolCalls = parsed.toolCalls;
      record.verdict = parsed.verdict;

      if (spawnRes.exitCode !== 0 || parsed.error) {
        record.status = "failed";
        record.error =
          parsed.error ??
          spawnRes.stderr.trim() ??
          `Subprocess exited with code ${spawnRes.exitCode}`;
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
