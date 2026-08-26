import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { JobDefinition } from "./frontmatter.js";
import type { RunRow } from "./state.js";

export const MEMORY_MAX_CHARS = 8192;
export const OUTPUT_TAIL_CHARS = 4000;

export interface ContextInput {
	job: JobDefinition;
	now: Date;
	trigger: { event: string; source: string };
	payload?: Record<string, unknown>;
	previous?: RunRow;
	memory?: { path: string; content: string };
}

export function memoryPath(stateDir: string, jobId: string): string {
	return join(stateDir, "memory", `${jobId}.md`);
}

export function truncateTail(text: string, max: number): string {
	return text.length <= max ? text : text.slice(text.length - max);
}

export async function readMemory(stateDir: string, jobId: string): Promise<string> {
	const path = memoryPath(stateDir, jobId);
	try {
		return truncateTail(await readFile(path, "utf8"), MEMORY_MAX_CHARS);
	} catch (error: any) {
		if (error?.code !== "ENOENT") throw error;
		await mkdir(join(stateDir, "memory"), { recursive: true });
		await writeFile(path, "", "utf8");
		return "";
	}
}

export function collectIfTokens(job: JobDefinition): string[] {
	const tokens = new Set<string>();
	for (const spec of job.emits) {
		for (const token of spec.ifTokens ?? []) tokens.add(token);
	}
	return [...tokens].sort();
}

export function continueInstruction(tokens: string[]): string {
	if (tokens.length === 0) return "";
	return [
		"---",
		"When you are done, the LAST line of your output must be a continue line naming which",
		"follow-up actions should run. Accepted tokens for this job:",
		...tokens.map((token) => `  - ${token}`),
		"",
		"Accepted forms:",
		`  continue: [${tokens.join(",")}]     (several)`,
		`  continue: ${tokens[0]}     (one)`,
		"  continue: []     (none apply)",
		"",
		"Write nothing after that line.",
	].join("\n");
}

function formatLocal(now: Date, timezone?: string): string {
	const formatter = new Intl.DateTimeFormat("sv-SE", {
		timeZone: timezone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	});
	return formatter.format(now);
}

export function buildContextHeader(input: ContextInput): string {
	const { job, now, trigger } = input;
	const scheduleSuffix = job.cron ? ` (${job.cron}${job.timezone ? ` ${job.timezone}` : ""})` : "";
	const zone = job.timezone ?? "local time";

	const lines = [
		`[scheduled job: ${job.id}]`,
		`Triggered by: ${trigger.event}${scheduleSuffix} from ${trigger.source}`,
		`Now: ${formatLocal(now, job.timezone)} (${zone}) | ISO date: ${now.toISOString().slice(0, 10)}`,
		`Workspace: ${job.workspace}`,
	];

	if (input.payload && Object.keys(input.payload).length > 0) {
		lines.push(`Event payload: ${JSON.stringify(input.payload)}`);
	}

	const previous = input.previous;
	if (previous) {
		const when = previous.completedAt ?? previous.startedAt;
		const duration = previous.durationMs === undefined ? "" : `, ${Math.round(previous.durationMs / 1000)}s`;
		const tokens = previous.continueTokens ? `, continue: [${previous.continueTokens.join(",")}]` : "";
		lines.push(`Previous run: ${previous.status} at ${when}${duration}${tokens}`);
		if (previous.outputTail) {
			lines.push(
				"--- previous output tail ---",
				truncateTail(previous.outputTail, OUTPUT_TAIL_CHARS),
				"--- end previous output ---",
			);
		}
	}

	if (job.memory && input.memory) {
		lines.push(
			`Memory file: ${input.memory.path}`,
			"You may rewrite that file with the write tool to remember things for the next run.",
			"--- memory ---",
			input.memory.content,
			"--- end memory ---",
		);
	}

	return lines.join("\n");
}

export function buildPrompt(input: ContextInput): string {
	const instruction = continueInstruction(collectIfTokens(input.job));
	const parts = [buildContextHeader(input), "", input.job.body];
	if (instruction) parts.push("", instruction);
	return parts.join("\n");
}
