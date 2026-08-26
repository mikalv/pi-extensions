import { type BusEvent, appendEvent, newEvent, readNewEvents } from "./bus.js";
import { OUTPUT_TAIL_CHARS, buildPrompt, collectIfTokens, memoryPath, readMemory, truncateTail } from "./context.js";
import { type JobDefinition, parseContinueLine } from "./frontmatter.js";
import { dispatchSinks, selectSinks } from "./sinks.js";
import {
	type Cursor,
	type RunRow,
	type RunStatus,
	lastRunFor,
	loadRuns,
	readCursor,
	saveRun,
	writeCursor,
} from "./state.js";

export const CHAIN_LIMIT = 8;
export const OUTPUT_STORE_CHARS = 12_000;
export const DEFAULT_TIMEOUT_MS = 600_000;
export const GRACE_MS = 60_000;

export type TimerHandle = unknown;

export type RunAgent = (input: {
	job: JobDefinition;
	prompt: string;
	signal: AbortSignal;
}) => Promise<{ status: "completed" | "failed"; output: string; error?: string }>;

export interface EngineDeps {
	stateDir: string;
	jobs: JobDefinition[];
	clock: () => number;
	pid: number;
	runAgent: RunAgent;
	notify: (message: string) => void;
	setTimer: (fn: () => void, ms: number) => TimerHandle;
	clearTimer: (handle: TimerHandle) => void;
	fetchImpl?: typeof fetch;
	scope?: Record<string, unknown>;
	idFn?: () => string;
	defaultTimeoutMs?: number;
	graceMs?: number;
	isPidAlive?: (pid: number) => boolean;
}

interface RunHandle {
	runId: string;
	jobId: string;
	controller: AbortController;
	promise: Promise<void>;
	startedMs: number;
	row: RunRow;
	overdueFired: boolean;
	timedOut: boolean;
	abandoned: boolean;
	settled: boolean;
	overdueTimer?: TimerHandle;
	deadlineTimer?: TimerHandle;
	graceTimer?: TimerHandle;
}

export class Engine {
	private jobs: JobDefinition[];
	private readonly inFlight = new Map<string, Set<RunHandle>>();
	private readonly pending = new Map<string, BusEvent>();
	private readonly pendingWrites = new Set<Promise<unknown>>();

	constructor(private readonly deps: EngineDeps) {
		this.jobs = deps.jobs;
	}

	setJobs(jobs: JobDefinition[]): void {
		this.jobs = jobs;
	}

	inFlightCount(jobId: string): number {
		return this.inFlight.get(jobId)?.size ?? 0;
	}

	/** Timer callbacks are not awaited by their caller, so their writes are tracked here instead. */
	private track<T>(promise: Promise<T>): Promise<T> {
		const tracked = promise.finally(() => {
			this.pendingWrites.delete(tracked);
		});
		this.pendingWrites.add(tracked);
		return tracked;
	}

	async idle(): Promise<void> {
		while (true) {
			const running = [...this.inFlight.values()].flatMap((set) => [...set]);
			const writes = [...this.pendingWrites];
			if (running.length === 0 && writes.length === 0) return;
			await Promise.all([...running.map((handle) => handle.promise), ...writes]);
		}
	}

	async emit(input: {
		event: string;
		source: string;
		runId?: string;
		chain?: number;
		payload?: Record<string, unknown>;
	}): Promise<void> {
		const now = new Date(this.deps.clock());
		await appendEvent(this.deps.stateDir, newEvent(input, now, this.deps.idFn), now);
	}

	async drain(): Promise<void> {
		const cursor: Cursor = await readCursor(this.deps.stateDir);
		const { events, cursor: next } = await readNewEvents(this.deps.stateDir, cursor);
		await writeCursor(this.deps.stateDir, next);
		for (const event of events) await this.handleEvent(event);
	}

	async handleEvent(event: BusEvent): Promise<void> {
		if (event.event === "cron.tick") {
			const jobId = event.payload?.jobId;
			const job = this.jobs.find((candidate) => candidate.id === jobId);
			if (job) await this.trigger(job, event);
			return;
		}
		for (const job of this.jobs) {
			if (job.on.includes(event.event)) await this.trigger(job, event);
		}
	}

	/** Aborts every in-flight run of a job. Returns how many were signalled. */
	kill(jobId: string): number {
		const bucket = this.inFlight.get(jobId);
		if (!bucket) return 0;
		for (const handle of bucket) {
			handle.timedOut = true;
			handle.controller.abort();
		}
		return bucket.size;
	}

