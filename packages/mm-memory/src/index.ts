import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { installAmbientSync, memoryStartupGuidance } from "./ambient.js";
import { checkpointBeforeCompact } from "./checkpoint.js";
import { formatMemoryStatus, isProviderAllowed, loadMemoryConfig, saveMemoryConfig } from "./config.js";
import { projectFromCwd, normalizeRecallHits, type MemoryKind } from "./documents.js";
import {
	formatRecallResult,
	formatRememberResult,
	recall,
	recallForInjection,
	remember,
	resolveCollection,
} from "./memory.js";
import {
	assessTopic,
	formatAssessResult,
	recordKnowledgeGap,
} from "./metacognition.js";
import { minePath } from "./mine.js";
import { escapePrismQuery, PrismApiError, PrismClient, truncateJson } from "./prism-client.js";

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
				{ value: "status", description: "Show Prism connection and collections" },
				{ value: "remember ", description: "Store a durable fact/decision/insight" },
				{ value: "recall ", description: "Semantic recall across LTM collections" },
				{ value: "sessions ", description: "Search past session summaries" },
				{ value: "mine ", description: "Mine docs/decisions from path into LTM" },
				{ value: "assess ", description: "Estimate knowledge coverage for topic" },
				{ value: "gap ", description: "Record a known missing fact or question" },
				{ value: "forget ", description: "Delete a memory by matching text" },
				{ value: "checkpoint", description: "Force a session summary checkpoint now" },
				{ value: "inject", description: "Preview the auto-injected recall block" },
				{ value: "sync", description: "Toggle ambient session sync (now: on)" },
			];
			return options.filter((opt) => opt.value.startsWith(prefix));
		},
		handler: async (args, ctx) => {
			const trimmed = args.trim();
			const [verb = "status", ...rest] = trimmed ? trimmed.split(/\s+/) : [];

			try {
				if (verb === "remember") {
					const text = rest.join(" ").trim();
					if (!text) {
						ctx.ui.notify("Usage: /memory remember <text>", "error");
						return;
					}
					const currentProvider = ctx.model?.provider;
					const result = await remember(
						{ text, kind: "note" },
						{ cwd: ctx.cwd, currentProvider },
					);
					ctx.ui.notify(
						`Remembered (${result.collection}: ${result.document.id})`,
						"info",
					);
					return;
				}

				if (verb === "recall") {
					const query = rest.join(" ").trim();
					if (!query) {
						ctx.ui.notify("Usage: /memory recall <query>", "error");
						return;
					}
					const currentProvider = ctx.model?.provider;
					const result = await recall(query, { cwd: ctx.cwd, limit: 5, currentProvider });
					const lines = [
						`Prism recall: "${query}" (${result.hits.length} hits)`,
						...result.hits.map((h, i) => `${i + 1}. [${h.kind ?? "fact"}] ${h.text}`),
					];
					ctx.ui.notify(lines.join("\n"), "info");
					return;
				}

				if (verb === "sessions") {
					const query = rest.join(" ").trim();
					if (!query) {
						ctx.ui.notify("Usage: /memory sessions <query>", "error");
						return;
					}
					const currentProvider = ctx.model?.provider;
					const result = await recall(query, {
						cwd: ctx.cwd,
						limit: 5,
						scope: "sessions",
						kind: "session_summary",
						currentProvider,
					});
					const lines = [
						`Prism session search: "${query}" (${result.hits.length} hits)`,
						...result.hits.map((h, i) => `${i + 1}. ${h.text}`),
					];
					ctx.ui.notify(lines.join("\n"), "info");
					return;
				}

				if (verb === "mine") {
					const target = rest.join(" ").trim() || ctx.cwd;
					ctx.ui.notify(`Mining ${target} into Prism LTM...`, "info");
					const report = await minePath({ path: target, cwd: ctx.cwd });
					ctx.ui.notify(
						`Mined ${report.indexed} chunks across ${report.filesScanned} files into ${report.collection}`,
						"info",
					);
					return;
				}

				if (verb === "checkpoint") {
					const result = await checkpointBeforeCompact({
						messages: [],
						cwd: ctx.cwd,
						reason: "manual",
					});
					ctx.ui.notify(
						result.ok
							? `Checkpoint saved (${result.collection}: ${result.id})`
							: "Checkpoint had no content to save",
						result.ok ? "info" : "warning",
					);
					return;
				}

				if (verb === "inject") {
					const currentProvider = ctx.model?.provider;
					const block = await recallForInjection("", { cwd: ctx.cwd, currentProvider });
					if (!block) {
						ctx.ui.notify("No memories would be auto-injected right now.", "info");
						return;
					}
					ctx.ui.notify(block, "info");
					return;
				}

				if (verb === "sync") {
					const config = loadMemoryConfig(ctx.cwd);
					const next = !config.ambientSync;
					saveMemoryConfig({ ambientSync: next }, ctx.cwd);
					ctx.ui.notify(`Ambient LTM sync is now ${next ? "ENABLED" : "DISABLED"}`, "info");
					return;
				}

				if (verb === "assess") {
					const topic = rest.join(" ").trim();
					if (!topic) {
						ctx.ui.notify("Usage: /memory assess <topic>", "error");
						return;
					}
					const assessment = await assessTopic(topic, { cwd: ctx.cwd });
					ctx.ui.notify(
						[
							`Coverage for "${topic}": ${assessment.confidence} confidence (${assessment.confidenceScore}/100)`,
							assessment.recommendation,
							`Wiki hits: ${assessment.sources.wikiHits.length} · Prism hits: ${assessment.sources.prismHits.length} · Gaps: ${assessment.sources.gaps.length}`,
						].join("\n"),
						"info",
					);
					return;
				}

				if (verb === "gap") {
					const description = rest.join(" ").trim();
					if (!description) {
						ctx.ui.notify("Usage: /memory gap <missing fact or question>", "error");
						return;
					}
					const path = recordKnowledgeGap(description);
					ctx.ui.notify(`Knowledge gap recorded → ${path}`, "info");
					return;
				}

				if (verb === "forget") {
					const text = rest.join(" ").trim();
					if (!text) {
						ctx.ui.notify("Usage: /memory forget <text> — delete a memory by matching text", "error");
						return;
					}
					const config = loadMemoryConfig(ctx.cwd);
					const currentProvider = ctx.model?.provider;
					const access = isProviderAllowed(currentProvider, config);
					if (!access.allowed) {
						ctx.ui.notify(`[LTM Governance] ${access.reason}`, "error");
						return;
					}

					const collection = resolveCollection(config, "memories");
					const client = new PrismClient(config.connection);
					const escapedQuery = escapePrismQuery(text);
					let searchResult: unknown;
					try {
						searchResult = await client.search(collection, { query: escapedQuery, limit: 1 });
					} catch (searchError) {
						ctx.ui.notify(`Search failed for "${text}": ${formatError(searchError)}`, "error");
						return;
					}
					const hits = normalizeRecallHits(searchResult, 1);
					if (hits.length === 0) {
						ctx.ui.notify(`No memory found matching: "${text}"`, "warning");
						return;
					}
					const hit = hits[0];
					await client.deleteDocument(collection, hit.id);
					ctx.ui.notify(
						`Forgot: "${hit.text.slice(0, 120)}${hit.text.length > 120 ? "..." : ""}" (id: ${hit.id})`,
						"info",
					);
					return;
				}

				if (verb !== "status") {
					ctx.ui.notify(
						`Unknown /memory action: ${verb}. Try status|recall|sessions|remember|mine|assess|gap|inject|checkpoint|sync|help`,
						"error",
					);
					return;
				}

				const config = loadMemoryConfig(ctx.cwd);
				const client = new PrismClient(config.connection);
				try {
					const health = await client.health();
					ctx.ui.notify(
						[formatMemoryStatus(config, ctx.cwd), "", `health: ok`, JSON.stringify(health)].join(
							"\n",
						),
						"info",
					);
				} catch (error) {
					ctx.ui.notify(
						[formatMemoryStatus(config, ctx.cwd), "", `health: FAILED — ${formatError(error)}`].join(
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
			"Store a durable long-term memory in Prism (facts, preferences, decisions, insights). Prefer this for lasting knowledge; short-lived observations belong in observational-memory; curated topics belong in mm-wiki. Search with memory_recall first — prefer one strong memory over near-duplicates.",
		parameters: Type.Object({
			text: Type.String({ description: "Memory text to store" }),
			kind: Type.Optional(KIND_ENUM),
			project: Type.Optional(Type.String({ description: "Project slug (defaults to cwd basename)" })),
			tags: Type.Optional(Type.Array(Type.String())),
			scope: Type.Optional(StringEnum(["memories", "sessions"] as const)),
			source: Type.Optional(Type.String()),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const currentProvider = ctx.model?.provider;
			try {
				const result = await remember(
					{
						text: params.text,
						kind: params.kind as MemoryKind | undefined,
						project: params.project,
						tags: params.tags,
						scope: params.scope,
						source: params.source ?? "memory_remember",
					},
					{ cwd: ctx.cwd, currentProvider },
				);
				return { content: [{ type: "text", text: formatRememberResult(result) }], details: {} };
			} catch (err) {
				return {
					content: [{ type: "text", text: `Remember failed: ${formatError(err)}` }],
					details: { success: false, error: formatError(err) },
				};
			}
		},
	});

	pi.registerTool({
		name: "memory_recall",
		label: "Recall (Prism LTM)",
		description:
			"Semantic recall from Prism LTM. Searches across ALL projects by default; pass project only to narrow. Use scope=memories (default) for durable facts; scope=sessions for past conversation summaries (ambient sync + precompact checkpoints); scope=both when unsure. Optional filters: project (wing), kind (room), tags.",
		parameters: Type.Object({
			query: Type.String({ description: "Natural-language recall query" }),
			limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
			scope: Type.Optional(StringEnum(["memories", "sessions", "both"] as const)),
			project: Type.Optional(Type.String({ description: "Optional: scope to project slug. Omit to search across all projects (recommended for infrastructure/cross-cutting topics)" })),
			kind: Type.Optional(KIND_ENUM),
			tags: Type.Optional(Type.Array(Type.String(), { description: "Require these tags" })),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const currentProvider = ctx.model?.provider;
			try {
				const result = await recall(params.query, {
					cwd: ctx.cwd,
					limit: params.limit,
					scope: params.scope,
					project: params.project,
					kind: params.kind,
					tags: params.tags,
					currentProvider,
				});
				return { content: [{ type: "text", text: formatRecallResult(result) }], details: {} };
			} catch (err) {
				return {
					content: [{ type: "text", text: `Recall failed: ${formatError(err)}` }],
					details: { success: false, error: formatError(err) },
				};
			}
		},
	});

	pi.registerTool({
		name: "memory_sessions",
		label: "Search session memory",
		description:
			"Search past Pi session summaries in Prism ltm-sessions (nmem thread-search pattern, Prism-backed). Use when the user asks about previous conversations or prior work in this project.",
		parameters: Type.Object({
			query: Type.String({ description: "What to find in past sessions" }),
			limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 30 })),
			project: Type.Optional(Type.String()),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const currentProvider = ctx.model?.provider;
			try {
				const result = await recall(params.query, {
					cwd: ctx.cwd,
					limit: params.limit ?? 10,
					scope: "sessions",
					kind: "session_summary",
					project: params.project,
					currentProvider,
				});
				return { content: [{ type: "text", text: formatRecallResult(result) }], details: {} };
			} catch (err) {
				return {
					content: [{ type: "text", text: `Session search failed: ${formatError(err)}` }],
					details: { success: false, error: formatError(err) },
				};
			}
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
			const config = loadMemoryConfig(ctx.cwd);
			const currentProvider = ctx.model?.provider;
			const access = isProviderAllowed(currentProvider, config);
			if (!access.allowed) {
				return {
					content: [{ type: "text", text: `[LTM Data Governance] ${access.reason}` }],
					details: { success: false, error: access.reason },
				};
			}

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
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const path = recordKnowledgeGap(params.description);
			return {
				content: [{ type: "text", text: `Recorded knowledge gap in ${path}` }],
				details: { path },
			};
		},
	});

	// Guidance always on; optional Prism hit inject when injectOnStart=true.
	pi.registerTool({
		name: "memory_forget",
		label: "Forget (Prism LTM)",
		description:
			"Delete a memory from Prism LTM. Searches for the text first, then deletes the top hit. Use when a memory was stored in error or is no longer valid. Requires exact-ish text to identify the memory.",
		parameters: Type.Object({
			text: Type.String({ description: "Memory text to search for and delete" }),
			scope: Type.Optional(StringEnum(["memories", "sessions"] as const)),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const config = loadMemoryConfig(ctx.cwd);
			const currentProvider = ctx.model?.provider;
			const access = isProviderAllowed(currentProvider, config);
			if (!access.allowed) {
				return {
					content: [{ type: "text", text: `[LTM Data Governance] ${access.reason}` }],
					details: { success: false, error: access.reason },
				};
			}

			const collection = resolveCollection(config, params.scope ?? "memories");
			const client = new PrismClient(config.connection);
			const escapedQuery = escapePrismQuery(params.text);

			let searchResult: unknown;
			try {
				searchResult = await client.search(collection, {
					query: escapedQuery,
					limit: 1,
				});
			} catch (searchError) {
				return {
					content: [
						{
							type: "text",
							text: `Search error while finding memory to delete: ${formatError(searchError)}`,
						},
					],
					details: { success: false, error: formatError(searchError) },
				};
			}

			const hits = normalizeRecallHits(searchResult, 1);
			if (hits.length === 0) {
				return {
					content: [{ type: "text", text: `No memory found matching: "${params.text}"` }],
					details: { success: false, error: "not_found" },
				};
			}

			const hit = hits[0];
			try {
				const deleted = await client.deleteDocument(collection, hit.id);
				return {
					content: [
						{
							type: "text",
							text: `Forgot: "${hit.text.slice(0, 120)}${hit.text.length > 120 ? "..." : ""}" (id: ${hit.id})`,
						},
					],
					details: { success: true, id: hit.id, collection, deleted },
				};
			} catch (deleteError) {
				return {
					content: [
						{
							type: "text",
							text: `Failed to delete memory (id: ${hit.id}): ${formatError(deleteError)}`,
						},
					],
					details: { success: false, error: formatError(deleteError), id: hit.id },
				};
			}
		},
	});

	pi.on("before_agent_start", async (event, ctx) => {
		const parts = [event.systemPrompt, memoryStartupGuidance()];
		try {
			const currentProvider = ctx.model?.provider;
			const block = await recallForInjection(event.prompt ?? "", { cwd: ctx.cwd, currentProvider });
			if (block) parts.push(block);
		} catch {
			// inject is best-effort
		}
		return { systemPrompt: parts.join("\n\n") };
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

	// Ambient rolling session sync (nmem pattern → Prism ltm-sessions).
	installAmbientSync(pi);

	// Atelier sidebar status — show Prism connection state
	const MEM_STATUS_KEY = "mm-memory";
	let sessionRecalls = 0;
	let sessionRemembers = 0;

	const emitMemStatus = (ctx: { hasUI: boolean; ui: { setStatus: (k: string, v: string) => void } }) => {
		const config = loadMemoryConfig();
		const connected = Boolean(config.connection.baseUrl && config.connection.apiKey);
		if (!connected) {
			ctx.ui.setStatus(MEM_STATUS_KEY, "💾 ltm: —");
			pi.events.emit("atelier:memory-status", { key: "mm-memory", line: "💾 ltm: —" });
			return;
		}
		const parts = ["💾 ltm"];
		if (sessionRecalls > 0) parts.push(`↓${sessionRecalls}`);
		if (sessionRemembers > 0) parts.push(`↑${sessionRemembers}`);
		const text = parts.join(" ");
		ctx.ui.setStatus(MEM_STATUS_KEY, text);
		pi.events.emit("atelier:memory-status", { key: "mm-memory", line: text });
	};

	pi.on("session_start", async (_event, ctx) => {
		sessionRecalls = 0;
		sessionRemembers = 0;
		if (ctx.hasUI) emitMemStatus(ctx);
	});

	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName === "memory_recall" || event.toolName === "memory_sessions") {
			sessionRecalls++;
			if (ctx.hasUI) emitMemStatus(ctx);
		} else if (event.toolName === "memory_remember" || event.toolName === "memory_mine") {
			sessionRemembers++;
			if (ctx.hasUI) emitMemStatus(ctx);
		}
	});
}
