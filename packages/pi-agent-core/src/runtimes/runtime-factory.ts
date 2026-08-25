import type { AgentDefinition, RuntimeType } from "../types.js";
import { ClaudeRunner } from "./claude-runner.js";
import { CodexRunner } from "./codex-runner.js";
import {
  CopilotRunner,
  CustomRunner,
  GeminiRunner,
} from "./extensible-runners.js";
import { InProcessRunner } from "./in-process-runner.js";
import type { AgentRunner } from "./runner-interface.js";
import { SubprocessRunner } from "./subprocess-runner.js";

const runnerRegistry = new Map<RuntimeType, AgentRunner>();

// Register default singleton instances
runnerRegistry.set("pi-inprocess", new InProcessRunner());
runnerRegistry.set("pi-subprocess", new SubprocessRunner());
runnerRegistry.set("claude", new ClaudeRunner());
runnerRegistry.set("codex", new CodexRunner());
runnerRegistry.set("gemini", new GeminiRunner());
runnerRegistry.set("copilot", new CopilotRunner());
runnerRegistry.set("custom", new CustomRunner());

export function registerRuntimeRunner(
  runtime: RuntimeType,
  runner: AgentRunner
): void {
  runnerRegistry.set(runtime, runner);
}

export function getRuntimeRunner(runtime: RuntimeType): AgentRunner {
  const runner = runnerRegistry.get(runtime);
  if (!runner) {
    // Fallback to in-process runner if runtime not explicitly registered
    return runnerRegistry.get("pi-inprocess") ?? new InProcessRunner();
  }
  return runner;
}

export function createRuntimeRunner(
  agent: AgentDefinition,
  options?: ExecutionOptions
): AgentRunner {
  const runtime = options?.runtime ?? agent.runtime ?? "pi-inprocess";
  return getRuntimeRunner(runtime);
}
