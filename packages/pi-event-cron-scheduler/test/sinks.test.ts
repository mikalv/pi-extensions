import { describe, it, expect } from "bun:test";
import type { EmitSpec } from "../src/frontmatter.js";
import { dispatchSinks, getSinkRegistry, registerSink, selectSinks, type SinkContext } from "../src/sinks.js";

const evt = (over: Partial<EmitSpec> = {}): EmitSpec => ({
	kind: "event",
	target: "news.found",
	when: "success",
	...over,
});

function ctx(over: Partial<SinkContext> = {}): SinkContext {
	return {
		jobId: "a",
		runId: "r1",
		workspace: "/ws",
		now: new Date("2026-08-26T04:00:00.000Z"),
		emit: async () => {},
		notify: () => {},
		scope: {},
		...over,
	};
}

describe("selectSinks", () => {
	it("matches when against the run status", () => {
		const specs = [
			evt({ target: "on-success", when: "success" }),
			evt({ target: "on-failure", when: "failure" }),
			evt({ target: "on-always", when: "always" }),
		];
		expect(selectSinks(specs, { status: "completed", tokens: null }).map((s) => s.target)).toEqual([
			"on-success",
			"on-always",
		]);
		expect(selectSinks(specs, { status: "failed", tokens: null }).map((s) => s.target)).toEqual([
			"on-failure",
			"on-always",
		]);
		expect(selectSinks(specs, { status: "timed_out", tokens: null }).map((s) => s.target)).toEqual([
			"on-failure",
			"on-always",
		]);
		expect(selectSinks(specs, { status: "interrupted", tokens: null }).map((s) => s.target)).toEqual([
			"on-failure",
			"on-always",
		]);
	});

	it("fires an if-guarded sink only when a token matches", () => {
		const specs = [
			evt({ target: "alerted", ifTokens: ["alert-user"] }),
			evt({ target: "recorded", ifTokens: ["record"] }),
			evt({ target: "unguarded" }),
		];
		expect(selectSinks(specs, { status: "completed", tokens: ["alert-user", "record"] }).map((s) => s.target)).toEqual([
			"alerted",
			"recorded",
			"unguarded",
		]);
		expect(selectSinks(specs, { status: "completed", tokens: ["record"] }).map((s) => s.target)).toEqual([
			"recorded",
			"unguarded",
		]);
		expect(selectSinks(specs, { status: "completed", tokens: [] }).map((s) => s.target)).toEqual(["unguarded"]);
	});

	it("skips if-guarded sinks when there is no continue line at all", () => {
		const specs = [evt({ target: "guarded", ifTokens: ["go"] }), evt({ target: "unguarded" })];
		expect(selectSinks(specs, { status: "completed", tokens: null }).map((s) => s.target)).toEqual(["unguarded"]);
	});

	it("requires when and if to both pass", () => {
		const specs = [evt({ target: "both", when: "failure", ifTokens: ["go"] })];
		expect(selectSinks(specs, { status: "completed", tokens: ["go"] })).toEqual([]);
		expect(selectSinks(specs, { status: "failed", tokens: ["nope"] })).toEqual([]);
		expect(selectSinks(specs, { status: "failed", tokens: ["go"] })).toHaveLength(1);
	});
});

describe("dispatchSinks", () => {
	it("emits events, posts webhooks, and notifies", async () => {
		const emitted: Array<{ event: string; payload?: Record<string, unknown> }> = [];
		const notified: string[] = [];
		const posted: Array<{ url: string; body: string }> = [];

		const fetchImpl = (async (url: any, init: any) => {
			posted.push({ url: String(url), body: String(init?.body) });
			return { ok: true, status: 200 } as any;
		}) as unknown as typeof fetch;

		const outcomes = await dispatchSinks(
			[
				evt({ kind: "event", target: "news.found", args: { severity: "high" } }),
				evt({ kind: "webhook", target: "https://example.com/hook", args: { text: "hi" } }),
				evt({ kind: "notify", target: "look at me" }),
			],
			ctx({
				emit: async (event, payload) => {
					emitted.push({ event, payload });
				},
				notify: (message) => notified.push(message),
				fetchImpl,
			}),
		);

		expect(outcomes.every((o) => o.ok)).toBe(true);
		expect(emitted).toEqual([{ event: "news.found", payload: { severity: "high" } }]);
		expect(posted[0].url).toBe("https://example.com/hook");
		expect(JSON.parse(posted[0].body)).toEqual({ text: "hi" });
		expect(notified).toEqual(["look at me"]);
	});

	it("reports a registry sink as missing without throwing", async () => {
		const outcomes = await dispatchSinks(
			[evt({ kind: "registry", target: "telegram.send.message", args: { text: "x" } })],
			ctx(),
		);
		expect(outcomes[0].ok).toBe(false);
		expect(outcomes[0].missing).toBe(true);
	});

	it("calls a registered sink and keeps going when one throws", async () => {
		const scope: Record<string, unknown> = {};
		const seen: Array<Record<string, unknown>> = [];
		registerSink(
			"good.sink",
			async (args) => {
				seen.push(args);
			},
			scope,
		);
		registerSink(
			"bad.sink",
			async () => {
				throw new Error("slack is down");
			},
			scope,
		);

		const outcomes = await dispatchSinks(
			[evt({ kind: "registry", target: "bad.sink", args: {} }), evt({ kind: "registry", target: "good.sink", args: { a: 1 } })],
			ctx({ scope }),
		);

		expect(outcomes[0].ok).toBe(false);
		expect(outcomes[0].error).toContain("slack is down");
		expect(outcomes[1].ok).toBe(true);
		expect(seen).toEqual([{ a: 1 }]);
	});

	it("reuses an existing registry object so load order does not matter", () => {
		const scope: Record<string, unknown> = {};
		const first = getSinkRegistry(scope);
		registerSink("x", async () => {}, scope);
		expect(getSinkRegistry(scope)).toBe(first);
		expect(Object.keys(getSinkRegistry(scope).sinks)).toEqual(["x"]);
	});
});
