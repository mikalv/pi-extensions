/**
 * Deterministic session-state catalog for compact summaries
 * (pattern from pi-smart-compact extraction — zero LLM).
 */
import type { MessageLike } from "./prune.ts";
import { extractText } from "./content.ts";

export interface StateCatalog {
	errors: string[];
	openLoops: string[];
	decisions: string[];
}

const ERROR_RE = /\b(error|failed|exception|ENOENT|EACCES|TypeError|panic)\b/i;
const DECISION_RE =
	/\b(decided|we'll use|going with|prefer|chosen|agreed to|will use)\b/i;
const OPEN_RE =
	/\b(TODO|FIXME|still need|next step|remaining|blocked|follow.?up)\b/i;

export function extractStateCatalog(messages: MessageLike[]): StateCatalog {
	const errors: string[] = [];
	const openLoops: string[] = [];
	const decisions: string[] = [];
	const seen = new Set<string>();

	const push = (bucket: string[], line: string) => {
		const key = line.slice(0, 160).toLowerCase();
		if (seen.has(key)) return;
		seen.add(key);
		bucket.push(line.slice(0, 200));
	};

	for (const msg of messages) {
		if (msg.role === "toolResult" && msg.isError) {
			const text = extractText(msg.content).replace(/\s+/g, " ").trim();
			if (text) push(errors, `${msg.toolName ?? "tool"}: ${text}`);
			continue;
		}
		if (msg.role === "bashExecution") {
			const failed = msg.cancelled || (typeof msg.exitCode === "number" && msg.exitCode !== 0);
			if (failed) {
				const out = (msg.output ?? "").replace(/\s+/g, " ").trim().slice(0, 160);
				push(errors, `bash ${msg.command ?? "?"}: ${out || `exit ${msg.exitCode}`}`);
			}
			continue;
		}
		if (msg.role !== "user" && msg.role !== "assistant") continue;
		const text = extractText(msg.content);
		if (!text) continue;
		for (const line of text.split("\n")) {
			const trimmed = line.trim();
			if (trimmed.length < 12) continue;
			if (ERROR_RE.test(trimmed) && msg.role === "assistant") {
				push(errors, trimmed);
			}
			if (DECISION_RE.test(trimmed)) push(decisions, trimmed);
			if (OPEN_RE.test(trimmed)) push(openLoops, trimmed);
		}
	}

	return {
		errors: errors.slice(0, 8),
		openLoops: openLoops.slice(0, 6),
		decisions: decisions.slice(0, 6),
	};
}

export function formatStateCatalog(catalog: StateCatalog): string {
	const sections: string[] = [];
	if (catalog.decisions.length) {
		sections.push("### Decisions", ...catalog.decisions.map((d) => `- ${d}`));
	}
	if (catalog.errors.length) {
		sections.push("### Errors", ...catalog.errors.map((e) => `- ${e}`));
	}
	if (catalog.openLoops.length) {
		sections.push("### Open", ...catalog.openLoops.map((o) => `- ${o}`));
	}
	return sections.join("\n");
}
