import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

import type { ExtensionAPI, SlashCommandInfo, ToolInfo } from "@mariozechner/pi-coding-agent";

function resolveMarketingAgentsSettingsPath(): string {
	const configured = (
		process.env.PI_CODING_AGENT_DIR ??
		process.env.MARKETINGAGENTS_CODING_AGENT_DIR ??
		process.env.ADSAGENTS_CODING_AGENT_DIR
	)?.trim();
	const agentDir = configured
		? configured.startsWith("~/")
			? resolve(homedir(), configured.slice(2))
			: resolve(configured)
		: resolve(homedir(), ".marketingagents", "agent");
	return resolve(agentDir, "settings.json");
}

function readConfiguredPackages(): string[] {
	const settingsPath = resolveMarketingAgentsSettingsPath();
	if (!existsSync(settingsPath)) return [];

	try {
		const parsed = JSON.parse(readFileSync(settingsPath, "utf8")) as { packages?: unknown[] };
		return Array.isArray(parsed.packages)
			? parsed.packages
					.map((entry) => {
						if (typeof entry === "string") return entry;
						if (!entry || typeof entry !== "object") return undefined;
						const record = entry as { source?: unknown };
						return typeof record.source === "string" ? record.source : undefined;
					})
					.filter((entry): entry is string => Boolean(entry))
			: [];
	} catch {
		return [];
	}
}

function formatSourceLabel(sourceInfo: { source: string; path: string }): string {
	if (sourceInfo.source === "local") {
		if (sourceInfo.path.includes("/prompts/")) return "workflow";
		if (sourceInfo.path.includes("/extensions/")) return "extension";
		return "local";
	}
	return sourceInfo.source.replace(/^npm:/, "").replace(/^git:/, "");
}

function formatCommandLine(command: SlashCommandInfo): string {
	const source = formatSourceLabel(command.sourceInfo);
	return `/${command.name} — ${command.description ?? ""} [${source}]`;
}

function summarizeToolParameters(tool: ToolInfo): string {
	const properties =
		tool.parameters &&
		typeof tool.parameters === "object" &&
		"properties" in tool.parameters &&
		tool.parameters.properties &&
		typeof tool.parameters.properties === "object"
			? Object.keys(tool.parameters.properties as Record<string, unknown>)
			: [];
	return properties.length > 0 ? properties.join(", ") : "no parameters";
}

function formatToolLine(tool: ToolInfo): string {
	const source = formatSourceLabel(tool.sourceInfo);
	return `${tool.name} — ${tool.description ?? ""} [${source}]`;
}

export function registerDiscoveryCommands(pi: ExtensionAPI): void {
	pi.registerCommand("commands", {
		description: "Browse all available slash commands, including package and built-in commands.",
		handler: async (_args, ctx) => {
			const commands = pi
				.getCommands()
				.slice()
				.sort((left, right) => left.name.localeCompare(right.name));
			const items = commands.map((command) => formatCommandLine(command));
			const selected = await ctx.ui.select("Slash Commands", items);
			if (!selected) return;
			ctx.ui.setEditorText(selected.split(" — ")[0] ?? "");
			ctx.ui.notify(`Prefilled ${selected.split(" — ")[0]}`, "info");
		},
	});

	pi.registerCommand("tools", {
		description: "Browse all callable tools with their source and parameter summary.",
		handler: async (_args, ctx) => {
			const tools = pi
				.getAllTools()
				.slice()
				.sort((left, right) => left.name.localeCompare(right.name));
			const selected = await ctx.ui.select("Tools", tools.map((tool) => formatToolLine(tool)));
			if (!selected) return;

			const toolName = selected.split(" — ")[0] ?? selected;
			const tool = tools.find((entry) => entry.name === toolName);
			if (!tool) return;
			ctx.ui.notify(`${tool.name}: ${summarizeToolParameters(tool)}`, "info");
		},
	});

	pi.registerCommand("capabilities", {
		description: "Show installed packages, discovery entrypoints, and high-level runtime capability counts.",
		handler: async (_args, ctx) => {
			const commands = pi.getCommands();
			const tools = pi.getAllTools();
			const workflows = commands.filter((command) => formatSourceLabel(command.sourceInfo) === "workflow");
			const packages = readConfiguredPackages();
			const items = [
				`Commands: ${commands.length}`,
				`Workflows: ${workflows.length}`,
				`Tools: ${tools.length}`,
				`Packages: ${packages.length}`,
				"--- Discovery ---",
				"/commands — browse slash commands",
				"/tools — inspect callable tools",
				"/hotkeys — view keyboard shortcuts",
				"/service-tier — set request tier for supported providers",
				"--- Installed Packages ---",
				...packages.map((pkg) => pkg),
			];
			const selected = await ctx.ui.select("Capabilities", items);
			if (!selected || selected.startsWith("---")) return;
			if (selected.startsWith("/")) {
				ctx.ui.setEditorText(selected.split(" — ")[0] ?? selected);
				ctx.ui.notify(`Prefilled ${selected.split(" — ")[0]}`, "info");
			}
		},
	});
}
