import assert from "node:assert/strict";
import test from "node:test";
import { transformContextMessages } from "../extensions/context-trim.ts";
import { cropText } from "../extensions/crop.ts";
import {
	extractStateCatalog,
	formatStateCatalog,
} from "../extensions/extract-state.ts";
import type { MessageLike } from "../extensions/prune.ts";

test("cropText head/tails oversized output", () => {
	const text = "A".repeat(1000) + "MIDDLE" + "B".repeat(1000);
	const result = cropText(text, 400);
	assert.equal(result.truncated, true);
	assert.ok(result.text.length < text.length);
	assert.ok(result.text.includes("[pruned:"));
	assert.ok(result.text.startsWith("A"));
	assert.ok(result.text.endsWith("B") || result.text.includes("B"));
});

test("extractStateCatalog finds errors and decisions", () => {
	const messages: MessageLike[] = [
		{ role: "user", content: "fix the bug" },
		{
			role: "assistant",
			content: "We decided to use Prism for LTM.",
		},
		{
			role: "toolResult",
			toolName: "bash",
			isError: true,
			content: "Error: command failed ENOENT",
		},
		{
			role: "assistant",
			content: "TODO: still need to wire ambient sync",
		},
	];
	const catalog = extractStateCatalog(messages);
	assert.ok(catalog.errors.length >= 1);
	assert.ok(catalog.decisions.length >= 1);
	assert.ok(catalog.openLoops.length >= 1);
	const block = formatStateCatalog(catalog);
	assert.match(block, /### Decisions/);
	assert.match(block, /### Errors/);
});

test("stripOldThinking keeps only latest assistant thinking", () => {
	const messages = [
		{
			role: "assistant",
			content: [
				{ type: "thinking", thinking: "old" },
				{ type: "text", text: "one" },
			],
		},
		{ role: "user", content: "ok" },
		{
			role: "assistant",
			content: [
				{ type: "thinking", thinking: "new" },
				{ type: "text", text: "two" },
			],
		},
	];
	const next = transformContextMessages(messages);
	const first = next[0] as { content: Array<{ type: string }> };
	const last = next[2] as { content: Array<{ type: string }> };
	assert.ok(!first.content.some((c) => c.type === "thinking"));
	assert.ok(last.content.some((c) => c.type === "thinking"));
});

test("purgeErroredArgs stubs large cooled-down failed tool args", () => {
	const big = { content: "x".repeat(2000) };
	const messages = [
		{
			role: "assistant",
			content: [{ type: "toolCall", id: "tc1", name: "write", arguments: big }],
		},
		{ role: "toolResult", toolCallId: "tc1", isError: true, content: "fail" },
		{ role: "assistant", content: [{ type: "text", text: "retry later" }] },
		{ role: "assistant", content: [{ type: "text", text: "moved on" }] },
		{ role: "assistant", content: [{ type: "text", text: "done" }] },
	];
	const next = transformContextMessages(messages);
	const args = (next[0] as { content: Array<{ arguments?: Record<string, unknown> }> })
		.content[0].arguments;
	assert.ok(args?._purged);
});
