import { describe, expect, it, beforeEach } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ControlPlane } from "../src/control/index.js";
import {
  ScriptLinter,
  WorkerRuntime,
  WorkflowRunner,
  runWorkflow,
  validateWorkflowScript,
} from "../src/workflow/index.js";
import type { AgentDefinition, ExecutionOptions, RunRecord } from "../src/types.js";
import type { AgentRunner } from "../src/runtimes/runner-interface.js";

// Mock runner for workflow testing
class MockWorkflowAgentRunner implements AgentRunner {
  public executionCount = 0;
  public promptsReceived: string[] = [];

  public async execute(
    agent: AgentDefinition,
    options: ExecutionOptions,
    signal?: AbortSignal,
    onUpdate?: (update: any) => void
  ): Promise<RunRecord> {
    this.executionCount++;
    this.promptsReceived.push(options.prompt);

    if (signal?.aborted) {
      return {
        id: `mock_${Math.random()}`,
        agent: agent.name,
        runtime: "pi-inprocess",
        status: "aborted",
        state: "DONE",
        prompt: options.prompt,
        output: "",
        turns: 0,
        turnBudget: 20,
        tokens: { input: 0, output: 0, total: 0 },
        startedAt: Date.now(),
        completedAt: Date.now(),
        durationMs: 0,
        depth: options.depth ?? 0,
      };
    }

    // Small delay to simulate work
    await new Promise((r) => setTimeout(r, 15));

    if (options.prompt.includes("FAIL_AGENT")) {
      return {
        id: `mock_${Math.random()}`,
        agent: agent.name,
        runtime: "pi-inprocess",
        status: "failed",
        state: "DONE",
        prompt: options.prompt,
        output: "",
        error: "Agent simulated failure",
        exitCode: 1,
        turns: 1,
        turnBudget: 20,
        tokens: { input: 10, output: 0, total: 10 },
        startedAt: Date.now(),
        completedAt: Date.now(),
        durationMs: 15,
        depth: options.depth ?? 0,
      };
    }

    return {
      id: `mock_${Math.random()}`,
      agent: agent.name,
      runtime: "pi-inprocess",
      status: "completed",
      state: "DONE",
      prompt: options.prompt,
      output: `Result for [${agent.name}]: ${options.prompt}`,
      verdict: "PASS",
      diff: "diff --git a/file b/file",
      turns: 2,
      turnBudget: 20,
      tokens: { input: 50, output: 25, total: 75 },
      startedAt: Date.now(),
      completedAt: Date.now(),
      durationMs: 15,
      depth: options.depth ?? 0,
    };
  }
}

