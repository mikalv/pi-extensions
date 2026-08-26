import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readdir, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { Cursor } from "./state.js";

export interface BusEvent {
	id: string;
	ts: string;
	event: string;
	source: string;
	runId?: string;
	chain: number;
	payload?: Record<string, unknown>;
}

const LOG_RE = /^\d{4}-\d{2}-\d{2}\.jsonl$/;
const DAY_MS = 86_400_000;

export function eventsDir(stateDir: string): string {
	return join(stateDir, "events");
}

export function logNameFor(now: Date): string {
	return `${now.toISOString().slice(0, 10)}.jsonl`;
}

export function newEvent(
	input: {
		event: string;
		source: string;
		runId?: string;
		chain?: number;
		payload?: Record<string, unknown>;
	},
	now: Date,
	idFn: () => string = randomUUID,
): BusEvent {
	return {
		id: idFn(),
		ts: now.toISOString(),
		event: input.event,
		source: input.source,
		runId: input.runId,
		chain: input.chain ?? 0,
		payload: input.payload,
	};
}

export async function appendEvent(stateDir: string, event: BusEvent, now: Date): Promise<void> {
	const dir = eventsDir(stateDir);
	await mkdir(dir, { recursive: true });
	await appendFile(join(dir, logNameFor(now)), `${JSON.stringify(event)}\n`, "utf8");
}

export async function readNewEvents(stateDir: string, cursor: Cursor): Promise<{ events: BusEvent[]; cursor: Cursor }> {
	const dir = eventsDir(stateDir);

	let names: string[];
	try {
		names = (await readdir(dir)).filter((name) => LOG_RE.test(name)).sort();
	} catch (error: any) {
		if (error?.code === "ENOENT") return { events: [], cursor };
		throw error;
	}

	const pending = names.filter((name) => !cursor.file || name >= cursor.file);
	const events: BusEvent[] = [];
	let nextCursor = cursor;

	for (const name of pending) {
		const buffer = await readFile(join(dir, name));
		const startOffset = name === cursor.file ? cursor.offset : 0;
		const slice = buffer.subarray(startOffset);
		const lastNewline = slice.lastIndexOf(0x0a);

		if (lastNewline === -1) {
			nextCursor = { file: name, offset: startOffset };
			continue;
		}

		const usable = slice.subarray(0, lastNewline + 1).toString("utf8");
		for (const line of usable.split("\n")) {
			if (!line.trim()) continue;
			try {
				events.push(JSON.parse(line) as BusEvent);
			} catch {
				// A corrupt line must not stall the bus forever; skip it.
			}
		}
		nextCursor = { file: name, offset: startOffset + lastNewline + 1 };
	}

	return { events, cursor: nextCursor };
}

export async function pruneOldLogs(stateDir: string, keepDays: number, now: Date): Promise<string[]> {
	const dir = eventsDir(stateDir);
	let names: string[];
	try {
		names = (await readdir(dir)).filter((name) => LOG_RE.test(name));
	} catch (error: any) {
		if (error?.code === "ENOENT") return [];
		throw error;
	}

	const cutoff = now.getTime() - keepDays * DAY_MS;
	const removed: string[] = [];
	for (const name of names.sort()) {
		const day = Date.parse(`${name.slice(0, 10)}T00:00:00.000Z`);
		if (Number.isFinite(day) && day < cutoff) {
			await unlink(join(dir, name));
			removed.push(name);
		}
	}
	return removed;
}
