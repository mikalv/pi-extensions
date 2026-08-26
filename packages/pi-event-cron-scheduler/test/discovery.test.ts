import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverJobs, scheduledDir } from "../src/discovery.js";

let ws: string;

async function writeJob(name: string, body: string): Promise<void> {
	await mkdir(scheduledDir(ws), { recursive: true });
	await writeFile(join(scheduledDir(ws), name), body, "utf8");
}

beforeEach(async () => {
	ws = await mkdtemp(join(tmpdir(), "eventcron-ws-"));
});

afterEach(async () => {
	await rm(ws, { recursive: true, force: true });
});

describe("discoverJobs", () => {
	it("returns an empty result when scheduled/ does not exist", async () => {
		expect(await discoverJobs(ws)).toEqual({ jobs: [], invalid: [] });
	});

	it("parses .md files, ignores other extensions, and sorts by id", async () => {
		await writeJob("b.md", "---\nid: beta\n---\n\nBeta task.\n");
		await writeJob("a.md", "---\nid: alpha\n---\n\nAlpha task.\n");
		await writeJob("notes.txt", "id: ignored");

		const result = await discoverJobs(ws);
		expect(result.jobs.map((job) => job.id)).toEqual(["alpha", "beta"]);
		expect(result.jobs[0].workspace).toBe(ws);
		expect(result.invalid).toEqual([]);
	});

	it("reports an invalid file without dropping the valid ones", async () => {
		await writeJob("good.md", "---\nid: good\n---\n\nGood.\n");
		await writeJob("bad.md", "---\nid: Bad Id\n---\n\nBad.\n");

		const result = await discoverJobs(ws);
		expect(result.jobs.map((job) => job.id)).toEqual(["good"]);
		expect(result.invalid).toHaveLength(1);
		expect(result.invalid[0].path).toContain("bad.md");
	});

	it("invalidates every file sharing an id and runs none of them", async () => {
		await writeJob("one.md", "---\nid: twin\n---\n\nOne.\n");
		await writeJob("two.md", "---\nid: twin\n---\n\nTwo.\n");
		await writeJob("solo.md", "---\nid: solo\n---\n\nSolo.\n");

		const result = await discoverJobs(ws);
		expect(result.jobs.map((job) => job.id)).toEqual(["solo"]);
		expect(result.invalid).toHaveLength(2);
		for (const entry of result.invalid) {
			expect(entry.id).toBe("twin");
			expect(entry.errors.join(" ")).toContain("duplicate id");
		}
	});
});
