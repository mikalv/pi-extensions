import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { MarkdownTask, MarkdownTaskStatus, TaskScope } from "./types.ts";

const TASKS_DIR = join(process.cwd(), ".pi", "tasks");
const SESSIONS_DIR = join(TASKS_DIR, "sessions");
const PROJECT_PATH = join(TASKS_DIR, "project.md");

let currentSessionId = "default";

function ensureFile(path: string, title: string): void {
  mkdirSync(dirname(path), { recursive: true });
  if (!existsSync(path)) {
    writeFileSync(path, `# ${title}\n\n`, "utf-8");
  }
}

export function setCurrentSessionId(sessionId: string | undefined): void {
  const trimmed = sessionId?.trim();
  if (!trimmed) return;
  currentSessionId = trimmed.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function getCurrentSessionId(): string {
  return currentSessionId;
}

export function pathForScope(scope: TaskScope): string {
  return scope === "session"
    ? join(SESSIONS_DIR, `${currentSessionId}.md`)
    : PROJECT_PATH;
}

export function readTaskFile(scope: TaskScope): string {
  const path = pathForScope(scope);
  ensureFile(path, scope === "session" ? "Session Todos" : "Project Tasks");
  return readFileSync(path, "utf-8");
}

export function writeTaskFile(scope: TaskScope, content: string): void {
  const path = pathForScope(scope);
  ensureFile(path, scope === "session" ? "Session Todos" : "Project Tasks");
  writeFileSync(path, content, "utf-8");
}

function parseStatus(marker: string): MarkdownTaskStatus {
  return marker === "[*]" ? "done" : "pending";
}

function markerForStatus(status: MarkdownTaskStatus): string {
  return status === "done" ? "[*]" : "[ ]";
}

function generateTaskId(scope: TaskScope): string {
  return `${scope}-${randomUUID().slice(0, 8)}`;
}

function parseTaskLine(line: string, scope: TaskScope, fallbackIndex: number): MarkdownTask | undefined {
  const match = line.match(/^\s*-\s*(\[ \]|\[\*\])\s+(.*?)(?:\s+<!--\s*pi-task:([^\s]+)\s*-->)?\s*$/);
  if (!match) return undefined;
  const id = match[3] || `${scope}-${fallbackIndex}`;
  return {
    id,
    text: (match[2] || "").trim(),
    status: parseStatus(match[1] || "[ ]"),
    scope,
    line: 0,
  };
}

function formatTaskLine(task: Pick<MarkdownTask, "id" | "text" | "status">): string {
  return `- ${markerForStatus(task.status)} ${task.text} <!-- pi-task:${task.id} -->`;
}

function normalizeTaskFile(scope: TaskScope): void {
  const raw = readTaskFile(scope);
  const lines = raw.split(/\r?\n/);
  let changed = false;
  let index = 1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] || "";
    const parsed = parseTaskLine(line, scope, index);
    if (!parsed) continue;
    const hasStableId = /<!--\s*pi-task:[^\s]+\s*-->/.test(line);
    const nextLine = formatTaskLine({ ...parsed, id: hasStableId ? parsed.id : generateTaskId(scope) });
    if (line.trimEnd() !== nextLine) {
      lines[i] = nextLine;
      changed = true;
    }
    index += 1;
  }
  if (changed) {
    writeTaskFile(scope, `${lines.join("\n")}\n`);
  }
}

export function parseTasks(scope: TaskScope): MarkdownTask[] {
  normalizeTaskFile(scope);
  const raw = readTaskFile(scope);
  const lines = raw.split(/\r?\n/);
  const tasks: MarkdownTask[] = [];
  let index = 1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] || "";
    const parsed = parseTaskLine(line, scope, index);
    if (!parsed) continue;
    parsed.line = i + 1;
    tasks.push(parsed);
    index += 1;
  }
  return tasks;
}

