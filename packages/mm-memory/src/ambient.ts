/**
 * Ambient session sync into Prism ltm-sessions.
 * Pattern ported from nmem (nowledge-mem-pi): debounce on agent_end,
 * hard flush on compact/switch/shutdown. Best-effort; never blocks the session.
 */
import { createHash } from "node:crypto";
import { basename } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { loadMemoryConfig } from "./config.js";
import { projectFromCwd } from "./documents.js";
import { remember } from "./memory.js";
import { buildCheckpointText } from "./checkpoint.js";

const FLUSH_DELAY_MS = 750;
const MIN_CHARS = 80;

type LooseEntry = Record<string, unknown>;
type LooseMessage = { role?: string; content?: unknown };

interface SessionManagerLike {
	getBranch?: () => LooseEntry[];
	getEntries?: () => LooseEntry[];
	getSessionId?: () => string;
	getSessionFile?: () => string | undefined;
	getSessionName?: () => string | undefined;
	getCwd?: () => string;
}

interface SyncState {
	timer?: ReturnType<typeof setTimeout>;
	inFlight?: Promise<void>;
	pending?: boolean;
	lastMessageCount?: number;
	lastError?: string;
}

const syncStates = new Map<string, SyncState>();
const warned = new Set<string>();

function sessionKey(ctx: ExtensionContext): string {
	const manager = ctx.sessionManager as unknown as SessionManagerLike;
	const id = manager.getSessionId?.()?.trim();
	if (id && id.toLowerCase() !== "unknown") return id;
	const file = manager.getSessionFile?.();
	if (file) return basename(file).replace(/\.jsonl$/i, "");
	return "unknown";
}

function stableSessionDocId(sessionId: string): string {
	const digest = createHash("sha256").update(`session\0${sessionId}`).digest("hex").slice(0, 24);
	return `ltm_sess_${digest}`;
}

function partText(part: unknown): string {
	if (typeof part === "string") return part;
	if (!part || typeof part !== "object") return "";
	const record = part as Record<string, unknown>;
	if (record.type === "text" && typeof record.text === "string") return record.text;
	if (typeof record.text === "string") return record.text;
	if (record.type === "toolUse" || record.type === "toolCall") {
		const name = typeof record.name === "string" ? record.name : "tool";
		return `[Tool: ${name}]`;
	}
	return "";
}

function contentText(content: unknown): string {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) return content.map(partText).filter(Boolean).join("\n");
	return partText(content);
}

function branchMessages(ctx: ExtensionContext): LooseMessage[] {
	const manager = ctx.sessionManager as unknown as SessionManagerLike;
	const entries =
		typeof manager.getBranch === "function"
			? manager.getBranch()
			: manager.getEntries?.() || [];
	const out: LooseMessage[] = [];
	for (const entry of entries) {
		if (entry?.type !== "message") continue;
		const message = entry.message;
		if (!message || typeof message !== "object") continue;
		const msg = message as Record<string, unknown>;
		const role = typeof msg.role === "string" ? msg.role : undefined;
		if (!role || role === "custom") continue;
		if (role !== "user" && role !== "assistant" && role !== "system") continue;
		const content = contentText(msg.content).trim();
		if (!content) continue;
		out.push({ role, content });
	}
	return out;
}

function shouldSync(messages: LooseMessage[]): boolean {
	return (
		messages.some((m) => m.role === "user") && messages.some((m) => m.role === "assistant")
	);
}

function sessionTitle(ctx: ExtensionContext, messages: LooseMessage[]): string {
	const manager = ctx.sessionManager as unknown as SessionManagerLike;
	const name = manager.getSessionName?.()?.trim();
	if (name) return name;
	const firstUser = messages.find((m) => m.role === "user")?.content;
	if (typeof firstUser === "string" && firstUser.trim()) return firstUser.trim().slice(0, 120);
	const cwd = manager.getCwd?.() || ctx.cwd;
	return cwd ? `Pi session — ${basename(cwd)}` : "Pi session";
}

function notifyOnce(ctx: ExtensionContext, message: string): void {
	if (warned.has(message)) return;
	warned.add(message);
	if (ctx.hasUI) ctx.ui.notify(message, "warning");
	else console.warn(`[mm-memory] ${message}`);
}

