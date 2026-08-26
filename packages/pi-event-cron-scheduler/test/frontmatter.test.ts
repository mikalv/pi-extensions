import { describe, it, expect } from "bun:test";
import { parseContinueLine, parseDuration, parseJobFile, validateCron } from "../src/frontmatter.js";

describe("parseDuration", () => {
	it("accepts duration strings and passes through millisecond numbers", () => {
		expect(parseDuration("500ms")).toBe(500);
		expect(parseDuration("90s")).toBe(90_000);
		expect(parseDuration("2m")).toBe(120_000);
		expect(parseDuration("1h")).toBe(3_600_000);
		expect(parseDuration(" 2m ")).toBe(120_000);
		expect(parseDuration(900_000)).toBe(900_000);
	});

	it("rejects zero, negatives, unknown units, and non-values", () => {
		expect(parseDuration(0)).toBeNull();
		expect(parseDuration(-5)).toBeNull();
		expect(parseDuration("2w")).toBeNull();
		expect(parseDuration("soon")).toBeNull();
		expect(parseDuration("")).toBeNull();
		expect(parseDuration(undefined)).toBeNull();
		expect(parseDuration({})).toBeNull();
	});
});

describe("parseContinueLine", () => {
	it("parses the bracketed list form from the last non-empty line", () => {
		const out = "did some work\n\ncontinue: [alert-user,record]\n\n";
		expect(parseContinueLine(out)).toEqual({
			raw: "continue: [alert-user,record]",
			tokens: ["alert-user", "record"],
		});
	});

	it("parses a bare token and an empty list, case-insensitively", () => {
		expect(parseContinueLine("CONTINUE: Alert-User")).toEqual({
			raw: "CONTINUE: Alert-User",
			tokens: ["alert-user"],
		});
		expect(parseContinueLine("continue: []")).toEqual({
			raw: "continue: []",
			tokens: [],
		});
	});

	it("returns null for prose, missing prefix, bad tokens, and over-long lines", () => {
		expect(parseContinueLine("I finished the report [see above]")).toBeNull();
		expect(parseContinueLine("alert-user")).toBeNull();
		expect(parseContinueLine("continue: [ok, BAD TOKEN]")).toBeNull();
		expect(parseContinueLine(`continue: [${"a".repeat(200)}]`)).toBeNull();
		expect(parseContinueLine("")).toBeNull();
	});
});

const FULL = `---
id: security-red-team
description: Red-team everything I own
agent: security-freak
runtime: pi-subprocess
tools: [read, write, bash]
expectedRuntime: 2m
timeout: 15m
schedule:
  cron: "*/5 * * * *"
  timezone: Europe/Oslo
on: [threat-report.written]
concurrency: queue
memory: true
emits:
  - event: threat-report.written
    when: success
    if: [Found-Threats]
    payload: { severity: high }
  - webhook: https://example.com/hook
    when: failure
    body: { text: failed }
  - notify: Your AI went berserk
  - telegram.send.message:
      text: Report ready
---

Go red-team everything.
`;