	async recoverInterrupted(): Promise<RunRow[]> {
		const alive =
			this.deps.isPidAlive ??
			((pid: number) => {
				try {
					process.kill(pid, 0);
					return true;
				} catch {
					return false;
				}
			});

		const rows = await loadRuns(this.deps.stateDir);
		const stale = rows.filter(
			(row) => row.status === "running" && (row.pid === this.deps.pid ? false : !alive(row.pid)),
		);

		const recovered: RunRow[] = [];
		for (const row of stale) {
			const updated: RunRow = {
				...row,
				status: "interrupted",
				completedAt: new Date(this.deps.clock()).toISOString(),
			};
			await saveRun(this.deps.stateDir, updated);
			await this.emit({
				event: "job.interrupted",
				source: row.jobId,
				runId: row.runId,
				payload: { jobId: row.jobId, runId: row.runId, pid: row.pid },
			});
			recovered.push(updated);
		}
		return recovered;
	}

	private async trigger(job: JobDefinition, event: BusEvent): Promise<void> {
		const running = this.inFlightCount(job.id);
		if (running > 0 && job.concurrency !== "parallel") {
			if (job.concurrency === "skip") {
				await this.emit({
					event: "job.skipped",
					source: job.id,
					chain: event.chain,
					payload: { jobId: job.id, trigger: event.event },
				});
			} else {
				this.pending.set(job.id, event);
			}
			return;
		}
		this.start(job, event);
	}

	private start(job: JobDefinition, event: BusEvent): void {
		const runId = (this.deps.idFn ?? (() => `${this.deps.clock()}`))();
		const startedMs = this.deps.clock();
		const handle: RunHandle = {
			runId,
			jobId: job.id,
			controller: new AbortController(),
			promise: Promise.resolve(),
			startedMs,
			row: {
				runId,
				jobId: job.id,
				workspace: job.workspace,
				status: "running",
				pid: this.deps.pid,
				startedAt: new Date(startedMs).toISOString(),
			},
			overdueFired: false,
			timedOut: false,
			abandoned: false,
			settled: false,
		};

		const bucket = this.inFlight.get(job.id) ?? new Set<RunHandle>();
		bucket.add(handle);
		this.inFlight.set(job.id, bucket);

		handle.promise = this.execute(job, event, handle).finally(() => {
			handle.settled = true;
			this.clearTimers(handle);
			this.releaseSlot(job, handle);
		});
	}

	private releaseSlot(job: JobDefinition, handle: RunHandle): void {
		const bucket = this.inFlight.get(job.id);
		if (!bucket || !bucket.has(handle)) return;
		bucket.delete(handle);
		if (bucket.size === 0) this.inFlight.delete(job.id);

		const queued = this.pending.get(job.id);
		if (queued && this.inFlightCount(job.id) === 0) {
			this.pending.delete(job.id);
			this.start(job, queued);
		}
	}

	private armTimers(job: JobDefinition, event: BusEvent, handle: RunHandle): void {
		if (job.expectedRuntimeMs !== undefined) {
			handle.overdueTimer = this.deps.setTimer(() => {
				if (handle.overdueFired || handle.settled) return;
				handle.overdueFired = true;
				this.track(
					this.emit({
						event: "job.overdue",
						source: job.id,
						runId: handle.runId,
						chain: event.chain,
						payload: {
							jobId: job.id,
							runId: handle.runId,
							elapsedMs: this.deps.clock() - handle.startedMs,
							expectedRuntimeMs: job.expectedRuntimeMs,
						},
					}),
				);
			}, job.expectedRuntimeMs);
		}

		const deadlineMs = job.timeoutMs ?? this.deps.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
		handle.deadlineTimer = this.deps.setTimer(() => {
			if (handle.settled) return;
			handle.timedOut = true;
			handle.controller.abort();
			this.track(
				this.emit({
					event: "job.timeout",
					source: job.id,
					runId: handle.runId,
					chain: event.chain,
					payload: { jobId: job.id, runId: handle.runId, deadlineMs },
				}),
			);

			// Abort is cooperative, so a run that ignores it must not hold its slot forever.
			handle.graceTimer = this.deps.setTimer(() => {
				if (handle.settled) return;
				handle.abandoned = true;
				const completedMs = this.deps.clock();
				this.track(
					saveRun(this.deps.stateDir, {
						...handle.row,
						status: "abandoned",
						completedAt: new Date(completedMs).toISOString(),
						durationMs: completedMs - handle.startedMs,
					}),
				);
				this.track(
					this.emit({
						event: "job.abandoned",
						source: job.id,
						runId: handle.runId,
						chain: event.chain,
						payload: { jobId: job.id, runId: handle.runId },
					}),
				);
				this.releaseSlot(job, handle);
			}, this.deps.graceMs ?? GRACE_MS);
		}, deadlineMs);
	}