async function flushOnce(ctx: ExtensionContext, reason: string, state: SyncState): Promise<void> {
	const config = loadMemoryConfig();
	if (!config.ambientSync) return;

	const messages = branchMessages(ctx);
	if (!shouldSync(messages)) return;
	if (state.lastMessageCount === messages.length && reason === "agent_end") return;

	const sid = sessionKey(ctx);
	const title = sessionTitle(ctx, messages);
	const body = buildCheckpointText(messages, { reason: `ambient:${reason}`, maxChars: 6_000 });
	const text = [`# ${title}`, `session=${sid}`, "", body].join("\n");
	if (text.length < MIN_CHARS) return;

	try {
		await remember(
			{
				id: stableSessionDocId(sid),
				text,
				kind: "session_summary",
				project: projectFromCwd(ctx.cwd),
				tags: ["ambient", reason],
				source: `memory_ambient:${reason}`,
				scope: "sessions",
			},
			{ cwd: ctx.cwd, config },
		);
		state.lastMessageCount = messages.length;
		state.lastError = undefined;
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		state.lastError = msg;
		notifyOnce(ctx, `LTM ambient sync failed: ${msg}`);
	}
}

async function flush(ctx: ExtensionContext, reason: string): Promise<void> {
	const key = sessionKey(ctx);
	const state = syncStates.get(key) || {};
	syncStates.set(key, state);
	if (state.inFlight) {
		state.pending = true;
		await state.inFlight;
		return;
	}
	do {
		state.pending = false;
		state.inFlight = flushOnce(ctx, reason, state).finally(() => {
			state.inFlight = undefined;
		});
		await state.inFlight;
	} while (state.pending);
}

function scheduleFlush(ctx: ExtensionContext, reason: string): void {
	const config = loadMemoryConfig();
	if (!config.ambientSync) return;
	const key = sessionKey(ctx);
	const state = syncStates.get(key) || {};
	syncStates.set(key, state);
	if (state.timer) clearTimeout(state.timer);
	state.timer = setTimeout(() => {
		state.timer = undefined;
		void flush(ctx, reason);
	}, FLUSH_DELAY_MS);
}

/** Short always-on guidance (nmem pattern: guidance ≠ optional inject). */
export function memoryStartupGuidance(): string {
	return [
		"## Prism LTM guidance",
		"",
		"You have persistent long-term memory via Prism. Use it actively:",
		"",
		"**When starting a new task/topic, do a quick recall when helpful:**",
		"Use `memory_recall` or `wiki_recall` when tackling a non-trivial topic, bugs, or user preferences to ensure past decisions and context are respected (don't over-do it on simple tool operations).",
		"- memory_recall — search durable facts/decisions/preferences (default). Use scope=sessions for prior session summaries.",
		"- memory_sessions — search past session summaries by topic",
		"- memory_assess — estimate coverage before claiming you don't know something",
		"",
		"**Always remember** when the user states: preferences, constraints, decisions, project facts, bug root causes, architectural choices, or anything worth knowing next session.",
		"- memory_remember — save with kind=fact/preference/decision/insight. Search first to avoid duplicates.",
		"- memory_gap — record when something important is missing or unresolved",
		"",
		"**Concrete triggers to recall:** user asks 'do you remember', 'what did we decide', 'as before', 'last time'; you're unsure about user preferences; starting work on a known project area.",
		"**Concrete triggers to remember:** user says 'always', 'never', 'I prefer', 'we decided', 'the pattern is'; you discover a non-obvious bug root cause; a major decision is made.",
		"- Short-lived observations belong in observational-memory (auto). Wiki pages for curated project docs.",
		"",
	].join("\n");
}

/** Wire ambient sync lifecycle hooks (guidance/inject stay in index.ts). */
export function installAmbientSync(pi: ExtensionAPI): void {
	pi.on("agent_end", async (_event, ctx) => {
		scheduleFlush(ctx, "agent_end");
	});

	pi.on("session_before_compact", async (_event, ctx) => {
		await flush(ctx, "session_before_compact");
	});

	pi.on("session_before_switch", async (_event, ctx) => {
		await flush(ctx, "session_before_switch");
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		await flush(ctx, "session_shutdown");
	});
}

/** Test helpers */
export const __test = {
	stableSessionDocId,
	shouldSync,
	sessionKey,
};
