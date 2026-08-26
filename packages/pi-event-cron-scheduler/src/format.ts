import type { InvalidJob, JobDefinition } from "./frontmatter.js";
import { type EnabledFile, type RunRow, isEnabled, lastRunFor, medianDurationMs } from "./state.js";

export interface JobListInput {
	workspace: string;
	jobs: JobDefinition[];
	invalid: InvalidJob[];
	enabled: EnabledFile;
	runs: RunRow[];
	leaderPid: number | null;
	selfPid: number;
	inFlight: (jobId: string) => number;
	nextRunFor: (job: JobDefinition) => Date | null;
}

export function formatDurationMs(ms: number | undefined): string {
	if (ms === undefined) return "-";
	if (ms < 1000) return `${ms}ms`;
	const totalSeconds = Math.round(ms / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return minutes === 0 ? `${seconds}s` : `${minutes}m${seconds}s`;
}

function leaderLine(input: JobListInput): string {
	if (input.leaderPid === null) return "leader: none";
	if (input.leaderPid === input.selfPid) return "leader: this session";
	return `leader: pid ${input.leaderPid}`;
}

export function formatJobList(input: JobListInput): string {
	const lines = [`Scheduled jobs in ${input.workspace} (${leaderLine(input)})`, ""];

	if (input.jobs.length === 0 && input.invalid.length === 0) {
		lines.push("No scheduled/*.md files found.");
		return lines.join("\n");
	}

	for (const job of input.jobs) {
		const state = isEnabled(input.enabled, input.workspace, job.id) ? "enabled" : "disabled";
		const running = input.inFlight(job.id);
		const last = lastRunFor(input.runs, job.id);
		const next = input.nextRunFor(job);

		lines.push(`${job.id} [${state}]${running > 0 ? `  running: ${running}` : ""}`);
		if (job.description) lines.push(`  ${job.description}`);
		if (job.cron) {
			lines.push(
				`  cron: ${job.cron}${job.timezone ? ` ${job.timezone}` : ""}  next: ${next ? next.toISOString() : "-"}`,
			);
		}
		if (job.on.length > 0) lines.push(`  on: ${job.on.join(", ")}`);
		if (job.emits.length > 0) {
			lines.push(
				`  emits: ${job.emits
					.map((spec) => `${spec.target}${spec.ifTokens ? ` if:[${spec.ifTokens.join(",")}]` : ""}`)
					.join(", ")}`,
			);
		}
		lines.push(`  concurrency: ${job.concurrency}  median: ${formatDurationMs(medianDurationMs(input.runs, job.id))}`);
		if (last) {
			lines.push(
				`  last: ${last.status} at ${last.completedAt ?? last.startedAt} in ${formatDurationMs(last.durationMs)}${
					last.verdict ? `  ${last.verdict}` : ""
				}`,
			);
		} else {
			lines.push("  last: never run");
		}
		lines.push("");
	}

	if (input.invalid.length > 0) {
		lines.push("Invalid files (never run):");
		for (const entry of input.invalid) {
			lines.push(`  ${entry.path}${entry.id ? ` (id: ${entry.id})` : ""}`);
			for (const error of entry.errors) lines.push(`    - ${error}`);
		}
	}

	return lines.join("\n").trimEnd();
}
