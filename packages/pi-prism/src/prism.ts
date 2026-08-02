import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { PrismApiError, PrismClient, truncateJson } from "./client.js";
import {
	formatStatusSummary,
	loadPrismConfig,
	parseConfigArgs,
	prismConfigPath,
	updateActiveProfile,
	upsertProfile,
	useProfile,
} from "./config.js";

function client(): PrismClient {
	return new PrismClient(loadPrismConfig());
}

function resolveCollection(explicit: string | undefined): string {
	const collection = explicit?.trim() || loadPrismConfig().defaultCollection;
	if (!collection) {
		throw new Error(
			"collection is required (pass collection, set PRISM_COLLECTION, or defaultCollection in ~/.pi/agent/pi-prism.json)",
		);
	}
	return collection;
}

function formatError(error: unknown): string {
	if (error instanceof PrismApiError) return error.message;
	if (error instanceof Error) return error.message;
	return String(error);
}

async function runHealthCheck(): Promise<string> {
	const config = loadPrismConfig();
	const api = new PrismClient(config);
	try {
		const [health, info] = await Promise.all([api.health(), api.serverInfo()]);
		return [
			formatStatusSummary(config),
			"",
			truncateJson({ ok: true, health, server: info }, 6_000),
		].join("\n");
	} catch (error) {
		return [
			formatStatusSummary(config),
			"",
			`health: FAILED — ${formatError(error)}`,
		].join("\n");
	}
}

async function handleConfigCommand(
	args: string,
	ctx: ExtensionCommandContext,
): Promise<void> {
	const parsed = parseConfigArgs(args);

	if (parsed.kind === "error") {
		ctx.ui.notify(parsed.message, "error");
		return;
	}

	if (parsed.kind === "show") {
		if (ctx.mode === "tui" && ctx.hasUI && typeof ctx.ui.select === "function") {
			const choice = await ctx.ui.select("Prism config", [
				"Show current config",
				"Set URL",
				"Set API key",
				"Set default collection",
				"Switch profile",
				"Test connection",
				"Clear API key",
			]);
			if (!choice || choice === "Show current config") {
				ctx.ui.notify(formatStatusSummary(loadPrismConfig()), "info");
				return;
			}
			if (choice === "Test connection") {
				ctx.ui.notify(await runHealthCheck(), "info");
				return;
			}
			if (choice === "Clear API key") {
				updateActiveProfile({ clearApiKey: true });
				ctx.ui.notify(`API key cleared on profile ${loadPrismConfig().activeProfile}`, "info");
				return;
			}
			if (choice === "Switch profile") {
				const config = loadPrismConfig();
				const profiles = Object.keys(config.profiles);
				const selected = await ctx.ui.select("Active Prism profile", profiles);
				if (!selected) return;
				useProfile(selected);
				ctx.ui.notify(await runHealthCheck(), "info");
				return;
			}
			if (
				choice === "Set URL" ||
				choice === "Set API key" ||
				choice === "Set default collection"
			) {
				const field =
					choice === "Set URL" ? "url" : choice === "Set API key" ? "apiKey" : "collection";
				const prompt =
					field === "url"
						? "Prism base URL"
						: field === "apiKey"
							? "Prism API key"
							: "Default collection";
				const value =
					typeof ctx.ui.input === "function"
						? await ctx.ui.input(prompt, field === "apiKey" ? "optional token" : undefined)
						: undefined;
				if (!value?.trim()) {
					ctx.ui.notify("Cancelled — no value provided", "error");
					return;
				}
				if (field === "url") updateActiveProfile({ baseUrl: value.trim() });
				else if (field === "apiKey") updateActiveProfile({ apiKey: value.trim() });
				else updateActiveProfile({ defaultCollection: value.trim() });
				ctx.ui.notify(await runHealthCheck(), "info");
				return;
			}
			return;
		}
		ctx.ui.notify(formatStatusSummary(loadPrismConfig()), "info");
		return;
	}

	if (parsed.kind === "test") {
		ctx.ui.notify(await runHealthCheck(), "info");
		return;
	}

	if (parsed.kind === "use") {
		useProfile(parsed.profile);
		ctx.ui.notify(await runHealthCheck(), "info");
		return;
	}

	if (parsed.kind === "profile-upsert") {
		upsertProfile(parsed.name);
		ctx.ui.notify(
			`Profile "${parsed.name}" upserted. Switch with /prism config use ${parsed.name}`,
			"info",
		);
		return;
	}

	if (parsed.kind === "clear-api-key") {
		updateActiveProfile({ clearApiKey: true });
		ctx.ui.notify(`API key cleared on profile ${loadPrismConfig().activeProfile}`, "info");
		return;
	}

	if (parsed.kind === "set") {
		if (parsed.field === "url") updateActiveProfile({ baseUrl: parsed.value });
		else if (parsed.field === "apiKey") updateActiveProfile({ apiKey: parsed.value });
		else if (parsed.field === "collection") {
			updateActiveProfile({ defaultCollection: parsed.value });
		} else if (parsed.field === "timeout") {
			const timeoutMs = Number(parsed.value);
			if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
				ctx.ui.notify("timeout must be a positive number (ms)", "error");
				return;
			}
			updateActiveProfile({ timeoutMs });
		}
		ctx.ui.notify(await runHealthCheck(), "info");
	}
}

