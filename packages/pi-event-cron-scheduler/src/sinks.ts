import type { EmitSpec } from "./frontmatter.js";
import type { RunStatus } from "./state.js";

export const SINK_REGISTRY_KEY = "__piEventCronSinkRegistry__";

export interface SinkContext {
	jobId: string;
	runId: string;
	workspace: string;
	now: Date;
	emit: (event: string, payload?: Record<string, unknown>) => Promise<void>;
	notify: (message: string) => void;
	fetchImpl?: typeof fetch;
	scope?: Record<string, unknown>;
}

export type SinkHandler = (args: Record<string, unknown>, ctx: SinkContext) => Promise<void>;

export interface SinkRegistry {
	version: 1;
	sinks: Record<string, SinkHandler>;
}

export interface DispatchOutcome {
	spec: EmitSpec;
	ok: boolean;
	missing?: boolean;
	error?: string;
}

const FAILURE_STATUSES: RunStatus[] = ["failed", "timed_out", "abandoned", "interrupted"];

export function getSinkRegistry(scope: Record<string, unknown> = globalThis as any): SinkRegistry {
	const existing = scope[SINK_REGISTRY_KEY] as SinkRegistry | undefined;
	if (existing && existing.version === 1 && existing.sinks) return existing;
	const created: SinkRegistry = { version: 1, sinks: {} };
	scope[SINK_REGISTRY_KEY] = created;
	return created;
}

export function registerSink(
	name: string,
	handler: SinkHandler,
	scope: Record<string, unknown> = globalThis as any,
): void {
	getSinkRegistry(scope).sinks[name] = handler;
}

export function selectSinks(emits: EmitSpec[], input: { status: RunStatus; tokens: string[] | null }): EmitSpec[] {
	const failed = FAILURE_STATUSES.includes(input.status);
	return emits.filter((spec) => {
		if (spec.when === "success" && failed) return false;
		if (spec.when === "failure" && !failed) return false;
		if (!spec.ifTokens) return true;
		if (!input.tokens) return false;
		return spec.ifTokens.some((token) => input.tokens!.includes(token));
	});
}

async function runOne(spec: EmitSpec, ctx: SinkContext): Promise<DispatchOutcome> {
	if (spec.kind === "event") {
		await ctx.emit(spec.target, spec.args);
		return { spec, ok: true };
	}

	if (spec.kind === "webhook") {
		const doFetch = ctx.fetchImpl ?? fetch;
		const response = await doFetch(spec.target, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(spec.args ?? {}),
		});
		if (!response.ok) return { spec, ok: false, error: `webhook returned ${response.status}` };
		return { spec, ok: true };
	}

	if (spec.kind === "notify") {
		ctx.notify(spec.target);
		return { spec, ok: true };
	}

	const handler = getSinkRegistry(ctx.scope ?? (globalThis as any)).sinks[spec.target];
	if (!handler) return { spec, ok: false, missing: true, error: `sink "${spec.target}" is not registered` };
	await handler(spec.args ?? {}, ctx);
	return { spec, ok: true };
}

export async function dispatchSinks(specs: EmitSpec[], ctx: SinkContext): Promise<DispatchOutcome[]> {
	const outcomes: DispatchOutcome[] = [];
	for (const spec of specs) {
		try {
			outcomes.push(await runOne(spec, ctx));
		} catch (error: any) {
			outcomes.push({ spec, ok: false, error: error?.message ?? String(error) });
		}
	}
	return outcomes;
}
