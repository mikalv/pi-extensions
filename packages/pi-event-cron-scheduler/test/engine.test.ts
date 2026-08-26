import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readNewEvents } from "../src/bus.js";
import { DEFAULT_TIMEOUT_MS, Engine, GRACE_MS, type RunAgent } from "../src/engine.js";
import type { EmitSpec, JobDefinition } from "../src/frontmatter.js";
import { loadRuns, saveRun } from "../src/state.js";

let dir: string;
let now = Date.parse("2026-08-26T04:00:00.000Z");
let counter = 0;

const clock = () => now;
const ids = () => `id-${++counter}`;

/** A run only reaches runAgent after several awaits, so tests wait for the state they need. */
async function until(predicate: () => boolean, label: string): Promise<void> {
	for (let attempt = 0; attempt < 400; attempt++) {
		if (predicate()) return;
		await new Promise((resolve) => setTimeout(resolve, 5));
	}
	throw new Error(`timed out waiting for ${label}`);
}

function job(over: Partial<JobDefinition> = {}): JobDefinition {
	return {
		id: "a",
		path: "/ws/scheduled/a.md",
		workspace: "/ws",
		on: [],
		concurrency: "skip",
		memory: false,
		emits: [],
		body: "Do the thing.",
		...over,
	};
}

function emitSpec(over: Partial<EmitSpec> = {}): EmitSpec {
	return { kind: "event", target: "news.found", when: "success", ...over };
}

/** A runner whose completion is controlled by the test. */
function controllable() {
	const calls: Array<{ prompt: string; resolve: (output: string) => void; reject: (error: Error) => void }> = [];
	const runAgent: RunAgent = ({ prompt }) =>
		new Promise((resolve) => {
			calls.push({
				prompt,
				resolve: (output) => resolve({ status: "completed", output }),
				reject: (error) => resolve({ status: "failed", output: "", error: error.message }),
			});
		});
	return { calls, runAgent };
}

/** Records timers so a test can fire them on demand instead of waiting for wall clock. */
function timerHarness() {
	const timers: Array<{ fn: () => void; ms: number; cancelled: boolean }> = [];
	const setTimer = (fn: () => void, ms: number) => {
		const entry = { fn, ms, cancelled: false };
		timers.push(entry);
		return entry;
	};
	const clearTimer = (handle: any) => {
		if (handle) handle.cancelled = true;
	};
	const fire = (ms: number) => {
		for (const timer of [...timers]) {
			if (!timer.cancelled && timer.ms === ms) {
				timer.cancelled = true;
				timer.fn();
			}
		}
	};
	const armed = (ms: number) => timers.some((timer) => timer.ms === ms);
	return { timers, setTimer, clearTimer, fire, armed };
}

function engineFor(
	jobs: JobDefinition[],
	runAgent: RunAgent,
	extra: Partial<ConstructorParameters<typeof Engine>[0]> = {},
): { engine: Engine; harness: ReturnType<typeof timerHarness> } {
	const harness = timerHarness();
	const engine = new Engine({
		stateDir: dir,
		jobs,
		clock,
		pid: 777,
		runAgent,
		notify: () => {},
		scope: {},
		idFn: ids,
		setTimer: harness.setTimer,
		clearTimer: harness.clearTimer,
		...extra,
	});
	return { engine, harness };
}

function engineWith(jobs: JobDefinition[], runAgent: RunAgent, scope: Record<string, unknown> = {}): Engine {
	return engineFor(jobs, runAgent, { scope }).engine;
}

async function allEvents(): Promise<string[]> {
	const { events } = await readNewEvents(dir, { file: "", offset: 0 });
	return events.map((event) => event.event);
}

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "eventcron-engine-"));
	now = Date.parse("2026-08-26T04:00:00.000Z");
	counter = 0;
});

afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

