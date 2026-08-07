/** Minimal Prism HTTP client (duplicated intentionally — no extension-to-extension deps). */

export interface PrismConnection {
	baseUrl: string;
	timeoutMs: number;
	apiKey?: string;
}

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
	constructor(readonly config: PrismConnection) {}

	async health(): Promise<unknown> {
		return this.request("GET", "/health");
	}

	async search(
		collection: string,
		body: { query?: string; limit?: number; offset?: number },
	): Promise<unknown> {
		return this.request("POST", `/collections/${encodeURIComponent(collection)}/search`, body);
	}

	async indexDocuments(collection: string, documents: unknown[]): Promise<unknown> {
		return this.request(
			"POST",
			`/collections/${encodeURIComponent(collection)}/documents?sync=true`,
			{ documents },
		);
	}

	async deleteDocument(collection: string, id: string): Promise<unknown> {
		return this.request(
			"DELETE",
			`/collections/${encodeURIComponent(collection)}/documents/${encodeURIComponent(id)}`,
		);
	}

	private async request(method: string, path: string, body?: unknown): Promise<unknown> {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
		try {
			const headers: Record<string, string> = { Accept: "application/json" };
			if (body !== undefined) headers["Content-Type"] = "application/json";
			if (this.config.apiKey) headers.Authorization = `Bearer ${this.config.apiKey}`;

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

export function truncateJson(value: unknown, maxChars = 40_000): string {
	const text = JSON.stringify(value, null, 2);
	if (text.length <= maxChars) return text;
	return `${text.slice(0, maxChars)}\n\n[truncated ${text.length - maxChars} characters]`;
}