describe("JS Worker Workflow Orchestration Engine", () => {
  describe("ScriptLinter & Validation", () => {
    it("passes validation for clean workflow scripts", () => {
      const script = `
        const meta = { name: "test-pipeline", phases: ["scan", "build"] };
        phase("scan");
        const analysis = await agent("explorer", "find all files");
        phase("build");
        const res = await agent("coder", \`fix \${analysis.output}\`);
        return res.output;
      `;
      const result = ScriptLinter.validate(script);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.meta?.name).toBe("test-pipeline");
      expect(result.meta?.phases).toEqual(["scan", "build"]);
    });

    it("rejects empty or whitespace-only scripts", () => {
      const res1 = ScriptLinter.validate("");
      expect(res1.valid).toBe(false);
      expect(res1.errors.length).toBeGreaterThan(0);

      const res2 = ScriptLinter.validate("   \n  \t  ");
      expect(res2.valid).toBe(false);
    });

    it("detects syntax errors in scripts", () => {
      const script = `
        const x = ; // syntax error
        await agent("coder", "do something");
      `;
      const result = ScriptLinter.validate(script);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Syntax error"))).toBe(true);
    });

    it("warns about unawaited async IIFEs", () => {
      const script = `
        (async () => {
          await agent("explorer", "search");
        })();
      `;
      const result = ScriptLinter.validate(script);
      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.includes("unawaited async IIFE"))).toBe(true);
    });

    it("warns about unawaited agent/parallel/pipeline calls", () => {
      const script = `
        agent("explorer", "search");
        const a = parallel(["a", "b"]);
      `;
      const result = ScriptLinter.validate(script);
      expect(result.warnings.length).toBeGreaterThanOrEqual(1);
      expect(result.warnings.some((w) => w.includes("unawaited"))).toBe(true);
    });

    it("rejects forbidden statements (process.exit, eval, require child_process, process.env mutations)", () => {
      const badScripts = [
        `process.exit(1);`,
        `eval("console.log('danger')");`,
        `const cp = require("child_process");`,
        `process.env.SECRET = "hacked";`,
      ];

      for (const bad of badScripts) {
        const result = ScriptLinter.validate(bad);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThanOrEqual(1);
      }
    });

    it("extracts meta with description and custom phases", () => {
      const script = `
        const meta = {
          name: "security-audit",
          description: "Perform comprehensive CVE scan",
          phases: ["recon", "exploit-check", "report"]
        };
        phase("recon");
      `;
      const result = validateWorkflowScript(script);
      expect(result.meta).toBeDefined();
      expect(result.meta?.name).toBe("security-audit");
      expect(result.meta?.description).toBe("Perform comprehensive CVE scan");
      expect(result.meta?.phases).toEqual(["recon", "exploit-check", "report"]);
    });
  });

  describe("WorkerRuntime Orchestration Primitives", () => {
    let mockRunner: MockWorkflowAgentRunner;
    let controlPlane: ControlPlane;

    beforeEach(() => {
      mockRunner = new MockWorkflowAgentRunner();
      controlPlane = new ControlPlane({
        runnerResolver: () => mockRunner,
      });
    });

    it("executes basic agent() task and populates workflow result", async () => {
      const runner = new WorkflowRunner({ controlPlane });
      const script = `
        const run1 = await agent("explorer", "Find index.ts");
        const run2 = await agent({ agent: "coder", prompt: "Fix bug in index.ts" });
        return { totalRuns: 2, lastOutput: run2.output };
      `;

      const result = await runner.runScript(script, { name: "basic-test" });
      expect(result.status).toBe("completed");
      expect(result.runs.length).toBe(2);
      expect(result.output).toEqual({
        totalRuns: 2,
        lastOutput: "Result for [coder]: Fix bug in index.ts",
      });
      expect(result.durationMs).toBeGreaterThan(0);
    });

    it("executes parallel() tasks concurrently", async () => {
      const runner = new WorkflowRunner({ controlPlane });
      const script = `
        const results = await parallel([
          { agent: "scanner-1", prompt: "Scan module A" },
          { agent: "scanner-2", prompt: "Scan module B" },
          { agent: "scanner-3", prompt: "Scan module C" }
        ]);
        return results.map(r => r.agent);
      `;

      const result = await runner.runScript(script, { name: "parallel-test" });
      expect(result.status).toBe("completed");
      expect(result.runs.length).toBe(3);
      expect(result.output).toEqual(["scanner-1", "scanner-2", "scanner-3"]);
    });

    it("executes pipeline() passing previous outputs forward", async () => {
      const runner = new WorkflowRunner({ controlPlane });
      const script = `
        const results = await pipeline([
          { agent: "step-1", prompt: "Initial data" },
          { agent: "step-2", prompt: "Processed: {{prev}}" },
          { agent: "step-3", template: (prev) => \`Final: \${prev}\` }
        ]);
        return results[results.length - 1].output;
      `;

      const result = await runner.runScript(script, { name: "pipeline-test" });
      expect(result.status).toBe("completed");
      expect(result.runs.length).toBe(3);
      expect(result.runs[1].prompt).toContain("Result for [step-1]");
      expect(result.runs[2].prompt).toContain("Result for [step-2]");
    });

    it("tracks phase transitions declaratively and with block scope", async () => {
      const runner = new WorkflowRunner({ controlPlane });
      const phaseEvents: string[] = [];

      runner.on("phase:change", (phase) => {
        phaseEvents.push(`${phase.name}:${phase.status}`);
      });

      const script = `
        const meta = { name: "phased-workflow", phases: ["scan", "code", "verify"] };
        
        phase("scan");
        await agent("explorer", "scan files");
        
        await phase("code", async () => {
          await agent("coder", "write implementation");
        });
        
        phase("verify");
        await agent("verifier", "run test suite");
      `;

      const result = await runner.runScript(script);
      expect(result.status).toBe("completed");
      expect(result.phases.length).toBe(3);
      expect(result.phases.every((p) => p.status === "completed")).toBe(true);
      expect(result.phases.every((p) => (p.durationMs ?? 0) >= 0)).toBe(true);
      expect(phaseEvents.some((e) => e.startsWith("scan:"))).toBe(true);
      expect(phaseEvents.some((e) => e.startsWith("code:"))).toBe(true);
      expect(phaseEvents.some((e) => e.startsWith("verify:"))).toBe(true);
    });

    it("shares mutable state and captures safe console logs", async () => {
      const runner = new WorkflowRunner({ controlPlane });
      const script = `
        console.log("Starting workflow execution");
        state.counter = 1;
        
        await agent("worker", "step 1");
        state.counter += 5;
        console.info("State updated:", state.counter);
        
        return state;
      `;

      const result = await runner.runScript(script, {
        initialState: { initialKey: "initialValue" },
      });

      expect(result.status).toBe("completed");
      expect(result.output).toEqual({
        initialKey: "initialValue",
        counter: 6,
      });
    });

    it("supports sleep helper with abort support", async () => {
      const runner = new WorkflowRunner({ controlPlane });
      const script = `
        await sleep(20);
        return "slept well";
      `;

      const result = await runner.runScript(script);
      expect(result.status).toBe("completed");
      expect(result.output).toBe("slept well");
    });
  });

  describe("Cancellation, Timeouts & Error Handling", () => {
    let mockRunner: MockWorkflowAgentRunner;
    let controlPlane: ControlPlane;

    beforeEach(() => {
      mockRunner = new MockWorkflowAgentRunner();
      controlPlane = new ControlPlane({
        runnerResolver: () => mockRunner,
      });
    });

    it("handles workflow timeout and marks result failed", async () => {
      const runner = new WorkflowRunner({ controlPlane });
      const script = `
        await sleep(500);
        return "done";
      `;

      const result = await runner.runScript(script, { timeoutMs: 50 });
      expect(result.status).toBe("failed");
      expect(result.error).toContain("timed out");
    });

    it("handles caller AbortSignal and aborts workflow cleanly", async () => {
      const runner = new WorkflowRunner({ controlPlane });
      const abortController = new AbortController();

      const script = `
        await sleep(50);
        await agent("coder", "do work");
        await sleep(100);
      `;

      setTimeout(() => {
        abortController.abort();
      }, 25);

      const result = await runner.runScript(script, {
        signal: abortController.signal,
      });

      expect(result.status).toBe("aborted");
      expect(result.error).toContain("aborted");
    });

    it("captures phase error when subagent phase fails", async () => {
      const runner = new WorkflowRunner({ controlPlane });
      const script = `
        phase("init");
        await agent("explorer", "all good");
        
        await phase("broken-phase", async () => {
          throw new Error("Phase exploded");
        });
      `;

      const result = await runner.runScript(script);
      expect(result.status).toBe("failed");
      expect(result.error).toContain("Phase exploded");
      const brokenPhase = result.phases.find((p) => p.name === "broken-phase");
      expect(brokenPhase?.status).toBe("failed");
      expect(brokenPhase?.error).toContain("Phase exploded");
    });

    it("executes workflow script from file using runFile()", async () => {
      const runner = new WorkflowRunner({ controlPlane });
      const tempDir = await mkdtemp(join(tmpdir(), "pi-wf-test-"));
      const filePath = join(tempDir, "sample-workflow.js");

      try {
        const fileContent = `
          const meta = { name: "file-workflow", phases: ["stepA", "stepB"] };
          phase("stepA");
          const r1 = await agent("worker1", "task 1");
          phase("stepB");
          const r2 = await agent("worker2", "task 2");
          return { runs: [r1.output, r2.output] };
        `;
        await writeFile(filePath, fileContent, "utf-8");

        const result = await runner.runFile(filePath);
        expect(result.status).toBe("completed");
        expect(result.name).toBe("file-workflow");
        expect(result.runs.length).toBe(2);
        expect(result.phases.length).toBe(2);
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    });

    it("runs helper runWorkflow() directly", async () => {
      const script = `
        return await agent("inline-agent", "quick task");
      `;
      const result = await runWorkflow(script, { controlPlane });
      expect(result.status).toBe("completed");
      expect(result.runs.length).toBe(1);
    });
  });
});
