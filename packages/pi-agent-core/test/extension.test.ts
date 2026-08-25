import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import piAgentCoreExtension from "../src/index.js";
import { ActiveWidgetController } from "../src/ui/active-widget.js";
import { formatPeekContent } from "../src/ui/peek-modal.js";
import { formatWorkflowsView } from "../src/ui/workflows-view.js";
import { SuperpowersBridge } from "../src/superpowers-bridge.js";
import { createRunRecord, createWorkflowResult, type RunRecord } from "../src/types.js";
import { ControlPlane } from "../src/control/index.js";
import { AuditLogger } from "../src/observability/index.js";

interface MockRegisteredTool {
  name: string;
  description: string;
  parameters: any;
  execute: (toolCallId: string, params: any, signal: AbortSignal | undefined, onUpdate: any, ctx: any) => Promise<any>;
}

interface MockRegisteredCommand {
  name: string;
  options: {
    description?: string;
    getArgumentCompletions?: (prefix: string) => Promise<any[] | null>;
    handler: (args: string, ctx: any) => Promise<void>;
  };
}

function createMockPi() {
  const tools = new Map<string, MockRegisteredTool>();
  const commands = new Map<string, MockRegisteredCommand>();
  const eventListeners = new Map<string, Array<Function>>();

  const pi = {
    registerTool(def: MockRegisteredTool) {
      tools.set(def.name, def);
    },
    registerCommand(name: string, options: any) {
      commands.set(name, { name, options });
    },
    on(event: string, handler: Function) {
      if (!eventListeners.has(event)) {
        eventListeners.set(event, []);
      }
      eventListeners.get(event)!.push(handler);
    },
    emit(event: string, ...args: any[]) {
      const handlers = eventListeners.get(event) || [];
      for (const h of handlers) {
        h(...args);
      }
    },
    tools,
    commands,
    eventListeners,
  };

  return pi;
}

function createMockContext() {
  const widgetCalls: Array<{ key: string; value: any; options?: any }> = [];
  const notifications: Array<{ message: string; level?: string }> = [];
  const customOverlays: any[] = [];
  let editorOpened: { title: string; content: string } | null = null;

  const ctx = {
    cwd: process.cwd(),
    hasUI: true,
    ui: {
      theme: {
        accent: (s: string) => `[accent]${s}`,
        success: (s: string) => `[success]${s}`,
        error: (s: string) => `[error]${s}`,
        warning: (s: string) => `[warn]${s}`,
        dim: (s: string) => `[dim]${s}`,
        bold: (s: string) => `[bold]${s}`,
      },
      setWidget(key: string, value: any, options?: any) {
        widgetCalls.push({ key, value, options });
      },
      notify(message: string, level?: string) {
        notifications.push({ message, level });
      },
      async custom(factory: any, options?: any) {
        customOverlays.push({ factory, options });
        return;
      },
      async editor(title: string, content: string) {
        editorOpened = { title, content };
        return content;
      },
      async select(title: string, options: any[]) {
        return options[0]?.value ?? options[0];
      },
      async input(title: string, placeholder?: string) {
        return placeholder;
      },
    },
    widgetCalls,
    notifications,
    customOverlays,
    getEditorOpened() {
      return editorOpened;
    },
  };

  return ctx;
}

