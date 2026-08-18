import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { mkdtemp, rm, writeFile, mkdir, utimes, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  SessionsIndex,
  type SessionIndexEntry,
  type SessionIndexData,
} from "../src/observability/sessions-index.js";
import {
  AuditLogger,
  type AuditRecord,
  formatTaskNotificationXml,
} from "../src/observability/audit-logger.js";
import { createRunRecord } from "../src/types.js";

describe("Observability & Fast Caching (`pi-agent-core/observability`)", () => {
  let tempDir: string;
  let sessionsDir: string;
  let historyDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "pi-obs-test-"));
    sessionsDir = join(tempDir, "sessions");
    historyDir = join(tempDir, "subagent-history");
    await mkdir(sessionsDir, { recursive: true });
    await mkdir(historyDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("SessionsIndex (Fast Cold Scanning & Atomic Index Cache)", () => {
    it("scans an empty sessions directory and writes an initial index", async () => {
      const indexer = new SessionsIndex({ baseDir: sessionsDir });
      const result = await indexer.scan();

      expect(result.entries).toEqual([]);
      expect(result.scannedCount).toBe(0);
      expect(result.cacheHits).toBe(0);
      expect(result.cacheMisses).toBe(0);
    });

    it("parses JSONL session files and builds accurate metadata records", async () => {
      const encDir = join(sessionsDir, "--test-project--");
      await mkdir(encDir, { recursive: true });

      const session1Path = join(encDir, "session-1.jsonl");
      const session1Content = [
        JSON.stringify({ type: "session", id: "ses_001", title: "Refactor Auth" }),
        JSON.stringify({ type: "user", message: { content: "Help refactor" }, timestamp: 1000 }),
        JSON.stringify({
          type: "assistant",
          message: {
            content: "Sure, starting refactor...",
            model: "claude-3-7-sonnet",
            usage: { input: 100, output: 50, total: 150 },
          },
          timestamp: 2000,
        }),
      ].join("\n");
      await writeFile(session1Path, session1Content, "utf-8");

      const indexer = new SessionsIndex({ baseDir: sessionsDir });
      const result = await indexer.scan();

      expect(result.scannedCount).toBe(1);
      expect(result.cacheMisses).toBe(1);
      expect(result.entries.length).toBe(1);

      const entry = result.entries[0];
      expect(entry.sessionId).toBe("ses_001");
      expect(entry.title).toBe("Refactor Auth");
      expect(entry.model).toBe("claude-3-7-sonnet");
      expect(entry.messageCount).toBe(2);
      expect(entry.tokens.total).toBe(150);
      expect(entry.firstMessageAt).toBe(1000);
      expect(entry.lastMessageAt).toBe(2000);

      // Verify sessions-index.json was created on disk atomically
      const indexPath = join(encDir, "sessions-index.json");
      const indexFileRaw = await readFile(indexPath, "utf-8");
      const indexData = JSON.parse(indexFileRaw) as SessionIndexData;
      expect(indexData.version).toBe(1);
      expect(Object.keys(indexData.entries).length).toBe(1);
    });

    it("uses cache on subsequent scans if mtime and size are unchanged (sub-100ms)", async () => {
      const encDir = join(sessionsDir, "--speed-test--");
      await mkdir(encDir, { recursive: true });

      // Create 5 session files
      for (let i = 0; i < 5; i++) {
        const p = join(encDir, `session-${i}.jsonl`);
        const content = [
          JSON.stringify({ type: "session", id: `ses_00${i}`, title: `Task ${i}` }),
          JSON.stringify({ type: "user", message: { content: `Hi ${i}` }, timestamp: 1000 + i * 100 }),
          JSON.stringify({
            type: "assistant",
            message: { content: `Done ${i}`, usage: { input: 10, output: 10, total: 20 } },
            timestamp: 2000 + i * 100,
          }),
        ].join("\n");
        await writeFile(p, content, "utf-8");
      }

      const indexer = new SessionsIndex({ baseDir: sessionsDir });

      // First scan (cold)
      const coldStart = performance.now();
      const coldResult = await indexer.scan();
      const coldDuration = performance.now() - coldStart;

      expect(coldResult.scannedCount).toBe(5);
      expect(coldResult.cacheMisses).toBe(5);
      expect(coldResult.cacheHits).toBe(0);

      // Second scan (warm cache hit)
      const warmStart = performance.now();
      const warmResult = await indexer.scan();
      const warmDuration = performance.now() - warmStart;

      expect(warmResult.scannedCount).toBe(5);
      expect(warmResult.cacheHits).toBe(5);
      expect(warmResult.cacheMisses).toBe(0);
      expect(warmDuration).toBeLessThan(100); // Guarantees sub-100ms scan
    });

    it("incrementally updates only modified session files when mtime changes", async () => {
      const encDir = join(sessionsDir, "--incremental--");
      await mkdir(encDir, { recursive: true });

      const f1 = join(encDir, "file-1.jsonl");
      const f2 = join(encDir, "file-2.jsonl");
      await writeFile(f1, JSON.stringify({ type: "session", id: "s1", title: "Initial S1" }), "utf-8");
      await writeFile(f2, JSON.stringify({ type: "session", id: "s2", title: "Initial S2" }), "utf-8");

      const indexer = new SessionsIndex({ baseDir: sessionsDir });
      await indexer.scan();

      // Modify only f2
      await new Promise((r) => setTimeout(r, 20));
      const updatedContent = [
        JSON.stringify({ type: "session", id: "s2", title: "Updated S2" }),
        JSON.stringify({ type: "user", message: { content: "New question" }, timestamp: 5000 }),
      ].join("\n");
      await writeFile(f2, updatedContent, "utf-8");

      const res2 = await indexer.scan();
      expect(res2.cacheHits).toBe(1); // file-1 unchanged
      expect(res2.cacheMisses).toBe(1); // file-2 refreshed

      const s2 = res2.entries.find((e) => e.sessionId === "s2");
      expect(s2?.title).toBe("Updated S2");
      expect(s2?.messageCount).toBe(1);
    });

    it("cleans up deleted session files from the index", async () => {
      const encDir = join(sessionsDir, "--deletion--");
      await mkdir(encDir, { recursive: true });

      const f1 = join(encDir, "to-keep.jsonl");
      const f2 = join(encDir, "to-delete.jsonl");
      await writeFile(f1, JSON.stringify({ type: "session", id: "keep" }), "utf-8");
      await writeFile(f2, JSON.stringify({ type: "session", id: "del" }), "utf-8");

      const indexer = new SessionsIndex({ baseDir: sessionsDir });
      const first = await indexer.scan();
      expect(first.entries.length).toBe(2);

      await rm(f2);
      const second = await indexer.scan();
      expect(second.entries.length).toBe(1);
      expect(second.entries[0].sessionId).toBe("keep");
    });

    it("finds sessions by query, ID, and sorts by most recent", async () => {
      const encDir = join(sessionsDir, "--query--");
      await mkdir(encDir, { recursive: true });

      await writeFile(
        join(encDir, "a.jsonl"),
        [
          JSON.stringify({ type: "session", id: "ses_alpha", title: "Authentication module" }),
          JSON.stringify({ type: "user", timestamp: 1000 }),
        ].join("\n"),
        "utf-8"
      );

      await writeFile(
        join(encDir, "b.jsonl"),
        [
          JSON.stringify({ type: "session", id: "ses_beta", title: "Payment processor" }),
          JSON.stringify({ type: "user", timestamp: 3000 }),
        ].join("\n"),
        "utf-8"
      );

      const indexer = new SessionsIndex({ baseDir: sessionsDir });
      await indexer.scan();

      const byId = await indexer.findById("ses_alpha");
      expect(byId?.sessionId).toBe("ses_alpha");

      const matchingAuth = await indexer.search("Auth");
      expect(matchingAuth.length).toBe(1);
      expect(matchingAuth[0].sessionId).toBe("ses_alpha");

      const recent = await indexer.getRecent(10);
      expect(recent[0].sessionId).toBe("ses_beta"); // timestamp 3000 > 1000
      expect(recent[1].sessionId).toBe("ses_alpha");
    });
  });

  describe("AuditLogger (Structured JSONL Logging & Telemetry)", () => {
    it("appends structured audit records to JSONL file atomically", async () => {
      const logger = new AuditLogger({ historyDir });
      const record = createRunRecord({
        agent: "code-cleaner",
        prompt: "Remove unused imports in src/index.ts",
        turnBudget: 15,
      });
      record.status = "completed";
      record.state = "DONE";
      record.output = "Cleaned 3 files successfully.";
      record.turns = 4;
      record.tokens = { input: 1200, output: 400, cacheRead: 500, total: 1600 };
      record.completedAt = Date.now();
      record.durationMs = 4500;
      record.model = "vllm-local/qwen3.6-27b";

      const appendRes = await logger.append(record, { sessionId: "session_abc" });
      expect(appendRes.success).toBe(true);
      expect(appendRes.filePath).toBe(join(historyDir, "session_abc.jsonl"));

      const content = await readFile(appendRes.filePath, "utf-8");
      const parsed = JSON.parse(content.trim()) as AuditRecord;

      expect(parsed.runId).toBe(record.id);
      expect(parsed.agent).toBe("code-cleaner");
      expect(parsed.prompt).toBe("Remove unused imports in src/index.ts");
      expect(parsed.status).toBe("completed");
      expect(parsed.output).toBe("Cleaned 3 files successfully.");
      expect(parsed.turns).toBe(4);
      expect(parsed.tokens.total).toBe(1600);
      expect(parsed.tokens.cacheRead).toBe(500);
      expect(parsed.model).toBe("vllm-local/qwen3.6-27b");
      expect(typeof parsed.loggedAt).toBe("number");
    });

    it("queries audit records with filters for agent, status, model, and limit", async () => {
      const logger = new AuditLogger({ historyDir });

      const r1 = createRunRecord({ agent: "verifier", prompt: "verify build" });
      r1.status = "completed";
      r1.startedAt = 1000;
      r1.completedAt = 2000;
      r1.model = "gemini-flash";
      r1.tokens = { input: 100, output: 50, total: 150 };

      const r2 = createRunRecord({ agent: "explorer", prompt: "explore api" });
      r2.status = "failed";
      r2.startedAt = 2001;
      r2.completedAt = 3000;
      r2.error = "File not found";
      r2.model = "qwen-local";
      r2.tokens = { input: 200, output: 10, total: 210 };

      const r3 = createRunRecord({ agent: "verifier", prompt: "verify tests" });
      r3.status = "completed";
      r3.startedAt = 3001;
      r3.completedAt = 4000;
      r3.model = "gemini-flash";
      r3.tokens = { input: 150, output: 80, total: 230 };

      await logger.append(r1, { sessionId: "ses1" });
      await new Promise((r) => setTimeout(r, 2));
      await logger.append(r2, { sessionId: "ses1" });
      await new Promise((r) => setTimeout(r, 2));
      await logger.append(r3, { sessionId: "ses1" });

      const all = await logger.query({ sessionId: "ses1" });
      expect(all.length).toBe(3);

      const verifiers = await logger.query({ sessionId: "ses1", agent: "verifier" });
      expect(verifiers.length).toBe(2);

      const failed = await logger.query({ sessionId: "ses1", status: "failed" });
      expect(failed.length).toBe(1);
      expect(failed[0].agent).toBe("explorer");

      const limited = await logger.query({ sessionId: "ses1", limit: 1 });
      expect(limited.length).toBe(1);
      // Default query returns newest first
      expect(limited[0].runId).toBe(r3.id);
    });

    it("aggregates audit summary statistics across all session history files", async () => {
      const logger = new AuditLogger({ historyDir });

      const r1 = createRunRecord({ agent: "worker", prompt: "task 1" });
      r1.status = "completed";
      r1.tokens = { input: 1000, output: 200, total: 1200 };
      r1.cost = 0.005;
      r1.durationMs = 2000;
      r1.model = "gpt-4o";

      const r2 = createRunRecord({ agent: "worker", prompt: "task 2" });
      r2.status = "failed";
      r2.tokens = { input: 500, output: 100, total: 600 };
      r2.cost = 0.002;
      r2.durationMs = 1500;
      r2.model = "gpt-4o";

      const r3 = createRunRecord({ agent: "reviewer", prompt: "review task" });
      r3.status = "completed";
      r3.tokens = { input: 800, output: 300, total: 1100 };
      r3.cost = 0.004;
      r3.durationMs = 3000;
      r3.model = "claude-3-7-sonnet";

      await logger.append(r1, { sessionId: "sessA" });
      await logger.append(r2, { sessionId: "sessA" });
      await logger.append(r3, { sessionId: "sessB" });

      const summary = await logger.getSummary();
      expect(summary.totalRuns).toBe(3);
      expect(summary.completedRuns).toBe(2);
      expect(summary.failedRuns).toBe(1);
      expect(summary.successRate).toBeCloseTo(2 / 3, 2);
      expect(summary.totalTokens.total).toBe(2900);
      expect(summary.totalCost).toBeCloseTo(0.011, 4);
      expect(summary.byAgent.worker.runs).toBe(2);
      expect(summary.byAgent.reviewer.runs).toBe(1);
      expect(summary.byModel["gpt-4o"].runs).toBe(2);
      expect(summary.byModel["claude-3-7-sonnet"].runs).toBe(1);
    });

    it("formats standard <task-notification> XML block for coordinator protocol", () => {
      const record = createRunRecord({
        agent: "verifier",
        prompt: "Verify all unit tests pass in packages/pi-agent-core",
      });
      record.status = "completed";
      record.output = "All 58 tests passed with 100% assertions satisfied.";
      record.turns = 3;
      record.tokens = { input: 1500, output: 250, total: 1750 };
      record.cost = 0.003;
      record.durationMs = 4200;
      record.model = "vllm-local/qwen3.6-27b";
      record.verdict = "PASS";

      const xml = formatTaskNotificationXml(record);

      expect(xml).toContain('<task-notification status="completed" agent="verifier">');
      expect(xml).toContain("<run-id>");
      expect(xml).toContain(record.id);
      expect(xml).toContain("<summary>");
      expect(xml).toContain("<result>");
      expect(xml).toContain("All 58 tests passed");
      expect(xml).toContain("<verdict>PASS</verdict>");
      expect(xml).toContain('<usage turns="3" total-tokens="1750" duration-ms="4200"');
      expect(xml).toContain("</task-notification>");
    });
  });
});
