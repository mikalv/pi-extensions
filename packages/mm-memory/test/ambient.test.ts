import assert from "node:assert/strict";
import test from "node:test";
import { __test, memoryStartupGuidance } from "../src/ambient.js";

test("stableSessionDocId is stable per session id", () => {
	const a = __test.stableSessionDocId("sess-abc");
	const b = __test.stableSessionDocId("sess-abc");
	const c = __test.stableSessionDocId("sess-other");
	assert.equal(a, b);
	assert.notEqual(a, c);
	assert.ok(a.startsWith("ltm_sess_"));
});

test("shouldSync requires both user and assistant", () => {
	assert.equal(__test.shouldSync([{ role: "user", content: "hi" }]), false);
	assert.equal(
		__test.shouldSync([
			{ role: "user", content: "hi" },
			{ role: "assistant", content: "yo" },
		]),
		true,
	);
});

test("memoryStartupGuidance mentions core tools", () => {
	const text = memoryStartupGuidance();
	assert.match(text, /memory_recall/);
	assert.match(text, /memory_remember/);
	assert.match(text, /memory_assess/);
});
