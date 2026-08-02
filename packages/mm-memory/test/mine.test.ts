import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { collectMineDocuments } from "../src/mine.js";

test("collectMineDocuments walks markdown and skips vendor dirs", () => {
	const root = mkdtempSync(join(tmpdir(), "mm-memory-mine-"));
	try {
		mkdirSync(join(root, "docs"));
		mkdirSync(join(root, "node_modules", "pkg"), { recursive: true });
		writeFileSync(join(root, "docs", "decision.md"), "# Decision\n\nUse Prism for LTM.\n");
		writeFileSync(join(root, "README.md"), "# Hello\n");
		writeFileSync(join(root, "node_modules", "pkg", "x.md"), "should skip\n");

		const collected = collectMineDocuments({
			path: root,
			project: "mine-test",
			maxFiles: 20,
		});

		assert.equal(collected.project, "mine-test");
		assert.ok(collected.files.length >= 2);
		assert.ok(collected.documents.length >= 2);
		assert.ok(collected.files.every((f) => !f.includes("node_modules")));
		assert.ok(collected.documents.some((d) => d.fields.text.includes("Prism for LTM")));
		assert.ok(collected.documents.every((d) => d.fields.tags.includes("mine")));
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