export default function piPrism(pi: ExtensionAPI): void {
	pi.registerCommand("prism", {
		description: "Prism search engine status, config, and quick actions",
		getArgumentCompletions: async (prefix) => {
			const options = [
				"status",
				"collections",
				"config",
				"config show",
				"config test",
				"config use ",
				"config set url ",
				"config set apiKey ",
				"config set collection ",
				"config set timeout ",
				"config clear apiKey",
				"config profile upsert ",
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
							"/prism status — profile + health",
							"/prism collections — list collections",
							"/prism config — show/edit remote profiles",
							"/prism config set url https://prism.example.com",
							"/prism config use remote",
							"Tools: prism_search, prism_get, prism_index, prism_graph_*",
							`Config file: ${prismConfigPath()}`,
						].join("\n"),
						"info",
					);
					return;
				}

				if (verb === "config") {
					await handleConfigCommand(rest.join(" "), ctx);
					return;
				}

				if (verb === "collections") {
					const collections = await client().listCollections();
					ctx.ui.notify(truncateJson(collections, 8_000), "info");
					return;
				}

				if (verb !== "status") {
					ctx.ui.notify(
						`Unknown /prism action: ${verb}. Try status|collections|config|help`,
						"error",
					);
					return;
				}

				ctx.ui.notify(await runHealthCheck(), "info");
			} catch (error) {
				ctx.ui.notify(formatError(error), "error");
			}
		},
	});

	pi.registerTool({
		name: "prism_health",
		label: "Prism health",
		description: "Check Prism server health and basic server info at the configured base URL.",
		parameters: Type.Object({}),
		async execute() {
			return { content: [{ type: "text", text: await runHealthCheck() }], details: {} };
		},
	});

	pi.registerTool({
		name: "prism_collections",
		label: "Prism collections",
		description: "List Prism collections available on the configured server.",
		parameters: Type.Object({}),
		async execute() {
			const api = client();
			const collections = await api.listCollections();
			return {
				content: [{ type: "text", text: truncateJson(collections) }],
				details: {},
			};
		},
	});

	pi.registerTool({
		name: "prism_search",
		label: "Prism search",
		description:
			"Hybrid full-text/vector search in a Prism collection. Prefer this over Elasticsearch for local/project search.",
		parameters: Type.Object({
			query: Type.String({ description: "Search query text" }),
			collection: Type.Optional(Type.String({ description: "Collection name" })),
			limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
			offset: Type.Optional(Type.Integer({ minimum: 0 })),
			fields: Type.Optional(Type.Array(Type.String())),
			merge_strategy: Type.Optional(StringEnum(["rrf", "weighted"] as const)),
			text_weight: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
			vector_weight: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
			all_collections: Type.Optional(
				Type.Boolean({
					description: "If true, use POST /api/search across collections instead of one collection",
				}),
			),
		}),
		async execute(_toolCallId, params) {
			const api = client();
			const limit = params.limit ?? 10;
			if (params.all_collections) {
				const result = await api.simpleSearch({ query: params.query, limit });
				return { content: [{ type: "text", text: truncateJson(result) }], details: {} };
			}
			const collection = resolveCollection(params.collection);
			const result = await api.search(collection, {
				query: params.query,
				limit,
				offset: params.offset,
				fields: params.fields,
				merge_strategy: params.merge_strategy,
				text_weight: params.text_weight,
				vector_weight: params.vector_weight,
			});
			return { content: [{ type: "text", text: truncateJson(result) }], details: {} };
		},
	});

	pi.registerTool({
		name: "prism_get",
		label: "Prism get document",
		description: "Fetch one Prism document by collection and id.",
		parameters: Type.Object({
			id: Type.String({ description: "Document id" }),
			collection: Type.Optional(Type.String({ description: "Collection name" })),
		}),
		async execute(_toolCallId, params) {
			const api = client();
			const collection = resolveCollection(params.collection);
			const doc = await api.getDocument(collection, params.id);
			return { content: [{ type: "text", text: truncateJson(doc) }], details: {} };
		},
	});

	pi.registerTool({
		name: "prism_index",
		label: "Prism index documents",
		description:
			"Index one or more documents into a Prism collection. Each document must include an id and fields matching the collection schema.",
		parameters: Type.Object({
			collection: Type.Optional(Type.String({ description: "Collection name" })),
			documents: Type.Array(Type.Unknown(), {
				minItems: 1,
				description: "Documents to index (objects with id + fields)",
			}),
		}),
		async execute(_toolCallId, params) {
			const api = client();
			const collection = resolveCollection(params.collection);
			const result = await api.indexDocuments(collection, params.documents);
			return {
				content: [
					{
						type: "text",
						text: truncateJson({
							collection,
							indexed: params.documents.length,
							result,
						}),
					},
				],
				details: {},
			};
		},
	});

	pi.registerTool({
		name: "prism_graph_stats",
		label: "Prism graph stats",
		description: "Get node/edge counts for a Prism collection graph backend.",
		parameters: Type.Object({
			collection: Type.Optional(Type.String()),
		}),
		async execute(_toolCallId, params) {
			const api = client();
			const collection = resolveCollection(params.collection);
			const stats = await api.graphStats(collection);
			return { content: [{ type: "text", text: truncateJson(stats) }], details: {} };
		},
	});

	pi.registerTool({
		name: "prism_graph_bfs",
		label: "Prism graph BFS",
		description: "Breadth-first traversal from a start node in a Prism graph collection.",
		parameters: Type.Object({
			start: Type.String({ description: "Start node id" }),
			collection: Type.Optional(Type.String()),
			edge_type: Type.Optional(Type.String()),
			max_depth: Type.Optional(Type.Integer({ minimum: 1, maximum: 32 })),
		}),
		async execute(_toolCallId, params) {
			const api = client();
			const collection = resolveCollection(params.collection);
			const result = await api.graphBfs(collection, {
				start: params.start,
				edge_type: params.edge_type,
				max_depth: params.max_depth,
			});
			return { content: [{ type: "text", text: truncateJson(result) }], details: {} };
		},
	});

	pi.registerTool({
		name: "prism_graph_path",
		label: "Prism shortest path",
		description: "Find the shortest path between two nodes in a Prism graph collection.",
		parameters: Type.Object({
			start: Type.String(),
			target: Type.String(),
			collection: Type.Optional(Type.String()),
			edge_types: Type.Optional(Type.Array(Type.String())),
		}),
		async execute(_toolCallId, params) {
			const api = client();
			const collection = resolveCollection(params.collection);
			const result = await api.graphShortestPath(collection, {
				start: params.start,
				target: params.target,
				edge_types: params.edge_types,
			});
			return { content: [{ type: "text", text: truncateJson(result) }], details: {} };
		},
	});

	pi.registerTool({
		name: "prism_graph_edges",
		label: "Prism graph edges",
		description: "List outgoing edges from a Prism graph node.",
		parameters: Type.Object({
			node_id: Type.String(),
			collection: Type.Optional(Type.String()),
		}),
		async execute(_toolCallId, params) {
			const api = client();
			const collection = resolveCollection(params.collection);
			const result = await api.graphEdges(collection, params.node_id);
			return { content: [{ type: "text", text: truncateJson(result) }], details: {} };
		},
	});
}
