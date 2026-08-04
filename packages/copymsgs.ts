/**
 * /copymsgs — copy one or more conversation messages to the clipboard.
 *
 * Solves the "mouse selection across multiple lines in a TUI is painful" problem.
 * No mouse needed — just type the command.
 *
 * Usage:
 *   /copymsgs            Copy the last 5 messages (user + assistant)
 *   /copymsgs N          Copy the last N messages (e.g. /copymsgs 10)
 *   /copymsgs all        Copy the entire current session conversation
 *
 * Output is plain text with role headers, e.g.:
 *   ── You ──
 *   hello
 *
 *   ── Assistant ──
 *   Hi there!
 *
 * Only text content is included; tool calls, tool results, and thinking
 * blocks are skipped so the clipboard stays clean for pasting elsewhere.
 *
 * Uses OSC 52 for clipboard (supported by Ghostty, iTerm2, Kitty, Alacritty,
 * WezTerm, tmux with set-clipboard on, Windows Terminal, etc.).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

function copyToClipboard(text: string): void {
	// OSC 52 ; c ; <base64> ST  (c = clipboard selection)
	const base64 = Buffer.from(text, "utf-8").toString("base64");
	process.stdout.write(`\x1b]52;c;${base64}\x07`);
}

/** Extract readable text from a message's content (string or content blocks). */
function textFromContent(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map((block) => {
			// Skip non-text blocks: tool_use, tool_result, thinking, image, etc.
			if (typeof block !== "object" || block === null) return "";
			const type = (block as { type?: unknown }).type;
			if (type && type !== "text") return "";
			const text = (block as { text?: unknown }).text;
			return typeof text === "string" ? text : "";
		})
		.filter(Boolean)
		.join("\n");
}

interface ExtractedMessage {
	role: string;
	text: string;
}

/** Pull (role, text) pairs from session entries along the current leaf path. */
function extractMessages(ctx: import("@earendil-works/pi-coding-agent").ExtensionCommandContext): ExtractedMessage[] {
	// buildContextEntries() follows the current leaf path (honoring compaction),
	// giving us the same messages the agent sees — minus off-path branches.
	const contextEntries = ctx.sessionManager.buildContextEntries();
	const out: ExtractedMessage[] = [];
	for (const entry of contextEntries) {
		if (entry.type !== "message") continue;
		const message = (entry as { message?: { role?: string; content?: unknown } }).message;
		if (!message) continue;
		const text = textFromContent(message.content).trim();
		if (!text) continue;
		out.push({ role: message.role ?? "unknown", text });
	}
	return out;
}

function formatMessages(messages: ExtractedMessage[]): string {
	const roleLabel = (role: string) => {
		switch (role) {
			case "user":
				return "You";
			case "assistant":
				return "Assistant";
			default:
				return role;
		}
	};
	return messages.map((m) => `── ${roleLabel(m.role)} ──\n${m.text}`).join("\n\n");
}

function show(ctx: import("@earendil-works/pi-coding-agent").ExtensionCommandContext, message: string, level: "info" | "warning" | "error" = "info") {
	if (ctx.hasUI) ctx.ui.notify(message, level);
}

export default function copymsgsExtension(pi: ExtensionAPI): void {
	pi.registerCommand("copymsgs", {
		description: "Copy conversation messages to clipboard. Usage: /copymsgs [N|all]",
		handler: async (args, ctx) => {
			const all = extractMessages(ctx);
			if (all.length === 0) {
				show(ctx, "No messages to copy yet.", "warning");
				return;
			}

			const arg = args.trim().toLowerCase();
			let selected: ExtractedMessage[];
			if (arg === "" ) {
				selected = all.slice(-5);
			} else if (arg === "all") {
				selected = all;
			} else {
				const n = Number(arg);
				if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
					show(ctx, `Invalid argument "${args.trim()}". Use a number or "all".`, "error");
					return;
				}
				selected = all.slice(-n);
			}

			const text = formatMessages(selected);
			try {
				copyToClipboard(text);
				const label = selected.length === all.length ? "entire session" : `last ${selected.length} message${selected.length === 1 ? "" : "s"}`;
				show(ctx, `Copied ${label} (${text.length} chars) to clipboard`, "info");
			} catch (error) {
				const msg = error instanceof Error ? error.message : String(error);
				show(ctx, `Failed to copy: ${msg}`, "error");
			}
		},
	});
}
