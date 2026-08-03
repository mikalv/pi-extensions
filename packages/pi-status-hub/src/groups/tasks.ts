import { TasksAdapter } from "../adapters/tasks.ts";
import type { GroupData, StatusGroup, TaskRecord } from "../types.ts";
import type { KanboardSettings } from "../config.ts";

function count(tasks: TaskRecord[], status: string): number {
  return tasks.filter((task) => task.status === status).length;
}

export function createTasksGroup(kanboard: KanboardSettings): StatusGroup {
  const adapter = new TasksAdapter({ includeSession: true, includeProject: true, includeKanboard: kanboard.enabled, kanboard });
  return {
    id: "tasks",
    name: "Tasks",
    icon: "✓",
    priority: 10,
    ttlMs: 5_000,
    async dataProvider(): Promise<GroupData> {
      const { session, project, kanboard: kanboardTasks, all, sources } = await adapter.listTasks();
      const current = session.find((task) => task.status === "in_progress") ?? session.find((task) => task.status === "pending");
      return {
        source: sources.join("+"),
        healthy: true,
        summary: current
          ? `Now: ${current.title} · ${count(all, "pending")} pending`
          : `${count(all, "in_progress")} in progress · ${count(all, "pending")} pending`,
        metrics: [
          { id: "session", label: "Session", value: session.length },
          { id: "project", label: "Project", value: project.length },
          { id: "kanboard", label: "Kanboard", value: kanboardTasks.length },
          { id: "pending", label: "Pending", value: count(all, "pending") },
          { id: "in_progress", label: "In progress", value: count(all, "in_progress") },
          { id: "done", label: "Done", value: count(all, "done") },
        ],
        items: all,
        updatedAt: Date.now(),
      };
    },
  };
}
