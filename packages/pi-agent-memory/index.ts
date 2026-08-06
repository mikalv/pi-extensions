/**
 * pi-agent-memory — Per-agent-type persistent memory.
 *
 * Ported from Claude Code's agentMemory.ts concept (file-based, per-type,
 * scoped to user/project/local). Each agent type gets a directory with a
 * MEMORY.md index plus individual memory files. Agents opt in by listing
 * `read_agent_memory` / `save_agent_memory` in their frontmatter `tools`.
 *
 * Directory layout:
 *   user scope    ~/.pi/agent/agent-memory/<agentType>/MEMORY.md (+ *.md)
 *   project scope <cwd>/.pi/agent-memory/<agentType>/MEMORY.md (+ *.md)
 *   local scope   <cwd>/.pi/agent-memory-local/<agentType>/MEMORY.md (+ *.md)
 *
 * A memory file is markdown with optional frontmatter:
 *   ---
 *   name: short title
 *   description: one-line hook
 *   type: user | feedback | project | reference
 *   ---
 *   <body>
 *
 * MEMORY.md is a flat index, one pointer per line:
 *   - [Title](file.md) — one-line hook
 */

import { type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";
import * as path from "node:path";
import { homedir } from "node:os";

type Scope = "user" | "project" | "local";

const SEP = path.sep;

/** Replace characters that are unsafe as a directory name (cross-platform). */
function sanitizeAgentTypeForPath(agentType: string): string {
	return agentType.replace(/[:<>"/\\|?*]/g, "-").replace(/\s+/g, "-");
}

/** Resolve the memory directory for an agent type and scope. */
function getAgentMemoryDir(agentType: string, scope: Scope, cwd: string): string {
	const dirName = sanitizeAgentTypeForPath(agentType);
	const base = homedir();
	switch (scope) {
		case "user":
			return path.join(base, ".pi", "agent", "agent-memory", dirName) + SEP;
		case "project":
			return path.join(cwd, ".pi", "agent-memory", dirName) + SEP;
		case "local":
			return path.join(cwd, ".pi", "agent-memory-local", dirName) + SEP;
	}
}

function ensureDir(dir: string): void {
	fs.mkdirSync(dir, { recursive: true });
}

/** Read MEMORY.md index + memory file contents for a given agent+scope. */
function readMemory(
	agentType: string,
	scope: Scope,
	cwd: string,
): { index: string | null; files: Array<{ name: string; content: string }> } {
	const dir = getAgentMemoryDir(agentType, scope, cwd);
	const indexPath = path.join(dir, "MEMORY.md");
	let index: string | null = null;
	try {
		index = fs.readFileSync(indexPath, "utf-8");
	} catch {
		// no index yet
	}
	const files: Array<{ name: string; content: string }> = [];
	try {
		for (const entry of fs.readdirSync(dir)) {
			if (entry.endsWith(".md") && entry !== "MEMORY.md") {
				const fp = path.join(dir, entry);
				try {
					const content = fs.readFileSync(fp, "utf-8");
					files.push({ name: entry, content });
				} catch {
					// skip unreadable
				}
			}
		}
	} catch {
		// dir missing
	}
	return { index, files };
}

/** Render a prompt-style summary of memory for injection into a tool result. */
function renderMemory(agentType: string, scope: Scope, cwd: string): string {
	const { index, files } = readMemory(agentType, scope, cwd);
	const dir = getAgentMemoryDir(agentType, scope, cwd);
	const lines: string[] = [
		`# Persistent Agent Memory — ${agentType} [${scope}]`,
		`Directory: ${dir}`,
		"",
	];
	if (index) {
		lines.push("## MEMORY.md (index)", "", index.trim(), "");
	} else {
		lines.push(
			"## MEMORY.md (index)",
			"",
			"(empty — no memories saved yet)",
			"",
		);
	}
	if (files.length > 0) {
		lines.push(`## Memory files (${files.length})`, "");
		for (const f of files) {
			lines.push(`### ${f.name}`, "```md", f.content.trim(), "```", "");
		}
	} else if (index) {
		lines.push("(index references files but none found — may have been removed)", "");
	}
	return lines.join("\n");
}

/** Write a memory file and update the index pointer. */
function saveMemory(
	agentType: string,
	scope: Scope,
	cwd: string,
	filename: string,
	title: string,
	hook: string,
	body: string,
): { path: string; indexUpdated: boolean } {
	const dir = getAgentMemoryDir(agentType, scope, cwd);
	ensureDir(dir);
	const safeName = filename.endsWith(".md") ? filename : `${filename}.md`;
	const safeNameClean = safeName.replace(/[/\\]/g, "-");
	const fp = path.join(dir, safeNameClean);
	const frontmatter = ["---", `name: ${title}`, `description: ${hook}`, "---", ""].join("\n");
	fs.writeFileSync(fp, frontmatter + body + "\n", "utf-8");

	// Update MEMORY.md index (dedupe by filename, append otherwise)
	const indexPath = path.join(dir, "MEMORY.md");
	let indexUpdated = false;
	let existing = "";
	try {
		existing = fs.readFileSync(indexPath, "utf-8");
	} catch {
		// create new
	}
	const pointer = `- [${title}](${safeNameClean}) — ${hook}`;
	const lines = existing.split("\n");
	const startMarker = `- [${title}](${safeNameClean})`;
	const idx = lines.findIndex((l) => l.startsWith(startMarker));
	if (idx >= 0) {
		lines[idx] = pointer;
		existing = lines.join("\n");
	} else {
		existing = existing.trimEnd() + (existing.trim() ? "\n" : "") + pointer + "\n";
	}
	fs.writeFileSync(indexPath, existing, "utf-8");
	indexUpdated = true;
	return { path: fp, indexUpdated };
}

export default function agentMemory(pi: ExtensionAPI) {
	pi.registerTool({
		name: "read_agent_memory",
		label: "Read Agent Memory",
		description: [
			"Read the persistent memory for a given agent type and scope.",
			"Returns the MEMORY.md index plus the contents of every memory file.",
			"Use this at the start of a run to recall prior learnings about this agent type's domain.",
			"",
			"Scopes:",
			"- user: ~/.pi/agent/agent-memory/<agentType>/ — general, cross-project learnings",
			"- project: <cwd>/.pi/agent-memory/<agentType>/ — shared via VCS, project-specific",
			"- local: <cwd>/.pi/agent-memory-local/<agentType>/ — not checked in, project+machine specific",
		].join("\n"),
		parameters: Type.Object({
			agent_type: Type.String({
				description: 'The agent type name (e.g. "worker", "coordinator", "verifier").',
			}),
			scope: Type.Optional(
				Type.Union(
					[
						Type.Literal("user"),
						Type.Literal("project"),
						Type.Literal("local"),
					],
					{
						description: "Memory scope. Defaults to 'project'.",
					},
				),
			),
		}),
		promptGuidelines: [
			"Call read_agent_memory at the start of a run to recall prior learnings for your agent type.",
			"If the directory is empty, treat it as a fresh start — do not fabricate memories.",
		],
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const agentType = String(params.agent_type ?? "").trim();
			const scope = (params.scope as Scope) ?? "project";
			if (!agentType) {
				return {
					content: [{ type: "text" as const, text: "Error: agent_type is required." }],
					details: { success: false, error: "missing_agent_type" },
				};
			}
			const cwd = process.cwd();
			try {
				const rendered = renderMemory(agentType, scope, cwd);
				return {
					content: [
						{
							type: "text" as const,
							text: rendered,
						},
					],
				};
			} catch (err) {
				return {
					content: [
						{
							type: "text" as const,
							text: `read_agent_memory error: ${err instanceof Error ? err.message : String(err)}`,
						},
					],
					details: { success: false, error: "read_failed" },
				};
			}
		},
	});

	pi.registerTool({
		name: "save_agent_memory",
		label: "Save Agent Memory",
		description: [
			"Save a memory for a given agent type and scope, writing a new .md file and updating the MEMORY.md index.",
			"Each memory should be a single durable fact, preference, or piece of project context.",
			"",
			"What to save:",
			"- User corrections and preferences ('use bun, not npm'; 'stop summarizing diffs')",
			"- Facts about the user, their role, or their goals",
			"- Project context not derivable from code (deadlines, decisions, rationale)",
			"- Pointers to external systems (dashboards, issue trackers, channels)",
			"- Anything the caller explicitly asks to remember",
			"",
			"What NOT to save:",
			"- Code patterns, architecture, or anything derivable from the current project state",
			"- Ephemeral task state or one-off decisions that won't recur",
		].join("\n"),
		parameters: Type.Object({
			agent_type: Type.String({
				description: 'The agent type name (e.g. "worker", "coordinator", "verifier").',
			}),
			filename: Type.String({
				description: 'Memory file name (e.g. "user_prefers_bun"). .md is appended if omitted.',
			}),
			title: Type.String({ description: "Short human-readable title." }),
			hook: Type.String({ description: "One-line summary (~150 chars) used as the index pointer." }),
			body: Type.String({ description: "Markdown body — the full memory content." }),
			scope: Type.Optional(
				Type.Union(
					[Type.Literal("user"), Type.Literal("project"), Type.Literal("local")],
					{ description: "Memory scope. Defaults to 'project'." },
				),
			),
		}),
		promptGuidelines: [
			"Save a memory only when you learn something durable — not for transient state.",
			"Before saving, check if an existing memory can be updated instead of creating a new one.",
			"One fact per file. Use the title and hook to make it findable in the index.",
		],
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const agentType = String(params.agent_type ?? "").trim();
			const filename = String(params.filename ?? "").trim();
			const title = String(params.title ?? "").trim();
			const hook = String(params.hook ?? "").trim();
			const body = String(params.body ?? "").trim();
			const scope = (params.scope as Scope) ?? "project";
			if (!agentType || !filename || !title || !hook || !body) {
				return {
					content: [
						{
							type: "text" as const,
							text: "Error: agent_type, filename, title, hook, and body are all required.",
						},
					],
					details: { success: false, error: "missing_fields" },
				};
			}
			const cwd = process.cwd();
			try {
				const { path: fp, indexUpdated } = saveMemory(
					agentType,
					scope,
					cwd,
					filename,
					title,
					hook,
					body,
				);
				return {
					content: [
						{
							type: "text" as const,
							text: `Saved memory to ${fp}\nIndex updated: ${indexUpdated}`,
						},
					],
				};
			} catch (err) {
				return {
					content: [
						{
							type: "text" as const,
							text: `save_agent_memory error: ${err instanceof Error ? err.message : String(err)}`,
						},
					],
					details: { success: false, error: "save_failed" },
				};
			}
		},
	});
}
