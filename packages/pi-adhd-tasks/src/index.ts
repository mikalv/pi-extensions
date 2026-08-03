import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@earendil-works/pi-ai";

const REMINDER_INTERVAL = 4;
let turnsSinceTaskTouch = 0;

function markTaskTouch(): void {
  turnsSinceTaskTouch = 0;
}
import {
  appendTask,
  getCurrentSessionId,
  listAllTasks,
  moveTask,
  pathForScope,
  removeTask,
  replaceTaskText,
  setCurrentSessionId,
  setTaskStatus,
} from "./store.ts";
import type { TaskScope } from "./types.ts";

function renderList(scope: TaskScope): string[] {
  const all = listAllTasks();
  const tasks = scope === "session" ? all.session : all.project;
  if (tasks.length === 0) return [scope === "session" ? "No session todos." : "No project tasks."];
  return tasks.map((task) => `${task.status === "done" ? "[*]" : "[ ]"} ${task.id} ${task.text}`);
}

function parseCommandArgs(args: string | undefined): string[] {
  return (args || "").trim().split(/\s+/).filter(Boolean);
}

function updateWidget(ctx: any): void {
  if (!ctx.hasUI) return;
  const { session, project } = listAllTasks();
  const lines = [
    `● ${session.length} todo${session.length === 1 ? "" : "s"} · ${project.length} task${project.length === 1 ? "" : "s"}`,
    `  Session (${getCurrentSessionId()})`,
    ...session.slice(0, 4).map((t) => `    ${t.status === "done" ? "[*]" : "[ ]"} ${t.text}`),
    `  Project`,
    ...project.slice(0, 4).map((t) => `    ${t.status === "done" ? "[*]" : "[ ]"} ${t.text}`),
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

function handleDone(scope: TaskScope, id: string, done: boolean, ctx: any): void {
  if (!id) {
    ctx.ui.notify(`Usage: /${scope === "session" ? "todo" : "task"} ${done ? "done" : "undo"} <id>`, "warning");
    return;
  }
  const ok = setTaskStatus(scope, id, done ? "done" : "pending");
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

function taskText(scope: TaskScope): string {
  return renderList(scope).join("\n");
}

function buildTaskReminder(): string | undefined {
  const { session, project } = listAllTasks();
  const pendingSession = session.filter((task) => task.status === "pending");
  const pendingProject = project.filter((task) => task.status === "pending");
  if (pendingSession.length === 0 && pendingProject.length === 0) return undefined;
  return [
    "<system-reminder>",
    "Remember to actively use /todo, /task, or the ADHD task tools to keep your working set explicit.",
    pendingSession.length > 0
      ? `Session todos: ${pendingSession.slice(0, 5).map((task) => task.text).join(" | ")}`
      : "Session todos: none",
    pendingProject.length > 0
      ? `Project tasks: ${pendingProject.slice(0, 5).map((task) => task.text).join(" | ")}`
      : "Project tasks: none",
    "If current work is drifting, capture the next concrete step as a todo or task before continuing.",
    "</system-reminder>",
  ].join("\n");
}

function registerScopedCommand(pi: ExtensionAPI, name: "todo" | "task", scope: TaskScope): void {
  pi.registerCommand(name, {
    description: scope === "session" ? "Manage session todos" : "Manage project tasks",
    handler: async (args, ctx) => {
      const parts = parseCommandArgs(args);
      const [action, first, ...rest] = parts;
      const remainder = rest.join(" ");

      if (!action || action === "list") return handleList(scope, ctx);
      if (action === "help") {
        ctx.ui.notify(`/${name} list | add <text> | done <id> | undo <id> | edit <id> <text> | remove <id> | move <id>`, "info");
        return;
      }
      if (action === "add") return handleAdd(scope, [first, ...rest].join(" "), ctx);
      if (action === "done") return handleDone(scope, first || "", true, ctx);
      if (action === "undo") return handleDone(scope, first || "", false, ctx);
      if (action === "edit") return handleEdit(scope, first || "", remainder, ctx);
      if (action === "remove") return handleRemove(scope, first || "", ctx);
      if (action === "move" || action === "promote" || action === "demote") return handleMove(scope, first || "", ctx);

      ctx.ui.notify(`Unknown /${name} action: ${action}`, "warning");
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
      status: Type.Optional(Type.Union([Type.Literal("pending"), Type.Literal("done")], { description: "Optional status change." })),
      text: Type.Optional(Type.String({ description: "Optional replacement text." })),
      moveTo: Type.Optional(Type.Union([Type.Literal("session"), Type.Literal("project")], { description: "Optionally move the task to the other list." })),
      remove: Type.Optional(Type.Boolean({ description: "If true, remove the task." })),
    }),
    async execute(_id, params: { scope: TaskScope; id: string; status?: "pending" | "done"; text?: string; moveTo?: TaskScope; remove?: boolean }, _signal, _onUpdate, ctx) {
      let ok = false;
      if (params.remove) {
        ok = removeTask(params.scope, params.id);
      } else if (params.moveTo && params.moveTo !== params.scope) {
        ok = moveTask(params.id, params.scope, params.moveTo);
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
    updateWidget(ctx);
  });

  pi.on("user_message", (_event, ctx) => {
    updateWidget(ctx);
  });

  pi.on("assistant_message", (_event, ctx) => {
    updateWidget(ctx);
  });

  pi.on("context", (event: any) => {
    turnsSinceTaskTouch += 1;
    if (turnsSinceTaskTouch < REMINDER_INTERVAL) return;
    const reminder = buildTaskReminder();
    if (!reminder) return;
    turnsSinceTaskTouch = 0;
    const messages = Array.isArray(event?.messages) ? event.messages : [];
    return {
      messages: [
        ...messages,
        { role: "system", content: reminder },
      ],
    };
  });
}
