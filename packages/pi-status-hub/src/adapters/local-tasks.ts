import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { TaskRecord } from "../types.ts";

function currentSessionId(): string {
  const raw = process.env.PI_SESSION_ID || process.env.PI_SESSION || "default";
  return raw.trim().replace(/[^a-zA-Z0-9._-]/g, "_") || "default";
}

function taskPath(scope: "session" | "project"): string {
  return scope === "session"
    ? join(process.cwd(), ".pi", "tasks", "sessions", `${currentSessionId()}.md`)
    : join(process.cwd(), ".pi", "tasks", "project.md");
}

function parseStatus(marker: string): string {
  if (marker === "[*]") return "done";
  if (marker === "[~]") return "in_progress";
  return "pending";
}

export function readTasks(scope: "session" | "project"): TaskRecord[] {
  const path = taskPath(scope);
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, "utf8");
  const tasks: TaskRecord[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*-\s*(\[ \]|\[\*\]|\[~\])\s+(.*?)(?:\s+<!--\s*pi-task:([^\s]+)\s*-->)?\s*$/);
    if (!match) continue;
    tasks.push({
      source: scope,
      id: match[3] || `${scope}-${tasks.length + 1}`,
      title: (match[2] || "").trim(),
      status: parseStatus(match[1] || "[ ]"),
    });
  }
  return tasks;
}
