/**
 * Promote durable reflections into Prism LTM and the local wiki filesystem.
 * Intentionally duplicates a minimal Prism client (no extension-to-extension imports).
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import type { Reflection } from "./session-ledger/index.js";

const DEFAULT_PRISM_URL = "http://127.0.0.1:3080";
const LTM_COLLECTION = "ltm-memories";

export interface PromoteOptions {
	cwd?: string;
	reflections: Reflection[];
	/** When false, skip Prism index. Default true. */
	toPrism?: boolean;
	/** When false, skip wiki append. Default true. */
	toWiki?: boolean;
}

export interface PromoteResult {
	prismIndexed: number;
	wikiAppended: number;
	errors: string[];
}

function agentDir(): string {
	const envDir = process.env.PI_CODING_AGENT_DIR?.trim();
	if (envDir) {
		if (envDir === "~") return homedir();
		if (envDir.startsWith("~/")) return join(homedir(), envDir.slice(2));
		return envDir;
	}
	return join(homedir(), ".pi", "agent");
}

function loadPrismConnection(): { baseUrl: string; apiKey?: string; timeoutMs: number } {
	const envUrl = process.env.PRISM_URL?.trim() || process.env.PRISM_BASE_URL?.trim();
	const envKey = process.env.PRISM_API_KEY?.trim();
	let fileUrl: string | undefined;
	let fileKey: string | undefined;
	const path = join(agentDir(), "pi-prism.json");
	if (existsSync(path)) {
		try {
			const parsed = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
			if (parsed.profiles && typeof parsed.profiles === "object") {
				const active = typeof parsed.activeProfile === "string" ? parsed.activeProfile : "local";
				const profile = (parsed.profiles as Record<string, Record<string, unknown>>)[active];
				fileUrl = typeof profile?.baseUrl === "string" ? profile.baseUrl : undefined;
				fileKey = typeof profile?.apiKey === "string" ? profile.apiKey : undefined;
			} else {
				fileUrl = typeof parsed.baseUrl === "string" ? parsed.baseUrl : undefined;
				fileKey = typeof parsed.apiKey === "string" ? parsed.apiKey : undefined;
			}
		} catch {
			// ignore
		}
	}
	return {
		baseUrl: (envUrl || fileUrl || DEFAULT_PRISM_URL).replace(/\/+$/, ""),
		apiKey: envKey || fileKey,
		timeoutMs: 30_000,
	};
}

async function indexPrismDocuments(
	documents: Array<{ id: string; fields: Record<string, string> }>,
): Promise<void> {
	if (documents.length === 0) return;
	const conn = loadPrismConnection();
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), conn.timeoutMs);
	try {
		const headers: Record<string, string> = {
			Accept: "application/json",
			"Content-Type": "application/json",
		};
		if (conn.apiKey) headers.Authorization = `Bearer ${conn.apiKey}`;
		const response = await fetch(
			`${conn.baseUrl}/collections/${encodeURIComponent(LTM_COLLECTION)}/documents?sync=true`,
			{
				method: "POST",
				headers,
				body: JSON.stringify({ documents }),
				signal: controller.signal,
			},
		);
		if (!response.ok) {
			const body = await response.text();
			throw new Error(`Prism index failed (${response.status}): ${body.slice(0, 300)}`);
		}
	} finally {
		clearTimeout(timer);
	}
}

function wikiRoot(): string {
	const env = process.env.MM_WIKI_DIR?.trim();
	if (env) return env;
	return join(agentDir(), "wiki");
}

function projectSlug(cwd?: string): string {
	if (!cwd?.trim()) return "global";
	return basename(cwd.trim()) || "global";
}

function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 48) || "reflection";
}

function reflectionKind(content: string): "preference" | "decision" | "insight" {
	const lower = content.toLowerCase();
	if (/\b(prefer|preference|always|never)\b/.test(lower)) return "preference";
	if (/\b(decid|agreed|chosen|going with|we'll use)\b/.test(lower)) return "decision";
	return "insight";
}

/** Best-effort append of a reflection bullet into /areas/<project>.md wiki page. */
function appendWikiReflection(cwd: string | undefined, reflection: Reflection): boolean {
	const root = wikiRoot();
	const project = projectSlug(cwd);
	const areaSlug = slugify(project);
	const relPath = `/areas/${areaSlug}.md`;
	const abs = join(root, "areas", `${areaSlug}.md`);
	mkdirSync(dirname(abs), { recursive: true, mode: 0o700 });

	const bullet = `- [stated] ${reflection.content.trim().replace(/\s+/g, " ")} (om:${reflection.id})`;
	if (existsSync(abs)) {
		const current = readFileSync(abs, "utf8");
		if (current.includes(`om:${reflection.id}`)) return false;
		const next = current.endsWith("\n") ? `${current}${bullet}\n` : `${current}\n${bullet}\n`;
		writeFileSync(abs, next, "utf8");
		return true;
	}

	const content = [
		"---",
		`name: ${areaSlug}`,
		`description: Ongoing area context for ${project} (promoted from observational memory)`,
		"sources: [pi, om]",
		"---",
		"",
		bullet,
		"",
	].join("\n");
	writeFileSync(abs, content, "utf8");
	return true;
}

export async function promoteReflections(opts: PromoteOptions): Promise<PromoteResult> {
	const errors: string[] = [];
	let prismIndexed = 0;
	let wikiAppended = 0;
	const toPrism = opts.toPrism !== false;
	const toWiki = opts.toWiki !== false;
	const project = projectSlug(opts.cwd);

	if (toPrism) {
		try {
			const documents = opts.reflections.map((reflection) => {
				const kind = reflectionKind(reflection.content);
				const id = `ltm_${createHash("sha256")
					.update(`om\0${reflection.id}\0${reflection.content}`)
					.digest("hex")
					.slice(0, 24)}`;
				return {
					id,
					fields: {
						text: reflection.content,
						kind,
						project,
						tags: "om,reflection",
						created_at: new Date().toISOString(),
						source: `om_reflect:${reflection.id}`,
					},
				};
			});
			await indexPrismDocuments(documents);
			prismIndexed = documents.length;
		} catch (error) {
			errors.push(error instanceof Error ? error.message : String(error));
		}
	}

	if (toWiki) {
		for (const reflection of opts.reflections) {
			try {
				if (appendWikiReflection(opts.cwd, reflection)) wikiAppended += 1;
			} catch (error) {
				errors.push(error instanceof Error ? error.message : String(error));
			}
		}
	}

	return { prismIndexed, wikiAppended, errors };
}

export function promoteEnabledFromEnv(): { toPrism: boolean; toWiki: boolean } {
	const raw = process.env.MM_OM_PROMOTE?.trim().toLowerCase();
	if (raw === "0" || raw === "false" || raw === "off") return { toPrism: false, toWiki: false };
	if (raw === "prism") return { toPrism: true, toWiki: false };
	if (raw === "wiki") return { toPrism: false, toWiki: true };
	return { toPrism: true, toWiki: true };
}