describe("Interactive TUI Overlays, Extension Entrypoint & Superpowers Bridge", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "pi-agent-ext-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("Extension Registration Contract", () => {
    it("registers 'subagent' tool and expected slash commands on startup", () => {
      const pi = createMockPi();
      piAgentCoreExtension(pi as any, { historyDir: tempDir });

      expect(pi.tools.has("subagent")).toBe(true);
      const subTool = pi.tools.get("subagent")!;
      expect(subTool.name).toBe("subagent");
      expect(typeof subTool.execute).toBe("function");
      expect(subTool.parameters).toBeDefined();

      const expectedCommands = [
        "sub:list",
        "sub:peek",
        "sub:steer",
        "sub:abort",
        "sub:history",
        "workflows",
        "sp-brainstorm",
        "sp-plan",
        "sp-implement",
      ];

      for (const cmd of expectedCommands) {
        expect(pi.commands.has(cmd)).toBe(true);
        const registered = pi.commands.get(cmd)!;
        expect(registered.options.description).toBeDefined();
        expect(typeof registered.options.handler).toBe("function");
      }
    });

    it("executes subagent tool returning valid AgentToolResult structure", async () => {
      const pi = createMockPi();
      piAgentCoreExtension(pi as any, {
        historyDir: tempDir,
        runnerResolver: () => ({
          runtime: "pi-inprocess",
          execute: async (agent, opts) => {
            const record = createRunRecord({ agent: agent.name, prompt: opts.prompt });
            record.status = "completed";
            record.state = "DONE";
            record.output = "Task executed successfully with in-process mock";
            record.tokens = { input: 120, output: 45, total: 165 };
            return record;
          },
        }),
      });

      const subTool = pi.tools.get("subagent")!;
      const ctx = createMockContext();

      const result = await subTool.execute(
        "call_1",
        { agent: "worker", prompt: "Perform static scan" },
        undefined,
        undefined,
        ctx
      );

      expect(result).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toContain("Task executed successfully");
      expect(result.content[0].text).toContain("<task-notification");
      expect(result.details).toBeDefined();
      expect(result.details.success).toBe(true);
      expect(result.details.runId).toBeDefined();
      expect(result.details.tokens.total).toBe(165);
    });

    it("captures execution failures in subagent tool gracefully", async () => {
      const pi = createMockPi();
      piAgentCoreExtension(pi as any, {
        historyDir: tempDir,
        runnerResolver: () => ({
          runtime: "pi-inprocess",
          execute: async () => {
            throw new Error("Simulated runner crash");
          },
        }),
      });

      const subTool = pi.tools.get("subagent")!;
      const ctx = createMockContext();

      const result = await subTool.execute(
        "call_2",
        { agent: "worker", prompt: "Should fail" },
        undefined,
        undefined,
        ctx
      );

      expect(result.details.success).toBe(false);
      expect(result.details.error).toContain("Simulated runner crash");
      expect(result.content[0].text).toContain("failed");
    });
  });

  describe("Active TUI Widget (`ActiveWidgetController`)", () => {
    it("renders active subagent metrics including depth and spinner", () => {
      const widget = new ActiveWidgetController({
        widgetKey: "pi-agent-core",
        updateIntervalMs: 50,
      });

      const run1 = createRunRecord({ agent: "code-explorer", prompt: "find references", depth: 1 });
      run1.status = "running";
      run1.state = "RUNNING";
      run1.turns = 3;
      run1.turnBudget = 15;
      run1.tokens = { input: 300, output: 80, total: 380 };

      const lines = widget.renderLines([run1], []);
      expect(lines.length).toBeGreaterThan(0);
      expect(lines[0]).toContain("code-explorer");
      expect(lines[0]).toContain("Depth: 1/10");
      expect(lines[0]).toContain("380 tokens");
    });

    it("updates widget on UI context and clears when no active runs", () => {
      const widget = new ActiveWidgetController({ widgetKey: "test-widget" });
      const ctx = createMockContext();

      const run = createRunRecord({ agent: "reviewer", prompt: "review" });
      run.status = "running";
      run.state = "RUNNING";

      widget.update(ctx as any, [run], []);
      expect(ctx.widgetCalls.length).toBe(1);
      expect(ctx.widgetCalls[0].key).toBe("test-widget");
      expect(ctx.widgetCalls[0].value).toBeDefined();

      // Clear when no active runs
      widget.update(ctx as any, [], []);
      expect(ctx.widgetCalls.length).toBe(2);
      expect(ctx.widgetCalls[1].value).toBeUndefined();
    });
  });

  describe("Peek Modal Viewer (`peek-modal.ts`)", () => {
    it("formats peek transcript showing run metadata, tool calls, and output", () => {
      const record = createRunRecord({ agent: "coder", prompt: "Refactor auth middleware" });
      record.status = "completed";
      record.state = "DONE";
      record.model = "vllm-local/qwen3.6-27b-awq";
      record.turns = 4;
      record.tokens = { input: 500, output: 200, total: 700 };
      record.output = "Successfully refactored auth.ts";
      record.toolCalls = [
        { tool: "read", args: { path: "auth.ts" }, result: "file content", timestamp: Date.now() - 2000 },
        { tool: "edit", args: { path: "auth.ts" }, result: "ok", timestamp: Date.now() - 1000 },
      ];

      const formatted = formatPeekContent(record);
      expect(formatted).toContain("Subagent Run: coder");
      expect(formatted).toContain("Status:     COMPLETED");
      expect(formatted).toContain("PROMPT");
      expect(formatted).toContain("Refactor auth middleware");
      expect(formatted).toContain("Tokens:     700 total");
      expect(formatted).toContain("[Tool Call: read]");
      expect(formatted).toContain("[Tool Call: edit]");
      expect(formatted).toContain("Successfully refactored auth.ts");
    });
  });

  describe("Workflows View (`workflows-view.ts`)", () => {
    it("formats workflows view tree with phases, status icons, and durations", () => {
      const wf = createWorkflowResult({
        name: "test-pipeline",
        description: "Integration test pipeline",
        phases: ["audit", "fix", "verify"],
      });
      wf.status = "completed";
      wf.durationMs = 4500;
      wf.phases[0].status = "completed";
      wf.phases[0].durationMs = 1200;
      wf.phases[1].status = "completed";
      wf.phases[1].durationMs = 2300;
      wf.phases[2].status = "completed";
      wf.phases[2].durationMs = 1000;

      const formatted = formatWorkflowsView([wf]);
      expect(formatted).toContain("Workflow: test-pipeline");
      expect(formatted).toContain("Status:   ✓ COMPLETED");
      expect(formatted).toContain("Phase 1: audit");
      expect(formatted).toContain("Phase 2: fix");
      expect(formatted).toContain("Phase 3: verify");
    });
  });

  describe("Superpowers Bridge (`superpowers-bridge.ts`)", () => {
    it("dispatches /sp-brainstorm with brainstorming methodology prompt", async () => {
      const controlPlane = new ControlPlane({
        runnerResolver: () => ({
          runtime: "pi-inprocess",
          execute: async (agent, opts) => {
            const record = createRunRecord({ agent: agent.name, prompt: opts.prompt });
            record.status = "completed";
            record.output = "Brainstorming questions and architecture options";
            return record;
          },
        }),
      });

      const bridge = new SuperpowersBridge({ controlPlane });
      const result = await bridge.dispatchBrainstorm("Design subagent control plane");

      expect(result.status).toBe("completed");
      expect(result.prompt).toContain("Design subagent control plane");
      expect(result.prompt).toContain("Explore 2-3 distinct approaches");
    });

    it("dispatches /sp-plan with plan generation methodology prompt", async () => {
      const controlPlane = new ControlPlane({
        runnerResolver: () => ({
          runtime: "pi-inprocess",
          execute: async (agent, opts) => {
            const record = createRunRecord({ agent: agent.name, prompt: opts.prompt });
            record.status = "completed";
            record.output = "Bite-sized implementation plan generated";
            return record;
          },
        }),
      });

      const bridge = new SuperpowersBridge({ controlPlane });
      const result = await bridge.dispatchPlan("Implement peek modal");

      expect(result.status).toBe("completed");
      expect(result.prompt).toContain("Implement peek modal");
      expect(result.prompt).toContain("Bite-sized");
    });

    it("dispatches /sp-implement with TDD implementation prompt", async () => {
      const controlPlane = new ControlPlane({
        runnerResolver: () => ({
          runtime: "pi-inprocess",
          execute: async (agent, opts) => {
            const record = createRunRecord({ agent: agent.name, prompt: opts.prompt });
            record.status = "completed";
            record.output = "Implemented with TDD and verified";
            return record;
          },
        }),
      });

      const bridge = new SuperpowersBridge({ controlPlane });
      const result = await bridge.dispatchImplement("Task 7 implementation");

      expect(result.status).toBe("completed");
      expect(result.prompt).toContain("Task 7 implementation");
      expect(result.prompt).toContain("TDD");
    });
  });

  describe("Slash Command Handlers", () => {
    it("handles /sub:list displaying discovered agents", async () => {
      const pi = createMockPi();
      piAgentCoreExtension(pi as any, { historyDir: tempDir });

      const ctx = createMockContext();
      const listCmd = pi.commands.get("sub:list")!;
      await listCmd.options.handler("", ctx);

      expect(ctx.getEditorOpened()).toBeDefined();
      expect(ctx.getEditorOpened()!.content).toContain("Available Subagents");
    });

    it("handles /sub:steer sending message to running agent", async () => {
      const pi = createMockPi();
      let capturedSteer: string | null = null;

      const controlPlane = new ControlPlane({
        runnerResolver: () => ({
          runtime: "pi-inprocess",
          execute: async (agent, opts) => {
            const record = createRunRecord({ agent: agent.name, prompt: opts.prompt });
            record.status = "running";
            return record;
          },
        }),
      });

      piAgentCoreExtension(pi as any, { controlPlane, historyDir: tempDir });

      const ctx = createMockContext();
      const steerCmd = pi.commands.get("sub:steer")!;

      // Steering without args shows guidance
      await steerCmd.options.handler("", ctx);
      expect(ctx.notifications.some((n) => n.message.includes("Usage: /sub:steer"))).toBe(true);
    });

    it("handles /sub:history showing aggregated audit history", async () => {
      const pi = createMockPi();
      const logger = new AuditLogger({ historyDir: tempDir });
      const rec = createRunRecord({ agent: "verifier", prompt: "audit verification" });
      rec.status = "completed";
      await logger.append(rec, { sessionId: "ses_history" });

      piAgentCoreExtension(pi as any, { auditLogger: logger, historyDir: tempDir });

      const ctx = createMockContext();
      const historyCmd = pi.commands.get("sub:history")!;
      await historyCmd.options.handler("", ctx);

      // In mock context with custom support, custom overlay is created
      expect(ctx.customOverlays.length).toBeGreaterThan(0);
    });
  });
});
