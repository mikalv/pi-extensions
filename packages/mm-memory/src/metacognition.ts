import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { recall } from "./memory.js";
import { loadMemoryConfig } from "./config.js";

export type ConfidenceLevel = "confident" | "uncertain" | "low_confidence";

export interface AssessResult {
	level: ConfidenceLevel;
	score: number;
	reason: string;
	gaps: string[];
	signals: {
		wikiHits: number;
		prismHits: number;
		knownGaps: number;
	};
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

function wikiRoot(): string {
	return process.env.MM_WIKI_DIR?.trim() || join(agentDir(), "wiki");
}

function gapsPath(): string {
	return join(agentDir(), "mm-knowledge-gaps.md");
}

function tokenize(text: string): string[] {
	return text
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((t) => t.length >= 3);
}

function wikiKeywordHits(topic: string): number {
	const root = wikiRoot();
	if (!existsSync(root)) return 0;
	const tokens = new Set(tokenize(topic));
	if (tokens.size === 0) return 0;
	let hits = 0;
	const stack = [root];
	while (stack.length > 0 && hits < 20) {
		const dir = stack.pop()!;
		let entries;
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				if (entry.name.startsWith(".")) continue;
				stack.push(full);
				continue;
			}
			if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
			try {
				const text = readFileSync(full, "utf8").toLowerCase();
				let score = 0;
				for (const token of tokens) {
					if (text.includes(token)) score += 1;
				}
				if (score >= Math.min(2, tokens.size)) hits += 1;
			} catch {
				// ignore unreadable files
			}
		}
	}
	return hits;
}

function readGaps(topic: string): string[] {
	const path = gapsPath();
	if (!existsSync(path)) return [];
	const tokens = tokenize(topic);
	return readFileSync(path, "utf8")
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.startsWith("- "))
		.map((line) => line.slice(2))
		.filter((line) => {
			const lower = line.toLowerCase();
			return tokens.some((t) => lower.includes(t));
		})
		.slice(0, 10);
}

export async function assessTopic(
	topic: string,
	opts: { cwd?: string; project?: string } = {},
): Promise<AssessResult> {
	const q = topic.trim();
	if (!q) {
		return {
			level: "low_confidence",
			score: 0,
			reason: "empty topic",
			gaps: [],
			signals: { wikiHits: 0, prismHits: 0, knownGaps: 0 },
		};
	}

	const project = opts.project || (opts.cwd ? basename(opts.cwd) : undefined);
	const wikiHits = wikiKeywordHits(q);
	let prismHits = 0;
	try {
		const config = loadMemoryConfig();
		const result = await recall(q, {
			cwd: opts.cwd,
			config,
			project,
			limit: 5,
			scope: "both",
		});
		prismHits = result.hits.length;
	} catch {
		prismHits = 0;
	}
	const gaps = readGaps(q);

	let score = 0;
	score += Math.min(0.45, wikiHits * 0.15);
	score += Math.min(0.45, prismHits * 0.12);
	score -= Math.min(0.35, gaps.length * 0.1);
	score = Math.max(0, Math.min(1, score));

	const level: ConfidenceLevel =
		score >= 0.55 ? "confident" : score >= 0.3 ? "uncertain" : "low_confidence";

	const reason =
		level === "confident"
			? `wiki=${wikiHits}, prism=${prismHits}`
			: level === "uncertain"
				? `partial coverage (wiki=${wikiHits}, prism=${prismHits}, gaps=${gaps.length})`
				: `weak coverage (wiki=${wikiHits}, prism=${prismHits}, gaps=${gaps.length})`;

	return {
		level,
		score,
		reason,
		gaps,
		signals: { wikiHits, prismHits, knownGaps: gaps.length },
	};
}

export function recordKnowledgeGap(description: string): string {
	const text = description.trim();
	if (!text) throw new Error("gap description is required");
	const path = gapsPath();
	mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
	const line = `- ${new Date().toISOString()} ${text.replace(/\s+/g, " ")}\n`;
	appendFileSync(path, line, "utf8");
	return path;
}

export function formatAssessResult(result: AssessResult): string {
	return JSON.stringify(result, null, 2);
}
