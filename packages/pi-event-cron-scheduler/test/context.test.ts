import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { JobDefinition } from "../src/frontmatter.js";
import {
	MEMORY_MAX_CHARS,
	buildContextHeader,
	buildPrompt,
	collectIfTokens,
	continueInstruction,
	memoryPath,
	readMemory,
	truncateTail,
} from "../src/context.js";

const NOW = new Date("2026-08-26T02:56:00.000Z");

function job(over: Partial<JobDefinition> = {}): JobDefinition {
	return {
		id: "security-red-team",
		path: "/ws/scheduled/rt.md",
		workspace: "/ws",
		on: [],
		concurrency: "skip",
		memory: false,
		emits: [],
		body: "Go red-team everything.",
		...over,
	};
}

let dir: string;

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "eventcron-ctx-"));
});

afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

describe("buildContextHeader", () => {
	it("states the job, trigger, time in the job timezone, and the ISO date", () => {
		const header = buildContextHeader({
			job: job({ cron: "*/5 * * * *", timezone: "Europe/Oslo" }),
			now: NOW,
			trigger: { event: "cron.tick", source: "cron" },
		});
		expect(header).toContain("[scheduled job: security-red-team]");
		expect(header).toContain("Triggered by: cron.tick");
		expect(header).toContain("*/5 * * * * Europe/Oslo");
		expect(header).toContain("ISO date: 2026-08-26");
		expect(header).toContain("04:56");
		expect(header).toContain("Workspace: /ws");
	});

	it("includes the event payload and the previous run with its continue tokens", () => {
		const header = buildContextHeader({
			job: job(),
			now: NOW,
			trigger: { event: "threat-report.written", source: "scout" },
			payload: { severity: "high" },
			previous: {
				runId: "r0",
				jobId: "security-red-team",
				workspace: "/ws",
				status: "completed",
				pid: 1,
				startedAt: "2026-08-26T02:48:00.000Z",
				completedAt: "2026-08-26T02:51:12.000Z",
				durationMs: 192_000,
				continueTokens: ["found-threats"],
				outputTail: "three hosts responded",
			},
		});
		expect(header).toContain('Event payload: {"severity":"high"}');
		expect(header).toContain("Previous run: completed");
		expect(header).toContain("continue: [found-threats]");
		expect(header).toContain("three hosts responded");
	});

	it("omits the memory block entirely when memory is off", () => {
		const header = buildContextHeader({ job: job(), now: NOW, trigger: { event: "cron.tick", source: "cron" } });
		expect(header).not.toContain("Memory file");
		expect(header).not.toContain("--- memory ---");
	});

	it("includes the memory path and content when memory is on", () => {
		const header = buildContextHeader({
			job: job({ memory: true }),
			now: NOW,
			trigger: { event: "cron.tick", source: "cron" },
			memory: { path: "/state/memory/security-red-team.md", content: "remember the open port" },
		});
		expect(header).toContain("Memory file: /state/memory/security-red-team.md");
		expect(header).toContain("--- memory ---");
		expect(header).toContain("remember the open port");
		expect(header).toContain("--- end memory ---");
	});
});

describe("collectIfTokens and continueInstruction", () => {
	it("collects unique sorted tokens across emits", () => {
		const tokens = collectIfTokens(
			job({
				emits: [
					{ kind: "event", target: "a", when: "success", ifTokens: ["record", "alert-user"] },
					{ kind: "notify", target: "n", when: "failure", ifTokens: ["record"] },
					{ kind: "event", target: "b", when: "always" },
				],
			}),
		);
		expect(tokens).toEqual(["alert-user", "record"]);
	});

	it("returns an empty string when no emit uses if", () => {
		expect(continueInstruction([])).toBe("");
	});

	it("lists exactly the tokens in use and both accepted forms", () => {
		const text = continueInstruction(["alert-user", "record"]);
		expect(text).toContain("continue: [alert-user,record]");
		expect(text).toContain("continue: alert-user");
		expect(text).toContain("continue: []");
		expect(text).not.toContain("TRUE");
	});
});

describe("buildPrompt", () => {
	it("puts the header first, the body next, and the instruction last", () => {
		const prompt = buildPrompt({
			job: job({ emits: [{ kind: "event", target: "a", when: "success", ifTokens: ["go"] }] }),
			now: NOW,
			trigger: { event: "cron.tick", source: "cron" },
		});
		const headerAt = prompt.indexOf("[scheduled job:");
		const bodyAt = prompt.indexOf("Go red-team everything.");
		const instructionAt = prompt.indexOf("continue: [go]");
		expect(headerAt).toBeGreaterThanOrEqual(0);
		expect(bodyAt).toBeGreaterThan(headerAt);
		expect(instructionAt).toBeGreaterThan(bodyAt);
	});

	it("adds no instruction when the job uses no if", () => {
		const prompt = buildPrompt({ job: job(), now: NOW, trigger: { event: "cron.tick", source: "cron" } });
		expect(prompt).not.toContain("continue:");
	});
});

describe("memory files", () => {
	it("creates the file empty on first read and keeps later content", async () => {
		expect(await readMemory(dir, "a")).toBe("");
		expect(await readFile(memoryPath(dir, "a"), "utf8")).toBe("");

		await writeFile(memoryPath(dir, "a"), "noted", "utf8");
		expect(await readMemory(dir, "a")).toBe("noted");
	});

	it("keeps the end of an oversized memory file", async () => {
		await readMemory(dir, "big");
		await writeFile(memoryPath(dir, "big"), `${"x".repeat(MEMORY_MAX_CHARS)}TAIL`, "utf8");
		const content = await readMemory(dir, "big");
		expect(content.length).toBe(MEMORY_MAX_CHARS);
		expect(content.endsWith("TAIL")).toBe(true);
	});

	it("truncateTail keeps the end and leaves short text alone", () => {
		expect(truncateTail("short", 10)).toBe("short");
		expect(truncateTail("abcdefghij", 4)).toBe("ghij");
	});
});
