import assert from "node:assert/strict";
import test from "node:test";
import {
	buildRememberDocument,
	buildSessionSummaryDocument,
	contentHashId,
	formatRecallForPrompt,
	normalizeRecallHits,
	projectFromCwd,
} from "../src/documents.js";

test("projectFromCwd uses basename", () => {
	assert.equal(projectFromCwd("/Users/me/proj/pi-extensions"), "pi-extensions");
	assert.equal(projectFromCwd(undefined), "global");
});

test("buildRememberDocument fills LTM document model", () => {
	const doc = buildRememberDocument(
		{
			text: "Prefer Norwegian replies",
			kind: "preference",
			tags: ["i18n", ""],
			source: "observer",
		},
		"/tmp/demo-project",
	);
	assert.equal(doc.kind, "preference");
	assert.equal(doc.project, "demo-project");
	assert.deepEqual(doc.tags, ["i18n"]);
	assert.equal(doc.source, "observer");
	assert.equal(doc.text, "Prefer Norwegian replies");
	assert.ok(doc.id.startsWith("ltm_"));
	assert.ok(doc.created_at.includes("T"));
});

test("contentHashId is stable for same payload", () => {
	const a = contentHashId("same", "proj", "fact");
	const b = contentHashId("same", "proj", "fact");
	const c = contentHashId("other", "proj", "fact");
	assert.equal(a, b);
	assert.notEqual(a, c);
});

test("session summary defaults kind and scope semantics", () => {
	const doc = buildSessionSummaryDocument({
		summary: "Discussed Prism LTM wiring",
		project: "pi-extensions",
	});
	assert.equal(doc.kind, "session_summary");
	assert.equal(doc.project, "pi-extensions");
	assert.equal(doc.source, "session_consolidator");
});

test("normalizeRecallHits accepts hits/results shapes", () => {
	const fromHits = normalizeRecallHits(
		{
			hits: [
				{
					id: "a",
					score: 0.9,
					fields: {
						text: "Use Prism for LTM",
						kind: "decision",
						project: "pi-extensions",
						tags: ["ltm"],
					},
				},
			],
		},
		5,
	);
	assert.equal(fromHits.length, 1);
	assert.equal(fromHits[0]?.text, "Use Prism for LTM");
	assert.equal(fromHits[0]?.kind, "decision");
	assert.equal(fromHits[0]?.score, 0.9);

	const fromResults = normalizeRecallHits(
		{ results: [{ document: { id: "b", text: "hello" } }] },
		5,
	);
	assert.equal(fromResults[0]?.id, "b");
	assert.equal(fromResults[0]?.text, "hello");
});

test("formatRecallForPrompt builds stable prompt block", () => {
	const block = formatRecallForPrompt([
		{ id: "1", text: "Prefer Norwegian", kind: "preference", project: "x", score: 0.8 },
	]);
	assert.ok(block.includes("Long-term memory (Prism)"));
	assert.ok(block.includes("Prefer Norwegian"));
	assert.equal(formatRecallForPrompt([]), "");
});