describe("routing", () => {
	it("runs the job named by a cron.tick payload and prompts it with its body", async () => {
		const { calls, runAgent } = controllable();
		const engine = engineWith([job()], runAgent);

		await engine.emit({ event: "cron.tick", source: "cron", payload: { jobId: "a" } });
		await engine.drain();
		await until(() => calls.length === 1, "the run to start");

		expect(calls[0].prompt).toContain("[scheduled job: a]");
		expect(calls[0].prompt).toContain("Do the thing.");

		calls[0].resolve("done");
		await engine.idle();
		expect(await allEvents()).toContain("job.completed");
	});

	it("starts only the jobs subscribed to an event", async () => {
		const { calls, runAgent } = controllable();
		const listener = job({ id: "listener", on: ["news.found"] });
		const bystander = job({ id: "bystander" });
		const engine = engineWith([listener, bystander], runAgent);

		await engine.emit({ event: "news.found", source: "scout" });
		await engine.drain();
		await until(() => calls.length === 1, "the listener to start");

		expect(calls).toHaveLength(1);
		expect(calls[0].prompt).toContain("[scheduled job: listener]");
	});

	it("drains each event exactly once across calls", async () => {
		const { calls, runAgent } = controllable();
		const engine = engineWith([job({ on: ["tick"] })], runAgent);

		await engine.emit({ event: "tick", source: "tool" });
		await engine.drain();
		await engine.drain();
		await until(() => calls.length === 1, "the run to start");
		expect(calls).toHaveLength(1);
	});
});

describe("concurrency", () => {
	it("skips a trigger that arrives while a run is in flight", async () => {
		const { calls, runAgent } = controllable();
		const engine = engineWith([job({ on: ["tick"], concurrency: "skip" })], runAgent);

		await engine.emit({ event: "tick", source: "tool" });
		await engine.drain();
		await until(() => calls.length === 1, "the first run to start");

		await engine.emit({ event: "tick", source: "tool" });
		await engine.drain();

		expect(calls).toHaveLength(1);
		expect(await allEvents()).toContain("job.skipped");

		calls[0].resolve("done");
		await engine.idle();
		expect(calls).toHaveLength(1);
	});

	it("queues at most one pending trigger and starts it when the slot frees", async () => {
		const { calls, runAgent } = controllable();
		const engine = engineWith([job({ on: ["tick"], concurrency: "queue" })], runAgent);

		await engine.emit({ event: "tick", source: "tool" });
		await engine.drain();
		await until(() => calls.length === 1, "the first run to start");

		for (let i = 0; i < 3; i++) {
			await engine.emit({ event: "tick", source: "tool" });
			await engine.drain();
		}
		expect(calls).toHaveLength(1);

		calls[0].resolve("first");
		await until(() => calls.length === 2, "the queued run to start");

		calls[1].resolve("second");
		await engine.idle();
		expect(calls).toHaveLength(2);
	});

	it("runs in parallel without a cap when asked", async () => {
		const { calls, runAgent } = controllable();
		const engine = engineWith([job({ on: ["tick"], concurrency: "parallel" })], runAgent);

		await engine.emit({ event: "tick", source: "tool" });
		await engine.drain();
		await engine.emit({ event: "tick", source: "tool" });
		await engine.drain();
		await until(() => calls.length === 2, "both runs to start");

		expect(engine.inFlightCount("a")).toBe(2);

		calls[0].resolve("one");
		calls[1].resolve("two");
		await engine.idle();
	});
});