	private clearTimers(handle: RunHandle): void {
		for (const timer of [handle.overdueTimer, handle.deadlineTimer, handle.graceTimer]) {
			if (timer) this.deps.clearTimer(timer);
		}
	}

	private async execute(job: JobDefinition, event: BusEvent, handle: RunHandle): Promise<void> {
		const startedMs = handle.startedMs;
		const rows = await loadRuns(this.deps.stateDir);
		const previous = lastRunFor(rows, job.id);
		const row = handle.row;
		await saveRun(this.deps.stateDir, row);
		this.armTimers(job, event, handle);

		await this.emit({
			event: "job.started",
			source: job.id,
			runId: handle.runId,
			chain: event.chain,
			payload: { jobId: job.id, trigger: event.event },
		});

		const memory = job.memory
			? { path: memoryPath(this.deps.stateDir, job.id), content: await readMemory(this.deps.stateDir, job.id) }
			: undefined;

		const prompt = buildPrompt({
			job,
			now: new Date(startedMs),
			trigger: { event: event.event, source: event.source },
			payload: event.payload,
			previous,
			memory,
		});

		let status: RunStatus;
		let output = "";
		try {
			const result = await this.deps.runAgent({ job, prompt, signal: handle.controller.signal });
			output = result.output ?? "";
			status = result.status === "completed" ? "completed" : "failed";
		} catch (error: any) {
			status = "failed";
			output = error?.message ?? String(error);
		}
		if (handle.timedOut) status = "timed_out";

		const parsed = parseContinueLine(output);
		const usesIf = collectIfTokens(job).length > 0;

		if (usesIf && !parsed) {
			await this.emit({
				event: "job.signal.missing",
				source: job.id,
				runId: handle.runId,
				chain: event.chain,
				payload: { jobId: job.id, runId: handle.runId },
			});
		}

		let chainExceeded = false;
		const selected = selectSinks(job.emits, { status, tokens: parsed ? parsed.tokens : null });
		const outcomes = await dispatchSinks(selected, {
			jobId: job.id,
			runId: handle.runId,
			workspace: job.workspace,
			now: new Date(this.deps.clock()),
			notify: this.deps.notify,
			fetchImpl: this.deps.fetchImpl,
			scope: this.deps.scope,
			emit: async (name, payload) => {
				const nextChain = event.chain + 1;
				if (nextChain > CHAIN_LIMIT) {
					chainExceeded = true;
					await this.emit({
						event: "chain.limit.exceeded",
						source: job.id,
						runId: handle.runId,
						chain: event.chain,
						payload: { jobId: job.id, runId: handle.runId, rejected: name },
					});
					return;
				}
				await this.emit({ event: name, source: job.id, runId: handle.runId, chain: nextChain, payload });
			},
		});

		for (const outcome of outcomes) {
			if (outcome.missing) {
				await this.emit({
					event: "sink.missing",
					source: job.id,
					runId: handle.runId,
					chain: event.chain,
					payload: { jobId: job.id, sink: outcome.spec.target },
				});
			}
		}

		if (handle.abandoned) return;

		const finalStatus: RunStatus = chainExceeded ? "failed" : status;
		const completedMs = this.deps.clock();
		await saveRun(this.deps.stateDir, {
			...row,
			status: finalStatus,
			completedAt: new Date(completedMs).toISOString(),
			durationMs: completedMs - startedMs,
			verdict: parsed?.raw,
			continueTokens: parsed?.tokens,
			outputTail: truncateTail(output, Math.min(OUTPUT_STORE_CHARS, OUTPUT_TAIL_CHARS)),
		});

		await this.emit({
			event: finalStatus === "completed" ? "job.completed" : "job.failed",
			source: job.id,
			runId: handle.runId,
			chain: event.chain,
			payload: { jobId: job.id, runId: handle.runId, status: finalStatus },
		});
	}
}
