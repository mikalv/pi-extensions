import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { appendFile, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendEvent, eventsDir, logNameFor, newEvent, pruneOldLogs, readNewEvents } from "../src/bus.js";

let dir: string;
let counter = 0;
const ids = () => `id-${++counter}`;

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "eventcron-bus-"));
	counter = 0;
});

afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

describe("logNameFor", () => {
	it("names the file after the UTC date", () => {
		expect(logNameFor(new Date("2026-08-26T23:59:59.000Z"))).toBe("2026-08-26.jsonl");
	});
});

describe("appendEvent and readNewEvents", () => {
	it("returns appended events once and advances the cursor", async () => {
		const now = new Date("2026-08-26T04:00:00.000Z");
		await appendEvent(dir, newEvent({ event: "cron.tick", source: "cron", payload: { jobId: "a" } }, now, ids), now);
		await appendEvent(dir, newEvent({ event: "news.found", source: "a", chain: 1 }, now, ids), now);

		const first = await readNewEvents(dir, { file: "", offset: 0 });
		expect(first.events.map((e) => e.event)).toEqual(["cron.tick", "news.found"]);
		expect(first.events[0].payload).toEqual({ jobId: "a" });
		expect(first.events[1].chain).toBe(1);
		expect(first.cursor.file).toBe("2026-08-26.jsonl");
		expect(first.cursor.offset).toBeGreaterThan(0);

		const second = await readNewEvents(dir, first.cursor);
		expect(second.events).toEqual([]);
		expect(second.cursor).toEqual(first.cursor);

		await appendEvent(dir, newEvent({ event: "third", source: "tool" }, now, ids), now);
		const third = await readNewEvents(dir, second.cursor);
		expect(third.events.map((e) => e.event)).toEqual(["third"]);
	});

	it("reads the tail of the previous day before moving to today", async () => {
		const yesterday = new Date("2026-08-25T23:59:59.000Z");
		const today = new Date("2026-08-26T00:00:01.000Z");
		await appendEvent(dir, newEvent({ event: "late-tick", source: "cron" }, yesterday, ids), yesterday);
		await appendEvent(dir, newEvent({ event: "early-tick", source: "cron" }, today, ids), today);

		const result = await readNewEvents(dir, { file: "2026-08-25.jsonl", offset: 0 });
		expect(result.events.map((e) => e.event)).toEqual(["late-tick", "early-tick"]);
		expect(result.cursor.file).toBe("2026-08-26.jsonl");
	});

	it("ignores a line that has no trailing newline yet", async () => {
		const now = new Date("2026-08-26T04:00:00.000Z");
		await appendEvent(dir, newEvent({ event: "complete", source: "cron" }, now, ids), now);
		await mkdir(eventsDir(dir), { recursive: true });
		await appendFile(join(eventsDir(dir), logNameFor(now)), '{"event":"half', "utf8");

		const result = await readNewEvents(dir, { file: "", offset: 0 });
		expect(result.events.map((e) => e.event)).toEqual(["complete"]);

		await appendFile(
			join(eventsDir(dir), logNameFor(now)),
			'-written","id":"x","ts":"t","source":"s","chain":0}\n',
			"utf8",
		);
		const after = await readNewEvents(dir, result.cursor);
		expect(after.events.map((e) => e.event)).toEqual(["half-written"]);
	});

	it("returns an empty result when the events directory is missing", async () => {
		expect(await readNewEvents(dir, { file: "", offset: 0 })).toEqual({
			events: [],
			cursor: { file: "", offset: 0 },
		});
	});
});

describe("pruneOldLogs", () => {
	it("deletes day files older than the retention window and keeps the rest", async () => {
		const now = new Date("2026-08-26T04:00:00.000Z");
		for (const day of ["2026-07-01", "2026-08-20", "2026-08-26"]) {
			await appendEvent(
				dir,
				newEvent({ event: "x", source: "cron" }, new Date(`${day}T00:00:00.000Z`), ids),
				new Date(`${day}T00:00:00.000Z`),
			);
		}

		const removed = await pruneOldLogs(dir, 30, now);
		expect(removed).toEqual(["2026-07-01.jsonl"]);
		expect((await readdir(eventsDir(dir))).sort()).toEqual(["2026-08-20.jsonl", "2026-08-26.jsonl"]);
	});
});
