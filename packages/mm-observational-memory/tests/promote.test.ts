import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	promoteEnabledFromEnv,
	promoteReflections,
} from "../src/promote.js";
import type { Reflection } from "../src/session-ledger/index.js";

const reflections: Reflection[] = [
	{
		id: "refl_abc123",
		content: "Prefer TypeScript strict mode for new packages",
		supportingObservationIds: ["obs_1"],
		tokenCount: 12,
	},
];

describe("promoteEnabledFromEnv", () => {
	const prev = process.env.MM_OM_PROMOTE;
	afterEach(() => {
		if (prev === undefined) delete process.env.MM_OM_PROMOTE;
		else process.env.MM_OM_PROMOTE = prev;
	});

	it("defaults to both targets", () => {
		delete process.env.MM_OM_PROMOTE;
		expect(promoteEnabledFromEnv()).toEqual({ toPrism: true, toWiki: true });
	});

	it("parses off/prism/wiki", () => {
		process.env.MM_OM_PROMOTE = "off";
		expect(promoteEnabledFromEnv()).toEqual({ toPrism: false, toWiki: false });
		process.env.MM_OM_PROMOTE = "prism";
		expect(promoteEnabledFromEnv()).toEqual({ toPrism: true, toWiki: false });
		process.env.MM_OM_PROMOTE = "wiki";
		expect(promoteEnabledFromEnv()).toEqual({ toPrism: false, toWiki: true });
	});
});

describe("promoteReflections wiki", () => {
	let root: string;
	const prevWiki = process.env.MM_WIKI_DIR;
	const prevPromote = process.env.MM_OM_PROMOTE;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "mm-om-promote-"));
		process.env.MM_WIKI_DIR = root;
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
		if (prevWiki === undefined) delete process.env.MM_WIKI_DIR;
		else process.env.MM_WIKI_DIR = prevWiki;
		if (prevPromote === undefined) delete process.env.MM_OM_PROMOTE;
		else process.env.MM_OM_PROMOTE = prevPromote;
		vi.unstubAllGlobals();
	});

	it("appends a wiki area bullet and skips duplicates", async () => {
		const first = await promoteReflections({
			cwd: "/tmp/demo-project",
			reflections,
			toPrism: false,
			toWiki: true,
		});
		expect(first.wikiAppended).toBe(1);
		expect(first.errors).toEqual([]);

		const path = join(root, "areas", "demo-project.md");
		const text = readFileSync(path, "utf8");
		expect(text).toContain("Prefer TypeScript strict mode");
		expect(text).toContain("om:refl_abc123");

		const second = await promoteReflections({
			cwd: "/tmp/demo-project",
			reflections,
			toPrism: false,
			toWiki: true,
		});
		expect(second.wikiAppended).toBe(0);
	});

	it("indexes into Prism when enabled", async () => {
		const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);

		const result = await promoteReflections({
			cwd: "/tmp/demo-project",
			reflections,
			toPrism: true,
			toWiki: false,
		});
		expect(result.prismIndexed).toBe(1);
		expect(result.errors).toEqual([]);
		expect(fetchMock).toHaveBeenCalledOnce();
		const [url, init] = fetchMock.mock.calls[0]!;
		expect(String(url)).toContain("/collections/ltm-memories/documents");
		const body = JSON.parse(String((init as RequestInit).body));
		expect(body.documents).toHaveLength(1);
		expect(body.documents[0].fields.source).toBe("om_reflect:refl_abc123");
		expect(body.documents[0].fields.project).toBe("demo-project");
	});
});
