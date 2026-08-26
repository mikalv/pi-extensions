import { describe, expect, test } from "bun:test";

import type { JobDefinition } from "../src/frontmatter.js";
import {
	type ExecResultLike,
	RUNNER_REGISTRY_KEY,
	cliArgs,
	makeRunAgent,
	registerRunner,
	selectRunner,
	unsupportedByCli,
} from "../src/runner.js";

function job(overrides: Partial<JobDefinition> = {}): JobDefinition {
	return {
		id: "nightly",
		path: "/ws/scheduled/nightly.md",
		workspace: "/ws",
		on: [],
		concurrency: "skip",
		memory: false,
		emits: [],
		body: "do the thing",
		...overrides,
	} as JobDefinition;
}

function exec(result: Partial<ExecResultLike>) {
	const calls: Array<{ command: string; args: string[]; options?: any }> = [];
	const fn = async (command: string, args: string[], options?: any): Promise<ExecResultLike> => {
		calls.push({ command, args, options });
		return { stdout: "", stderr: "", code: 0, killed: false, ...result };
	};
	return { fn, calls };
}

describe("cliArgs", () => {
	test("passes the prompt last, without a session", () => {
		expect(cliArgs(job(), "hello")).toEqual(["--print", "--no-session", "hello"]);
	});

	test("maps model, thinking, and tools to flags", () => {
		const args = cliArgs(job({ model: "anthropic/sonnet", thinking: "high", tools: ["read", "bash"] }), "go");
		expect(args).toEqual([
			"--print",
			"--no-session",
			"--model",
			"anthropic/sonnet",
			"--thinking",
			"high",
			"--tools",
			"read,bash",
			"go",
		]);
	});

	test("ignores a boolean thinking level, which has no flag value", () => {
		expect(cliArgs(job({ thinking: true }), "go")).not.toContain("--thinking");
	});
});

describe("unsupportedByCli", () => {
	test("is empty for a job the CLI can express", () => {
		expect(unsupportedByCli(job({ model: "x", tools: ["read"] }))).toEqual([]);
	});

	test("names every field that needs a registered runner", () => {
		expect(unsupportedByCli(job({ agent: "security-freak", skills: ["audit"] }))).toEqual(["agent", "skills"]);
	});
});

describe("selectRunner", () => {
	test("prefers a runner matching the job runtime, then default", async () => {
		const scope: Record<string, unknown> = {};
		const fromDefault: any = async () => ({ status: "completed", output: "default" });
		const fromCore: any = async () => ({ status: "completed", output: "core" });
		registerRunner("default", fromDefault, scope);
		registerRunner("pi-subprocess", fromCore, scope);

		expect(selectRunner(job({ runtime: "pi-subprocess" }), scope)).toBe(fromCore);
		expect(selectRunner(job(), scope)).toBe(fromDefault);
		expect(selectRunner(job({ runtime: "unknown" }), scope)).toBe(fromDefault);
	});

	test("returns undefined when nothing is registered", () => {
		expect(selectRunner(job(), {})).toBeUndefined();
	});
});

describe("makeRunAgent", () => {
	test("runs a child pi process in the job workspace", async () => {
		const { fn, calls } = exec({ stdout: "done\ncontinue: record" });
		const run = makeRunAgent({ exec: fn, scope: {} });
		const signal = new AbortController().signal;

		const result = await run({ job: job({ timeoutMs: 5000 }), prompt: "go", signal });

		expect(result).toEqual({ status: "completed", output: "done\ncontinue: record" });
		expect(calls[0].command).toBe("pi");
		expect(calls[0].options).toEqual({ cwd: "/ws", signal, timeout: 5000 });
	});

	test("reports a non-zero exit as failed with stderr as the error", async () => {
		const { fn } = exec({ stdout: "partial", stderr: "boom\n", code: 1 });
		const run = makeRunAgent({ exec: fn, scope: {} });

		const result = await run({ job: job(), prompt: "go", signal: new AbortController().signal });

		expect(result).toEqual({ status: "failed", output: "partial", error: "boom" });
	});

	test("falls back to the exit code when stderr is empty", async () => {
		const { fn } = exec({ code: 137 });
		const run = makeRunAgent({ exec: fn, scope: {} });

		const result = await run({ job: job(), prompt: "go", signal: new AbortController().signal });

		expect(result.error).toBe("pi exited with code 137");
	});

	test("prefers a registered runner over the CLI", async () => {
		const { fn, calls } = exec({});
		const scope: Record<string, unknown> = {};
		registerRunner("default", async () => ({ status: "completed", output: "from runner" }), scope);
		const run = makeRunAgent({ exec: fn, scope });

		const result = await run({ job: job(), prompt: "go", signal: new AbortController().signal });

		expect(result.output).toBe("from runner");
		expect(calls).toHaveLength(0);
	});

	test("fails loudly instead of silently dropping agent or skills", async () => {
		const { fn, calls } = exec({});
		const run = makeRunAgent({ exec: fn, scope: {} });

		const result = await run({
			job: job({ agent: "security-freak" }),
			prompt: "go",
			signal: new AbortController().signal,
		});

		expect(result.status).toBe("failed");
		expect(result.error).toContain("agent");
		expect(result.error).toContain(RUNNER_REGISTRY_KEY);
		expect(calls).toHaveLength(0);
	});
});
