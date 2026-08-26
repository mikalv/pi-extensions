import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { writeJsonAtomic } from "./state.js";

export const HEARTBEAT_MS = 15_000;
export const STALE_MS = 45_000;

export interface LockFile {
	pid: number;
	heartbeat: string;
	acquiredAt: string;
}

export class LeaderLock {
	private readonly path: string;
	private readonly pid: number;
	private readonly clock: () => number;
	private readonly staleMs: number;
	private acquiredAt?: string;
	private isHeld = false;

	constructor(options: { stateDir: string; pid: number; clock: () => number; staleMs?: number }) {
		this.path = join(options.stateDir, "leader.lock");
		this.pid = options.pid;
		this.clock = options.clock;
		this.staleMs = options.staleMs ?? STALE_MS;
	}

	get held(): boolean {
		return this.isHeld;
	}

	/** A missing or unreadable lock both mean "nobody demonstrably holds it". */
	async read(): Promise<LockFile | null> {
		try {
			return JSON.parse(await readFile(this.path, "utf8")) as LockFile;
		} catch {
			return null;
		}
	}

	async tryAcquire(): Promise<boolean> {
		const nowIso = new Date(this.clock()).toISOString();
		const existing = await this.read();

		if (!existing) {
			const payload: LockFile = { pid: this.pid, heartbeat: nowIso, acquiredAt: nowIso };
			try {
				await mkdir(dirname(this.path), { recursive: true });
				await writeFile(this.path, `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
				this.acquiredAt = nowIso;
				this.isHeld = true;
				return true;
			} catch {
				// Someone created it between our read and our write; fall through and re-evaluate.
				return this.tryAcquire();
			}
		}

		if (existing.pid === this.pid) {
			this.acquiredAt = existing.acquiredAt;
			this.isHeld = true;
			return true;
		}

		const age = this.clock() - Date.parse(existing.heartbeat);
		if (Number.isFinite(age) && age <= this.staleMs) {
			this.isHeld = false;
			return false;
		}

		await writeJsonAtomic(this.path, { pid: this.pid, heartbeat: nowIso, acquiredAt: nowIso });
		const confirmed = await this.read();
		this.isHeld = confirmed?.pid === this.pid;
		if (this.isHeld) this.acquiredAt = nowIso;
		return this.isHeld;
	}

	async heartbeat(): Promise<void> {
		if (!this.isHeld) return;
		const nowIso = new Date(this.clock()).toISOString();
		await writeJsonAtomic(this.path, {
			pid: this.pid,
			heartbeat: nowIso,
			acquiredAt: this.acquiredAt ?? nowIso,
		});
	}

	async release(): Promise<void> {
		if (!this.isHeld) return;
		this.isHeld = false;
		try {
			await unlink(this.path);
		} catch {
			// Already gone; releasing is best-effort.
		}
	}
}
