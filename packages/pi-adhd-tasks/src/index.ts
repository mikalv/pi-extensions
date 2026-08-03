import { existsSync, readFileSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@earendil-works/pi-ai";
import {
  appendTask,
  getCurrentSessionId,
  getCurrentTask,
  getNextTask,
  listAllTasks,
  moveTask,
  moveTaskDown,
  moveTaskToTop,
  moveTaskUp,
  pathForScope,
  removeTask,
  replaceTaskText,
  setCurrentSessionId,
  setTaskStatus,
} from "./store.ts";
import type { TaskScope } from "./types.ts";

const SESSION_REMINDER_INTERVAL = 1;
const PROJECT_REMINDER_INTERVAL = 6;
let turnsSinceTaskTouch = 0;
let remindAfterTaskTouch = false;
let lastSessionTaskSnapshot = "";
let lastProjectTaskSnapshot = "";

function markTaskTouch(): void {
  turnsSinceTaskTouch = 0;
  remindAfterTaskTouch = true;
  captureTaskSnapshots();
}

function readSnapshot(scope: TaskScope): string {
  const path = pathForScope(scope);
  if (!existsSync(path)) return "";
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

function captureTaskSnapshots(): void {
  lastSessionTaskSnapshot = readSnapshot("session");
  lastProjectTaskSnapshot = readSnapshot("project");
}

function detectExternalTaskChange(): boolean {
  const sessionSnapshot = readSnapshot("session");
  const projectSnapshot = readSnapshot("project");
  const changed = sessionSnapshot !== lastSessionTaskSnapshot || projectSnapshot !== lastProjectTaskSnapshot;
  lastSessionTaskSnapshot = sessionSnapshot;
  lastProjectTaskSnapshot = projectSnapshot;
  if (changed) {
    turnsSinceTaskTouch = 0;
    remindAfterTaskTouch = true;
  }
  return changed;
}

function renderList(scope: TaskScope): string[] {
  const all = listAllTasks();
  const tasks = scope === "session" ? all.session : all.project;
  if (tasks.length === 0) return [scope === "session" ? "No session todos." : "No project tasks."];
  return tasks.map((task) => `${task.status === "done" ? "[*]" : task.status === "in_progress" ? "[~]" : "[ ]"} ${task.id} ${task.text}`);
}

function parseCommandArgs(args: string | undefined): string[] {
  return (args || "").trim().split(/\s+/).filter(Boolean);
}

function updateWidget(ctx: any): void {
  if (!ctx.hasUI) return;
  const { session, project } = listAllTasks();
  const current = getCurrentTask("session");
  const next = getNextTask("session");
  const backlog = session.filter((task) => task.status === "pending" && task.id !== next?.id).length;
  const lines = [
    `● ${session.length} todo${session.length === 1 ? "" : "s"} · session ${getCurrentSessionId()} · ${project.length} project`,
    current ? `  Now: ${current.text}` : "  Now: none",
    next && next.id !== current?.id ? `  Next: ${next.text}` : backlog > 0 ? `  Next: ${backlog} more pending` : "  Next: none",
    ...(session.length > 0
      ? session.slice(0, 3).map((t) => `  ${t.status === "done" ? "[*]" : t.status === "in_progress" ? "[~]" : "[ ]"} ${t.text}`)
      : ["  No session todos."]),
  ];
  ctx.ui.setWidget("pi-adhd-tasks", lines);
}

function handleList(scope: TaskScope, ctx: any): void {
  const path = pathForScope(scope);
  const extra = scope === "session" ? ` (session ${getCurrentSessionId()})` : "";
  ctx.ui.notify(`Using ${path}${extra}`, "info");
  ctx.ui.setWidget(`pi-adhd-${scope}`, renderList(scope));
  updateWidget(ctx);
}

function handleAdd(scope: TaskScope, text: string, ctx: any): void {
  if (!text.trim()) {
    ctx.ui.notify(`Usage: /${scope === "session" ? "todo" : "task"} add <text>`, "warning");
    return;
  }
  const task = appendTask(scope, text.trim());
  markTaskTouch();
  ctx.ui.notify(`Added ${task.id}: ${task.text}`, "info");
  updateWidget(ctx);
}

function handleDone(scope: TaskScope, id: string, done: boolean, ctx: any, explicitStatus?: "pending" | "in_progress"): void {
  if (!id) {
    ctx.ui.notify(`Usage: /${scope === "session" ? "todo" : "task"} ${done ? "done" : explicitStatus === "in_progress" ? "start" : "undo"} <id>`, "warning");
    return;
  }
  const status = done ? "done" : explicitStatus || "pending";
  const ok = setTaskStatus(scope, id, status);
  if (ok) markTaskTouch();
  ctx.ui.notify(ok ? `${id} updated` : `${id} not found`, ok ? "info" : "warning");
  updateWidget(ctx);
}

function handleEdit(scope: TaskScope, id: string, text: string, ctx: any): void {
  if (!id || !text.trim()) {
    ctx.ui.notify(`Usage: /${scope === "session" ? "todo" : "task"} edit <id> <text>`, "warning");
    return;
  }
  const ok = replaceTaskText(scope, id, text.trim());
  if (ok) markTaskTouch();
  ctx.ui.notify(ok ? `${id} edited` : `${id} not found`, ok ? "info" : "warning");
  updateWidget(ctx);
}

function handleRemove(scope: TaskScope, id: string, ctx: any): void {
  if (!id) {
    ctx.ui.notify(`Usage: /${scope === "session" ? "todo" : "task"} remove <id>`, "warning");
    return;
  }
  const ok = removeTask(scope, id);
  if (ok) markTaskTouch();
  ctx.ui.notify(ok ? `${id} removed` : `${id} not found`, ok ? "info" : "warning");
  updateWidget(ctx);
}

function handleMove(from: TaskScope, id: string, ctx: any): void {
  const to: TaskScope = from === "session" ? "project" : "session";
  if (!id) {
    ctx.ui.notify(`Usage: /${from === "session" ? "todo" : "task"} move <id>`, "warning");
    return;
  }
  const ok = moveTask(id, from, to);
  if (ok) markTaskTouch();
  ctx.ui.notify(ok ? `${id} moved to ${to}` : `${id} not found`, ok ? "info" : "warning");
  updateWidget(ctx);
}

function handleReorder(scope: TaskScope, id: string, mode: "top" | "up" | "down", ctx: any): void {
  if (!id) {
    ctx.ui.notify(`Usage: /${scope === "session" ? "todo" : "task"} ${mode} <id>`, "warning");
    return;
  }
  const ok = mode === "top"
    ? moveTaskToTop(scope, id)
    : mode === "up"
      ? moveTaskUp(scope, id)
      : moveTaskDown(scope, id);
  if (ok) markTaskTouch();
  ctx.ui.notify(ok ? `${id} reordered (${mode})` : `${id} not found`, ok ? "info" : "warning");
  updateWidget(ctx);
}

function taskText(scope: TaskScope): string {
  return renderList(scope).join("\n");
}

function buildTaskReminder(options?: { includeProject?: boolean; emphasizeFreshChange?: boolean }): string | undefined {
  const { session, project } = listAllTasks();
  const currentSession = getCurrentTask("session");
  const nextSession = getNextTask("session");
  const pendingProject = project.filter((task) => task.status !== "done");
  if (!currentSession && pendingProject.length === 0) return undefined;
  return [
    "<system-reminder>",
    options?.emphasizeFreshChange
      ? "The todo/task list was just updated. Re-anchor on it before continuing."
      : "Use the todo/task list as your active working set, not just as a note.",
    currentSession
      ? `Current session todo: ${currentSession.text}`
      : "Current session todo: none",
    nextSession && nextSession.id !== currentSession?.id
      ? `Next session todo: ${nextSession.text}`
      : "Next session todo: none",
    options?.includeProject && pendingProject.length > 0
      ? `Project tasks: ${pendingProject.slice(0, 3).map((task) => task.text).join(" | ")}`
      : undefined,
    currentSession
      ? "Before starting unrelated work, either finish, update, or reprioritize the current session todo."
      : "If a new concrete step appears, capture it in /todo or /task immediately.",
    "</system-reminder>",
  ].filter(Boolean).join("\n");
}

function registerScopedCommand(pi: ExtensionAPI, name: "todo" | "task", scope: TaskScope): void {
  pi.registerCommand(name, {
    description: scope === "session" ? "Manage session todos" : "Manage project tasks",
    handler: async (args, ctx) => {
      const raw = (args || "").trim();
      const parts = parseCommandArgs(args);
      const [action, first, ...rest] = parts;
      const remainder = rest.join(" ");

      if (!action || action === "list") return handleList(scope, ctx);
      if (action === "help") {
        ctx.ui.notify(`/${name} list | add <text> | done <id> | undo <id> | edit <id> <text> | remove <id> | move <id> | top <id> | up <id> | down <id>`, "info");
        return;
      }
      if (action === "add") return handleAdd(scope, [first, ...rest].join(" "), ctx);
      if (action === "start") return handleDone(scope, first || "", false, ctx, "in_progress");
      if (action === "done") return handleDone(scope, first || "", true, ctx);
      if (action === "undo") return handleDone(scope, first || "", false, ctx);
      if (action === "edit") return handleEdit(scope, first || "", remainder, ctx);
      if (action === "remove") return handleRemove(scope, first || "", ctx);
      if (action === "move" || action === "promote" || action === "demote") return handleMove(scope, first || "", ctx);
      if (action === "top") return handleReorder(scope, first || "", "top", ctx);
      if (action === "up") return handleReorder(scope, first || "", "up", ctx);
      if (action === "down") return handleReorder(scope, first || "", "down", ctx);

      // Shorthand: `/todo some text here` or `/task some text here` means add.
      return handleAdd(scope, raw, ctx);
    },
  });
}

export default function (pi: ExtensionAPI) {
  registerScopedCommand(pi, "todo", "session");
  registerScopedCommand(pi, "task", "project");

  pi.registerTool({
    name: "adhd_tasks_list",
    label: "ADHD Tasks List",
    description: "List the current session todo list or the shared project task list.",
    parameters: Type.Object({
      scope: Type.Optional(Type.Union([Type.Literal("session"), Type.Literal("project")], { description: "Which list to show. Defaults to session." })),
    }),
    async execute(_id, params: { scope?: TaskScope }) {
      const scope = params.scope || "session";
      return { content: [{ type: "text", text: taskText(scope) }], details: { scope, sessionId: getCurrentSessionId(), path: pathForScope(scope) } };
    },
  });

  pi.registerTool({
    name: "adhd_tasks_add",
    label: "ADHD Tasks Add",
    description: "Add a new item to the current session todo list or the shared project task list.",
    parameters: Type.Object({
      scope: Type.Optional(Type.Union([Type.Literal("session"), Type.Literal("project")], { description: "Which list to add to. Defaults to session." })),
      text: Type.String({ description: "Task text to append." }),
    }),
    async execute(_id, params: { scope?: TaskScope; text: string }, _signal, _onUpdate, ctx) {
      const scope = params.scope || "session";
      const task = appendTask(scope, params.text.trim());
      markTaskTouch();
      updateWidget(ctx);
      return { content: [{ type: "text", text: `Added ${task.id}: ${task.text}` }], details: { scope, task, path: pathForScope(scope) } };
    },
  });

  pi.registerTool({
    name: "adhd_tasks_update",
    label: "ADHD Tasks Update",
    description: "Update a markdown task item: mark done/undone, edit text, move between session and project, or remove it.",
    parameters: Type.Object({
      scope: Type.Union([Type.Literal("session"), Type.Literal("project")], { description: "Current list containing the task." }),
      id: Type.String({ description: "Task id such as session-1 or project-2." }),
      status: Type.Optional(Type.Union([Type.Literal("pending"), Type.Literal("in_progress"), Type.Literal("done")], { description: "Optional status change." })),
      text: Type.Optional(Type.String({ description: "Optional replacement text." })),
      moveTo: Type.Optional(Type.Union([Type.Literal("session"), Type.Literal("project")], { description: "Optionally move the task to the other list." })),
      reorder: Type.Optional(Type.Union([Type.Literal("top"), Type.Literal("up"), Type.Literal("down")], { description: "Optionally reorder the task within its current list." })),
      remove: Type.Optional(Type.Boolean({ description: "If true, remove the task." })),
    }),
    async execute(_id, params: { scope: TaskScope; id: string; status?: "pending" | "in_progress" | "done"; text?: string; moveTo?: TaskScope; reorder?: "top" | "up" | "down"; remove?: boolean }, _signal, _onUpdate, ctx) {
      let ok = false;
      if (params.remove) {
        ok = removeTask(params.scope, params.id);
      } else if (params.moveTo && params.moveTo !== params.scope) {
        ok = moveTask(params.id, params.scope, params.moveTo);
      } else if (params.reorder) {
        ok = params.reorder === "top"
          ? moveTaskToTop(params.scope, params.id)
          : params.reorder === "up"
            ? moveTaskUp(params.scope, params.id)
            : moveTaskDown(params.scope, params.id);
      } else {
        ok = true;
        if (params.status) ok = setTaskStatus(params.scope, params.id, params.status) && ok;
        if (params.text?.trim()) ok = replaceTaskText(params.scope, params.id, params.text.trim()) && ok;
      }
      if (ok) markTaskTouch();
      updateWidget(ctx);
      const message = ok ? `Updated ${params.id}` : `${params.id} not found`;
      return { content: [{ type: "text", text: message }], details: { ok, path: pathForScope(params.scope) } };
    },
  });

  pi.on("session_start", (event: any, ctx) => {
    setCurrentSessionId(event?.sessionId || process.env.PI_SESSION_ID || process.env.PI_SESSION || undefined);
    turnsSinceTaskTouch = 0;
    remindAfterTaskTouch = false;
    captureTaskSnapshots();
    updateWidget(ctx);
  });

  pi.on("user_message", (_event, ctx) => {
    detectExternalTaskChange();
    updateWidget(ctx);
  });

  pi.on("assistant_message", (_event, ctx) => {
    detectExternalTaskChange();
    updateWidget(ctx);
  });

  pi.on("context", (event: any) => {
    detectExternalTaskChange();
    turnsSinceTaskTouch += 1;
    const { session, project } = listAllTasks();
    const hasSession = session.some((task) => task.status !== "done");
    const hasProject = project.some((task) => task.status !== "done");

    let reminder: string | undefined;
    if (remindAfterTaskTouch) {
      reminder = buildTaskReminder({ includeProject: hasProject, emphasizeFreshChange: true });
      remindAfterTaskTouch = false;
    } else if (hasSession && turnsSinceTaskTouch >= SESSION_REMINDER_INTERVAL) {
      reminder = buildTaskReminder({ includeProject: false, emphasizeFreshChange: false });
      turnsSinceTaskTouch = 0;
    } else if (!hasSession && hasProject && turnsSinceTaskTouch >= PROJECT_REMINDER_INTERVAL) {
      reminder = buildTaskReminder({ includeProject: true, emphasizeFreshChange: false });
      turnsSinceTaskTouch = 0;
    }

    if (!reminder) return;
    const messages = Array.isArray(event?.messages) ? event.messages : [];
    return {
      messages: [
        ...messages,
        { role: "system", content: reminder },
      ],
    };
  });
}