describe("continue line and sinks", () => {
	it("stores the continue line and fires only the matching if-guarded sinks", async () => {
		const { calls, runAgent } = controllable();
		const engine = engineWith(
			[
				job({
					on: ["tick"],
					emits: [
						emitSpec({ target: "user.alerted", ifTokens: ["alert-user"] }),
						emitSpec({ target: "run.recorded", ifTokens: ["record"] }),
					],
				}),
			],
			runAgent,
		);

		await engine.emit({ event: "tick", source: "tool" });
		await engine.drain();
		await until(() => calls.length === 1, "the run to start");

		calls[0].resolve("worked hard\ncontinue: [record]");
		await engine.idle();

		const events = await allEvents();
		expect(events).toContain("run.recorded");
		expect(events).not.toContain("user.alerted");

		const runs = await loadRuns(dir);
		expect(runs[0].verdict).toBe("continue: [record]");
		expect(runs[0].continueTokens).toEqual(["record"]);
		expect(runs[0].status).toBe("completed");
	});

	it("emits job.signal.missing once when an if-using job produces no continue line", async () => {
		const { calls, runAgent } = controllable();
		const engine = engineWith(
			[job({ on: ["tick"], emits: [emitSpec({ target: "user.alerted", ifTokens: ["alert-user"] })] })],
			runAgent,
		);

		await engine.emit({ event: "tick", source: "tool" });
		await engine.drain();
		await until(() => calls.length === 1, "the run to start");

		calls[0].resolve("I forgot the line entirely");
		await engine.idle();

		const events = await allEvents();
		expect(events.filter((event) => event === "job.signal.missing")).toHaveLength(1);
		expect(events).not.toContain("user.alerted");
	});

	it("emits job.failed when the runner reports failure and skips success sinks", async () => {
		const { calls, runAgent } = controllable();
		const engine = engineWith([job({ on: ["tick"], emits: [emitSpec({ target: "news.found", when: "success" })] })], runAgent);

		await engine.emit({ event: "tick", source: "tool" });
		await engine.drain();
		await until(() => calls.length === 1, "the run to start");

		calls[0].reject(new Error("model exploded"));
		await engine.idle();

		const events = await allEvents();
		expect(events).toContain("job.failed");
		expect(events).not.toContain("news.found");
		expect((await loadRuns(dir))[0].status).toBe("failed");
	});
});

describe("chain limit", () => {
	it("rejects an emit past the limit, records it, and fails the run", async () => {
		const { calls, runAgent } = controllable();
		const engine = engineWith([job({ on: ["tick"], emits: [emitSpec({ target: "news.found" })] })], runAgent);

		await engine.emit({ event: "tick", source: "tool", chain: 8 });
		await engine.drain();
		await until(() => calls.length === 1, "the run to start");

		calls[0].resolve("done");
		await engine.idle();

		const events = await allEvents();
		expect(events).toContain("chain.limit.exceeded");
		expect(events).not.toContain("news.found");
		expect((await loadRuns(dir))[0].status).toBe("failed");
	});

	it("increments chain for events a run emits", async () => {
		const { calls, runAgent } = controllable();
		const engine = engineWith([job({ on: ["tick"], emits: [emitSpec({ target: "news.found" })] })], runAgent);

		await engine.emit({ event: "tick", source: "tool", chain: 2 });
		await engine.drain();
		await until(() => calls.length === 1, "the run to start");

		calls[0].resolve("done");
		await engine.idle();

		const { events } = await readNewEvents(dir, { file: "", offset: 0 });
		const emitted = events.find((event) => event.event === "news.found");
		expect(emitted?.chain).toBe(3);
		expect(emitted?.source).toBe("a");
	});
});

