import { describe, expect, it, beforeEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  RunLifecycle,
  ConcurrencyPool,
  SteeringManager,
  ReplayCache,
  ControlPlane,
} from "../src/control/index.js";
import {
  createRunRecord,
  MAX_RECURSION_DEPTH,
  type AgentDefinition,
  type ExecutionOptions,
  type RunRecord,
} from "../src/types.js";
import type { AgentRunner } from "../src/runtimes/runner-interface.js";

describe("Control Plane & State Machine", () => {
  describe("RunLifecycle State Machine", () => {
    it("initializes in PENDING state", () => {
      const record = createRunRecord({ agent: "test-agent", prompt: "Hello" });
      const lifecycle = new RunLifecycle(record);

      expect(lifecycle.state).toBe("PENDING");
      expect(lifecycle.status).toBe("pending");
      expect(lifecycle.record.state).toBe("PENDING");
      expect(lifecycle.record.status).toBe("pending");
    });

    it("transitions PENDING -> RUNNING", () => {
      const record = createRunRecord({ agent: "test-agent", prompt: "Hello" });
      const lifecycle = new RunLifecycle(record);

      const updated = lifecycle.start();
      expect(updated.state).toBe("RUNNING");
      expect(updated.status).toBe("running");
      expect(lifecycle.state).toBe("RUNNING");
      expect(lifecycle.status).toBe("running");
    });

    it("transitions RUNNING -> completed with output and tokens", () => {
      const record = createRunRecord({ agent: "test-agent", prompt: "Hello" });
      const lifecycle = new RunLifecycle(record);
      lifecycle.start();

      const completed = lifecycle.complete({
        output: "Task done successfully",
        turns: 3,
        tokens: { input: 100, output: 50, total: 150 },
        verdict: "PASS",
      });

      expect(completed.state).toBe("DONE");
      expect(completed.status).toBe("completed");
      expect(completed.output).toBe("Task done successfully");
      expect(completed.turns).toBe(3);
      expect(completed.tokens.total).toBe(150);
      expect(completed.verdict).toBe("PASS");
      expect(completed.completedAt).toBeDefined();
      expect(completed.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("transitions RUNNING -> failed with error message", () => {
      const record = createRunRecord({ agent: "test-agent", prompt: "Hello" });
      const lifecycle = new RunLifecycle(record);
      lifecycle.start();

      const failed = lifecycle.fail("Syntax error in generated code", 1);
      expect(failed.state).toBe("DONE");
      expect(failed.status).toBe("failed");
      expect(failed.error).toBe("Syntax error in generated code");
      expect(failed.exitCode).toBe(1);
      expect(failed.completedAt).toBeDefined();
    });

    it("transitions RUNNING -> aborted", () => {
      const record = createRunRecord({ agent: "test-agent", prompt: "Hello" });
      const lifecycle = new RunLifecycle(record);
      lifecycle.start();

      const aborted = lifecycle.abort("User cancelled operation");
      expect(aborted.state).toBe("DONE");
      expect(aborted.status).toBe("aborted");
      expect(aborted.error).toBe("User cancelled operation");
    });

    it("transitions RUNNING -> time_limited on timeout", () => {
      const record = createRunRecord({ agent: "test-agent", prompt: "Hello" });
      const lifecycle = new RunLifecycle(record);
      lifecycle.start();

      const timeoutRecord = lifecycle.timeout(5000);
      expect(timeoutRecord.state).toBe("DONE");
      expect(timeoutRecord.status).toBe("time_limited");
      expect(timeoutRecord.error).toContain("timed out");
    });

    it("transitions RUNNING -> budget_limited on turn limit", () => {
      const record = createRunRecord({ agent: "test-agent", prompt: "Hello", turnBudget: 10 });
      const lifecycle = new RunLifecycle(record);
      lifecycle.start();

      const budgetRecord = lifecycle.budgetExceeded(10);
      expect(budgetRecord.state).toBe("DONE");
      expect(budgetRecord.status).toBe("budget_limited");
      expect(budgetRecord.turns).toBe(10);
    });

    it("rejects illegal transitions from DONE state", () => {
      const record = createRunRecord({ agent: "test-agent", prompt: "Hello" });
      const lifecycle = new RunLifecycle(record);
      lifecycle.start();
      lifecycle.complete({ output: "Finished" });

      expect(() => lifecycle.start()).toThrow(/Cannot transition/);
      expect(() => lifecycle.fail("error")).toThrow(/Cannot transition/);
      expect(() => lifecycle.abort("cancel")).toThrow(/Cannot transition/);
    });

    it("emits events on status and progress updates", () => {
      const record = createRunRecord({ agent: "test-agent", prompt: "Hello" });
      const lifecycle = new RunLifecycle(record);
      const events: string[] = [];

      lifecycle.on("status", (status) => events.push(`status:${status}`));
      lifecycle.on("update", (up) => events.push(`update:${up.turns}`));

      lifecycle.start();
      lifecycle.updateProgress({ turns: 1 });
      lifecycle.updateProgress({ turns: 2 });
      lifecycle.complete({ output: "ok" });

      expect(events).toEqual([
        "status:running",
        "update:1",
        "update:2",
        "status:completed",
      ]);
    });
  });

  describe("ConcurrencyPool", () => {
    it("executes tasks immediately up to maxConcurrent limit", async () => {
      const pool = new ConcurrencyPool({ maxConcurrent: 2 });
      let active = 0;
      let maxSeenActive = 0;

      const runTask = async (delayMs: number) => {
        return pool.run(async () => {
          active++;
          maxSeenActive = Math.max(maxSeenActive, active);
          await new Promise((res) => setTimeout(res, delayMs));
          active--;
          return delayMs;
        });
      };

      const promises = [runTask(30), runTask(30), runTask(30), runTask(30)];
      const results = await Promise.all(promises);

      expect(results).toEqual([30, 30, 30, 30]);
      expect(maxSeenActive).toBe(2);
      expect(pool.activeCount).toBe(0);
      expect(pool.pendingCount).toBe(0);
    });

    it("tracks queue statistics accurately", async () => {
      const pool = new ConcurrencyPool({ maxConcurrent: 1 });
      expect(pool.stats).toEqual({ active: 0, pending: 0, maxConcurrent: 1 });

      let releaseTask1: () => void;
      const task1Promise = new Promise<void>((r) => {
        releaseTask1 = r;
      });

      const p1 = pool.run(async () => {
        await task1Promise;
        return 1;
      });

      const p2 = pool.run(async () => 2);

      // Task 1 should be active, task 2 pending in queue
      expect(pool.activeCount).toBe(1);
      expect(pool.pendingCount).toBe(1);

      releaseTask1!();
      await p1;
      await p2;

      expect(pool.activeCount).toBe(0);
      expect(pool.pendingCount).toBe(0);
    });

    it("supports cancelling queued task with AbortSignal", async () => {
      const pool = new ConcurrencyPool({ maxConcurrent: 1 });
      let releaseTask1: () => void;
      const task1Promise = new Promise<void>((r) => {
        releaseTask1 = r;
      });

      const p1 = pool.run(async () => {
        await task1Promise;
        return "first";
      });

      const abortController = new AbortController();
      const p2 = pool.run(
        async () => "second",
        abortController.signal
      );

      expect(pool.pendingCount).toBe(1);
      abortController.abort(new Error("Queue cancelled"));

      await expect(p2).rejects.toThrow("Queue cancelled");
      expect(pool.pendingCount).toBe(0);

      releaseTask1!();
      const r1 = await p1;
      expect(r1).toBe("first");
    });

    it("immediately rejects acquire if signal already aborted", async () => {
      const pool = new ConcurrencyPool({ maxConcurrent: 2 });
      const controller = new AbortController();
      controller.abort(new Error("Already aborted"));

      await expect(pool.acquire(controller.signal)).rejects.toThrow(
        "Already aborted"
      );
    });
  });

  describe("SteeringManager (Live Steering Channel)", () => {
    it("queues and delivers steering messages to running agents", () => {
      const steering = new SteeringManager();
      const runId = "run_test_123";

      expect(steering.hasPending(runId)).toBe(false);
      expect(steering.getPending(runId)).toEqual([]);

      steering.steer(runId, "Focus on testing error paths first");
      steering.steer(runId, "Also check for memory leaks");

      expect(steering.hasPending(runId)).toBe(true);
      expect(steering.peek(runId)).toEqual([
        "Focus on testing error paths first",
        "Also check for memory leaks",
      ]);

      const consumed = steering.consume(runId);
      expect(consumed).toEqual([
        "Focus on testing error paths first",
        "Also check for memory leaks",
      ]);
      expect(steering.hasPending(runId)).toBe(false);
    });

    it("evicts oldest messages when maxQueueSize is exceeded", () => {
      const steering = new SteeringManager({ maxQueueSize: 2 });
      const runId = "run_small_queue";

      steering.steer(runId, "msg 1");
      steering.steer(runId, "msg 2");
      steering.steer(runId, "msg 3");

      expect(steering.getPending(runId)).toEqual(["msg 2", "msg 3"]);
      expect(steering.activeRunsWithSteering()).toEqual([runId]);
    });

    it("emits steer event when message is sent", () => {
      const steering = new SteeringManager();
      const messages: { runId: string; message: string }[] = [];

      steering.on("steer", (runId, message) => {
        messages.push({ runId, message });
      });

      steering.steer("run_abc", "Hello live agent");
      expect(messages).toEqual([{ runId: "run_abc", message: "Hello live agent" }]);
    });

    it("clears pending steering on agent cleanup", () => {
      const steering = new SteeringManager();
      steering.steer("run_to_clear", "Test message");
      expect(steering.hasPending("run_to_clear")).toBe(true);

      steering.clear("run_to_clear");
      expect(steering.hasPending("run_to_clear")).toBe(false);
    });
  });

  describe("ReplayCache (Crash-Recovery & Idempotency)", () => {
    it("generates deterministic replay keys", () => {
      const cache = new ReplayCache();
      const key1 = cache.computeKey("code-reviewer", "Review index.ts for bugs", {
        model: "vllm-local/qwen3.6",
      });
      const key2 = cache.computeKey("code-reviewer", "Review index.ts for bugs", {
        model: "vllm-local/qwen3.6",
      });
      const key3 = cache.computeKey("code-reviewer", "Review other.ts for bugs");

      expect(key1).toBe(key2);
      expect(key1).not.toBe(key3);
    });

    it("stores and retrieves completed run records", () => {
      const cache = new ReplayCache();
      const record = createRunRecord({ agent: "code-reviewer", prompt: "Review index.ts" });
      record.status = "completed";
      record.state = "DONE";
      record.output = "No bugs found!";

      const key = cache.computeKey("code-reviewer", "Review index.ts");
      expect(cache.has(key)).toBe(false);

      cache.set(key, record);
      expect(cache.has(key)).toBe(true);

      const retrieved = cache.get(key);
      expect(retrieved).toBeDefined();
      expect(retrieved?.output).toBe("No bugs found!");
      expect(retrieved?.status).toBe("completed");
    });

    it("supports clearing and entry eviction when maxEntries is exceeded", () => {
      const cache = new ReplayCache({ maxEntries: 2 });
      const rec = (p: string) =>
        createRunRecord({ agent: "agent", prompt: p });

      cache.set("k1", rec("1"));
      cache.set("k2", rec("2"));
      cache.set("k3", rec("3"));

      expect(cache.size).toBe(2);
      expect(cache.has("k1")).toBe(false); // oldest evicted
      expect(cache.has("k2")).toBe(true);
      expect(cache.has("k3")).toBe(true);

      cache.delete("k2");
      expect(cache.has("k2")).toBe(false);

      cache.clear();
      expect(cache.size).toBe(0);
    });

    it("supports persisting and restoring cache from disk", async () => {
      const tmp = await mkdtemp(join(tmpdir(), "replay-cache-test-"));
      const filePath = join(tmp, "cache.json");

      try {
        const cache = new ReplayCache({ persistPath: filePath });
        const record = createRunRecord({ agent: "persisted", prompt: "Save me" });
        record.status = "completed";
        record.state = "DONE";
        record.output = "Saved state";

        const key = cache.computeKey("persisted", "Save me");
        cache.set(key, record);
        await cache.saveToDisk();

        const newCache = new ReplayCache({ persistPath: filePath });
        await newCache.loadFromDisk();

        expect(newCache.has(key)).toBe(true);
        expect(newCache.get(key)?.output).toBe("Saved state");
      } finally {
        await rm(tmp, { recursive: true, force: true });
      }
    });
  });

  describe("ControlPlane Orchestration", () => {
    let mockRunner: AgentRunner;

    beforeEach(() => {
      mockRunner = {
        runtime: "pi-inprocess",
        async execute(agent, options, signal, onUpdate) {
          if (onUpdate) onUpdate("thinking...");
          if (signal?.aborted) {
            throw new Error("Aborted before run");
          }
          const rec = createRunRecord({
            agent: typeof options.agent === "string" ? options.agent : options.agent.name,
            prompt: options.prompt,
            runtime: "pi-inprocess",
            depth: options.depth,
          });
          rec.status = "completed";
          rec.state = "DONE";
          rec.output = `Output for ${options.prompt}`;
          rec.turns = 2;
          rec.tokens = { input: 50, output: 25, total: 75 };
          return rec;
        },
      };
    });

    it("dispatches execution and returns completed RunRecord", async () => {
      const cp = new ControlPlane({
        runnerResolver: () => mockRunner,
      });

      const options: ExecutionOptions = {
        agent: "explorer",
        prompt: "Find all typescript files",
      };

      const run = await cp.dispatch(options);

      expect(run.id).toBeDefined();
      expect(run.agent).toBe("explorer");
      expect(run.status).toBe("completed");
      expect(run.state).toBe("DONE");
      expect(run.output).toContain("Output for Find all typescript files");
      expect(cp.listActiveRuns().length).toBe(0);
      expect(cp.listAllRuns().length).toBe(1);
      expect(cp.getRun(run.id)).toBeDefined();

      const stats = cp.stats();
      expect(stats.totalRuns).toBe(1);
      expect(stats.activeCount).toBe(0);
    });

    it("enforces MAX_RECURSION_DEPTH limit guardrail", async () => {
      const cp = new ControlPlane({
        runnerResolver: () => mockRunner,
      });

      const options: ExecutionOptions = {
        agent: "explorer",
        prompt: "Deep loop",
        depth: MAX_RECURSION_DEPTH + 1,
      };

      await expect(cp.dispatch(options)).rejects.toThrow(/recursion depth/i);
    });

    it("utilizes replay cache when replayKey or caching is enabled", async () => {
      const cp = new ControlPlane({
        runnerResolver: () => mockRunner,
        enableReplayCache: true,
      });

      const options: ExecutionOptions = {
        agent: "cached-agent",
        prompt: "Compute expensive hash",
        replayKey: "expensive-hash-key-1",
      };

      // First run executes mock runner
      const run1 = await cp.dispatch(options);
      expect(run1.status).toBe("completed");

      // Second run with same replayKey should return cached record immediately
      const run2 = await cp.dispatch(options);
      expect(run2.id).toBe(run1.id);
      expect(run2.output).toBe(run1.output);
    });

    it("handles run abortion via cp.abort(runId)", async () => {
      let abortTriggered = false;

      const longRunner: AgentRunner = {
        runtime: "pi-inprocess",
        async execute(agent, options, signal) {
          return new Promise<RunRecord>((resolve, reject) => {
            signal?.addEventListener("abort", () => {
              abortTriggered = true;
              const rec = createRunRecord({ agent: "long-agent", prompt: options.prompt });
              rec.status = "aborted";
              rec.state = "DONE";
              rec.error = "Aborted";
              resolve(rec);
            });
          });
        },
      };

      const cp = new ControlPlane({
        runnerResolver: () => longRunner,
      });

      const dispatchPromise = cp.dispatch({
        agent: "long-agent",
        prompt: "Run forever",
      });

      // Let run start
      await new Promise((r) => setTimeout(r, 10));
      const active = cp.listActiveRuns();
      expect(active.length).toBe(1);
      const runId = active[0].id;

      const abortOk = cp.abort(runId, "Terminated by user");
      expect(abortOk).toBe(true);

      const result = await dispatchPromise;
      expect(result.status).toBe("aborted");
      expect(abortTriggered).toBe(true);
      expect(cp.listActiveRuns().length).toBe(0);
    });

    it("allows live steering of running agent via cp.steer(runId, message)", async () => {
      const steerableRunner: AgentRunner = {
        runtime: "pi-inprocess",
        async execute(agent, options, signal) {
          await new Promise((r) => setTimeout(r, 30));
          const rec = createRunRecord({ agent: "steerable", prompt: options.prompt });
          rec.status = "completed";
          rec.state = "DONE";
          rec.output = "Steered output";
          return rec;
        },
      };

      const cp = new ControlPlane({
        runnerResolver: () => steerableRunner,
      });

      const dispatchPromise = cp.dispatch({
        agent: "steerable",
        prompt: "Generate plan",
      });

      await new Promise((r) => setTimeout(r, 5));
      const active = cp.listActiveRuns();
      expect(active.length).toBe(1);
      const runId = active[0].id;

      const steered = cp.steer(runId, "Make sure to include security considerations");
      expect(steered).toBe(true);
      expect(cp.getPendingSteering(runId)).toEqual([
        "Make sure to include security considerations",
      ]);

      const consumed = cp.consumeSteering(runId);
      expect(consumed).toEqual([
        "Make sure to include security considerations",
      ]);
      expect(cp.getPendingSteering(runId)).toEqual([]);

      const result = await dispatchPromise;
      expect(result.status).toBe("completed");
    });

    it("handles timeout automatically", async () => {
      const hangingRunner: AgentRunner = {
        runtime: "pi-inprocess",
        async execute(agent, options, signal) {
          return new Promise<RunRecord>((resolve, reject) => {
            signal?.addEventListener("abort", () => {
              reject(new Error("Subagent timed out after 20ms"));
            });
          });
        },
      };

      const cp = new ControlPlane({
        runnerResolver: () => hangingRunner,
      });

      const result = await cp.dispatch({
        agent: "hanging",
        prompt: "Never finishes",
        timeout: 20,
      });

      expect(result.status).toBe("time_limited");
      expect(result.error).toContain("timed out after 20ms");
    });
  });
});
