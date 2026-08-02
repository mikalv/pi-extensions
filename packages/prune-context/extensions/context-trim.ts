/**
 * Mid-session deterministic context reclaim (condense patterns, zero-LLM):
 * - strip thinking blocks from older assistant turns
 * - purge large args on cooled-down errored toolCalls
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const KEEP_THINKING_TURNS = 1;
const ERROR_PURGE_COOLDOWN = 2;
const ERROR_PURGE_MIN_CHARS = 800;

function withoutThinking(content: unknown): unknown {
	if (!Array.isArray(content)) return content;
	const next = content.filter(
		(part) =>
			!(part && typeof part === "object" && (part as { type?: string }).type === "thinking"),
	);
	return next.length === content.length ? content : next;
}

export function stripOldThinking(messages: unknown[]): unknown[] {
	const assistantIdx: number[] = [];
	for (let i = 0; i < messages.length; i++) {
		const msg = messages[i] as { role?: string };
		if (msg?.role === "assistant") assistantIdx.push(i);
	}
	if (assistantIdx.length <= KEEP_THINKING_TURNS) return messages;

	const firstKept = assistantIdx[assistantIdx.length - KEEP_THINKING_TURNS]!;
	let changed = false;
	const out = messages.map((msg, i) => {
		const m = msg as { role?: string; content?: unknown };
		if (i >= firstKept || m?.role !== "assistant") return msg;
		if (!Array.isArray(m.content)) return msg;
		if (!m.content.some((c) => c && typeof c === "object" && (c as { type?: string }).type === "thinking")) {
			return msg;
		}
		changed = true;
		return { ...m, content: withoutThinking(m.content) };
	});
	return changed ? out : messages;
}

export function purgeErroredArgs(messages: unknown[]): unknown[] {
	const erroredAtTurn = new Map<string, number>();
	let turnCount = 0;
	for (const msg of messages) {
		const m = msg as { role?: string; isError?: boolean; toolCallId?: string };
		if (m?.role === "assistant") turnCount += 1;
		else if (m?.role === "toolResult" && m.isError === true && m.toolCallId) {
			erroredAtTurn.set(m.toolCallId, turnCount);
		}
	}
	if (erroredAtTurn.size === 0) return messages;

	let anyModified = false;
	const result = messages.map((msg) => {
		const m = msg as { role?: string; content?: unknown };
		if (m?.role !== "assistant" || !Array.isArray(m.content)) return msg;

		let contentModified = false;
		const newContent = m.content.map((block) => {
			if (!block || typeof block !== "object") return block;
			const b = block as { type?: string; id?: string; arguments?: Record<string, unknown> };
			if (b.type !== "toolCall" || !b.id) return block;
			const errorTurn = erroredAtTurn.get(b.id);
			if (errorTurn === undefined) return block;
			if (turnCount - errorTurn < ERROR_PURGE_COOLDOWN) return block;
			const argBody = JSON.stringify(b.arguments ?? {});
			if (argBody.length < ERROR_PURGE_MIN_CHARS) return block;
			contentModified = true;
			return {
				...b,
				arguments: { _purged: `<purged-errored-args size="${argBody.length}"/>` },
			};
		});

		if (!contentModified) return msg;
		anyModified = true;
		return { ...m, content: newContent };
	});
	return anyModified ? result : messages;
}

export function transformContextMessages(messages: unknown[]): unknown[] {
	let next = stripOldThinking(messages);
	next = purgeErroredArgs(next);
	return next;
}

export function installContextTrim(pi: ExtensionAPI): void {
	const disabled = process.env.PRUNE_CONTEXT_TRIM?.trim().toLowerCase();
	if (disabled === "0" || disabled === "false" || disabled === "off") return;

	pi.on("context", (event) => {
		const messages = (event as { messages?: unknown[] }).messages;
		if (!Array.isArray(messages) || messages.length === 0) return;
		const next = transformContextMessages(messages);
		if (next === messages) return;
		return { messages: next };
	});
}
