import { describe, it, expect } from "bun:test";
import {
  type AgentDefinition,
  type RuntimeType,
  type RunRecord,
  type RunStatus,
  type RunState,
  type ExecutionOptions,
  type RunUpdate,
  type WorkflowMeta,
  type WorkflowPhase,
  type WorkflowResult,
  validateAgentDefinition,
  validateExecutionOptions,
  createRunRecord,
  createWorkflowResult,
  MAX_RECURSION_DEPTH,
  DEFAULT_TURN_BUDGET,
  DEFAULT_MAX_CONCURRENT_RUNS,
  DEFAULT_SUBAGENT_TIMEOUT_MS,
  SUPPORTED_RUNTIMES,
  SUPPORTED_THINKING_LEVELS,
} from "../src/types.ts";

describe("pi-agent-core types & validation", () => {
  describe("Constants & Enums", () => {
    it("exports guardrail constants with expected limits", () => {
      expect(MAX_RECURSION_DEPTH).toBe(10);
      expect(DEFAULT_TURN_BUDGET).toBe(20);
      expect(DEFAULT_MAX_CONCURRENT_RUNS).toBe(4);
      expect(DEFAULT_SUBAGENT_TIMEOUT_MS).toBe(300_000);
    });

    it("supports all supported runtime types", () => {
      expect(SUPPORTED_RUNTIMES).toEqual([
        "pi-inprocess",
        "pi-subprocess",
        "claude",
        "codex",
        "gemini",
        "copilot",
        "custom",
      ]);
    });

    it("supports all thinking levels", () => {
      expect(SUPPORTED_THINKING_LEVELS).toEqual([
        "off",
        "minimal",
        "low",
        "medium",
        "high",
        "xhigh",
        "max",
      ]);
    });
  });

  describe("validateAgentDefinition", () => {
    it("validates a complete valid agent definition", () => {
      const validDef: AgentDefinition = {
        name: "code-reviewer",
        description: "Rigorous code reviewer focusing on correctness",
        runtime: "pi-subprocess",
        model: "vllm-local/qwen3.6-27b-awq",
        thinking: "high",
        tools: ["read", "grep", "find"],
        worktree: true,
        turnBudget: 15,
        timeout: 60000,
        systemPrompt: "You are a code reviewer...",
        source: "bundled",
        tier: "max",
        skills: ["superpowers:code-review"],
        params: { strict: true },
      };

      const res = validateAgentDefinition(validDef);
      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
      expect(res.agent?.name).toBe("code-reviewer");
      expect(res.agent?.runtime).toBe("pi-subprocess");
      expect(res.agent?.tier).toBe("max");
      expect(res.agent?.worktree).toBe(true);
      expect(res.agent?.skills).toEqual(["superpowers:code-review"]);
    });

    it("defaults optional fields when valid minimal definition provided", () => {
      const minimal = {
        name: "simple-agent",
        description: "A minimal agent",
      };

      const res = validateAgentDefinition(minimal);
      expect(res.valid).toBe(true);
      expect(res.agent?.runtime).toBe("pi-inprocess");
      expect(res.agent?.turnBudget).toBe(DEFAULT_TURN_BUDGET);
      expect(res.agent?.worktree).toBe(false);
      expect(res.agent?.source).toBe("bundled");
    });

    it("supports each of the supported runtimes explicitly", () => {
      for (const runtime of SUPPORTED_RUNTIMES) {
        const res = validateAgentDefinition({
          name: `agent-${runtime}`,
          description: "Test runtime",
          runtime,
        });
        expect(res.valid).toBe(true);
        expect(res.agent?.runtime).toBe(runtime);
      }
    });

    it("supports boolean and string thinking levels", () => {
      expect(
        validateAgentDefinition({
          name: "agent-bool-think",
          description: "desc",
          thinking: true,
        }).valid
      ).toBe(true);

      for (const thinking of SUPPORTED_THINKING_LEVELS) {
        const res = validateAgentDefinition({
          name: `agent-think-${thinking}`,
          description: "desc",
          thinking,
        });
        expect(res.valid).toBe(true);
        expect(res.agent?.thinking).toBe(thinking);
      }
    });

    it("rejects invalid agent names, non-objects, or missing descriptions", () => {
      expect(validateAgentDefinition(null).valid).toBe(false);
      expect(validateAgentDefinition("not an object").valid).toBe(false);
      expect(
        validateAgentDefinition({
          name: "invalid name with spaces!",
          description: "desc",
        }).valid
      ).toBe(false);
      expect(validateAgentDefinition({ name: "valid-name" }).valid).toBe(false);
      expect(
        validateAgentDefinition({ name: "valid-name", description: "" }).valid
      ).toBe(false);
    });

    it("rejects unsupported runtimes and thinking levels", () => {
      const badRuntime = validateAgentDefinition({
        name: "bad-agent",
        description: "desc",
        runtime: "unsupported-runtime",
      });
      expect(badRuntime.valid).toBe(false);
      expect(badRuntime.errors.some((e) => e.includes("runtime"))).toBe(true);

      const badThinking = validateAgentDefinition({
        name: "bad-agent",
        description: "desc",
        thinking: "super-ultra-high",
      });
      expect(badThinking.valid).toBe(false);
      expect(badThinking.errors.some((e) => e.includes("thinking"))).toBe(true);
    });
  });

  describe("validateExecutionOptions", () => {
    it("validates valid execution options and applies defaults", () => {
      const opts: ExecutionOptions = {
        agent: "code-reviewer",
        prompt: "Review PR #42",
        depth: 2,
      };

      const res = validateExecutionOptions(opts);
      expect(res.valid).toBe(true);
      expect(res.options?.depth).toBe(2);
      expect(res.options?.turnBudget).toBe(DEFAULT_TURN_BUDGET);
      expect(res.options?.timeout).toBe(DEFAULT_SUBAGENT_TIMEOUT_MS);
    });

    it("supports AgentDefinition object as agent parameter", () => {
      const agentDef: AgentDefinition = {
        name: "inline-worker",
        description: "Inline agent def",
        runtime: "pi-inprocess",
      };
      const res = validateExecutionOptions({
        agent: agentDef,
        prompt: "Do work",
      });
      expect(res.valid).toBe(true);
      expect(res.options?.agent).toEqual(agentDef);
    });

    it("enforces MAX_RECURSION_DEPTH limit (Depth: N/10)", () => {
      const excessiveDepth: ExecutionOptions = {
        agent: "orchestrator",
        prompt: "Recursive delegate",
        depth: 11,
      };

      const res = validateExecutionOptions(excessiveDepth);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("recursion depth"))).toBe(true);
    });

    it("allows execution at max boundary depth of 10", () => {
      const maxAllowed: ExecutionOptions = {
        agent: "orchestrator",
        prompt: "Boundary depth",
        depth: 10,
      };
      const res = validateExecutionOptions(maxAllowed);
      expect(res.valid).toBe(true);
      expect(res.options?.depth).toBe(10);
    });

    it("rejects empty prompts, missing agent, or non-object inputs", () => {
      expect(validateExecutionOptions(null).valid).toBe(false);
      expect(validateExecutionOptions({ agent: "", prompt: "test" }).valid).toBe(false);
      expect(validateExecutionOptions({ agent: "test", prompt: "   " }).valid).toBe(false);
    });
  });

  describe("createRunRecord factory", () => {
    it("initializes a RunRecord with sensible defaults and initial state", () => {
      const run = createRunRecord({
        agent: "coder",
        prompt: "Fix bug in auth",
        runtime: "pi-inprocess",
        depth: 1,
        parentRunId: "run_parent_123",
        worktreePath: "/tmp/wt-123",
        replayKey: "step-1-hash",
      });

      expect(run.id).toBeDefined();
      expect(run.runId).toBe(run.id);
      expect(run.agent).toBe("coder");
      expect(run.runtime).toBe("pi-inprocess");
      expect(run.status).toBe("pending");
      expect(run.state).toBe("PENDING");
      expect(run.turns).toBe(0);
      expect(run.tokens.total).toBe(0);
      expect(run.depth).toBe(1);
      expect(run.parentRunId).toBe("run_parent_123");
      expect(run.worktreePath).toBe("/tmp/wt-123");
      expect(run.replayKey).toBe("step-1-hash");
      expect(run.toolCalls).toEqual([]);
      expect(run.startedAt).toBeGreaterThan(0);
    });
  });

  describe("createWorkflowResult factory", () => {
    it("constructs workflow execution result tracking phases and runs", () => {
      const meta: WorkflowMeta = {
        name: "test-pipeline",
        description: "Test pipeline description",
        phases: ["scan", "execute", "verify"],
      };

      const wf = createWorkflowResult(meta);
      expect(wf.id).toBeDefined();
      expect(wf.name).toBe("test-pipeline");
      expect(wf.status).toBe("running");
      expect(wf.phases).toHaveLength(3);
      expect(wf.phases[0].name).toBe("scan");
      expect(wf.phases[0].status).toBe("pending");
      expect(wf.runs).toEqual([]);
      expect(wf.startedAt).toBeGreaterThan(0);
    });
  });
});
