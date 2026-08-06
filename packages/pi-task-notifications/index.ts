/**
 * pi-task-notifications — Structured result protocol for subagent runs.
 *
 * Ported from Claude Code's coordinatorMode.ts <task-notification> XML concept.
 * Provides:
 *   - formatTaskNotification(): transform a subagent result into a coordinator-
 *     friendly <task-notification> XML block (status/summary/result/usage).
 *   - appendRunAudit(): write a JSONL audit record per run for cluster
 *     observability (replayable, queryable).
 *   - inspect_run tool: lets the model/coordinator query the audit log for
 *     recent runs with usage stats.
 *
 * Decoupled from any specific runner: takes a normalized RunRecord and produces
 * protocol output. Fleet's SingleResult maps cleanly to RunRecord (see
 * toRunRecord helper).
 *
 * Audit log: ~/.pi/agent/subagent-history/{sessionId}.jsonl
 */

import { type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";
import * as path from "node:path";
import { homedir } from "node:os";

// ---- Protocol types --------------------------------------------------------

export type RunStatus = "completed" | "failed" | "killed" | "running" | "pending";

export interface RunUsage {
	totalTokens?: number;
	inputTokens?: number;
	outputTokens?: number;
	cacheReadTokens?: number;
	cacheWriteTokens?: number;
	costUsd?: number;
	toolUses?: number;
	turns?: number;
	durationMs?: number;
}

export interface RunRecord {
	runId: string;
	agent: string;
	task: string;
	status: RunStatus;
	summary: string;
	result?: string;
	usage?: RunUsage;
	model?: string;
	stopReason?: string;
	errorMessage?: string;
	startedAt?: number;
	endedAt?: number;
}

// ---- Audit log -------------------------------------------------------------

function getHistoryDir(): string {
	return path.join(homedir(), ".pi", "agent", "subagent-history");
}

function ensureHistoryDir(): string {
	const dir = getHistoryDir();
	fs.mkdirSync(dir, { recursive: true });
	return dir;
}

function getSessionId(): string {
	// PI_SESSION_ID / PI_SESSION_FILE are set by pi at runtime. Fall back to
	// a per-process stable id so audit records still land somewhere useful.
	const fromEnv = process.env.PI_SESSION_ID || process.env.PI_SESSION_FILE;
	if (fromEnv) {
		const base = path.basename(fromEnv).replace(/\.(jsonl|json)$/i, "");
		return base || "unknown";
	}
	return `pid-${process.pid}`;
}

/** Append a run record to the audit log (JSONL, best-effort). */
export function appendRunAudit(record: RunRecord): { path: string; appended: boolean } {
	const dir = ensureHistoryDir();
	const file = path.join(dir, `${getSessionId()}.jsonl`);
	const line = JSON.stringify({ ...record, loggedAt: Date.now() }) + "\n";
	try {
		fs.appendFileSync(file, line, "utf-8");
		return { path: file, appended: true };
	} catch {
		return { path: file, appended: false };
	}
}

/** Read recent run records from the audit log (newest first). */
export function readRecentRuns(limit = 20, sessionId?: string): RunRecord[] {
	const dir = getHistoryDir();
	const file = path.join(dir, `${sessionId ?? getSessionId()}.jsonl`);
	let content = "";
	try {
		content = fs.readFileSync(file, "utf-8");
	} catch {
		return [];
	}
	const records: RunRecord[] = [];
	for (const line of content.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		try {
			records.push(JSON.parse(trimmed) as RunRecord);
		} catch {
			// skip malformed
		}
	}
	return records.reverse().slice(0, limit);
}

// ---- XML protocol formatter ------------------------------------------------

function escapeXml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

/** Format a RunRecord as a <task-notification> XML block for coordinator consumption. */
export function formatTaskNotification(record: RunRecord): string {
	const usage = record.usage ?? {};
	const usageLines: string[] = [];
	if (usage.totalTokens != null) usageLines.push(`  <total_tokens>${usage.totalTokens}</total_tokens>`);
	if (usage.inputTokens != null) usageLines.push(`  <input_tokens>${usage.inputTokens}</input_tokens>`);
	if (usage.outputTokens != null) usageLines.push(`  <output_tokens>${usage.outputTokens}</output_tokens>`);
	if (usage.cacheReadTokens != null) usageLines.push(`  <cache_read_tokens>${usage.cacheReadTokens}</cache_read_tokens>`);
	if (usage.cacheWriteTokens != null) usageLines.push(`  <cache_write_tokens>${usage.cacheWriteTokens}</cache_write_tokens>`);
	if (usage.costUsd != null) usageLines.push(`  <cost_usd>${usage.costUsd.toFixed(6)}</cost_usd>`);
	if (usage.toolUses != null) usageLines.push(`  <tool_uses>${usage.toolUses}</tool_uses>`);
	if (usage.turns != null) usageLines.push(`  <turns>${usage.turns}</turns>`);
	if (usage.durationMs != null) usageLines.push(`  <duration_ms>${usage.durationMs}</duration_ms>`);

	const lines: string[] = [
		"<task-notification>",
		`<task-id>${escapeXml(record.runId)}</task-id>`,
		`<status>${record.status}</status>`,
		`<summary>${escapeXml(record.summary)}</summary>`,
	];
	if (record.agent) lines.push(`<agent>${escapeXml(record.agent)}</agent>`);
	if (record.model) lines.push(`<model>${escapeXml(record.model)}</model>`);
	if (record.stopReason) lines.push(`<stop_reason>${escapeXml(record.stopReason)}</stop_reason>`);
	if (record.result) {
		lines.push(`<result>${escapeXml(record.result)}</result>`);
	}
	if (record.errorMessage) {
		lines.push(`<error>${escapeXml(record.errorMessage)}</error>`);
	}
	if (usageLines.length > 0) {
		lines.push("<usage>");
		lines.push(...usageLines);
		lines.push("</usage>");
	}
	lines.push("</task-notification>");
	return lines.join("\n");
}

// ---- Fleet adapter ---------------------------------------------------------

/**
 * Map a fleet SingleResult (loosely typed here to avoid hard import) to RunRecord.
 * Callers pass the fleet result object; we read only the fields we need.
 */
export function toRunRecord(
	runId: string,
	singleResult: {
		agent: string;
		task: string;
		exitCode: number;
		usage?: {
			input?: number;
			output?: number;
			cacheRead?: number;
			cacheWrite?: number;
			cost?: number;
			turns?: number;
		};
		model?: string;
		stopReason?: string;
		errorMessage?: string;
		messages?: Array<{ role?: string; content?: unknown }>;
		stderr?: string;
	},
	startedAt?: number,
): RunRecord {
	const usage = singleResult.usage ?? {};
	const totalTokens = (usage.input ?? 0) + (usage.output ?? 0) + (usage.cacheRead ?? 0);
	// Extract last assistant text as result
	let result: string | undefined;
	const msgs = singleResult.messages ?? [];
	for (let i = msgs.length - 1; i >= 0; i--) {
		const m = msgs[i];
		if (m.role === "assistant") {
			const content = m.content;
			if (typeof content === "string") {
				result = content;
			} else if (Array.isArray(content)) {
				const texts = content
					.filter((b: { type?: string }) => b && b.type === "text")
					.map((b: { text?: unknown }) => String(b.text ?? ""));
				if (texts.length > 0) result = texts.join("\n");
			}
			if (result) break;
		}
	}
	const failed = singleResult.exitCode !== 0;
	const summary = failed
		? `Agent "${singleResult.agent}" failed (exit ${singleResult.exitCode})`
		: `Agent "${singleResult.agent}" completed`;
	return {
		runId,
		agent: singleResult.agent,
		task: singleResult.task,
		status: failed ? "failed" : "completed",
		summary,
		result,
		usage: {
			totalTokens: totalTokens || undefined,
			inputTokens: usage.input,
			outputTokens: usage.output,
			cacheReadTokens: usage.cacheRead,
			cacheWriteTokens: usage.cacheWrite,
			costUsd: usage.cost,
			turns: usage.turns,
			durationMs: startedAt != null ? Date.now() - startedAt : undefined,
		},
		model: singleResult.model,
		stopReason: singleResult.stopReason,
		errorMessage: singleResult.errorMessage ?? (failed ? singleResult.stderr : undefined),
		startedAt,
		endedAt: Date.now(),
	};
}

// ---- Extension entry -------------------------------------------------------

export default function taskNotifications(pi: ExtensionAPI) {
	pi.registerTool({
		name: "inspect_run",
		label: "Inspect Subagent Run",
		description: [
			"Inspect recent subagent runs with structured usage statistics.",
			"Returns a list of RunRecords (runId, agent, task, status, usage) from the audit log.",
			"Use this to observe what subagents did and how much they cost — cluster observability.",
			"",
			"Each run can be rendered as <task-notification> XML for coordinator consumption:",
			"  <task-notification><task-id>...</task-id><status>completed|failed</status>...</task-notification>",
		].join("\n"),
		parameters: Type.Object({
			limit: Type.Optional(
				Type.Integer({
					description: "Max runs to return (newest first). Default 10.",
					minimum: 1,
					maximum: 100,
				}),
			),
			xml: Type.Optional(
				Type.Boolean({
					description: "If true, render each run as <task-notification> XML instead of a summary line.",
				}),
			),
			session_id: Type.Optional(
				Type.String({
					description: "Optional session id to inspect (defaults to current session).",
				}),
			),
		}),
		promptGuidelines: [
			"Call inspect_run to review recent subagent activity and usage — do not poll in tight loops.",
			"Use the XML form when feeding results into coordinator-style synthesis.",
		],
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const limit = Math.min(100, Math.max(1, Number(params.limit ?? 10)));
			const asXml = Boolean(params.xml);
			const sessionId = params.session_id ? String(params.session_id) : undefined;
			try {
				const runs = readRecentRuns(limit, sessionId);
				if (runs.length === 0) {
					return {
						content: [
							{
								type: "text" as const,
								text: "No subagent runs recorded yet for this session.",
							},
						],
					};
				}
				const body = asXml
					? runs.map(formatTaskNotification).join("\n\n")
					: runs
							.map((r) => {
								const u = r.usage ?? {};
								const tok = u.totalTokens != null ? ` ${u.totalTokens} tok` : "";
								const cost = u.costUsd != null ? ` $${u.costUsd.toFixed(4)}` : "";
								const turns = u.turns != null ? ` ${u.turns} turns` : "";
								const dur = u.durationMs != null ? ` ${(u.durationMs / 1000).toFixed(1)}s` : "";
								return `- [${r.status}] ${r.runId} (${r.agent})${tok}${cost}${turns}${dur}: ${r.summary}`;
							})
							.join("\n");
				return {
					content: [
						{
							type: "text" as const,
							text: `# Recent subagent runs (${runs.length})\n\n${body}`,
						},
],
				details: { success: true, count: runs.length },
				};
			} catch (err) {
				return {
					content: [
						{
							type: "text" as const,
							text: `inspect_run error: ${err instanceof Error ? err.message : String(err)}`,
						},
],
details: { success: false, error: "inspect_failed" },
				};
			}
		},
	});
}
