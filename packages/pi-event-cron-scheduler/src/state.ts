import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export const RUNS_PER_JOB = 50;

export type RunStatus = "running" | "completed" | "failed" | "timed_out" | "abandoned" | "interrupted";

export interface RunRow {
	runId: string;
	jobId: string;
	workspace: string;
	status: RunStatus;
	pid: number;
	startedAt: string;
	completedAt?: string;
	durationMs?: number;
	verdict?: string;
	continueTokens?: string[];
	outputTail?: string;
}

export interface EnabledFile {
	version: 1;
	jobs: Record<string, { enabledAt: string; path: string }>;
}

export interface Cursor {
	file: string;
	offset: number;
}

export function enabledKey(workspace: string, id: string): string {
	return `${workspace}::${id}`;
}

export async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	// Unique per write: two parallel runs in one process would otherwise race for the same temp file.
	const tmp = `${path}.${process.pid}.${randomUUID()}.tmp`;
	await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
	await rename(tmp, path);
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
	try {
		return JSON.parse(await readFile(path, "utf8")) as T;
	} catch (error: any) {
		if (error?.code === "ENOENT") return fallback;
		throw error;
	}
}

export async function loadEnabled(stateDir: string): Promise<EnabledFile> {
	const file = await readJson<EnabledFile>(join(stateDir, "enabled.json"), { version: 1, jobs: {} });
	return { version: 1, jobs: file.jobs ?? {} };
}

export function isEnabled(file: EnabledFile, workspace: string, id: string): boolean {
	return Boolean(file.jobs[enabledKey(workspace, id)]);
}

export async function setEnabled(
	stateDir: string,
	input: { workspace: string; id: string; path: string; on: boolean; now: Date },
): Promise<EnabledFile> {
	const file = await loadEnabled(stateDir);
	const key = enabledKey(input.workspace, input.id);
	if (input.on) file.jobs[key] = { enabledAt: input.now.toISOString(), path: input.path };
	else delete file.jobs[key];
	await writeJsonAtomic(join(stateDir, "enabled.json"), file);
	return file;
}

export async function loadRuns(stateDir: string): Promise<RunRow[]> {
	const file = await readJson<{ version: 1; runs: RunRow[] }>(join(stateDir, "runs.json"), {
		version: 1,
		runs: [],
	});
	return file.runs ?? [];
}

// runs.json is read-modify-written, so concurrent callers in one process must take turns or
// lose rows. Only the leader process writes it, so an in-process chain is enough.
let runWrites: Promise<unknown> = Promise.resolve();

export function saveRun(stateDir: string, run: RunRow): Promise<void> {
	const next = runWrites.then(
		() => saveRunNow(stateDir, run),
		() => saveRunNow(stateDir, run),
	);
	runWrites = next;
	return next;
}

async function saveRunNow(stateDir: string, run: RunRow): Promise<void> {
	const rows = (await loadRuns(stateDir)).filter((existing) => existing.runId !== run.runId);
	rows.push(run);

	const perJob = new Map<string, RunRow[]>();
	for (const rowValue of rows) {
		const bucket = perJob.get(rowValue.jobId);
		if (bucket) bucket.push(rowValue);
		else perJob.set(rowValue.jobId, [rowValue]);
	}

	const kept: RunRow[] = [];
	for (const bucket of perJob.values()) {
		bucket.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
		kept.push(...bucket.slice(-RUNS_PER_JOB));
	}
	kept.sort((a, b) => a.startedAt.localeCompare(b.startedAt));

	await writeJsonAtomic(join(stateDir, "runs.json"), { version: 1, runs: kept });
}

export function findRun(rows: RunRow[], runId: string): RunRow | undefined {
	return rows.find((row) => row.runId === runId);
}

export function lastRunFor(rows: RunRow[], jobId: string): RunRow | undefined {
	return rows
		.filter((row) => row.jobId === jobId)
		.sort((a, b) => a.startedAt.localeCompare(b.startedAt))
		.at(-1);
}

export function medianDurationMs(rows: RunRow[], jobId: string): number | undefined {
	const durations = rows
		.filter((row) => row.jobId === jobId && typeof row.durationMs === "number")
		.map((row) => row.durationMs as number)
		.sort((a, b) => a - b);
	if (durations.length === 0) return undefined;
	const middle = Math.floor(durations.length / 2);
	return durations.length % 2 === 1 ? durations[middle] : Math.round((durations[middle - 1] + durations[middle]) / 2);
}

export async function readCursor(stateDir: string): Promise<Cursor> {
	return readJson<Cursor>(join(stateDir, "cursor.json"), { file: "", offset: 0 });
}

export async function writeCursor(stateDir: string, cursor: Cursor): Promise<void> {
	await writeJsonAtomic(join(stateDir, "cursor.json"), cursor);
}
