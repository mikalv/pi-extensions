/**
 * Heuristic tool-result crop at ingestion (distill pattern, zero-LLM).
 * Large successful text outputs are head/tail truncated with a spill file pointer.
 *
 * PRUNE_CROP_CHARS — max chars kept in context (default 12000; 0 disables).
 * Errors are never cropped.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const DEFAULT_MAX = 12_000;
const HEAD_RATIO = 0.7;

function cropLimit(): number {
	const raw = process.env.PRUNE_CROP_CHARS?.trim();
	if (raw === undefined || raw === "") return DEFAULT_MAX;
	const n = Number(raw);
	if (!Number.isFinite(n) || n < 0) return DEFAULT_MAX;
	return Math.floor(n);
}

function textFromContent(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map((part) => {
			if (!part || typeof part !== "object") return "";
			const p = part as { type?: string; text?: string };
			return p.type === "text" && typeof p.text === "string" ? p.text : "";
		})
		.filter(Boolean)
		.join("\n");
}

function spillPath(text: string): string | undefined {
	try {
		const dir = join(tmpdir(), "pi-prune-context");
		mkdirSync(dir, { recursive: true });
		const path = join(
			dir,
			`tool-output-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`,
		);
		writeFileSync(path, text, "utf8");
		return path;
	} catch {
		return undefined;
	}
}

export function cropText(text: string, maxChars: number): {
	text: string;
	truncated: boolean;
	spill?: string;
} {
	if (text.length <= maxChars) return { text, truncated: false };
	const spill = spillPath(text);
	const omittedHint = text.length;
	const marker = `\n[pruned: omitted ~${omittedHint} chars${spill ? `; full: ${spill}` : ""}]\n`;
	const budget = Math.max(64, maxChars - marker.length);
	const headLen = Math.floor(budget * HEAD_RATIO);
	const tailLen = Math.max(0, budget - headLen);
	const head = text.slice(0, headLen);
	const tail = tailLen > 0 ? text.slice(-tailLen) : "";
	return { text: `${head}${marker}${tail}`, truncated: true, spill };
}

export function installToolResultCrop(pi: ExtensionAPI): void {
	pi.on("tool_result", async (event) => {
		const max = cropLimit();
		if (max === 0) return;

		const ev = event as {
			isError?: boolean;
			content?: unknown;
			details?: unknown;
			toolName?: string;
		};
		if (ev.isError) return;

		const original = textFromContent(ev.content);
		if (!original || original.length <= max) return;
		// Explicit RAW escape (distill convention)
		if (original.trimStart().startsWith("RAW\n") || original.trimStart().startsWith("RAW ")) {
			return;
		}

		const cropped = cropText(original, max);
		if (!cropped.truncated) return;

		return {
			content: [{ type: "text" as const, text: cropped.text }],
			details: {
				...(typeof ev.details === "object" && ev.details && !Array.isArray(ev.details)
					? (ev.details as Record<string, unknown>)
					: {}),
				prunedCrop: true,
				originalChars: original.length,
				keptChars: cropped.text.length,
				...(cropped.spill ? { fullOutputPath: cropped.spill } : {}),
			},
		};
	});
}