export function appendTask(scope: TaskScope, text: string): MarkdownTask {
  const content = readTaskFile(scope).replace(/\s*$/, "");
  const task: MarkdownTask = {
    id: generateTaskId(scope),
    text,
    status: "pending",
    scope,
    line: 0,
  };
  const next = `${content}\n${formatTaskLine(task)}\n`;
  writeTaskFile(scope, next);
  const tasks = parseTasks(scope);
  return tasks[tasks.length - 1]!;
}

export function setTaskStatus(scope: TaskScope, id: string, status: MarkdownTaskStatus): boolean {
  const raw = readTaskFile(scope);
  const lines = raw.split(/\r?\n/);
  const tasks = parseTasks(scope);
  const task = tasks.find((entry) => entry.id === id);
  if (!task) return false;
  const idx = task.line - 1;
  lines[idx] = formatTaskLine({ ...task, status });
  writeTaskFile(scope, `${lines.join("\n")}\n`);
  return true;
}

export function replaceTaskText(scope: TaskScope, id: string, text: string): boolean {
  const raw = readTaskFile(scope);
  const lines = raw.split(/\r?\n/);
  const tasks = parseTasks(scope);
  const task = tasks.find((entry) => entry.id === id);
  if (!task) return false;
  lines[task.line - 1] = formatTaskLine({ ...task, text });
  writeTaskFile(scope, `${lines.join("\n")}\n`);
  return true;
}

export function removeTask(scope: TaskScope, id: string): boolean {
  const raw = readTaskFile(scope);
  const lines = raw.split(/\r?\n/);
  const tasks = parseTasks(scope);
  const task = tasks.find((entry) => entry.id === id);
  if (!task) return false;
  lines.splice(task.line - 1, 1);
  writeTaskFile(scope, `${lines.join("\n")}\n`);
  return true;
}

export function moveTask(id: string, from: TaskScope, to: TaskScope): boolean {
  const tasks = parseTasks(from);
  const task = tasks.find((entry) => entry.id === id);
  if (!task) return false;
  appendTask(to, task.text);
  if (task.status === "done") {
    const moved = parseTasks(to).slice(-1)[0];
    if (moved) setTaskStatus(to, moved.id, "done");
  }
  removeTask(from, id);
  return true;
}

function reorderWithinScope(scope: TaskScope, id: string, computeTargetIndex: (currentIndex: number, total: number) => number): boolean {
  const raw = readTaskFile(scope);
  const lines = raw.split(/\r?\n/);
  const tasks = parseTasks(scope);
  const currentIndex = tasks.findIndex((entry) => entry.id === id);
  if (currentIndex === -1) return false;
  const targetIndex = computeTargetIndex(currentIndex, tasks.length);
  if (targetIndex === currentIndex || targetIndex < 0 || targetIndex >= tasks.length) return true;

  const lineIndexes = tasks.map((task) => task.line - 1);
  const taskLines = lineIndexes.map((index) => lines[index] || "");
  const [movedLine] = taskLines.splice(currentIndex, 1);
  taskLines.splice(targetIndex, 0, movedLine || "");

  lineIndexes.forEach((lineIndex, i) => {
    lines[lineIndex] = taskLines[i] || "";
  });

  writeTaskFile(scope, `${lines.join("\n")}\n`);
  return true;
}

export function moveTaskToTop(scope: TaskScope, id: string): boolean {
  return reorderWithinScope(scope, id, () => 0);
}

export function moveTaskUp(scope: TaskScope, id: string): boolean {
  return reorderWithinScope(scope, id, (currentIndex) => Math.max(0, currentIndex - 1));
}

export function moveTaskDown(scope: TaskScope, id: string): boolean {
  return reorderWithinScope(scope, id, (currentIndex, total) => Math.min(total - 1, currentIndex + 1));
}

export function listAllTasks(): { session: MarkdownTask[]; project: MarkdownTask[] } {
  return {
    session: parseTasks("session"),
    project: parseTasks("project"),
  };
}
