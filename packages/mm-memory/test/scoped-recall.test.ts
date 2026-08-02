import assert from "node:assert/strict";
import test from "node:test";
import { buildCheckpointText } from "../src/checkpoint.js";
import { normalizeRecallHits } from "../src/documents.js";

test("normalizeRecallHits exposes fields used for scoped filtering", () => {
	const hits = normalizeRecallHits(
		{
			hits: [
				{
					id: "1",
					score: 0.9,
					fields: {
						text: "Use Prism for LTM",
						kind: "decision",
						project: "pi-extensions",
						tags: "ltm,mine",
					},
				},
			],
		},
		5,
	);
	assert.equal(hits[0]?.kind, "decision");
	assert.equal(hits[0]?.project, "pi-extensions");
	assert.deepEqual(hits[0]?.tags, ["ltm", "mine"]);
});

test("buildCheckpointText prefers recent message text", () => {
	const text = buildCheckpointText(
		[
			{ role: "user", content: "old noise" },
			{ role: "assistant", content: [{ type: "text", text: "we decided on Prism LTM" }] },
			{ role: "user", content: "checkpoint me" },
		],
		{ reason: "threshold" },
	);
	assert.match(text, /Session checkpoint \(threshold\)/);
	assert.match(text, /Prism LTM/);
	assert.match(text, /checkpoint me/);
});
