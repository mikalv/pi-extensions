import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Cron } from "croner";
import { homedir } from "node:os";
import { join } from "node:path";
import { Type } from "typebox";

import { pruneOldLogs } from "./bus.js";
import { discoverJobs, scheduledDir } from "./discovery.js";
import { DEFAULT_TIMEOUT_MS, Engine } from "./engine.js";
import { formatJobList } from "./format.js";
import type { InvalidJob, JobDefinition } from "./frontmatter.js";
import { HEARTBEAT_MS, LeaderLock } from "./leader.js";
import { makeRunAgent } from "./runner.js";
import { isEnabled, loadEnabled, loadRuns, setEnabled } from "./state.js";

const ACTIONS = ["list", "enable", "disable", "kill", "reload", "emit"] as const;
const DRAIN_INTERVAL_MS = 2_000;
const KEEP_LOG_DAYS = 14;

function stateDir(): string {
	return join(homedir(), ".pi", "agent", "state", "pi-event-cron-scheduler");
}

export default function eventCronExtension(pi: ExtensionAPI) {
	const dir = stateDir();
	const lock = new LeaderLock({ stateDir: dir, pid: process.pid, clock: () => Date.now() });

	let jobs: JobDefinition[] = [];
	let invalid: InvalidJob[] = [];
	let crons: Cron[] = [];
	let engine: Engine | undefined;
	let drainTimer: ReturnType<typeof setInterval> | undefined;
	let heartbeatTimer: ReturnType<typeof setInterval> | undefined;

	function updateStatus(ctx: ExtensionContext): void {
		if (!engine) {
			ctx.ui.setStatus("event-cron", undefined);
			return;
		}
		const running = jobs.reduce((total, job) => total + (engine?.inFlightCount(job.id) ?? 0), 0);
		ctx.ui.setStatus("event-cron", running > 0 ? `⏱ ${running} job${running === 1 ? "" : "s"} running` : undefined);
	}

	/** Enabled jobs only: a disabled file is parsed and listed but never scheduled or triggered. */
	async function activeJobs(ctx: ExtensionContext): Promise<JobDefinition[]> {
		const enabled = await loadEnabled(dir);
		return jobs.filter((job) => isEnabled(enabled, ctx.cwd, job.id));
	}

	function stopCrons(): void {
		for (const cron of crons) cron.stop();
		crons = [];
	}

	async function armCrons(ctx: ExtensionContext): Promise<void> {
		stopCrons();
		if (!engine) return;
		const active = await activeJobs(ctx);
		engine.setJobs(active);

		// Followers parse and list, but only the leader dispatches.
		if (!lock.held) return;

		for (const job of active) {
			if (!job.cron) continue;
			crons.push(
				new Cron(job.cron, { timezone: job.timezone, protect: false }, () => {
					void engine
						?.emit({ event: "cron.tick", source: "cron", payload: { jobId: job.id } })
						.then(() => engine?.drain())
						.then(() => updateStatus(ctx))
						.catch((error) => ctx.ui.notify(`event-cron: ${error?.message ?? error}`, "error"));
				}),
			);
		}
	}

	async function reload(ctx: ExtensionContext): Promise<string> {
		const discovered = await discoverJobs(ctx.cwd);
		jobs = discovered.jobs;
		invalid = discovered.invalid;
		await armCrons(ctx);
		const active = await activeJobs(ctx);
		return `event-cron: ${active.length} enabled, ${jobs.length - active.length} disabled, ${invalid.length} invalid`;
	}

	async function renderList(ctx: ExtensionContext): Promise<string> {
		const [enabled, runs, lockFile] = await Promise.all([loadEnabled(dir), loadRuns(dir), lock.read()]);
		return formatJobList({
			workspace: ctx.cwd,
			jobs,
			invalid,
			enabled,
			runs,
			leaderPid: lockFile?.pid ?? null,
			selfPid: process.pid,
			inFlight: (jobId) => engine?.inFlightCount(jobId) ?? 0,
			nextRunFor: (job) => {
				if (!job.cron) return null;
				try {
					return new Cron(job.cron, { timezone: job.timezone }).nextRun();
				} catch {
					return null;
				}
			},
		});
	}

	async function toggle(ctx: ExtensionContext, action: "enable" | "disable", id: string): Promise<JobDefinition> {
		const job = jobs.find((candidate) => candidate.id === id);
		if (!job) throw new Error(`no valid job with id "${id}" in ${scheduledDir(ctx.cwd)}`);
		await setEnabled(dir, {
			workspace: ctx.cwd,
			id: job.id,
			path: job.path,
			on: action === "enable",
			now: new Date(),
		});
		await armCrons(ctx);
		return job;
	}

	pi.on("session_start", async (_event, ctx) => {
		engine = new Engine({
			stateDir: dir,
			jobs: [],
			clock: () => Date.now(),
			pid: process.pid,
			runAgent: makeRunAgent({
				exec: (command, args, options) => pi.exec(command, args, options),
				timeoutMs: DEFAULT_TIMEOUT_MS,
			}),
			notify: (message) => ctx.ui.notify(message, "info"),
			setTimer: (fn, ms) => setTimeout(fn, ms),
			clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
		});

		const acquired = await lock.tryAcquire();
		await reload(ctx);
		if (!acquired) return;

		await engine.recoverInterrupted();
		await pruneOldLogs(dir, KEEP_LOG_DAYS, new Date());

		heartbeatTimer = setInterval(() => void lock.heartbeat(), HEARTBEAT_MS);
		drainTimer = setInterval(() => {
			void engine
				?.drain()
				.then(() => updateStatus(ctx))
				.catch((error) => ctx.ui.notify(`event-cron: ${error?.message ?? error}`, "error"));
		}, DRAIN_INTERVAL_MS);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		stopCrons();
		if (drainTimer) clearInterval(drainTimer);
		if (heartbeatTimer) clearInterval(heartbeatTimer);
		ctx.ui.setStatus("event-cron", undefined);
		await lock.release();
	});

	pi.registerTool({
		name: "cron_jobs",
		label: "Scheduled Jobs",
		description:
			"Inspect and control executable scheduled markdown jobs in scheduled/*.md: list them with their next run and last result, enable or disable one, kill a stuck run, reload files from disk, or emit an event by hand.",
		promptSnippet: "List, enable, disable, kill, reload, or manually trigger scheduled markdown jobs",
		promptGuidelines: [
			"Use action='list' when the user asks what is scheduled, why a job did not run, or what a job last decided.",
			"A job in scheduled/*.md does nothing until action='enable' is called for it in this workspace.",
			"Use action='emit' to test a job that is triggered by an event rather than by cron.",
		],
		parameters: Type.Object({
			action: StringEnum(ACTIONS, { description: "What to do. Default list.", default: "list" }),
			id: Type.Optional(Type.String({ description: "Job id, required for enable, disable, and kill." })),
			event: Type.Optional(Type.String({ description: "Event name for action='emit'." })),
			payload: Type.Optional(
				Type.String({ description: "JSON object string used as the payload for action='emit'." }),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const action = params.action ?? "list";

			if (action === "list") {
				return { content: [{ type: "text", text: await renderList(ctx) }], details: { jobs, invalid } };
			}

			if (action === "reload") {
				return { content: [{ type: "text", text: await reload(ctx) }], details: { jobs, invalid } };
			}

			if (action === "enable" || action === "disable") {
				if (!params.id) throw new Error(`action='${action}' needs an id`);
				const job = await toggle(ctx, action, params.id);
				return {
					content: [{ type: "text", text: `${action}d ${job.id}` }],
					details: { id: job.id, enabled: action === "enable" },
				};
			}

			if (action === "kill") {
				if (!params.id) throw new Error("action='kill' needs an id");
				const killed = engine?.kill(params.id) ?? 0;
				updateStatus(ctx);
				return {
					content: [
						{
							type: "text",
							text:
								killed === 0
									? `no run in flight for ${params.id}`
									: `aborted ${killed} run(s) of ${params.id}`,
						},
					],
					details: { id: params.id, killed },
				};
			}

			if (!params.event) throw new Error("action='emit' needs an event");
			const payload = params.payload ? (JSON.parse(params.payload) as Record<string, unknown>) : undefined;
			await engine?.emit({ event: params.event, source: "tool", payload });
			await engine?.drain();
			updateStatus(ctx);
			return {
				content: [{ type: "text", text: `emitted ${params.event}` }],
				details: { event: params.event, payload },
			};
		},
	});

	pi.registerCommand("cron", {
		description: "List scheduled markdown jobs, or enable/disable/kill/reload/emit",
		handler: async (args, ctx) => {
			const [action = "list", argument] = args.trim().split(/\s+/);
			try {
				if (action === "list") {
					ctx.ui.notify(await renderList(ctx), "info");
					return;
				}
				if (action === "reload") {
					ctx.ui.notify(await reload(ctx), "info");
					return;
				}
				if (action === "enable" || action === "disable") {
					if (!argument) throw new Error(`Usage: /cron ${action} <id>`);
					const job = await toggle(ctx, action, argument);
					ctx.ui.notify(`${action}d ${job.id}`, "info");
					return;
				}
				if (action === "kill") {
					if (!argument) throw new Error("Usage: /cron kill <id>");
					ctx.ui.notify(`aborted ${engine?.kill(argument) ?? 0} run(s) of ${argument}`, "info");
					updateStatus(ctx);
					return;
				}
				if (action === "emit") {
					if (!argument) throw new Error("Usage: /cron emit <event>");
					await engine?.emit({ event: argument, source: "command" });
					await engine?.drain();
					updateStatus(ctx);
					ctx.ui.notify(`emitted ${argument}`, "info");
					return;
				}
				ctx.ui.notify("Usage: /cron [list|enable <id>|disable <id>|kill <id>|reload|emit <event>]", "info");
			} catch (error: any) {
				ctx.ui.notify(error?.message ?? String(error), "error");
			}
		},
	});
}
