import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	RUNS_PER_JOB,
	enabledKey,
	isEnabled,
	lastRunFor,
	loadEnabled,
	loadRuns,
	medianDurationMs,
	readCursor,
	saveRun,
	setEnabled,
	writeCursor,
	type RunRow,
} from "../src/state.js";

let dir: string;

function row(overrides: Partial<RunRow> & { runId: string; jobId: string }): RunRow {
	return {
		workspace: "/ws",
		status: "completed",
		pid: 42,
		startedAt: "2026-08-26T00:00:00.000Z",
		...overrides,
	};
}

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "eventcron-state-"));
});

afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

describe("enabled.json", () => {
	it("returns an empty file when nothing is on disk", async () => {
		expect(await loadEnabled(dir)).toEqual({ version: 1, jobs: {} });
	});

	it("keys by workspace and id so the same id in two workspaces is two jobs", async () => {
		const now = new Date("2026-08-26T02:50:00.000Z");
		await setEnabled(dir, { workspace: "/ws-a", id: "twin", path: "scheduled/t.md", on: true, now });
		const file = await setEnabled(dir, { workspace: "/ws-b", id: "twin", path: "scheduled/t.md", on: true, now });

		expect(Object.keys(file.jobs).sort()).toEqual([enabledKey("/ws-a", "twin"), enabledKey("/ws-b", "twin")]);
		expect(file.jobs[enabledKey("/ws-a", "twin")].enabledAt).toBe("2026-08-26T02:50:00.000Z");
		expect(isEnabled(file, "/ws-a", "twin")).toBe(true);
		expect(isEnabled(file, "/ws-c", "twin")).toBe(false);
	});

	it("round-trips through disk and removes on disable", async () => {
		const now = new Date("2026-08-26T02:50:00.000Z");
		await setEnabled(dir, { workspace: "/ws", id: "a", path: "scheduled/a.md", on: true, now });
		expect(isEnabled(await loadEnabled(dir), "/ws", "a")).toBe(true);

		await setEnabled(dir, { workspace: "/ws", id: "a", path: "scheduled/a.md", on: false, now });
		expect(isEnabled(await loadEnabled(dir), "/ws", "a")).toBe(false);
	});
});

describe("runs.json", () => {
	it("upserts by runId rather than appending duplicates", async () => {
		await saveRun(dir, row({ runId: "r1", jobId: "a", status: "running" }));
		await saveRun(dir, row({ runId: "r1", jobId: "a", status: "completed", durationMs: 1200 }));

		const rows = await loadRuns(dir);
		expect(rows).toHaveLength(1);
		expect(rows[0].status).toBe("completed");
		expect(rows[0].durationMs).toBe(1200);
	});

	it(`keeps only the newest ${RUNS_PER_JOB} rows per job`, async () => {
		for (let i = 0; i < RUNS_PER_JOB + 10; i++) {
			await saveRun(
				dir,
				row({
					runId: `r${i}`,
					jobId: "a",
					startedAt: new Date(Date.UTC(2026, 7, 26, 0, i)).toISOString(),
				}),
			);
		}
		await saveRun(dir, row({ runId: "other", jobId: "b" }));

		const rows = await loadRuns(dir);
		expect(rows.filter((r) => r.jobId === "a")).toHaveLength(RUNS_PER_JOB);
		expect(rows.filter((r) => r.jobId === "b")).toHaveLength(1);
		expect(rows.some((r) => r.runId === "r0")).toBe(false);
		expect(rows.some((r) => r.runId === `r${RUNS_PER_JOB + 9}`)).toBe(true);
	});

	it("keeps every row when parallel runs save at the same time", async () => {
		await Promise.all([
			saveRun(dir, row({ runId: "p1", jobId: "a", startedAt: "2026-08-26T00:01:00.000Z" })),
			saveRun(dir, row({ runId: "p2", jobId: "a", startedAt: "2026-08-26T00:01:01.000Z" })),
			saveRun(dir, row({ runId: "p3", jobId: "a", startedAt: "2026-08-26T00:01:02.000Z" })),
		]);

		expect((await loadRuns(dir)).map((r) => r.runId).sort()).toEqual(["p1", "p2", "p3"]);
	});

	it("reports the last run and the median duration per job", async () => {
		await saveRun(dir, row({ runId: "r1", jobId: "a", startedAt: "2026-08-26T00:01:00.000Z", durationMs: 100 }));
		await saveRun(dir, row({ runId: "r2", jobId: "a", startedAt: "2026-08-26T00:02:00.000Z", durationMs: 300 }));
		await saveRun(dir, row({ runId: "r3", jobId: "a", startedAt: "2026-08-26T00:03:00.000Z", durationMs: 200 }));
		await saveRun(dir, row({ runId: "r4", jobId: "a", startedAt: "2026-08-26T00:04:00.000Z", status: "running" }));

		const rows = await loadRuns(dir);
		expect(lastRunFor(rows, "a")?.runId).toBe("r4");
		expect(medianDurationMs(rows, "a")).toBe(200);
		expect(medianDurationMs(rows, "missing")).toBeUndefined();
	});
});

describe("cursor.json", () => {
	it("defaults to an empty cursor and round-trips", async () => {
		expect(await readCursor(dir)).toEqual({ file: "", offset: 0 });
		await writeCursor(dir, { file: "2026-08-26.jsonl", offset: 512 });
		expect(await readCursor(dir)).toEqual({ file: "2026-08-26.jsonl", offset: 512 });
	});
});
