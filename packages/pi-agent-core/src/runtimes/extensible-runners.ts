import { spawn } from "node:child_process";
import {
  type AgentDefinition,
  type ExecutionOptions,
  type RunRecord,
  createRunRecord,
} from "../types.js";
import type { AgentRunner, SpawnFunction, SpawnResult } from "./runner-interface.js";

async function defaultCliSpawn(
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

export interface GenericCliRunnerOptions {
  binaryPath?: string;
  spawnFn?: SpawnFunction;
}

export class GeminiRunner implements AgentRunner {
  readonly runtime = "gemini" as const;
  private binaryPath: string;
  private spawnFn?: SpawnFunction;

  constructor(options?: GenericCliRunnerOptions) {
    this.binaryPath = options?.binaryPath ?? "gemini";
    this.spawnFn = options?.spawnFn;
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
      runtime: "gemini",
      depth: options.depth ?? 0,
      parentRunId: options.parentRunId,
      turnBudget: options.turnBudget ?? agent.turnBudget,
    });

    const activeSignal = signal ?? options.signal;
    if (activeSignal?.aborted) {
      record.status = "aborted";
      record.state = "DONE";
      record.error = "Execution was aborted";
      return record;
    }

    record.status = "running";
    record.state = "RUNNING";

    const spawnExecutor = this.spawnFn ?? defaultCliSpawn;
    try {
      onUpdate?.(`Spawning Gemini CLI (${agent.name})...`);
      const res = await spawnExecutor(this.binaryPath, ["-p", options.prompt], {
        cwd: options.cwd,
        env: { ...(process.env as Record<string, string>), ...(options.env ?? {}) },
        signal: activeSignal,
        timeout: options.timeout ?? agent.timeout,
      });

      record.exitCode = res.exitCode;
      record.output = res.stdout.trim();
      record.turns = 1;
      record.tokens = {
        input: Math.ceil(options.prompt.length / 4),
        output: Math.ceil(record.output.length / 4),
        total: Math.ceil((options.prompt.length + record.output.length) / 4),
      };
      record.status = res.exitCode === 0 ? "completed" : "failed";
      if (res.exitCode !== 0) {
        record.error = res.stderr.trim() || `Gemini exited with code ${res.exitCode}`;
      }
    } catch (err: unknown) {
      record.status = "failed";
      record.error = err instanceof Error ? err.message : String(err);
    } finally {
      record.state = "DONE";
      record.completedAt = Date.now();
      record.durationMs = record.completedAt - record.startedAt;
    }

    return record;
  }
}

export class CopilotRunner implements AgentRunner {
  readonly runtime = "copilot" as const;
  private binaryPath: string;
  private spawnFn?: SpawnFunction;

  constructor(options?: GenericCliRunnerOptions) {
    this.binaryPath = options?.binaryPath ?? "copilot";
    this.spawnFn = options?.spawnFn;
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
      runtime: "copilot",
      depth: options.depth ?? 0,
      parentRunId: options.parentRunId,
      turnBudget: options.turnBudget ?? agent.turnBudget,
    });

    const activeSignal = signal ?? options.signal;
    if (activeSignal?.aborted) {
      record.status = "aborted";
      record.state = "DONE";
      record.error = "Execution was aborted";
      return record;
    }

    record.status = "running";
    record.state = "RUNNING";

    const spawnExecutor = this.spawnFn ?? defaultCliSpawn;
    try {
      onUpdate?.(`Spawning Copilot CLI (${agent.name})...`);
      const res = await spawnExecutor(this.binaryPath, ["exec", options.prompt], {
        cwd: options.cwd,
        env: { ...(process.env as Record<string, string>), ...(options.env ?? {}) },
        signal: activeSignal,
        timeout: options.timeout ?? agent.timeout,
      });

      record.exitCode = res.exitCode;
      record.output = res.stdout.trim();
      record.turns = 1;
      record.tokens = {
        input: Math.ceil(options.prompt.length / 4),
        output: Math.ceil(record.output.length / 4),
        total: Math.ceil((options.prompt.length + record.output.length) / 4),
      };
      record.status = res.exitCode === 0 ? "completed" : "failed";
      if (res.exitCode !== 0) {
        record.error = res.stderr.trim() || `Copilot exited with code ${res.exitCode}`;
      }
    } catch (err: unknown) {
      record.status = "failed";
      record.error = err instanceof Error ? err.message : String(err);
    } finally {
      record.state = "DONE";
      record.completedAt = Date.now();
      record.durationMs = record.completedAt - record.startedAt;
    }

    return record;
  }
}

export type CustomRunnerHandler = (
  agent: AgentDefinition,
  options: ExecutionOptions,
  signal?: AbortSignal,
  onUpdate?: (chunk: string) => void
) => Promise<{
  output: string;
  turns?: number;
  tokens?: { input: number; output: number; total: number };
}>;

export class CustomRunner implements AgentRunner {
  readonly runtime = "custom" as const;
  private handler?: CustomRunnerHandler;

  constructor(options?: { handler?: CustomRunnerHandler }) {
    this.handler = options?.handler;
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
      runtime: "custom",
      depth: options.depth ?? 0,
      parentRunId: options.parentRunId,
      turnBudget: options.turnBudget ?? agent.turnBudget,
    });

    const activeSignal = signal ?? options.signal;
    if (activeSignal?.aborted) {
      record.status = "aborted";
      record.state = "DONE";
      record.error = "Execution was aborted";
      return record;
    }

    record.status = "running";
    record.state = "RUNNING";

    try {
      if (this.handler) {
        const res = await this.handler(agent, options, activeSignal, onUpdate);
        record.output = res.output;
        record.turns = res.turns ?? 1;
        record.tokens = res.tokens ?? {
          input: Math.ceil(options.prompt.length / 4),
          output: Math.ceil(res.output.length / 4),
          total: Math.ceil((options.prompt.length + res.output.length) / 4),
        };
      } else {
        record.output = `Custom runner executed: ${options.prompt}`;
        record.turns = 1;
        record.tokens = {
          input: Math.ceil(options.prompt.length / 4),
          output: Math.ceil(record.output.length / 4),
          total: Math.ceil((options.prompt.length + record.output.length) / 4),
        };
      }

      record.status = "completed";
    } catch (err: unknown) {
      record.status = "failed";
      record.error = err instanceof Error ? err.message : String(err);
    } finally {
      record.state = "DONE";
      record.completedAt = Date.now();
      record.durationMs = record.completedAt - record.startedAt;
    }

    return record;
  }
}
