import type {
  AgentDefinition,
  ExecutionOptions,
  RunRecord,
  RuntimeType,
} from "../types.js";

export interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type SpawnFunction = (
  cmd: string,
  args: string[],
  options?: {
    cwd?: string;
    env?: Record<string, string>;
    signal?: AbortSignal;
    timeout?: number;
  }
) => Promise<SpawnResult>;

export interface AgentRunner {
  readonly runtime: RuntimeType;
  execute(
    agent: AgentDefinition,
    options: ExecutionOptions,
    signal?: AbortSignal,
    onUpdate?: (chunk: string) => void
  ): Promise<RunRecord>;
}
