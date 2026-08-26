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
	fetchImpl?: typeof fetch;
	scope?: Record<string, unknown>;
	idFn?: () => string;
}

interface RunHandle {
	runId: string;
	jobId: string;
	controller: AbortController;
	promise: Promise<void>;
}

export class Engine {
	private jobs: JobDefinition[];
	private readonly inFlight = new Map<string, Set<RunHandle>>();
	private readonly pending = new Map<string, BusEvent>();

	constructor(private readonly deps: EngineDeps) {
		this.jobs = deps.jobs;
	}

	setJobs(jobs: JobDefinition[]): void {
		this.jobs = jobs;
	}

	inFlightCount(jobId: string): number {
		return this.inFlight.get(jobId)?.size ?? 0;
	}

	async idle(): Promise<void> {
		while (true) {
			const running = [...this.inFlight.values()].flatMap((set) => [...set]);
			if (running.length === 0) return;
			await Promise.all(running.map((handle) => handle.promise));
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
		const controller = new AbortController();
		const handle: RunHandle = { runId, jobId: job.id, controller, promise: Promise.resolve() };

		const bucket = this.inFlight.get(job.id) ?? new Set<RunHandle>();
		bucket.add(handle);
		this.inFlight.set(job.id, bucket);

		handle.promise = this.execute(job, event, handle).finally(() => {
			bucket.delete(handle);
			if (bucket.size === 0) this.inFlight.delete(job.id);
			const queued = this.pending.get(job.id);
			if (queued && this.inFlightCount(job.id) === 0) {
				this.pending.delete(job.id);
				this.start(job, queued);
			}
		});
	}

	private async execute(job: JobDefinition, event: BusEvent, handle: RunHandle): Promise<void> {
		const startedMs = this.deps.clock();
		const startedAt = new Date(startedMs).toISOString();

		const rows = await loadRuns(this.deps.stateDir);
		const previous = lastRunFor(rows, job.id);

		const row: RunRow = {
			runId: handle.runId,
			jobId: job.id,
			workspace: job.workspace,
			status: "running",
			pid: this.deps.pid,
			startedAt,
		};
		await saveRun(this.deps.stateDir, row);

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
