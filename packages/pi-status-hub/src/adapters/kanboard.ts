import type { TaskRecord } from "../types.ts";

export interface KanboardAdapterConfig {
  baseUrl?: string;
  projectId?: string;
  token?: string;
  enabled?: boolean;
}

export interface KanboardTaskRecord extends TaskRecord {
  source: "kanboard";
  metadata?: Record<string, unknown> & {
    kanboardTaskId?: number | string;
    kanboardProjectId?: number | string;
    kanboardColumnId?: number | string;
    kanboardSwimlaneId?: number | string;
  };
}

export interface KanboardAdapter {
  isConfigured(): boolean;
  listTasks(): Promise<KanboardTaskRecord[]>;
}

export class StubKanboardAdapter implements KanboardAdapter {
  constructor(private config: KanboardAdapterConfig = {}) {}

  isConfigured(): boolean {
    return Boolean(this.config.enabled && this.config.baseUrl && this.config.projectId && this.config.token);
  }

  async listTasks(): Promise<KanboardTaskRecord[]> {
    return [];
  }
}

export function createKanboardAdapter(config?: KanboardAdapterConfig): KanboardAdapter {
  return new StubKanboardAdapter(config);
}
