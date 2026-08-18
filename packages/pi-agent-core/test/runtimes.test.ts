import { describe, expect, it } from "bun:test";
import {
  type AgentDefinition,
  type ExecutionOptions,
  type RunRecord,
  type RuntimeType,
} from "../src/types.js";
import {
  ClaudeRunner,
  CodexRunner,
  CopilotRunner,
  CustomRunner,
  GeminiRunner,
  InProcessRunner,
  SubprocessRunner,
  createRuntimeRunner,
  getRuntimeRunner,
  registerRuntimeRunner,
} from "../src/runtimes/index.js";
import type { AgentRunner } from "../src/runtimes/runner-interface.js";

describe("Pluggable Runtime Adapters", () => {
  const baseAgent: AgentDefinition = {
    name: "test-agent",
    description: "A test agent for runtime verification",
    runtime: "pi-inprocess",
    turnBudget: 10,
    systemPrompt: "You are a test agent.",
  };

  const baseOptions: ExecutionOptions = {
    agent: baseAgent,
    prompt: "Execute test task",
    depth: 1,
  };

  describe("Runtime Factory & Registry", () => {
    it("resolves default in-process runner for pi-inprocess", () => {
      const runner = getRuntimeRunner("pi-inprocess");
      expect(runner).toBeDefined();
      expect(runner.runtime).toBe("pi-inprocess");
      expect(runner).toBeInstanceOf(InProcessRunner);
    });

    it("resolves subprocess runner for pi-subprocess", () => {
      const runner = getRuntimeRunner("pi-subprocess");
      expect(runner).toBeDefined();
      expect(runner.runtime).toBe("pi-subprocess");
      expect(runner).toBeInstanceOf(SubprocessRunner);
    });

    it("resolves claude runner for claude", () => {
      const runner = getRuntimeRunner("claude");
      expect(runner).toBeDefined();
      expect(runner.runtime).toBe("claude");
      expect(runner).toBeInstanceOf(ClaudeRunner);
    });

    it("resolves codex runner for codex", () => {
      const runner = getRuntimeRunner("codex");
      expect(runner).toBeDefined();
      expect(runner.runtime).toBe("codex");
      expect(runner).toBeInstanceOf(CodexRunner);
    });

    it("resolves gemini runner for gemini", () => {
      const runner = getRuntimeRunner("gemini");
      expect(runner).toBeDefined();
      expect(runner.runtime).toBe("gemini");
      expect(runner).toBeInstanceOf(GeminiRunner);
    });

    it("resolves copilot runner for copilot", () => {
      const runner = getRuntimeRunner("copilot");
      expect(runner).toBeDefined();
      expect(runner.runtime).toBe("copilot");
      expect(runner).toBeInstanceOf(CopilotRunner);
    });

    it("resolves custom runner for custom", () => {
      const runner = getRuntimeRunner("custom");
      expect(runner).toBeDefined();
      expect(runner.runtime).toBe("custom");
      expect(runner).toBeInstanceOf(CustomRunner);
    });

    it("creates runner by agent definition with fallback to pi-inprocess", () => {
      const runnerWithoutRuntime = createRuntimeRunner({
        name: "no-runtime",
        description: "Agent without runtime specified",
      });
      expect(runnerWithoutRuntime.runtime).toBe("pi-inprocess");

      const runnerWithSubprocess = createRuntimeRunner({
        ...baseAgent,
        runtime: "pi-subprocess",
      });
      expect(runnerWithSubprocess.runtime).toBe("pi-subprocess");
    });

    it("allows registering custom runtime implementations", () => {
      class MockCustomRunner implements AgentRunner {
        readonly runtime = "custom" as const;
        async execute(
          agent: AgentDefinition,
          options: ExecutionOptions
        ): Promise<RunRecord> {
          return {
            id: "custom_123",
            agent: agent.name,
            runtime: "custom",
            status: "completed",
            state: "DONE",
            prompt: options.prompt,
            output: "Mock custom output",
            turns: 1,
            turnBudget: 10,
            tokens: { input: 10, output: 20, total: 30 },
            startedAt: Date.now(),
            completedAt: Date.now(),
            durationMs: 5,
            depth: options.depth ?? 0,
          };
        }
      }

      registerRuntimeRunner("custom", new MockCustomRunner());
      const runner = getRuntimeRunner("custom");
      expect(runner).toBeInstanceOf(MockCustomRunner);
    });
  });

  describe("InProcessRunner", () => {
    it("executes task with direct completion handler", async () => {
      let customExecutorCalled = false;
      const runner = new InProcessRunner({
        executor: async (agent, options) => {
          customExecutorCalled = true;
          return {
            output: `Executed in-process: ${options.prompt} for ${agent.name}`,
            turns: 2,
            tokens: { input: 15, output: 35, total: 50 },
          };
        },
      });

      const updates: string[] = [];
      const record = await runner.execute(
        baseAgent,
        baseOptions,
        undefined,
        (chunk) => updates.push(chunk)
      );

      expect(customExecutorCalled).toBe(true);
      expect(record.status).toBe("completed");
      expect(record.state).toBe("DONE");
      expect(record.output).toContain("Executed in-process: Execute test task");
      expect(record.turns).toBe(2);
      expect(record.tokens.total).toBe(50);
      expect(record.depth).toBe(1);
    });

    it("handles abort signal cancellation", async () => {
      const controller = new AbortController();
      controller.abort();

      const runner = new InProcessRunner();
      const record = await runner.execute(
        baseAgent,
        baseOptions,
        controller.signal
      );

      expect(record.status).toBe("aborted");
      expect(record.state).toBe("DONE");
      expect(record.error).toBe("Execution was aborted");
    });

    it("captures execution errors gracefully", async () => {
      const runner = new InProcessRunner({
        executor: async () => {
          throw new Error("Simulated model failure");
        },
      });

      const record = await runner.execute(baseAgent, baseOptions);
      expect(record.status).toBe("failed");
      expect(record.state).toBe("DONE");
      expect(record.error).toBe("Simulated model failure");
    });
  });

  describe("SubprocessRunner", () => {
    it("formats command line arguments with depth and json mode", () => {
      const runner = new SubprocessRunner();
      const args = runner.buildArgs(
        {
          ...baseAgent,
          model: "zai/glm-5.2",
          thinking: "high",
          tools: ["read", "grep"],
        },
        {
          ...baseOptions,
          depth: 2,
          parentRunId: "run_parent_1",
          turnBudget: 15,
        }
      );

      expect(args).toContain("--mode");
      expect(args).toContain("json");
      expect(args).toContain("-p");
      expect(args).toContain("--model");
      expect(args).toContain("zai/glm-5.2");
      expect(args).toContain("--thinking");
      expect(args).toContain("high");
      expect(args).toContain("--tools");
      expect(args).toContain("read,grep");
    });

    it("constructs environment variables including depth and recursion headers", () => {
      const runner = new SubprocessRunner();
      const env = runner.buildEnv(baseAgent, {
        ...baseOptions,
        depth: 3,
        parentRunId: "parent_xyz",
      });

      expect(env.PI_SUBAGENT).toBe("1");
      expect(env.PI_SUBAGENT_DEPTH).toBe("3");
      expect(env.PI_PARENT_RUN_ID).toBe("parent_xyz");
      expect(env.PI_RECURSION_DEPTH_HEADER).toBe("Depth: 3/10");
    });

    it("parses streaming JSON events from subprocess output", () => {
      const runner = new SubprocessRunner();
      const events: unknown[] = [];
      const onEvent = (ev: unknown) => events.push(ev);

      const jsonStream = [
        JSON.stringify({ type: "turn_start", turn: 1 }),
        JSON.stringify({ type: "message", content: "Working on task" }),
        JSON.stringify({
          type: "tool_call",
          tool: "read",
          args: { path: "foo.ts" },
        }),
        JSON.stringify({
          type: "done",
          output: "Finished successfully",
          usage: { input: 100, output: 50, total: 150 },
        }),
      ].join("\n");

      const result = runner.parseStreamOutput(jsonStream, onEvent);
      expect(result.output).toBe("Finished successfully");
      expect(result.tokens.total).toBe(150);
      expect(result.toolCalls?.length).toBe(1);
      expect(result.toolCalls?.[0].tool).toBe("read");
      expect(events.length).toBe(4);
    });

    it("parses plain text output when non-json is emitted", () => {
      const runner = new SubprocessRunner();
      const rawText = "Plain stdout output line 1\nLine 2 done";
      const result = runner.parseStreamOutput(rawText);
      expect(result.output).toBe(rawText);
    });

    it("executes simulated subprocess and produces valid RunRecord", async () => {
      const runner = new SubprocessRunner({
        spawnFn: async (_cmd, _args, _opts) => {
          return {
            stdout: JSON.stringify({
              type: "done",
              output: "Subprocess executed successfully",
              usage: { input: 200, output: 80, total: 280 },
              turns: 3,
            }),
            stderr: "",
            exitCode: 0,
          };
        },
      });

      const record = await runner.execute(
        { ...baseAgent, runtime: "pi-subprocess" },
        baseOptions
      );

      expect(record.status).toBe("completed");
      expect(record.runtime).toBe("pi-subprocess");
      expect(record.output).toBe("Subprocess executed successfully");
      expect(record.tokens.total).toBe(280);
      expect(record.turns).toBe(3);
    });
  });

  describe("External CLI Runners (Claude, Codex, Gemini, Copilot)", () => {
    it("ClaudeRunner formats claude CLI arguments and parses output", () => {
      const runner = new ClaudeRunner();
      const args = runner.buildArgs(
        { ...baseAgent, model: "claude-3-7-sonnet" },
        { ...baseOptions, prompt: "Review PR" }
      );

      expect(args).toContain("-p");
      expect(args).toContain("Review PR");
      expect(args).toContain("--output-format");
      expect(args).toContain("json");
    });

    it("ClaudeRunner executes via spawn adapter", async () => {
      const runner = new ClaudeRunner({
        spawnFn: async () => ({
          stdout: JSON.stringify({
            result: "Claude review complete",
            usage: { input_tokens: 120, output_tokens: 45 },
          }),
          stderr: "",
          exitCode: 0,
        }),
      });

      const record = await runner.execute(
        { ...baseAgent, runtime: "claude" },
        baseOptions
      );
      expect(record.status).toBe("completed");
      expect(record.runtime).toBe("claude");
      expect(record.output).toContain("Claude review complete");
      expect(record.tokens.input).toBe(120);
      expect(record.tokens.output).toBe(45);
    });

    it("CodexRunner formats arguments and executes via codex CLI", async () => {
      const runner = new CodexRunner({
        spawnFn: async () => ({
          stdout: "Codex finished task",
          stderr: "",
          exitCode: 0,
        }),
      });

      const record = await runner.execute(
        { ...baseAgent, runtime: "codex" },
        baseOptions
      );
      expect(record.status).toBe("completed");
      expect(record.runtime).toBe("codex");
      expect(record.output).toBe("Codex finished task");
    });

    it("GeminiRunner formats arguments and executes", async () => {
      const runner = new GeminiRunner({
        spawnFn: async () => ({
          stdout: "Gemini CLI task result",
          stderr: "",
          exitCode: 0,
        }),
      });

      const record = await runner.execute(
        { ...baseAgent, runtime: "gemini" },
        baseOptions
      );
      expect(record.status).toBe("completed");
      expect(record.runtime).toBe("gemini");
      expect(record.output).toBe("Gemini CLI task result");
    });

    it("CopilotRunner formats arguments and executes", async () => {
      const runner = new CopilotRunner({
        spawnFn: async () => ({
          stdout: "Copilot task result",
          stderr: "",
          exitCode: 0,
        }),
      });

      const record = await runner.execute(
        { ...baseAgent, runtime: "copilot" },
        baseOptions
      );
      expect(record.status).toBe("completed");
      expect(record.runtime).toBe("copilot");
      expect(record.output).toBe("Copilot task result");
    });

    it("CustomRunner uses custom handler or fallback", async () => {
      const runner = new CustomRunner({
        handler: async (agent, options) => ({
          output: `Custom handled: ${options.prompt}`,
          tokens: { input: 1, output: 2, total: 3 },
        }),
      });

      const record = await runner.execute(
        { ...baseAgent, runtime: "custom" },
        baseOptions
      );
      expect(record.status).toBe("completed");
      expect(record.runtime).toBe("custom");
      expect(record.output).toBe("Custom handled: Execute test task");
    });
  });

  describe("Worktree Management in SubprocessRunner", () => {
    it("identifies worktree requirement from agent or execution options", () => {
      const runner = new SubprocessRunner();
      expect(runner.requiresWorktree(baseAgent, baseOptions)).toBe(false);

      expect(
        runner.requiresWorktree(
          { ...baseAgent, worktree: true },
          baseOptions
        )
      ).toBe(true);

      expect(
        runner.requiresWorktree(baseAgent, {
          ...baseOptions,
          worktree: true,
        })
      ).toBe(true);
    });
  });
});
