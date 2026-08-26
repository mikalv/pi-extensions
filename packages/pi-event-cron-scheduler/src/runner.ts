import type { RunAgent } from "./engine.js";
import type { JobDefinition } from "./frontmatter.js";

export const RUNNER_REGISTRY_KEY = "__piEventCronRunnerRegistry__";

export interface RunnerRegistry {
	version: 1;
	runners: Record<string, RunAgent>;
}

export interface ExecResultLike {
	stdout: string;
	stderr: string;
	code: number;
	killed: boolean;
}

export type ExecFn = (
	command: string,
	args: string[],
	options?: { signal?: AbortSignal; timeout?: number; cwd?: string },
) => Promise<ExecResultLike>;

/**
 * Execution backends live in a registry rather than an import, because the extension that owns
 * subagents is enabled per session and may not be loaded here.
 */
export function getRunnerRegistry(scope: Record<string, unknown> = globalThis as any): RunnerRegistry {
	const existing = scope[RUNNER_REGISTRY_KEY] as RunnerRegistry | undefined;
	if (existing && existing.version === 1 && existing.runners) return existing;
	const created: RunnerRegistry = { version: 1, runners: {} };
	scope[RUNNER_REGISTRY_KEY] = created;
	return created;
}

export function registerRunner(
	name: string,
	runner: RunAgent,
	scope: Record<string, unknown> = globalThis as any,
): void {
	getRunnerRegistry(scope).runners[name] = runner;
}

/** Frontmatter the pi CLI has no flag for, so such a job needs a registered runner. */
const CLI_UNSUPPORTED = ["agent", "runtime", "skills", "turnBudget"] as const;

export function unsupportedByCli(job: JobDefinition): string[] {
	return CLI_UNSUPPORTED.filter((field) => job[field] !== undefined);
}

export function cliArgs(job: JobDefinition, prompt: string): string[] {
	const args = ["--print", "--no-session"];
	if (job.model) args.push("--model", job.model);
	if (typeof job.thinking === "string") args.push("--thinking", job.thinking);
	if (job.tools && job.tools.length > 0) args.push("--tools", job.tools.join(","));
	args.push(prompt);
	return args;
}

export function selectRunner(job: JobDefinition, scope: Record<string, unknown>): RunAgent | undefined {
	const { runners } = getRunnerRegistry(scope);
	if (job.runtime && runners[job.runtime]) return runners[job.runtime];
	return runners.default;
}

export function makeRunAgent(deps: {
	exec: ExecFn;
	command?: string;
	scope?: Record<string, unknown>;
	timeoutMs?: number;
}): RunAgent {
	return async (input) => {
		const scope = deps.scope ?? (globalThis as any);
		const registered = selectRunner(input.job, scope);
		if (registered) return registered(input);

		const unsupported = unsupportedByCli(input.job);
		if (unsupported.length > 0) {
			return {
				status: "failed",
				output: "",
				error: `job uses ${unsupported.join(", ")}, which needs a runner registered in globalThis.${RUNNER_REGISTRY_KEY}`,
			};
		}

		const result = await deps.exec(deps.command ?? "pi", cliArgs(input.job, input.prompt), {
			cwd: input.job.workspace,
			signal: input.signal,
			timeout: input.job.timeoutMs ?? deps.timeoutMs,
		});

		if (result.code === 0) return { status: "completed", output: result.stdout };
		return {
			status: "failed",
			output: result.stdout,
			error: result.stderr.trim() || `pi exited with code ${result.code}`,
		};
	};
}
