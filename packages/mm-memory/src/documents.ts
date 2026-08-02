import { createHash } from "node:crypto";
import { basename } from "node:path";

export type MemoryKind =
	| "fact"
	| "preference"
	| "decision"
	| "insight"
	| "session_summary"
	| "follow_up"
	| "note";

export interface MemoryDocument {
	id: string;
	kind: MemoryKind;
	text: string;
	project: string;
	tags: string[];
	created_at: string;
	source: string;
}

export interface RememberInput {
	text: string;
	kind?: MemoryKind;
	project?: string;
	tags?: string[];
	source?: string;
	id?: string;
	/** Target collection role */
	scope?: "memories" | "sessions";
}

const KIND_SET = new Set<MemoryKind>([
	"fact",
	"preference",
	"decision",
	"insight",
	"session_summary",
	"follow_up",
	"note",
]);

export function normalizeKind(value: unknown, fallback: MemoryKind = "note"): MemoryKind {
	if (typeof value === "string" && KIND_SET.has(value as MemoryKind)) {
		return value as MemoryKind;
	}
	return fallback;
}

export function projectFromCwd(cwd: string | undefined): string {
	if (!cwd?.trim()) return "global";
	return basename(cwd.trim()) || "global";
}

export function contentHashId(text: string, project: string, kind: MemoryKind): string {
	const digest = createHash("sha256")
		.update(`${kind}\0${project}\0${text.trim()}`)
		.digest("hex")
		.slice(0, 24);
	return `ltm_${digest}`;
}

export function buildRememberDocument(input: RememberInput, cwd?: string): MemoryDocument {
	const text = input.text.trim();
	if (!text) throw new Error("text is required");

	const kind = normalizeKind(
		input.kind,
		input.scope === "sessions" ? "session_summary" : "note",
	);
	const project = (input.project?.trim() || projectFromCwd(cwd)).trim() || "global";
	const tags = (input.tags ?? [])
		.map((tag) => tag.trim())
		.filter((tag) => tag.length > 0);
	const source = input.source?.trim() || "memory_remember";
	const id = input.id?.trim() || contentHashId(text, project, kind);

	return {
		id,
		kind,
		text,
		project,
		tags,
		created_at: new Date().toISOString(),
		source,
	};
}

export function buildSessionSummaryDocument(input: {
	summary: string;
	project?: string;
	tags?: string[];
	source?: string;
}): MemoryDocument {
	return buildRememberDocument({
		text: input.summary,
		kind: "session_summary",
		project: input.project,
		tags: input.tags,
		source: input.source ?? "session_consolidator",
		scope: "sessions",
	});
}

/** Normalize heterogeneous Prism search hits into a stable recall shape. */
export function normalizeRecallHits(raw: unknown, limit: number): Array<{
	id: string;
	text: string;
	score?: number;
	kind?: string;
	project?: string;
	tags?: string[];
	source?: string;
	created_at?: string;
}> {
	const items = extractHitArray(raw).slice(0, Math.max(1, limit));
	return items.map((item, index) => {
		const record = asRecord(item) ?? {};
		const fields = asRecord(record.fields) ?? asRecord(record.document) ?? record;
		const id =
			asString(record.id) ||
			asString(fields.id) ||
			asString(record.document_id) ||
			`hit_${index}`;
		const text =
			asString(fields.text) ||
			asString(record.text) ||
			asString(fields.content) ||
			asString(record.content) ||
			JSON.stringify(fields);
		const score =
			asNumber(record.score) ?? asNumber(record._score) ?? asNumber(fields.score);
		const tagsRaw = fields.tags ?? record.tags;
		const tags = Array.isArray(tagsRaw)
			? tagsRaw.filter((t): t is string => typeof t === "string")
			: typeof tagsRaw === "string" && tagsRaw.trim()
				? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean)
				: undefined;
		return {
			id,
			text,
			...(score !== undefined ? { score } : {}),
			...(asString(fields.kind) || asString(record.kind)
				? { kind: asString(fields.kind) || asString(record.kind) }
				: {}),
			...(asString(fields.project) || asString(record.project)
				? { project: asString(fields.project) || asString(record.project) }
				: {}),
			...(tags ? { tags } : {}),
			...(asString(fields.source) || asString(record.source)
				? { source: asString(fields.source) || asString(record.source) }
				: {}),
			...(asString(fields.created_at) || asString(record.created_at)
				? { created_at: asString(fields.created_at) || asString(record.created_at) }
				: {}),
		};
	});
}

export function formatRecallForPrompt(
	hits: ReturnType<typeof normalizeRecallHits>,
	heading = "Long-term memory (Prism)",
): string {
	if (hits.length === 0) return "";
	const lines = hits.map((hit, i) => {
		const meta = [
			hit.kind,
			hit.project,
			hit.score !== undefined ? `score=${hit.score.toFixed(3)}` : undefined,
		]
			.filter(Boolean)
			.join(", ");
		return `${i + 1}. ${meta ? `[${meta}] ` : ""}${hit.text}`;
	});
	return [`## ${heading}`, ...lines].join("\n");
}

function extractHitArray(raw: unknown): unknown[] {
	if (Array.isArray(raw)) return raw;
	const record = asRecord(raw);
	if (!record) return [];
	for (const key of ["hits", "results", "documents", "items"]) {
		const value = record[key];
		if (Array.isArray(value)) return value;
	}
	return [];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
	return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
