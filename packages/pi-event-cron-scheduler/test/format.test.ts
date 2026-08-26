import { describe, it, expect } from "bun:test";
import { formatDurationMs, formatJobList } from "../src/format.js";
import type { JobDefinition } from "../src/frontmatter.js";
import { enabledKey, type EnabledFile, type RunRow } from "../src/state.js";

function job(over: Partial<JobDefinition> = {}): JobDefinition {
	return {
		id: "a",
		path: "/ws/scheduled/a.md",
		workspace: "/ws",
		on: [],
		concurrency: "skip",
		memory: false,
		emits: [],
		body: "Do it.",
		...over,
	};
}

const enabled: EnabledFile = {
	version: 1,
	jobs: { [enabledKey("/ws", "a")]: { enabledAt: "2026-08-26T02:50:00.000Z", path: "scheduled/a.md" } },
};

const runs: RunRow[] = [
	{
		runId: "r1",
		jobId: "a",
		workspace: "/ws",
		status: "completed",
		pid: 1,
		startedAt: "2026-08-26T02:48:00.000Z",
		completedAt: "2026-08-26T02:51:12.000Z",
		durationMs: 192_000,
		verdict: "continue: [record]",
		continueTokens: ["record"],
	},
];

function render(over: Partial<Parameters<typeof formatJobList>[0]> = {}): string {
	return formatJobList({
		workspace: "/ws",
		jobs: [
			job({
				cron: "*/5 * * * *",
				timezone: "Europe/Oslo",
				on: ["news.found"],
				emits: [{ kind: "event", target: "done", when: "success" }],
			}),
		],
		invalid: [],
		enabled,
		runs,
		leaderPid: 777,
		selfPid: 777,
		inFlight: () => 0,
		nextRunFor: () => new Date("2026-08-26T03:00:00.000Z"),
		...over,
	});
}

describe("formatDurationMs", () => {
	it("renders sub-second, seconds, and minutes", () => {
		expect(formatDurationMs(800)).toBe("800ms");
		expect(formatDurationMs(12_000)).toBe("12s");
		expect(formatDurationMs(192_000)).toBe("3m12s");
		expect(formatDurationMs(undefined)).toBe("-");
	});
});

describe("formatJobList", () => {
	it("marks enabled jobs and shows cron, next run, triggers, and last result", () => {
		const text = render();
		expect(text).toContain("a");
		expect(text).toContain("*/5 * * * *");
		expect(text).toContain("Europe/Oslo");
		expect(text).toContain("on: news.found");
		expect(text).toContain("emits: done");
		expect(text).toContain("last: completed");
		expect(text).toContain("3m12s");
		expect(text).toContain("continue: [record]");
		expect(text).toContain("enabled");
	});

	it("lists a disabled job instead of hiding it", () => {
		const text = render({ enabled: { version: 1, jobs: {} } });
		expect(text).toContain("a");
		expect(text).toContain("disabled");
	});

	it("names this process as leader or reports which pid holds it", () => {
		expect(render()).toContain("leader: this session");
		expect(render({ leaderPid: 999 })).toContain("leader: pid 999");
		expect(render({ leaderPid: null })).toContain("leader: none");
	});

	it("shows running counts and invalid files with their errors", () => {
		const text = render({
			inFlight: () => 2,
			invalid: [{ path: "/ws/scheduled/bad.md", id: "twin", errors: ['duplicate id "twin"'] }],
		});
		expect(text).toContain("running: 2");
		expect(text).toContain("bad.md");
		expect(text).toContain('duplicate id "twin"');
	});

	it("says so when the workspace has no scheduled files", () => {
		const text = render({ jobs: [], invalid: [] });
		expect(text).toContain("No scheduled/*.md files");
	});
});