describe("parseJobFile", () => {
	it("parses a full file into a JobDefinition", () => {
		const res = parseJobFile({ path: "/ws/scheduled/rt.md", workspace: "/ws", content: FULL });
		if (!res.ok) throw new Error(`expected ok, got ${res.invalid.errors.join("; ")}`);
		const job = res.job;
		expect(job.id).toBe("security-red-team");
		expect(job.agent).toBe("security-freak");
		expect(job.tools).toEqual(["read", "write", "bash"]);
		expect(job.expectedRuntimeMs).toBe(120_000);
		expect(job.timeoutMs).toBe(900_000);
		expect(job.cron).toBe("*/5 * * * *");
		expect(job.timezone).toBe("Europe/Oslo");
		expect(job.on).toEqual(["threat-report.written"]);
		expect(job.concurrency).toBe("queue");
		expect(job.memory).toBe(true);
		expect(job.body).toBe("Go red-team everything.");
	});

	it("normalises every emit shape and lowercases if-tokens", () => {
		const res = parseJobFile({ path: "/ws/scheduled/rt.md", workspace: "/ws", content: FULL });
		if (!res.ok) throw new Error("expected ok");
		expect(res.job.emits).toEqual([
			{
				kind: "event",
				target: "threat-report.written",
				when: "success",
				ifTokens: ["found-threats"],
				args: { severity: "high" },
			},
			{
				kind: "webhook",
				target: "https://example.com/hook",
				when: "failure",
				args: { text: "failed" },
			},
			{ kind: "notify", target: "Your AI went berserk", when: "success" },
			{
				kind: "registry",
				target: "telegram.send.message",
				when: "success",
				args: { text: "Report ready" },
			},
		]);
	});

	it("defaults concurrency to skip, memory to false, and on to an empty list", () => {
		const res = parseJobFile({
			path: "/ws/scheduled/min.md",
			workspace: "/ws",
			content: "---\nid: minimal\n---\n\nDo a thing.\n",
		});
		if (!res.ok) throw new Error("expected ok");
		expect(res.job.concurrency).toBe("skip");
		expect(res.job.memory).toBe(false);
		expect(res.job.on).toEqual([]);
		expect(res.job.emits).toEqual([]);
	});

	it("rejects a missing id, a bad id charset, and a traversal id", () => {
		const noId = parseJobFile({ path: "/ws/a.md", workspace: "/ws", content: "---\ndescription: x\n---\nbody\n" });
		expect(noId.ok).toBe(false);
		if (!noId.ok) expect(noId.invalid.errors.join(" ")).toContain("id is required");

		const badId = parseJobFile({ path: "/ws/a.md", workspace: "/ws", content: "---\nid: Bad Id\n---\nbody\n" });
		expect(badId.ok).toBe(false);

		const traversal = parseJobFile({
			path: "/ws/a.md",
			workspace: "/ws",
			content: "---\nid: ../../etc/passwd\n---\nbody\n",
		});
		expect(traversal.ok).toBe(false);
	});

	it("rejects reserved event prefixes, unknown fields, bad cron, and bad durations", () => {
		const reserved = parseJobFile({
			path: "/ws/a.md",
			workspace: "/ws",
			content: "---\nid: a\nemits:\n  - event: job.completed\n---\nbody\n",
		});
		expect(reserved.ok).toBe(false);
		if (!reserved.ok) expect(reserved.invalid.errors.join(" ")).toContain("reserved");

		const unknown = parseJobFile({
			path: "/ws/a.md",
			workspace: "/ws",
			content: "---\nid: a\nnope: 1\n---\nbody\n",
		});
		expect(unknown.ok).toBe(false);
		if (!unknown.ok) expect(unknown.invalid.errors.join(" ")).toContain("unknown field");

		const badCron = parseJobFile({
			path: "/ws/a.md",
			workspace: "/ws",
			content: '---\nid: a\nschedule:\n  cron: "not a cron"\n---\nbody\n',
		});
		expect(badCron.ok).toBe(false);

		const badDuration = parseJobFile({
			path: "/ws/a.md",
			workspace: "/ws",
			content: "---\nid: a\ntimeout: 2w\n---\nbody\n",
		});
		expect(badDuration.ok).toBe(false);
	});

	it("rejects malformed YAML and a missing body without throwing", () => {
		const broken = parseJobFile({ path: "/ws/a.md", workspace: "/ws", content: "---\nid: [unclosed\n---\nbody\n" });
		expect(broken.ok).toBe(false);

		const noBody = parseJobFile({ path: "/ws/a.md", workspace: "/ws", content: "---\nid: a\n---\n\n   \n" });
		expect(noBody.ok).toBe(false);
		if (!noBody.ok) expect(noBody.invalid.errors.join(" ")).toContain("body");
	});
});

describe("validateCron", () => {
	it("accepts a valid expression with a timezone and rejects nonsense", () => {
		expect(validateCron("*/5 * * * *", "Europe/Oslo")).toBeNull();
		expect(validateCron("not a cron")).not.toBeNull();
		expect(validateCron("*/5 * * * *", "Mars/Olympus")).not.toBeNull();
	});
});
