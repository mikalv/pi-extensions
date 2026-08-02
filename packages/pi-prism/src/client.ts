import type { PrismConfig } from "./config.js";

export class PrismApiError extends Error {
	readonly status: number;
	readonly body: string;

	constructor(status: number, body: string, path: string) {
		super(`Prism ${path} failed (${status}): ${body.slice(0, 500)}`);
		this.name = "PrismApiError";
		this.status = status;
		this.body = body;
	}
}

export class PrismClient {
	readonly config: PrismConfig;

	constructor(config: PrismConfig) {
		this.config = config;
	}

	get baseUrl(): string {
		return this.config.baseUrl;
	}

	get defaultCollection(): string | undefined {
		return this.config.defaultCollection;
	}

	async health(): Promise<unknown> {
		return this.request("GET", "/health");
	}

	async serverInfo(): Promise<unknown> {
		return this.request("GET", "/");
	}

	async listCollections(): Promise<unknown> {
		return this.request("GET", "/admin/collections");
	}

	async search(
		collection: string,
		body: {
			query?: string;
			limit?: number;
			offset?: number;
			fields?: string[];
			merge_strategy?: string;
			text_weight?: number;
			vector_weight?: number;
			vector?: number[];
		},
	): Promise<unknown> {
		return this.request("POST", `/collections/${encodeURIComponent(collection)}/search`, body);
	}

	async simpleSearch(body: { query: string; limit?: number }): Promise<unknown> {
		return this.request("POST", "/api/search", body);
	}

	async getDocument(collection: string, id: string): Promise<unknown> {
		return this.request(
			"GET",
			`/collections/${encodeURIComponent(collection)}/documents/${encodeURIComponent(id)}`,
		);
	}

	async indexDocuments(collection: string, documents: unknown[]): Promise<unknown> {
		const normalized = documents.map((doc) => normalizeIndexDocument(doc));
		return this.request(
			"POST",
			`/collections/${encodeURIComponent(collection)}/documents?sync=true`,
			{ documents: normalized },
		);
	}

	async graphStats(collection: string): Promise<unknown> {
		return this.request(
			"GET",
			`/collections/${encodeURIComponent(collection)}/graph/stats`,
		);
	}

	async graphBfs(
		collection: string,
		body: { start: string; edge_type?: string; max_depth?: number },
	): Promise<unknown> {
		return this.request(
			"POST",
			`/collections/${encodeURIComponent(collection)}/graph/bfs`,
			body,
		);
	}

	async graphShortestPath(
		collection: string,
		body: { start: string; target: string; edge_types?: string[] },
	): Promise<unknown> {
		return this.request(
			"POST",
			`/collections/${encodeURIComponent(collection)}/graph/shortest-path`,
			body,
		);
	}

	async graphEdges(collection: string, nodeId: string): Promise<unknown> {
		return this.request(
			"GET",
			`/collections/${encodeURIComponent(collection)}/graph/nodes/${encodeURIComponent(nodeId)}/edges`,
		);
	}

	private async request(method: string, path: string, body?: unknown): Promise<unknown> {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
		try {
			const headers: Record<string, string> = {
				Accept: "application/json",
			};
			if (body !== undefined) {
				headers["Content-Type"] = "application/json";
			}
			if (this.config.apiKey) {
				headers.Authorization = `Bearer ${this.config.apiKey}`;
			}

			const response = await fetch(`${this.config.baseUrl}${path}`, {
				method,
				headers,
				body: body === undefined ? undefined : JSON.stringify(body),
				signal: controller.signal,
			});

			const text = await response.text();
			if (!response.ok) {
				throw new PrismApiError(response.status, text || response.statusText, path);
			}
			if (!text) return null;
			try {
				return JSON.parse(text) as unknown;
			} catch {
				return text;
			}
		} finally {
			clearTimeout(timer);
		}
	}
}

/** Prism 0.6 accepts `{ id, fields: {...} }`; flatten plain docs into that shape. */
function normalizeIndexDocument(doc: unknown): unknown {
	if (!doc || typeof doc !== "object" || Array.isArray(doc)) return doc;
	const record = doc as Record<string, unknown>;
	if (record.fields && typeof record.fields === "object") return doc;
	const { id, ...rest } = record;
	if (typeof id !== "string" || !id.trim()) return doc;
	return { id, fields: rest };
}

export function truncateJson(value: unknown, maxChars = 40_000): string {
	const text = JSON.stringify(value, null, 2);
	if (text.length <= maxChars) return text;
	return `${text.slice(0, maxChars)}\n\n[truncated ${text.length - maxChars} characters]`;
}
