import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { checkpointBeforeCompact } from "./checkpoint.js";
import { formatMemoryStatus, loadMemoryConfig, saveMemoryConfig } from "./config.js";
import { projectFromCwd, type MemoryKind } from "./documents.js";
import {
	formatRecallResult,
	formatRememberResult,
	recall,
	recallForInjection,
	remember,
} from "./memory.js";
import {
	assessTopic,
	formatAssessResult,
	recordKnowledgeGap,
} from "./metacognition.js";
import { minePath } from "./mine.js";
import { PrismApiError, PrismClient, truncateJson } from "./prism-client.js";

function formatError(error: unknown): string {
	if (error instanceof PrismApiError) return error.message;
	if (error instanceof Error) return error.message;
	return String(error);
}

const KIND_ENUM = StringEnum([
	"fact",
	"preference",
	"decision",
	"insight",
	"session_summary",
	"follow_up",
	"note",
] as const);

export default function mmMemory(pi: ExtensionAPI): void {
	pi.registerCommand("memory", {
		description: "Prism LTM status, remember, recall, and mine",
		getArgumentCompletions: async (prefix) => {
			const options = [
				"status",
				"recall ",
				"remember ",
				"mine ",
				"assess ",
				"gap ",
				"inject on",
				"inject off",
				"checkpoint on",
				"checkpoint off",
				"help",
			];
			const needle = prefix.trim().toLowerCase();
			return options
				.filter((option) => option.startsWith(needle) || option.includes(needle))
				.map((value) => ({ value, label: value }));
		},
		handler: async (args, ctx) => {
			const trimmed = args.trim();
			const [action, ...rest] = trimmed.split(/\s+/);
			const verb = (action || "status").toLowerCase();

			try {
				if (verb === "help") {
					ctx.ui.notify(
						[
							"/memory status — Prism LTM config + health",
							"/memory recall <query> — scoped semantic search",
							"/memory remember <text> — index a durable memory",
							"/memory mine [path] — ingest files into Prism (default: cwd)",
							"/memory assess <topic> — coverage/confidence over wiki + Prism",
							"/memory gap <description> — record a known knowledge gap",
							"/memory inject on|off — session-start Prism inject (default off)",
							"/memory checkpoint on|off — precompact LTM checkpoint (default on)",
							"Tools: memory_remember, memory_recall, memory_mine, memory_assess, memory_gap",
						].join("\n"),
						"info",
					);
					return;
				}

				if (verb === "inject" || verb === "checkpoint") {
					const mode = rest[0]?.toLowerCase();
					if (mode !== "on" && mode !== "off") {
						ctx.ui.notify(`Usage: /memory ${verb} on|off`, "error");
						return;
					}
					if (verb === "inject") saveMemoryConfig({ injectOnStart: mode === "on" });
					else saveMemoryConfig({ checkpointOnCompact: mode === "on" });
					ctx.ui.notify(formatMemoryStatus(loadMemoryConfig()), "info");
					return;
				}

				if (verb === "remember") {
					const text = rest.join(" ").trim();
					if (!text) {
						ctx.ui.notify("Usage: /memory remember <text>", "error");
						return;
					}
					const result = await remember(
						{ text, kind: "note", source: "memory_command" },
						{ cwd: ctx.cwd },
					);
					ctx.ui.notify(formatRememberResult(result), "info");
					return;
				}

				if (verb === "recall") {
					const query = rest.join(" ").trim();
					if (!query) {
						ctx.ui.notify("Usage: /memory recall <query>", "error");
						return;
					}
					const result = await recall(query, {
						cwd: ctx.cwd,
						project: projectFromCwd(ctx.cwd),
					});
					ctx.ui.notify(formatRecallResult(result), "info");
					return;
				}

				if (verb === "mine") {
					const target = rest.join(" ").trim() || ctx.cwd;
					const result = await minePath({ path: target, cwd: ctx.cwd });
					ctx.ui.notify(truncateJson(result, 8_000), "info");
					return;
				}

				if (verb === "assess") {
					const topic = rest.join(" ").trim();
					if (!topic) {
						ctx.ui.notify("Usage: /memory assess <topic>", "error");
						return;
					}
					const result = await assessTopic(topic, { cwd: ctx.cwd });
					ctx.ui.notify(formatAssessResult(result), "info");
					return;
				}

				if (verb === "gap") {
					const description = rest.join(" ").trim();
					if (!description) {
						ctx.ui.notify("Usage: /memory gap <description>", "error");
						return;
					}
					const path = recordKnowledgeGap(description);
					ctx.ui.notify(`Knowledge gap recorded → ${path}`, "info");
					return;
				}

				if (verb !== "status") {
					ctx.ui.notify(
						`Unknown /memory action: ${verb}. Try status|recall|remember|mine|assess|gap|inject|checkpoint|help`,
						"error",
					);
					return;
				}

				const config = loadMemoryConfig();
				const client = new PrismClient(config.connection);
				try {
					const health = await client.health();
					ctx.ui.notify(
						[formatMemoryStatus(config), "", `health: ok`, JSON.stringify(health)].join(
							"\n",
						),
						"info",
					);
				} catch (error) {
					ctx.ui.notify(
						[formatMemoryStatus(config), "", `health: FAILED — ${formatError(error)}`].join(
							"\n",
						),
						"error",
					);
				}
			} catch (error) {
				ctx.ui.notify(formatError(error), "error");
			}
		},
	});

	pi.registerTool({
		name: "memory_remember",
		label: "Remember (Prism LTM)",
		description:
			"Store a durable long-term memory in Prism (facts, preferences, decisions, session summaries). Prefer this for lasting knowledge; short-lived observations belong in observational-memory; curated topics belong in mm-wiki.",
		parameters: Type.Object({
			text: Type.String({ description: "Memory text to store" }),
			kind: Type.Optional(KIND_ENUM),
			project: Type.Optional(Type.String({ description: "Project slug (defaults to cwd basename)" })),
			tags: Type.Optional(Type.Array(Type.String())),
			scope: Type.Optional(StringEnum(["memories", "sessions"] as const)),
			source: Type.Optional(Type.String()),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const result = await remember(
				{
					text: params.text,
					kind: params.kind as MemoryKind | undefined,
					project: params.project,
					tags: params.tags,
					scope: params.scope,
					source: params.source ?? "memory_remember",
				},
				{ cwd: ctx.cwd },
			);
			return { content: [{ type: "text", text: formatRememberResult(result) }], details: {} };
		},
	});

	pi.registerTool({
		name: "memory_recall",
		label: "Recall (Prism LTM)",
		description:
			"Semantic recall from Prism LTM with optional scopes: project (wing), kind (room), and tags. Use when asking what is known durably about a topic across sessions.",
		parameters: Type.Object({
			query: Type.String({ description: "Natural-language recall query" }),
			limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
			scope: Type.Optional(StringEnum(["memories", "sessions", "both"] as const)),
			project: Type.Optional(Type.String({ description: "Scope to project slug (wing)" })),
			kind: Type.Optional(KIND_ENUM),
			tags: Type.Optional(Type.Array(Type.String(), { description: "Require these tags" })),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const result = await recall(params.query, {
				cwd: ctx.cwd,
				limit: params.limit,
				scope: params.scope,
				project: params.project ?? projectFromCwd(ctx.cwd),
				kind: params.kind,
				tags: params.tags,
			});
			return { content: [{ type: "text", text: formatRecallResult(result) }], details: {} };
		},
	});

	pi.registerTool({
		name: "memory_mine",
		label: "Mine into Prism LTM",
		description:
			"Ingest text files from a directory (or a single file) into Prism LTM collections. Skips binary/vendor dirs; chunks large files. Use for project docs/decisions you want searchable long-term.",
		parameters: Type.Object({
			path: Type.Optional(
				Type.String({ description: "Directory or file to mine (default: cwd)" }),
			),
			project: Type.Optional(Type.String()),
			kind: Type.Optional(KIND_ENUM),
			tags: Type.Optional(Type.Array(Type.String())),
			max_files: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })),
			scope: Type.Optional(StringEnum(["memories", "sessions"] as const)),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const result = await minePath({
				path: params.path?.trim() || ctx.cwd,
				cwd: ctx.cwd,
				project: params.project,
				kind: params.kind as MemoryKind | undefined,
				tags: params.tags,
				maxFiles: params.max_files,
				scope: params.scope,
			});
			return { content: [{ type: "text", text: truncateJson(result, 10_000) }], details: {} };
		},
	});

	pi.registerTool({
		name: "memory_assess",
		label: "Assess knowledge coverage",
		description:
			"Metacognition-lite: estimate confidence for a topic from wiki keyword hits, Prism recall hits, and recorded knowledge gaps. Use before answering when unsure whether durable knowledge exists.",
		parameters: Type.Object({
			topic: Type.String({ description: "Topic or question to assess coverage for" }),
			project: Type.Optional(Type.String()),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const result = await assessTopic(params.topic, {
				cwd: ctx.cwd,
				project: params.project,
			});
			return { content: [{ type: "text", text: formatAssessResult(result) }], details: {} };
		},
	});

	pi.registerTool({
		name: "memory_gap",
		label: "Record knowledge gap",
		description:
			"Record a known knowledge gap (missing fact, unresolved question, or topic with weak coverage). Stored under ~/.pi/agent/mm-knowledge-gaps.md and used by memory_assess.",
		parameters: Type.Object({
			description: Type.String({ description: "What is missing or uncertain" }),
		}),
		async execute(_toolCallId, params) {
			const path = recordKnowledgeGap(params.description);
			return {
				content: [{ type: "text", text: `Knowledge gap recorded → ${path}` }],
				details: {},
			};
		},
	});

	// Optional: inject top-N at agent start only when explicitly enabled.
	pi.on("before_agent_start", async (event, ctx) => {
		try {
			const block = await recallForInjection(event.prompt ?? "", { cwd: ctx.cwd });
			if (!block) return;
			return { systemPrompt: `${event.systemPrompt}\n\n${block}` };
		} catch {
			return;
		}
	});

	// Pre-compaction checkpoint → ltm-sessions (MemPalace-inspired pattern, Prism-backed).
	pi.on("session_before_compact", async (event, ctx) => {
		try {
			const messages = event.preparation?.messagesToSummarize ?? [];
			const result = await checkpointBeforeCompact({
				messages: messages as Array<{ role?: string; content?: unknown }>,
				cwd: ctx.cwd,
				reason: event.reason,
			});
			if (result.ok && ctx.hasUI) {
				ctx.ui.notify(
					`LTM checkpoint saved (${result.collection}: ${result.id})`,
					"info",
				);
			}
		} catch (error) {
			if (ctx.hasUI) {
				ctx.ui.notify(`LTM checkpoint failed: ${formatError(error)}`, "error");
			}
		}
	});
}
