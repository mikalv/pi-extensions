/**
 * pi-lazy — LazyVim-style extension manager for Pi Coding Agent.
 *
 * Load strategies:
 *   lazy: false         always-on (Pi loads normally)
 *   lazy: "after-start" VeryLazy — load after session_start
 *   lazy: true          on demand via cmd / tools / events / keywords / /lazy load
 *
 * True module-lazy requires `/lazy migrate` once (sets packages[].extensions = []).
 */

import { Type } from "typebox";
import { getAgentDir, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { isManagedLazy, loadConfig, saveConfig, defaultConfig, getLazyConfigPath } from "./config.ts";
import { loadResolvedEntry } from "./loader.ts";
import { migrateSettings } from "./migrate.ts";
import { isModuleLazyInSettings, resolveSpecPaths } from "./resolve.ts";
import { performance } from "node:perf_hooks";
import type { LazyConfig, LoadResult, ResolvedEntry } from "./types.ts";
import { existsSync, readFileSync } from "node:fs";
import { getSettingsPath } from "./config.ts";

interface Runtime {
	config: LazyConfig;
	entries: Map<string, ResolvedEntry>;
	auto: boolean;
	sessionCtx?: ExtensionContext;
	afterStartQueued: boolean;
	status: string;
	profile: Array<{ label: string; ms: number }>;
	queueCancelled: boolean;
}

function readSettingsPackages(agentDir: string): unknown[] {
	const path = getSettingsPath(agentDir);
	if (!existsSync(path)) return [];
	try {
		const settings = JSON.parse(readFileSync(path, "utf-8")) as { packages?: unknown[] };
		return Array.isArray(settings.packages) ? settings.packages : [];
	} catch {
		return [];
	}
}

function buildCatalog(config: LazyConfig, agentDir: string, cwd: string): Map<string, ResolvedEntry> {
	const packages = readSettingsPackages(agentDir);
	const map = new Map<string, ResolvedEntry>();

	for (const spec of config.specs) {
		const managed = isManagedLazy(spec);
		const moduleLazyReady = managed && isModuleLazyInSettings(spec.source, packages);

		let state: ResolvedEntry["state"];
		if (!managed) {
			state = "eager";
		} else if (!moduleLazyReady) {
			// Still eager in settings — Pi already loaded (or will load) the factory
			state = "eager";
		} else {
			state = "pending";
		}

		map.set(spec.name, {
			spec,
			// Avoid filesystem/package.json scans for packages that are never loaded.
			packageRoot: "",
			extensionPaths: [],
			moduleLazyReady,
			state,
		});
	}

	return map;
}

function formatStatus(rt: Runtime): string {
	const all = [...rt.entries.values()];
	const loaded = all.filter((e) => e.state === "loaded").length;
	const pending = all.filter((e) => e.state === "pending").length;
	const eager = all.filter((e) => e.state === "eager").length;
	const errors = all.filter((e) => e.state === "error").length;
	const parts = [`lazy ${loaded}↑`, `${pending}·`, `${eager}⚡`];
	if (errors) parts.push(`${errors}✗`);
	return parts.join(" ");
}

function refreshStatus(pi: ExtensionAPI, rt: Runtime, ctx?: ExtensionContext) {
	rt.status = formatStatus(rt);
	// Prefer the freshest known ctx: a passed-in ctx captured before an async
	// gap (e.g. runAfterStart's setTimeout) can go stale if the session gets
	// replaced/reloaded in the meantime, while rt.sessionCtx is updated
	// synchronously by every session_start.
	const target = rt.sessionCtx ?? ctx;
	if (!target) return;
	try {
		// ctx.ui is a getter that throws once the ctx is stale, so even reading
		// it must be guarded — a status-bar update is never worth crashing pi.
		const ui = target.ui;
		if (ui && typeof ui.setStatus === "function") {
			ui.setStatus("pi-lazy", rt.status);
		}
	} catch {
		// stale ctx — session was replaced/reloaded since this ctx was captured.
	}
}

/** Best-effort notify: a stale ctx must never crash the whole pi process. */
function notifySafe(ctx: ExtensionContext | undefined, message: string, type?: "info" | "warning" | "error") {
	if (!ctx) return;
	try {
		ctx.ui.notify(message, type);
	} catch {
		// stale ctx — session was replaced/reloaded since this ctx was captured.
	}
}

function recordTiming(rt: Runtime, label: string, started: number) {
	rt.profile.push({ label, ms: performance.now() - started });
	if (rt.profile.length > 100) rt.profile.shift();
}

async function loadByName(pi: ExtensionAPI, rt: Runtime, name: string, ctx?: ExtensionContext): Promise<LoadResult> {
	const key = name.trim();
	const entry =
		rt.entries.get(key) ??
		[...rt.entries.values()].find(
			(e) => e.spec.source === key || e.spec.source.endsWith(key) || e.spec.name.toLowerCase() === key.toLowerCase(),
		);

	if (!entry) {
		return { ok: false, name: key, error: `unknown spec '${key}' — see /lazy list` };
	}

	// Eager packages are already loaded by Pi
	if (entry.state === "eager") {
		return {
			ok: true,
			name: entry.spec.name,
			alreadyLoaded: true,
			error: undefined,
		};
	}

	// Resolve package metadata only on first actual load, not during startup catalog creation.
	if (!entry.packageRoot && entry.extensionPaths.length === 0) {
		const started = performance.now();
		const resolved = resolveSpecPaths(entry.spec, getAgentDir(), (ctx ?? rt.sessionCtx)?.cwd ?? process.cwd());
		entry.packageRoot = resolved.packageRoot ?? "";
		entry.extensionPaths = resolved.extensionPaths;
		entry.resolveMs = performance.now() - started;
		recordTiming(rt, `resolve:${entry.spec.name}`, started);
	}
	const started = performance.now();
	const result = await loadResolvedEntry(entry, pi, ctx ?? rt.sessionCtx, {
		loadDependency: (dep) => loadByName(pi, rt, dep, ctx),
	});
	recordTiming(rt, `load:${entry.spec.name}`, started);

	refreshStatus(pi, rt, ctx ?? rt.sessionCtx);
	return result;
}

function registerStubs(pi: ExtensionAPI, rt: Runtime) {
	const cmdOwners = new Map<string, string>(); // cmd -> spec name
	const toolOwners = new Map<string, string>();

	for (const entry of rt.entries.values()) {
		if (entry.state !== "pending") continue;
		const { spec } = entry;
		for (const cmd of spec.cmd ?? []) {
			if (cmdOwners.has(cmd)) continue;
			cmdOwners.set(cmd, spec.name);
		}
		for (const tool of spec.tools ?? []) {
			if (toolOwners.has(tool)) continue;
			toolOwners.set(tool, spec.name);
		}
		for (const key of spec.keys ?? []) {
			try {
				pi.registerShortcut(key as any, {
					description: `Load lazy package ${spec.name}`,
					handler: async (ctx) => {
						const res = await loadByName(pi, rt, spec.name, ctx);
						ctx.ui.notify(
							res.ok
								? res.alreadyLoaded
									? `${spec.name} already loaded`
									: `loaded ${spec.name}${res.loadMs != null ? ` (${res.loadMs}ms)` : ""}`
								: `failed ${spec.name}: ${res.error}`,
							res.ok ? "info" : "error",
						);
					},
				});
			} catch {
				/* duplicate shortcut */
			}
		}
	}

	for (const [cmd, owner] of cmdOwners) {
		pi.registerCommand(cmd, {
			description: `[lazy] load ${owner} then run /${cmd}`,
			handler: async (args, ctx) => {
				const res = await loadByName(pi, rt, owner, ctx);
				if (!res.ok) {
					ctx.ui.notify(`lazy: failed to load ${owner}: ${res.error}`, "error");
					return;
				}
				if (!res.alreadyLoaded) {
					ctx.ui.notify(`lazy: loaded ${owner}${res.loadMs != null ? ` in ${res.loadMs}ms` : ""}`, "info");
				}
				// Call the real command's handler in-process. sendUserMessage()
				// injects text back into the conversation as a literal chat
				// message rather than re-running slash-command dispatch, so a
				// re-sent "/cmd" never reaches the newly loaded handler — it
				// just gets shown to the LLM as a stray prompt.
				const real = rt.entries.get(owner)?.loadedCommandHandlers?.get(cmd);
				if (real) {
					await real(args, ctx);
					return;
				}
				// Fallback: package didn't register this exact command name
				// (e.g. it renamed/aliased it internally). Best effort re-dispatch.
				const suffix = args?.trim() ? ` ${args.trim()}` : "";
				pi.sendUserMessage(`/${cmd}${suffix}`, { deliverAs: "followUp" });
			},
		});
	}

	for (const [toolName, owner] of toolOwners) {
		pi.registerTool({
			name: toolName,
			label: `Lazy: ${toolName}`,
			description: `Lazy stub for ${toolName}. Loads package '${owner}' on first use, then activates the real tool. Call again after activation if needed.`,
			parameters: Type.Object({
				_lazy: Type.Optional(Type.String({ description: "Ignored. Present so the tool is valid before load." })),
			}, { additionalProperties: true }),
			async execute(_id, _params, _signal, _onUpdate, ctx) {
				const res = await loadByName(pi, rt, owner, ctx);
				if (!res.ok) {
					return {
						content: [{ type: "text", text: `Failed to load '${owner}': ${res.error}` }],
						details: { ok: false, error: res.error },
					};
				}
				const tools = res.tools?.length ? res.tools.join(", ") : "(see package)";
				return {
					content: [
						{
							type: "text",
							text: res.alreadyLoaded
								? `Package '${owner}' already available. Use the real tools now.`
								: `Loaded '${owner}'${res.loadMs != null ? ` in ${res.loadMs}ms` : ""}. Registered tools: ${tools}. Call the real tool again on the next turn.`,
						},
					],
					details: { ok: true, loaded: owner, tools: res.tools ?? [], alreadyLoaded: !!res.alreadyLoaded },
				};
			},
		});
	}
}

function registerEventTriggers(pi: ExtensionAPI, rt: Runtime) {
	const eventMap = new Map<string, string[]>(); // event -> spec names
	for (const entry of rt.entries.values()) {
		if (entry.state !== "pending") continue;
		for (const ev of entry.spec.event ?? []) {
			const list = eventMap.get(ev) ?? [];
			list.push(entry.spec.name);
			eventMap.set(ev, list);
		}
	}

	// before_agent_start: keywords + explicit event
	pi.on("before_agent_start", async (event, ctx) => {
		if (!rt.auto) return;
		const prompt = (event.prompt ?? "").toLowerCase();
		const toLoad = new Set<string>();

		for (const name of eventMap.get("before_agent_start") ?? []) {
			toLoad.add(name);
		}

		for (const entry of rt.entries.values()) {
			if (entry.state !== "pending") continue;
			for (const kw of entry.spec.keywords ?? []) {
				if (kw && prompt.includes(kw.toLowerCase())) {
					toLoad.add(entry.spec.name);
					break;
				}
			}
		}

		const limit = rt.config.autoLoadLimit ?? 1;
		for (const name of [...toLoad].slice(0, limit)) {
			// Re-derive ctx after each await: the session can be replaced/reloaded
			// mid-loop, which would make the closed-over `ctx` stale.
			const current = rt.sessionCtx ?? ctx;
			const res = await loadByName(pi, rt, name, current);
			if (res.ok && !res.alreadyLoaded) {
				notifySafe(rt.sessionCtx ?? current, `lazy: auto-loaded ${name}`, "info");
			}
		}
	});
}

async function runAfterStart(pi: ExtensionAPI, rt: Runtime, ctx: ExtensionContext) {
	const queue = [...rt.entries.values()]
		.filter((e) => e.state === "pending" && e.spec.lazy === "after-start")
		.sort((a, b) => (a.spec.priority ?? 100) - (b.spec.priority ?? 100));

	const batchSize = rt.config.afterStartBatchSize ?? 1;
	const delayMs = rt.config.afterStartDelayMs ?? 0;
	for (let i = 0; i < queue.length && !rt.queueCancelled; i += batchSize) {
		for (const entry of queue.slice(i, i + batchSize)) {
			// The ctx passed in was captured by session_start before the
			// setTimeout(0) that scheduled this call; if the session was
			// replaced/reloaded in that gap (or between iterations here),
			// rt.sessionCtx already points at the fresh one.
			const current = rt.sessionCtx ?? ctx;
			const res = await loadByName(pi, rt, entry.spec.name, current);
			if (!res.ok) {
				notifySafe(rt.sessionCtx ?? current, `lazy: after-start failed ${entry.spec.name}: ${res.error}`, "warning");
			}
		}
		if (i + batchSize < queue.length && !rt.queueCancelled) {
			await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
		}
	}
	refreshStatus(pi, rt, rt.sessionCtx ?? ctx);
}

function listLines(rt: Runtime): string[] {
	const lines: string[] = [];
	const order = ["pending", "loading", "loaded", "error", "eager"] as const;
	const sorted = [...rt.entries.values()].sort((a, b) => {
		const ai = order.indexOf(a.state as (typeof order)[number]);
		const bi = order.indexOf(b.state as (typeof order)[number]);
		if (ai !== bi) return ai - bi;
		return a.spec.name.localeCompare(b.spec.name);
	});

	for (const e of sorted) {
		const mode = e.spec.lazy === false ? "eager" : e.spec.lazy === "after-start" ? "after-start" : "on-demand";
		const ms = e.loadMs != null ? ` ${e.loadMs}ms` : "";
		const err = e.error ? ` — ${e.error}` : "";
		const ready = e.moduleLazyReady ? "" : e.state === "eager" && isManagedLazy(e.spec) ? " (migrate+restart needed)" : "";
		lines.push(`${e.state.padEnd(8)} ${e.spec.name.padEnd(16)} ${mode.padEnd(12)} ${e.spec.source}${ms}${ready}${err}`);
	}
	return lines;
}

export default function piLazy(pi: ExtensionAPI) {
	const agentDir = getAgentDir();
	const config = loadConfig(agentDir);
	const rt: Runtime = {
		config,
		entries: new Map(),
		auto: config.auto !== false,
		afterStartQueued: false,
		status: "lazy …",
		profile: [],
		queueCancelled: false,
	};

	// Catalog is rebuilt on session_start with cwd
	const rebuild = (cwd: string) => {
		const started = performance.now();
		rt.config = loadConfig(agentDir);
		rt.auto = rt.config.auto !== false;
		rt.entries = buildCatalog(rt.config, agentDir, cwd);
		rt.status = formatStatus(rt);
		recordTiming(rt, "catalog", started);
	};

	rebuild(process.cwd());
	registerStubs(pi, rt);
	registerEventTriggers(pi, rt);

	pi.on("session_start", async (event, ctx) => {
		rt.sessionCtx = ctx;
		rt.queueCancelled = false;
		rebuild(ctx.cwd);
		// Re-register stubs only for still-pending entries — commands/tools already registered
		// at factory time stay; new pending set is fine for this session.
		refreshStatus(pi, rt, ctx);

		const needsMigrate = [...rt.entries.values()].some(
			(e) => isManagedLazy(e.spec) && !e.moduleLazyReady,
		);
		if (needsMigrate && event.reason === "startup") {
			ctx.ui.notify("pi-lazy: run /lazy migrate then restart for true module-lazy", "info");
		}

		if (!rt.afterStartQueued) {
			rt.afterStartQueued = true;
			// VeryLazy: yield so first paint / prompt isn't blocked
			setTimeout(() => {
				void runAfterStart(pi, rt, ctx);
			}, 0);
		}
	});

	pi.on("session_shutdown", () => {
		rt.sessionCtx = undefined;
		rt.afterStartQueued = false;
		rt.queueCancelled = true;
	});

	pi.registerCommand("lazy", {
		description: "LazyVim-style extension manager (list|load|migrate|auto|init|status)",
		getArgumentCompletions: (prefix) => {
			const sub = ["status", "list", "load", "migrate", "auto", "init", "config", "profile"];
			const names = [...rt.entries.keys()].map((n) => `load ${n}`);
			const items = [...sub, ...names, "auto on", "auto off"].map((v) => ({ value: v, label: v }));
			const filtered = items.filter((i) => i.value.startsWith(prefix) || i.value.includes(prefix));
			return filtered.length ? filtered : null;
		},
		handler: async (args, ctx) => {
			const raw = (args ?? "").trim();
			const [head, ...rest] = raw.split(/\s+/);
			const sub = (head || "status").toLowerCase();

			if (sub === "status" || sub === "") {
				const lines = [
					formatStatus(rt),
					`auto: ${rt.auto ? "on" : "off"}`,
					`config: ${getLazyConfigPath(agentDir)}`,
					"",
					...listLines(rt),
				];
				ctx.ui.notify(lines.join("\n"), "info");
				return;
			}

			if (sub === "list") {
				ctx.ui.notify(listLines(rt).join("\n") || "no specs", "info");
				return;
			}

			if (sub === "config") {
				ctx.ui.notify(getLazyConfigPath(agentDir), "info");
				return;
			}

			if (sub === "profile") {
				const lines = rt.profile.length
					? rt.profile.map((item) => `${item.label.padEnd(24)} ${item.ms.toFixed(1)}ms`)
					: ["no timings recorded"];
				ctx.ui.notify(lines.join("\n"), "info");
				return;
			}

			if (sub === "init") {
				const path = saveConfig(defaultConfig(), agentDir);
				rebuild(ctx.cwd);
				ctx.ui.notify(`wrote default config → ${path}`, "info");
				return;
			}

			if (sub === "auto") {
				const mode = (rest[0] ?? "").toLowerCase();
				if (mode === "on" || mode === "off") {
					rt.auto = mode === "on";
					rt.config.auto = rt.auto;
					saveConfig(rt.config, agentDir);
					ctx.ui.notify(`lazy auto ${mode}`, "info");
					return;
				}
				ctx.ui.notify(`lazy auto is ${rt.auto ? "on" : "off"} (usage: /lazy auto on|off)`, "info");
				return;
			}

			if (sub === "migrate") {
				const result = migrateSettings(agentDir);
				if (!result.ok) {
					ctx.ui.notify(`migrate failed: ${result.error}`, "error");
					return;
				}
				const lines = [
					result.changed.length ? `updated: ${result.changed.join(", ")}` : "no package changes needed",
					result.skipped.length ? `already lazy: ${result.skipped.join(", ")}` : "",
					result.added.length ? `added: ${result.added.join(", ")}` : "",
					result.backupPath ? `backup: ${result.backupPath}` : "",
					"Restart pi to apply module-lazy (extensions filtered to []).",
				].filter(Boolean);
				ctx.ui.notify(lines.join("\n"), "info");
				rebuild(ctx.cwd);
				refreshStatus(pi, rt, ctx);
				return;
			}

			if (sub === "load") {
				const name = rest.join(" ").trim();
				if (!name) {
					ctx.ui.notify("usage: /lazy load <name>", "warning");
					return;
				}
				const res = await loadByName(pi, rt, name, ctx);
				if (!res.ok) {
					ctx.ui.notify(`load failed: ${res.error}`, "error");
					return;
				}
				if (res.alreadyLoaded) {
					ctx.ui.notify(`${res.name} already loaded/eager`, "info");
					return;
				}
				ctx.ui.notify(
					`loaded ${res.name}${res.loadMs != null ? ` in ${res.loadMs}ms` : ""}${
						res.tools?.length ? ` — tools: ${res.tools.join(", ")}` : ""
					}`,
					"info",
				);
				return;
			}

			ctx.ui.notify("usage: /lazy [status|list|profile|load <name>|migrate|auto on|off|init|config]", "warning");
		},
	});

	pi.registerTool({
		name: "lazy_load",
		label: "Lazy Load",
		description:
			"Load a deferred Pi extension package managed by pi-lazy (LazyVim-style). Use when a capability is pending/on-demand (web, mcp, lens, plannotator, context-mode, etc.). Prefer /lazy list names.",
		promptSnippet: "Load a deferred pi-lazy extension package on demand",
		parameters: Type.Object({
			name: Type.String({ description: "Spec name from /lazy list (e.g. web, mcp, lens, plannotator)" }),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const res = await loadByName(pi, rt, params.name, ctx);
			if (!res.ok) {
				return {
					content: [{ type: "text", text: `Failed: ${res.error}` }],
					details: res,
				};
			}
			return {
				content: [
					{
						type: "text",
						text: res.alreadyLoaded
							? `'${res.name}' already loaded or eager.`
							: `Loaded '${res.name}' in ${res.loadMs ?? "?"}ms. tools=[${(res.tools ?? []).join(", ")}] commands=[${(res.commands ?? []).join(", ")}]`,
					},
				],
				details: res,
			};
		},
	});
}
