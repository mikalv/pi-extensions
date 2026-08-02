import { remember } from "./memory.js";
import { projectFromCwd } from "./documents.js";
import { loadMemoryConfig } from "./config.js";

const MAX_CHECKPOINT_CHARS = 6_000;

type LooseMessage = {
	role?: string;
	content?: unknown;
};

function messageText(message: LooseMessage): string {
	const role = typeof message.role === "string" ? message.role : "unknown";
	const content = message.content;
	if (typeof content === "string") return `${role}: ${content}`;
	if (!Array.isArray(content)) return `${role}:`;
	const parts = content
		.map((part) => {
			if (!part || typeof part !== "object") return "";
			const record = part as Record<string, unknown>;
			if (typeof record.text === "string") return record.text;
			return "";
		})
		.filter(Boolean);
	return `${role}: ${parts.join("\n")}`;
}

/** Build a compact session checkpoint text from messages about to be compacted. */
export function buildCheckpointText(
	messages: LooseMessage[],
	opts: { reason?: string; maxChars?: number } = {},
): string {
	const maxChars = opts.maxChars ?? MAX_CHECKPOINT_CHARS;
	const lines = [
		`Session checkpoint (${opts.reason ?? "compact"})`,
		`messages=${messages.length}`,
		"",
	];
	// Prefer recent messages
	const recent = messages.slice(-40);
	for (const message of recent) {
		const line = messageText(message).replace(/\s+/g, " ").trim();
		if (!line || line.length < 4) continue;
		lines.push(line.slice(0, 500));
	}
	let text = lines.join("\n").trim();
	if (text.length > maxChars) {
		text = `${text.slice(0, maxChars)}\n\n[truncated]`;
	}
	return text;
}

export async function checkpointBeforeCompact(opts: {
	messages: LooseMessage[];
	cwd?: string;
	reason?: string;
}): Promise<{ ok: true; id: string; collection: string } | { ok: false; skipped: string }> {
	const config = loadMemoryConfig();
	if (!config.checkpointOnCompact) {
		return { ok: false, skipped: "checkpointOnCompact=false" };
	}
	const messages = opts.messages ?? [];
	if (messages.length === 0) {
		return { ok: false, skipped: "no messages to summarize" };
	}
	const text = buildCheckpointText(messages, { reason: opts.reason });
	if (text.length < 40) {
		return { ok: false, skipped: "checkpoint too short" };
	}
	const result = await remember(
		{
			text,
			kind: "session_summary",
			project: projectFromCwd(opts.cwd),
			tags: ["precompact", opts.reason ?? "compact"],
			source: "memory_precompact",
			scope: "sessions",
		},
		{ cwd: opts.cwd, config },
	);
	return { ok: true, id: result.document.id, collection: result.collection };
}
