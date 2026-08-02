import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	assessTopic,
	recordKnowledgeGap,
} from "../src/metacognition.js";

test("recordKnowledgeGap + assessTopic use wiki and gaps", async () => {
	const agent = mkdtempSync(join(tmpdir(), "mm-metacog-"));
	const wiki = join(agent, "wiki");
	mkdirSync(join(wiki, "areas"), { recursive: true });
	writeFileSync(
		join(wiki, "areas", "demo.md"),
		"---\nname: demo\n---\n\nTypeScript strict mode preference for packages.\n",
		"utf8",
	);

	const prevAgent = process.env.PI_CODING_AGENT_DIR;
	const prevWiki = process.env.MM_WIKI_DIR;
	process.env.PI_CODING_AGENT_DIR = agent;
	process.env.MM_WIKI_DIR = wiki;

	try {
		const gapPath = recordKnowledgeGap("Missing deployment runbook for TypeScript services");
		assert.ok(gapPath.endsWith("mm-knowledge-gaps.md"));

		const result = await assessTopic("TypeScript strict mode packages", {
			cwd: "/tmp/demo",
		});
		assert.ok(result.signals.wikiHits >= 1);
		assert.ok(result.signals.knownGaps >= 1);
		assert.ok(["confident", "uncertain", "low_confidence"].includes(result.level));
		assert.ok(result.score >= 0 && result.score <= 1);
	} finally {
		if (prevAgent === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = prevAgent;
		if (prevWiki === undefined) delete process.env.MM_WIKI_DIR;
		else process.env.MM_WIKI_DIR = prevWiki;
		rmSync(agent, { recursive: true, force: true });
	}
});

test("assessTopic empty topic is low confidence", async () => {
	const result = await assessTopic("   ");
	assert.equal(result.level, "low_confidence");
	assert.equal(result.score, 0);
});
