import { homedir } from "node:os";
import { join, basename } from "node:path";
import {
  mkdir,
  appendFile,
  readFile,
  readdir,
} from "node:fs/promises";
import type {
  RunRecord,
  RunStatus,
  RuntimeType,
  TokenUsage,
} from "../types.js";

export interface AuditRecord {
  runId: string;
  agent: string;
  runtime: RuntimeType;
  status: RunStatus;
  prompt: string;
  taskSummary?: string;
  output?: string;
  error?: string;
  turns: number;
  turnBudget: number;
  tokens: TokenUsage;
  cost?: number;
  model?: string;
  verdict?: "PASS" | "FAIL" | "PARTIAL" | string;
  depth?: number;
  parentRunId?: string;
  sessionId?: string;
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  loggedAt: number;
}

export interface AuditQueryOptions {
  sessionId?: string;
  agent?: string;
  model?: string;
  status?: RunStatus;
  limit?: number;
  since?: number;
}

export interface AgentAuditSummary {
  runs: number;
  completed: number;
  failed: number;
  tokens: TokenUsage;
  cost: number;
}

export interface ModelAuditSummary {
  runs: number;
  tokens: TokenUsage;
  cost: number;
}

export interface AuditSummary {
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  abortedRuns: number;
  successRate: number;
  totalTokens: TokenUsage;
  totalCost: number;
  totalDurationMs: number;
  byAgent: Record<string, AgentAuditSummary>;
  byModel: Record<string, ModelAuditSummary>;
}

export interface AuditLoggerOptions {
  historyDir?: string;
}

/**
 * Structured, append-only JSONL telemetry and audit logger for subagents.
 */
export class AuditLogger {
  private historyDir: string;

  constructor(options?: AuditLoggerOptions) {
    this.historyDir =
      options?.historyDir ??
      join(homedir(), ".pi", "agent", "subagent-history");
  }

  /**
   * Append a completed or updated run record to the session history audit log.
   */
  public async append(
    record: RunRecord | AuditRecord,
    options?: { sessionId?: string; historyDir?: string }
  ): Promise<{ success: boolean; filePath: string }> {
    const dir = options?.historyDir ?? this.historyDir;
    await mkdir(dir, { recursive: true });

    const sessionId =
      options?.sessionId ??
      (record as any).sessionId ??
      this.resolveCurrentSessionId();

    const filePath = join(dir, `${sessionId}.jsonl`);

    const auditEntry: AuditRecord = {
      runId: record.runId ?? (record as RunRecord).id,
      agent: record.agent,
      runtime: record.runtime,
      status: record.status,
      prompt: record.prompt,
      taskSummary:
        (record as any).taskSummary ??
        (record as any).taskForDisplay ??
        this.extractTaskSummary(record.prompt),
      output: record.output,
      error: record.error,
      turns: record.turns,
      turnBudget: record.turnBudget,
      tokens: { ...record.tokens },
      cost: record.cost,
      model: record.model,
      verdict: record.verdict,
      depth: record.depth,
      parentRunId: record.parentRunId,
      sessionId,
      startedAt: record.startedAt,
      completedAt: record.completedAt ?? Date.now(),
      durationMs:
        record.durationMs ??
        ((record.completedAt ?? Date.now()) - record.startedAt),
      loggedAt: (record as AuditRecord).loggedAt ?? Date.now(),
    };

    const line = JSON.stringify(auditEntry) + "\n";

    try {
      await appendFile(filePath, line, "utf-8");
      return { success: true, filePath };
    } catch {
      return { success: false, filePath };
    }
  }

