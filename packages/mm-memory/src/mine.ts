import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join, relative } from "node:path";
import {
	buildRememberDocument,
	projectFromCwd,
	type MemoryKind,
} from "./documents.js";
import { type MemoryConfig, loadMemoryConfig } from "./config.js";
import { PrismClient } from "./prism-client.js";
import { resolveCollection } from "./memory.js";

const TEXT_EXTS = new Set([
	".md",
	".txt",
	".rst",
	".org",
	".json",
	".yaml",
	".yml",
	".toml",
	".ts",
	".tsx",
	".js",
	".jsx",
	".mjs",
	".cjs",
	".py",
	".rs",
	".go",
	".ex",
	".exs",
	".java",
	".kt",
	".swift",
	".c",
	".h",
	".cpp",
	".hpp",
	".css",
	".html",
	".xml",
	".sql",
	".sh",
	".bash",
	".zsh",
	".env.example",
]);

const SKIP_DIRS = new Set([
	"node_modules",
	".git",
	".hg",
	".svn",
	"dist",
	"build",
	".next",
	"coverage",
	"__pycache__",
	".venv",
	"venv",
	"target",
	".turbo",
	".cache",
]);

const MAX_FILE_BYTES = 64_000;
const MAX_FILES_DEFAULT = 40;
const CHUNK_CHARS = 3_500;

export interface MineOptions {
	path: string;
	cwd?: string;
	project?: string;
	kind?: MemoryKind;
	tags?: string[];
	maxFiles?: number;
	scope?: "memories" | "sessions";
	config?: MemoryConfig;
}

export interface MineResult {
	root: string;
	project: string;
	collection: string;
	filesScanned: number;
	filesIndexed: number;
	chunksIndexed: number;
	skipped: Array<{ path: string; reason: string }>;
	documentIds: string[];
}

function isTextCandidate(filePath: string): boolean {
	const base = basename(filePath);
	if (base === "AGENTS.md" || base === "CLAUDE.md" || base === "README.md") return true;
	const ext = extname(filePath).toLowerCase();
	return TEXT_EXTS.has(ext);
}

function walkFiles(root: string, maxFiles: number): string[] {
	const out: string[] = [];
	const stack = [root];
	while (stack.length > 0 && out.length < maxFiles) {
		const dir = stack.pop()!;
		let entries;
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			if (out.length >= maxFiles) break;
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
				stack.push(full);
				continue;
			}
			if (!entry.isFile()) continue;
			if (!isTextCandidate(full)) continue;
			out.push(full);
		}
	}
	return out;
}

function chunkText(text: string, size = CHUNK_CHARS): string[] {
	const trimmed = text.trim();
	if (!trimmed) return [];
	if (trimmed.length <= size) return [trimmed];
	const chunks: string[] = [];
	for (let i = 0; i < trimmed.length; i += size) {
		chunks.push(trimmed.slice(i, i + size));
	}
	return chunks;
}

function kindForPath(filePath: string, fallback: MemoryKind): MemoryKind {
	const base = basename(filePath).toLowerCase();
	if (base.includes("decision")) return "decision";
	if (base.includes("prefer")) return "preference";
	if (base.endsWith(".md") && (base.includes("readme") || base.includes("agents"))) {
		return "insight";
	}
	return fallback;
}

export function collectMineDocuments(opts: MineOptions): {
	root: string;
	project: string;
	scope: "memories" | "sessions";
	files: string[];
	skipped: MineResult["skipped"];
	documents: Array<{ id: string; fields: Record<string, string> }>;
} {
	const root = opts.path.trim();
	if (!root) throw new Error("path is required");
	let st;
	try {
		st = statSync(root);
	} catch {
		throw new Error(`path not found: ${root}`);
	}

	const project = (opts.project?.trim() || projectFromCwd(opts.cwd || root)).trim() || "global";
	const maxFiles = opts.maxFiles ?? MAX_FILES_DEFAULT;
	const kindFallback = opts.kind ?? "note";
	const scope = opts.scope ?? "memories";
	const tags = opts.tags ?? ["mined"];

	const files = st.isDirectory() ? walkFiles(root, maxFiles) : [root];
	const skipped: MineResult["skipped"] = [];
	const documents: Array<{ id: string; fields: Record<string, string> }> = [];

	for (const filePath of files) {
		let size = 0;
		try {
			size = statSync(filePath).size;
		} catch {
			skipped.push({ path: filePath, reason: "stat failed" });
			continue;
		}
		if (size > MAX_FILE_BYTES) {
			skipped.push({ path: filePath, reason: `too large (${size} bytes)` });
			continue;
		}
		let raw: string;
		try {
			raw = readFileSync(filePath, "utf8");
		} catch {
			skipped.push({ path: filePath, reason: "read failed" });
			continue;
		}
		if (!raw.trim()) {
			skipped.push({ path: filePath, reason: "empty" });
			continue;
		}

		const rel = st.isDirectory() ? relative(root, filePath) : basename(filePath);
		const kind = kindForPath(filePath, kindFallback);
		const chunks = chunkText(raw);
		chunks.forEach((chunk, index) => {
			const text = `[${rel}${chunks.length > 1 ? `#${index + 1}` : ""}]\n${chunk}`;
			const doc = buildRememberDocument(
				{
					text,
					kind,
					project,
					tags: [...tags, "mine"],
					source: `memory_mine:${rel}`,
					id: `ltm_${createHash("sha256").update(`${project}\0${rel}\0${index}\0${chunk}`).digest("hex").slice(0, 24)}`,
					scope,
				},
				opts.cwd,
			);
			documents.push({
				id: doc.id,
				fields: {
					text: doc.text,
					kind: doc.kind,
					project: doc.project,
					tags: doc.tags.join(","),
					created_at: doc.created_at,
					source: doc.source,
				},
			});
		});
	}

	return { root, project, scope, files, skipped, documents };
}

export async function minePath(opts: MineOptions): Promise<MineResult> {
	const config = opts.config ?? loadMemoryConfig();
	const collected = collectMineDocuments(opts);
	const collection = resolveCollection(config, collected.scope);
	const client = new PrismClient(config.connection);
	const batchSize = 20;
	for (let i = 0; i < collected.documents.length; i += batchSize) {
		const batch = collected.documents.slice(i, i + batchSize);
		await client.indexDocuments(collection, batch);
	}

	return {
		root: collected.root,
		project: collected.project,
		collection,
		filesScanned: collected.files.length,
		filesIndexed: collected.files.length - collected.skipped.length,
		chunksIndexed: collected.documents.length,
		skipped: collected.skipped,
		documentIds: collected.documents.map((d) => d.id),
	};
}
