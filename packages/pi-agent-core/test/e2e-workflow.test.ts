import { describe, expect, it, beforeEach } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ControlPlane } from "../src/control/index.js";
import { discoverAgents, listAgents } from "../src/discovery/index.js";
import { SessionsIndex, AuditLogger, formatTaskNotificationXml } from "../src/observability/index.js";
import { WorkflowRunner } from "../src/workflow/index.js";
import { SuperpowersBridge } from "../src/superpowers-bridge.js";
import type { AgentDefinition, ExecutionOptions, RunRecord } from "../src/types.js";
import type { AgentRunner } from "../src/runtimes/runner-interface.js";

/**
 * High-fidelity Simulated Runner for End-to-End lifecycle verification
 */
class E2ETestRunner implements AgentRunner {
  public executionCount = 0;
  public executionLog: { agent: string; prompt: string; depth: number; worktree?: boolean }[] = [];

  public async execute(
    agent: AgentDefinition,
    options: ExecutionOptions,
    signal?: AbortSignal,
    onUpdate?: (update: any) => void
  ): Promise<RunRecord> {
    this.executionCount++;
    const depth = options.depth ?? 0;
    this.executionLog.push({
      agent: agent.name,
      prompt: options.prompt,
      depth,
      worktree: options.worktree,
    });

    if (signal?.aborted) {
      return {
        id: `e2e_run_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        agent: agent.name,
        runtime: agent.runtime ?? "pi-inprocess",
        status: "aborted",
        state: "DONE",
        prompt: options.prompt,
        output: "",
        turns: 0,
        turnBudget: options.turnBudget ?? 20,
        tokens: { input: 0, output: 0, total: 0 },
        startedAt: Date.now(),
        completedAt: Date.now(),
        durationMs: 0,
        depth,
      };
    }

    onUpdate?.({ phase: "executing", progress: 0.5 });
    await new Promise((r) => setTimeout(r, 10));

    return {
      id: `e2e_run_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      agent: agent.name,
      runtime: agent.runtime ?? "pi-inprocess",
      status: "completed",
      state: "DONE",
      prompt: options.prompt,
      output: `[Output from ${agent.name}]: Completed task: ${options.prompt}`,
      verdict: "PASS",
      diff: options.worktree ? `diff --git a/worktree-file.ts b/worktree-file.ts\n+ // change by ${agent.name}` : undefined,
      turns: 2,
      turnBudget: options.turnBudget ?? 20,
      tokens: { input: 120, output: 60, total: 180 },
      startedAt: Date.now(),
      completedAt: Date.now(),
      durationMs: 12,
      depth,
    };
  }
}

describe("pi-agent-core End-to-End Lifecycle Suite", () => {
  let tempBaseDir: string;
  let customAgentsDir: string;
  let historyDir: string;
  let sessionsDir: string;
  let runner: E2ETestRunner;
  let controlPlane: ControlPlane;
  let auditLogger: AuditLogger;
  let sessionsIndex: SessionsIndex;
  let workflowRunner: WorkflowRunner;
  let superpowers: SuperpowersBridge;

  beforeEach(async () => {
    tempBaseDir = await mkdtemp(join(tmpdir(), "pi-agent-core-e2e-"));
    customAgentsDir = join(tempBaseDir, "agents");
    historyDir = join(tempBaseDir, "history");
    sessionsDir = join(tempBaseDir, "sessions");

    await mkdir(customAgentsDir, { recursive: true });
    await mkdir(historyDir, { recursive: true });
    await mkdir(sessionsDir, { recursive: true });

    runner = new E2ETestRunner();
    controlPlane = new ControlPlane({
      runnerResolver: () => runner,
      maxConcurrent: 3,
    });
    auditLogger = new AuditLogger({ historyDir });
    sessionsIndex = new SessionsIndex({ baseDir: sessionsDir });
    workflowRunner = new WorkflowRunner({ controlPlane });
    superpowers = new SuperpowersBridge({ controlPlane });
  });

  it("executes complete lifecycle: Discovery -> Workflow -> Parallel Execution -> Replay -> Audit -> Index", async () => {
    // -------------------------------------------------------------------------
    // Step 1: Agent Discovery with Custom & Bundled Agents
    // -------------------------------------------------------------------------
    const customAgentMd = `---
name: custom-architect
description: Senior system architect specialist
runtime: pi-subprocess
model: vllm-local/qwen3.6-27b-awq
thinking: high
tools: [read, grep, find]
worktree: true
turnBudget: 15
---
You are the lead architect.`;

    await writeFile(join(customAgentsDir, "custom-architect.md"), customAgentMd, "utf-8");

    const discovered = await discoverAgents({
      customDirs: [customAgentsDir],
      includeGlobal: false,
    });

    expect(discovered.has("custom-architect")).toBe(true);
    const architect = discovered.get("custom-architect")!;
    expect(architect.name).toBe("custom-architect");
    expect(architect.runtime).toBe("pi-subprocess");
    expect(architect.worktree).toBe(true);
    expect(architect.tools).toEqual(["read", "grep", "find"]);

    // Bundled fallback exists
    expect(discovered.has("worker")).toBe(true);
    expect(discovered.has("reviewer")).toBe(true);

    // -------------------------------------------------------------------------
    // Step 2: Multi-Phase Workflow Execution (Worker thread script)
    // -------------------------------------------------------------------------
    const workflowScript = `
      const meta = {
        name: "e2e-refactor-feature",
        description: "Full end-to-end multi-agent refactoring workflow",
        phases: ["analysis", "parallel-work", "review"]
      };

      // Phase 1: Analysis
      phase("analysis");
      const specAnalysis = await agent("custom-architect", "Analyze codebase architecture");

      // Phase 2: Parallel implementation branches in isolated worktrees
      phase("parallel-work");
      const [coreBranch, testBranch] = await parallel([
        { agent: "worker", prompt: "Refactor core API according to architecture spec", worktree: true },
        { agent: "worker", prompt: "Implement unit & integration test suites", worktree: true }
      ]);

      // Phase 3: Adversarial Review
      phase("review");
      const reviewResult = await agent("reviewer", "Review diff and test assertions");

      return {
        architecture: specAnalysis.output,
        branches: [coreBranch.output, testBranch.output],
        verdict: reviewResult.verdict
      };
    `;

    const phasesObserved: string[] = [];
    const wfResult = await workflowRunner.runScript(workflowScript, {
      cwd: tempBaseDir,
      onPhaseChange: (p) => {
        if (p.status === "running") {
          phasesObserved.push(p.name);
        }
      },
    });

    expect(wfResult.status).toBe("completed");
    expect(wfResult.name).toBe("e2e-refactor-feature");
    expect(wfResult.phases.map((p) => p.name)).toEqual(["analysis", "parallel-work", "review"]);
    expect(phasesObserved).toEqual(["analysis", "parallel-work", "review"]);
    expect(wfResult.runs.length).toBe(4); // 1 architect + 2 parallel workers + 1 reviewer
    expect(wfResult.output.verdict).toBe("PASS");

    // -------------------------------------------------------------------------
    // Step 3: Replay Cache Verification (Idempotent replay of same task)
    // -------------------------------------------------------------------------
    const initialRunnerCount = runner.executionCount;
    const replayOptions = {
      agent: "worker",
      prompt: "Cached computation task",
      useReplayCache: true,
      replayKey: "cache-key-12345",
    };

    // First execution fills cache
    const run1 = await controlPlane.dispatch(replayOptions);
    expect(run1.status).toBe("completed");
    expect(runner.executionCount).toBe(initialRunnerCount + 1);

    // Second execution with same replay key should hit cache without calling runner
    const run2 = await controlPlane.dispatch(replayOptions);
    expect(run2.status).toBe("completed");
    expect(run2.output).toBe(run1.output);
    expect(runner.executionCount).toBe(initialRunnerCount + 1); // No new execution!

    // -------------------------------------------------------------------------
    // Step 4: Structured Audit Logging & Telemetry
    // -------------------------------------------------------------------------
    const testSessionId = "session_e2e_test_999";
    for (const record of wfResult.runs) {
      await auditLogger.append(record, { sessionId: testSessionId });
    }

    const auditRecords = await auditLogger.query({ sessionId: testSessionId });
    expect(auditRecords.length).toBe(4);

    const summary = await auditLogger.getSummary();
    expect(summary.totalRuns).toBe(4);
    expect(summary.completedRuns).toBe(4);
    expect(summary.successRate).toBe(1.0);
    expect(summary.totalTokens.total).toBe(4 * 180);

    // Task notification XML formatting
    const notificationXml = formatTaskNotificationXml(wfResult.runs[0]);
    expect(notificationXml).toContain("<task-notification");
    expect(notificationXml).toContain("status=\"completed\"");
    expect(notificationXml).toContain("total-tokens=\"180\"");
    expect(notificationXml).toContain("</task-notification>");

    // -------------------------------------------------------------------------
    // Step 5: Sessions-Index Fast Scanning
    // -------------------------------------------------------------------------
    const projectSessionsDir = join(sessionsDir, "--e2e-test-project--");
    await mkdir(projectSessionsDir, { recursive: true });
    const sessionFilePath = join(projectSessionsDir, `${testSessionId}.jsonl`);
    const sessionContent = [
      JSON.stringify({
        type: "session",
        id: testSessionId,
        title: "E2E Refactoring Session",
      }),
      JSON.stringify({
        type: "user",
        message: { content: "Please refactor the module architecture." },
        timestamp: Date.now() - 50_000,
      }),
      JSON.stringify({
        type: "assistant",
        message: {
          content: "Delegating to custom-architect and parallel workers...",
          model: "vllm-local/qwen3.6-27b-awq",
          usage: { input: 1500, output: 800, total: 2300 },
        },
        timestamp: Date.now() - 40_000,
      }),
    ].join("\n") + "\n";

    await writeFile(sessionFilePath, sessionContent, "utf-8");

    const scanResult = await sessionsIndex.scan();
    expect(scanResult.entries.length).toBe(1);
    const indexed = scanResult.entries[0];
    expect(indexed.sessionId).toBe(testSessionId);
    expect(indexed.title).toBe("E2E Refactoring Session");
    expect(indexed.model).toBe("vllm-local/qwen3.6-27b-awq");
    expect(indexed.tokens.total).toBe(2300);

    // Cached scan should be instant
    const startCold = performance.now();
    const cachedResult = await sessionsIndex.scan();
    const coldDuration = performance.now() - startCold;
    expect(cachedResult.entries.length).toBe(1);
    expect(coldDuration).toBeLessThan(100); // Strict sub-100ms requirement

    // -------------------------------------------------------------------------
    // Step 6: Superpowers Bridge Dispatch Verification
    // -------------------------------------------------------------------------
    const brainstormResult = await superpowers.dispatchBrainstorm("Optimize caching layer", { cwd: tempBaseDir });
    expect(brainstormResult.status).toBe("completed");
    expect(brainstormResult.agent).toBe("sp-brainstorm");

    const planResult = await superpowers.dispatchPlan("Add memory compression", { cwd: tempBaseDir });
    expect(planResult.status).toBe("completed");
    expect(planResult.agent).toBe("sp-plan");

    const implementResult = await superpowers.dispatchImplement("Implement compression algorithm", { cwd: tempBaseDir });
    expect(implementResult.status).toBe("completed");
    expect(implementResult.agent).toBe("sp-implement");
  });
});
