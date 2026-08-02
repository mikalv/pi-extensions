import {
	type MemoryConfig,
	LTM_MEMORIES_COLLECTION,
	LTM_SESSIONS_COLLECTION,
	loadMemoryConfig,
} from "./config.js";
import {
	buildRememberDocument,
	formatRecallForPrompt,
	normalizeRecallHits,
	type RememberInput,
} from "./documents.js";
import { PrismClient, truncateJson } from "./prism-client.js";

export function createClient(config = loadMemoryConfig()): PrismClient {
	return new PrismClient(config.connection);
}

export function resolveCollection(
	config: MemoryConfig,
	scope: "memories" | "sessions" = "memories",
): string {
	return scope === "sessions" ? config.sessionsCollection : config.memoriesCollection;
}

export async function remember(
	input: RememberInput,
	opts: { cwd?: string; config?: MemoryConfig } = {},
): Promise<{ collection: string; document: ReturnType<typeof buildRememberDocument>; result: unknown }> {
	const config = opts.config ?? loadMemoryConfig();
	const document = buildRememberDocument(input, opts.cwd);
	const scope =
		input.scope ??
		(document.kind === "session_summary" ? "sessions" : "memories");
	const collection = resolveCollection(config, scope);
	const client = createClient(config);
	const indexed = {
		id: document.id,
		fields: {
			text: document.text,
			kind: document.kind,
			project: document.project,
			tags: document.tags.join(","),
			created_at: document.created_at,
			source: document.source,
		},
	};
	const result = await client.indexDocuments(collection, [indexed]);
	return { collection, document, result };
}

export interface RecallScope {
	cwd?: string;
	config?: MemoryConfig;
	limit?: number;
	scope?: "memories" | "sessions" | "both";
	/** Wing-like filter: project slug */
	project?: string;
	/** Room-like filter: memory kind */
	kind?: string;
	/** Extra tag filters (all must match when present on a hit) */
	tags?: string[];
}

function buildScopedQuery(query: string, opts: RecallScope): string {
	const parts = [query.trim()];
	if (opts.project?.trim()) parts.push(`project:${opts.project.trim()}`);
	if (opts.kind?.trim()) parts.push(`kind:${opts.kind.trim()}`);
	for (const tag of opts.tags ?? []) {
		const t = tag.trim();
		if (t) parts.push(`tag:${t}`);
	}
	return parts.join(" ");
}

function hitMatchesScope(
	hit: ReturnType<typeof normalizeRecallHits>[number],
	opts: RecallScope,
): boolean {
	// Only enforce filters when the hit actually carries that metadata.
	// Missing fields still pass — the scoped query string already biases retrieval.
	if (opts.project?.trim() && hit.project) {
		const want = opts.project.trim().toLowerCase();
		if (hit.project.toLowerCase() !== want) return false;
	}
	if (opts.kind?.trim() && hit.kind) {
		const want = opts.kind.trim().toLowerCase();
		if (hit.kind.toLowerCase() !== want) return false;
	}
	if (opts.tags && opts.tags.length > 0 && hit.tags && hit.tags.length > 0) {
		const have = new Set(hit.tags.map((t) => t.toLowerCase()));
		for (const tag of opts.tags) {
			const t = tag.trim().toLowerCase();
			if (t && !have.has(t)) return false;
		}
	}
	return true;
}

export async function recall(
	query: string,
	opts: RecallScope = {},
): Promise<{
	query: string;
	scopedQuery: string;
	hits: ReturnType<typeof normalizeRecallHits>;
	collections: string[];
	filters: { project?: string; kind?: string; tags?: string[] };
}> {
	const q = query.trim();
	if (!q) throw new Error("query is required");
	const config = opts.config ?? loadMemoryConfig();
	const limit = opts.limit ?? 8;
	const scope = opts.scope ?? "memories";
	const collections =
		scope === "both"
			? [config.memoriesCollection, config.sessionsCollection]
			: [resolveCollection(config, scope)];

	const client = createClient(config);
	const scopedQuery = buildScopedQuery(q, opts);
	// Over-fetch when filtering so post-filter still has enough hits
	const fetchLimit = opts.project || opts.kind || (opts.tags && opts.tags.length)
		? Math.min(50, limit * 3)
		: limit;

	const chunks = await Promise.all(
		collections.map(async (collection) => {
			try {
				const raw = await client.search(collection, { query: scopedQuery, limit: fetchLimit });
				return normalizeRecallHits(raw, fetchLimit);
			} catch {
				return [];
			}
		}),
	);

	const merged = chunks
		.flat()
		.filter((hit) => hitMatchesScope(hit, opts))
		.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
		.slice(0, limit);

	return {
		query: q,
		scopedQuery,
		hits: merged,
		collections,
		filters: {
			...(opts.project?.trim() ? { project: opts.project.trim() } : {}),
			...(opts.kind?.trim() ? { kind: opts.kind.trim() } : {}),
			...(opts.tags?.length ? { tags: opts.tags } : {}),
		},
	};
}

export async function recallForInjection(
	prompt: string,
	opts: { cwd?: string; config?: MemoryConfig } = {},
): Promise<string | undefined> {
	const config = opts.config ?? loadMemoryConfig();
	if (!config.injectOnStart) return undefined;
	const project = opts.cwd ? opts.cwd.split(/[/\\]/).filter(Boolean).at(-1) : undefined;
	const query = prompt.trim().slice(0, 400) || project || "recent preferences decisions";
	const { hits } = await recall(query, {
		cwd: opts.cwd,
		config,
		limit: config.injectLimit,
		scope: config.injectCollection,
		project,
	});
	const block = formatRecallForPrompt(hits);
	return block || undefined;
}

export function formatRememberResult(payload: Awaited<ReturnType<typeof remember>>): string {
	return truncateJson(
		{
			ok: true,
			collection: payload.collection,
			document: payload.document,
			result: payload.result,
		},
		8_000,
	);
}

export function formatRecallResult(payload: Awaited<ReturnType<typeof recall>>): string {
	return truncateJson(
		{
			ok: true,
			query: payload.query,
			scopedQuery: payload.scopedQuery,
			filters: payload.filters,
			collections: payload.collections,
			count: payload.hits.length,
			hits: payload.hits,
			defaults: {
				memories: LTM_MEMORIES_COLLECTION,
				sessions: LTM_SESSIONS_COLLECTION,
			},
		},
		12_000,
	);
}
