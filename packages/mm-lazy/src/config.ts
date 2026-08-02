import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { LazyConfig, LazyMode, LazySpec } from "./types.ts";

export const CONFIG_VERSION = 1 as const;

export function getLazyConfigPath(agentDir = getAgentDir()): string {
	return join(agentDir, "lazy.json");
}

export function getSettingsPath(agentDir = getAgentDir()): string {
	return join(agentDir, "settings.json");
}

export function defaultConfig(): LazyConfig {
	return {
		version: 1,
		defaults: { lazy: true },
		auto: true,
		autoLoadLimit: 1,
		afterStartBatchSize: 1,
		afterStartDelayMs: 0,
		specs: [
			// Providers / always-on identity
			{ name: "grok-cli", source: "npm:pi-grok-cli", lazy: false, description: "Grok CLI provider" },
			{ name: "antigravity", source: "npm:pi-antigravity", lazy: false, description: "Antigravity provider" },
			{ name: "cursor", source: "npm:@rahularya01/pi-cursor", lazy: false, description: "Cursor provider bridge" },

			// VeryLazy — common after UI is up
			{
				name: "subagents",
				source: "npm:pi-subagents",
				lazy: "after-start",
				priority: 10,
				description: "Subagent orchestration",
			},
			{
				name: "todo",
				source: "npm:@juicesharp/rpiv-todo",
				lazy: "after-start",
				priority: 20,
				cmd: ["todo"],
				tools: ["todo"],
			},
			{
				name: "ask-user",
				source: "npm:@juicesharp/rpiv-ask-user-question",
				lazy: "after-start",
				priority: 20,
				tools: ["ask_user_question"],
			},
			{
				name: "hypa",
				source: "npm:@hypabolic/pi-hypa",
				lazy: "after-start",
				priority: 30,
				description: "Hypa compressed tools",
			},
			{
				name: "paster",
				source: "npm:pi-paster",
				lazy: "after-start",
				priority: 40,
				description: "Clipboard / paste helpers",
			},

			// On-demand — heavy / situational
			{
				name: "web",
				source: "npm:pi-web-access",
				lazy: true,
				cmd: ["web"],
				tools: ["web_search", "fetch_content", "get_search_content"],
				keywords: ["web search", "search the web", "fetch url", "youtube"],
				description: "Web search / fetch / video",
			},
			{
				name: "mcp",
				source: "npm:pi-mcp-adapter",
				lazy: true,
				cmd: ["mcp"],
				keywords: ["mcp", "playwright", "clickup"],
				description: "MCP server bridge",
			},
			{
				name: "context-mode",
				source: "npm:context-mode",
				lazy: true,
				cmd: ["context-mode", "ctx"],
				tools: ["ctx_execute", "ctx_search", "ctx_index"],
				keywords: ["context-mode", "ctx_execute"],
				description: "Context-mode tools + skills",
			},
			{
				name: "lens",
				source: "npm:pi-lens",
				lazy: true,
				cmd: ["lens"],
				tools: ["lens_diagnostics", "symbol_search", "module_report", "lsp_diagnostics"],
				keywords: ["diagnostics", "symbol search", "ast-grep", "lsp"],
				description: "pi-lens code intelligence",
			},
			{
				name: "plannotator",
				source: "npm:@plannotator/pi-extension",
				lazy: true,
				cmd: ["plannotator", "plan"],
				keywords: ["plannotator", "plan mode"],
				description: "Plan mode / plannotator",
			},
		],
	};
}

export function normalizeMode(value: unknown, fallback: LazyMode = true): LazyMode {
	if (value === false || value === true || value === "after-start") return value;
	return fallback;
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

function normalizeNonNegativeInteger(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : fallback;
}

export function loadConfig(agentDir = getAgentDir()): LazyConfig {
	const path = getLazyConfigPath(agentDir);
	if (!existsSync(path)) {
		const cfg = defaultConfig();
		saveConfig(cfg, agentDir);
		return cfg;
	}

	try {
		const raw = JSON.parse(readFileSync(path, "utf-8")) as Partial<LazyConfig>;
		const defaultsLazy = normalizeMode(raw.defaults?.lazy, true);
		const specs = Array.isArray(raw.specs)
			? raw.specs
					.filter((s): s is LazySpec => !!s && typeof s === "object" && typeof s.name === "string" && typeof s.source === "string")
					.map((s) => ({
						...s,
						lazy: s.lazy === undefined ? defaultsLazy : normalizeMode(s.lazy, defaultsLazy),
						cmd: s.cmd?.filter((c) => typeof c === "string" && c.length > 0),
						tools: s.tools?.filter((t) => typeof t === "string" && t.length > 0),
						keys: s.keys?.filter((k) => typeof k === "string" && k.length > 0),
						event: s.event?.filter((e) => typeof e === "string" && e.length > 0),
						keywords: s.keywords?.filter((k) => typeof k === "string" && k.length > 0),
						dependencies: s.dependencies?.filter((d) => typeof d === "string" && d.length > 0),
					}))
			: defaultConfig().specs;

		return {
			version: 1,
			defaults: { lazy: defaultsLazy },
			auto: raw.auto !== false,
			autoLoadLimit: normalizePositiveInteger(raw.autoLoadLimit, 1),
			afterStartBatchSize: normalizePositiveInteger(raw.afterStartBatchSize, 1),
			afterStartDelayMs: normalizeNonNegativeInteger(raw.afterStartDelayMs, 0),
			specs,
		};
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(`[pi-lazy] failed to parse lazy.json: ${message}`);
		return defaultConfig();
	}
}

export function saveConfig(config: LazyConfig, agentDir = getAgentDir()): string {
	const path = getLazyConfigPath(agentDir);
	mkdirSync(dirname(path), { recursive: true });
	const body = `${JSON.stringify(config, null, 2)}\n`;
	writeFileSync(path, body, "utf-8");
	return path;
}

export function isManagedLazy(spec: LazySpec): boolean {
	return spec.lazy !== false;
}
