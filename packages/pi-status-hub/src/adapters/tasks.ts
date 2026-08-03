import { createKanboardAdapter, type KanboardAdapter, type KanboardAdapterConfig } from "./kanboard.ts";
import { readTasks } from "./local-tasks.ts";
import type { TaskRecord } from "../types.ts";

export interface TasksAdapterOptions {
  includeSession?: boolean;
  includeProject?: boolean;
  includeKanboard?: boolean;
  kanboard?: KanboardAdapterConfig;
}

export interface CombinedTaskResult {
  session: TaskRecord[];
  project: TaskRecord[];
  kanboard: TaskRecord[];
  all: TaskRecord[];
  sources: string[];
}

export class TasksAdapter {
  private kanboard: KanboardAdapter;

  constructor(private options: TasksAdapterOptions = {}) {
    this.kanboard = createKanboardAdapter(options.kanboard);
  }

  async listTasks(): Promise<CombinedTaskResult> {
    const session = this.options.includeSession === false ? [] : readTasks("session");
    const project = this.options.includeProject === false ? [] : readTasks("project");
    const kanboard = this.options.includeKanboard && this.kanboard.isConfigured()
      ? await this.kanboard.listTasks()
      : [];

    const sources = [
      session.length >= 0 ? "session" : null,
      project.length >= 0 ? "project" : null,
      kanboard.length > 0 || this.options.includeKanboard ? "kanboard" : null,
    ].filter(Boolean) as string[];

    return {
      session,
      project,
      kanboard,
      all: [...session, ...project, ...kanboard],
      sources,
    };
  }
}