describe("deadlines", () => {
	it("aborts on timeout, records timed_out, and frees the slot", async () => {
		const { calls, runAgent } = controllable();
		const { engine, harness } = engineFor([job({ on: ["tick"], concurrency: "skip", timeoutMs: 5_000 })], runAgent);

		await engine.emit({ event: "tick", source: "tool" });
		await engine.drain();
		await until(() => harness.armed(5_000), "the deadline timer to be armed");
		expect(engine.inFlightCount("a")).toBe(1);

		harness.fire(5_000);
		calls[0].resolve("aborted mid-flight");
		await engine.idle();

		expect(await allEvents()).toContain("job.timeout");
		expect((await loadRuns(dir))[0].status).toBe("timed_out");
		expect(engine.inFlightCount("a")).toBe(0);

		await engine.emit({ event: "tick", source: "tool" });
		await engine.drain();
		await until(() => calls.length === 2, "the next run to start");
	});

	it("uses the default deadline when the job sets no timeout", async () => {
		const { runAgent } = controllable();
		const { engine, harness } = engineFor([job({ on: ["tick"] })], runAgent);

		await engine.emit({ event: "tick", source: "tool" });
		await engine.drain();
		await until(() => harness.armed(DEFAULT_TIMEOUT_MS), "the default deadline to be armed");
	});

	it("emits job.overdue exactly once and lets the run continue", async () => {
		const { calls, runAgent } = controllable();
		const { engine, harness } = engineFor(
			[job({ on: ["tick"], expectedRuntimeMs: 2_000, timeoutMs: 60_000 })],
			runAgent,
		);

		await engine.emit({ event: "tick", source: "tool" });
		await engine.drain();
		await until(() => harness.armed(2_000), "the overdue timer to be armed");

		harness.fire(2_000);
		harness.fire(2_000);

		calls[0].resolve("slow but fine");
		await engine.idle();

		const events = await allEvents();
		expect(events.filter((event) => event === "job.overdue")).toHaveLength(1);
		expect(events).toContain("job.completed");
		expect((await loadRuns(dir))[0].status).toBe("completed");
	});

	it("abandons a run that ignores its abort and frees the slot anyway", async () => {
		const { calls, runAgent } = controllable();
		const { engine, harness } = engineFor([job({ on: ["tick"], concurrency: "skip", timeoutMs: 5_000 })], runAgent);

		await engine.emit({ event: "tick", source: "tool" });
		await engine.drain();
		await until(() => harness.armed(5_000), "the deadline timer to be armed");

		harness.fire(5_000);
		harness.fire(GRACE_MS);
		await engine.idle();

		expect(engine.inFlightCount("a")).toBe(0);
		const events = await allEvents();
		expect(events).toContain("job.abandoned");
		expect((await loadRuns(dir)).find((row) => row.runId === "id-2")?.status).toBe("abandoned");

		await engine.emit({ event: "tick", source: "tool" });
		await engine.drain();
		await until(() => calls.length === 2, "the next run to start despite the stuck one");
	});
});

describe("kill", () => {
	it("aborts in-flight runs and records them as timed_out", async () => {
		const { calls, runAgent } = controllable();
		const engine = engineWith([job({ on: ["tick"] })], runAgent);

		await engine.emit({ event: "tick", source: "tool" });
		await engine.drain();
		await until(() => calls.length === 1, "the run to start");

		expect(engine.kill("a")).toBe(1);
		expect(engine.kill("nope")).toBe(0);

		calls[0].resolve("stopped");
		await engine.idle();
		expect((await loadRuns(dir))[0].status).toBe("timed_out");
	});
});

describe("recoverInterrupted", () => {
	it("marks running rows from a dead pid as interrupted and announces them", async () => {
		await saveRun(dir, {
			runId: "ghost",
			jobId: "a",
			workspace: "/ws",
			status: "running",
			pid: 4242,
			startedAt: "2026-08-26T03:00:00.000Z",
		});

		const { runAgent } = controllable();
		const { engine } = engineFor([job()], runAgent, { isPidAlive: () => false });

		const recovered = await engine.recoverInterrupted();
		expect(recovered.map((row) => row.runId)).toEqual(["ghost"]);
		expect((await loadRuns(dir)).find((row) => row.runId === "ghost")?.status).toBe("interrupted");
		expect(await allEvents()).toContain("job.interrupted");
	});

	it("leaves rows alone when the owning pid is still alive", async () => {
		await saveRun(dir, {
			runId: "alive",
			jobId: "a",
			workspace: "/ws",
			status: "running",
			pid: 4242,
			startedAt: "2026-08-26T03:00:00.000Z",
		});

		const { runAgent } = controllable();
		const { engine } = engineFor([job()], runAgent, { isPidAlive: () => true });

		expect(await engine.recoverInterrupted()).toEqual([]);
		expect((await loadRuns(dir))[0].status).toBe("running");
	});
});