  /**
   * Query historical audit records matching filter criteria.
   */
  public async query(options?: AuditQueryOptions): Promise<AuditRecord[]> {
    const dir = this.historyDir;
    let files: string[] = [];

    try {
      await mkdir(dir, { recursive: true });
      if (options?.sessionId) {
        files = [`${options.sessionId}.jsonl`];
      } else {
        const allFiles = await readdir(dir);
        files = allFiles.filter((f) => f.endsWith(".jsonl"));
      }
    } catch {
      return [];
    }

    const records: AuditRecord[] = [];

    for (const fileName of files) {
      const filePath = join(dir, fileName);
      try {
        const content = await readFile(filePath, "utf-8");
        const lines = content.split("\n");
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const entry = JSON.parse(trimmed) as AuditRecord;

            if (options?.since && entry.loggedAt < options.since) continue;
            if (options?.agent && entry.agent !== options.agent) continue;
            if (options?.model && entry.model !== options.model) continue;
            if (options?.status && entry.status !== options.status) continue;

            records.push(entry);
          } catch {
            // ignore corrupt line
          }
        }
      } catch {
        // file unreadable
      }
    }

    // Sort newest first by loggedAt, falling back to completedAt/startedAt
    records.sort((a, b) => {
      const timeA = a.loggedAt || a.completedAt || a.startedAt;
      const timeB = b.loggedAt || b.completedAt || b.startedAt;
      return timeB - timeA;
    });

    if (options?.limit && options.limit > 0) {
      return records.slice(0, options.limit);
    }
    return records;
  }

  /**
   * Aggregate statistics across all audit logs.
   */
  public async getSummary(options?: { since?: number }): Promise<AuditSummary> {
    const records = await this.query({ since: options?.since });

    const summary: AuditSummary = {
      totalRuns: records.length,
      completedRuns: 0,
      failedRuns: 0,
      abortedRuns: 0,
      successRate: 0,
      totalTokens: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0,
      },
      totalCost: 0,
      totalDurationMs: 0,
      byAgent: {},
      byModel: {},
    };

    for (const rec of records) {
      if (rec.status === "completed") {
        summary.completedRuns++;
      } else if (rec.status === "failed") {
        summary.failedRuns++;
      } else if (rec.status === "aborted") {
        summary.abortedRuns++;
      }

      summary.totalTokens.input += rec.tokens.input;
      summary.totalTokens.output += rec.tokens.output;
      summary.totalTokens.cacheRead = (summary.totalTokens.cacheRead ?? 0) + (rec.tokens.cacheRead ?? 0);
      summary.totalTokens.cacheWrite = (summary.totalTokens.cacheWrite ?? 0) + (rec.tokens.cacheWrite ?? 0);
      summary.totalTokens.total += rec.tokens.total;

      if (rec.cost) {
        summary.totalCost += rec.cost;
      }
      if (rec.durationMs) {
        summary.totalDurationMs += rec.durationMs;
      }

      // Aggregate by Agent
      if (!summary.byAgent[rec.agent]) {
        summary.byAgent[rec.agent] = {
          runs: 0,
          completed: 0,
          failed: 0,
          tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          cost: 0,
        };
      }
      const agentStat = summary.byAgent[rec.agent];
      agentStat.runs++;
      if (rec.status === "completed") agentStat.completed++;
      if (rec.status === "failed") agentStat.failed++;
      agentStat.tokens.input += rec.tokens.input;
      agentStat.tokens.output += rec.tokens.output;
      agentStat.tokens.total += rec.tokens.total;
      if (rec.cost) agentStat.cost += rec.cost;

      // Aggregate by Model
      const modelKey = rec.model || "unknown";
      if (!summary.byModel[modelKey]) {
        summary.byModel[modelKey] = {
          runs: 0,
          tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          cost: 0,
        };
      }
      const modelStat = summary.byModel[modelKey];
      modelStat.runs++;
      modelStat.tokens.input += rec.tokens.input;
      modelStat.tokens.output += rec.tokens.output;
      modelStat.tokens.total += rec.tokens.total;
      if (rec.cost) modelStat.cost += rec.cost;
    }

    summary.successRate =
      summary.totalRuns > 0 ? summary.completedRuns / summary.totalRuns : 1;

    return summary;
  }

  private resolveCurrentSessionId(): string {
    const fromEnv = process.env.PI_SESSION_ID || process.env.PI_SESSION_FILE;
    if (fromEnv) {
      const base = basename(fromEnv).replace(/\.(jsonl|json)$/i, "");
      return base || "default_session";
    }
    return "session_global";
  }

  private extractTaskSummary(prompt: string): string {
    const firstLine = prompt.split("\n")[0].trim();
    if (firstLine.length <= 120) return firstLine;
    return firstLine.slice(0, 117) + "...";
  }
}

/**
 * Format a RunRecord or AuditRecord as a coordinator-friendly <task-notification> XML block.
 */
export function formatTaskNotificationXml(
  record: RunRecord | AuditRecord
): string {
  const status = record.status;
  const agent = escapeXml(record.agent);
  const runId = escapeXml(record.runId ?? (record as RunRecord).id ?? "unknown");
  const summary = escapeXml(
    (record as AuditRecord).taskSummary ??
      (record as any).taskForDisplay ??
      record.prompt.split("\n")[0].slice(0, 120)
  );
  const resultText = escapeXml(record.output || record.error || "");
  const verdict = record.verdict ? `<verdict>${escapeXml(record.verdict)}</verdict>` : "";
  const turns = record.turns ?? 0;
  const totalTokens = record.tokens?.total ?? 0;
  const durationMs = record.durationMs ?? 0;
  const costUsd = record.cost !== undefined ? ` cost-usd="${record.cost.toFixed(4)}"` : "";

  return [
    `<task-notification status="${status}" agent="${agent}">`,
    `  <run-id>${runId}</run-id>`,
    `  <summary>${summary}</summary>`,
    `  <result>${resultText}</result>`,
    verdict ? `  ${verdict}` : null,
    `  <usage turns="${turns}" total-tokens="${totalTokens}" duration-ms="${durationMs}"${costUsd} />`,
    `</task-notification>`,
  ]
    .filter(Boolean)
    .join("\n");
}

function escapeXml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
