import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export interface GroupMetric {
  id: string;
  label: string;
  value: string | number | boolean;
}

export interface GroupData {
  summary?: string;
  metrics?: GroupMetric[];
  items?: unknown[];
  updatedAt?: number;
  source?: string;
  healthy?: boolean;
  error?: string;
}

export interface StatusGroup {
  id: string;
  name: string;
  icon?: string;
  priority?: number;
  ttlMs?: number;
  dataProvider: (ctx?: ExtensionContext) => Promise<GroupData>;
}

export interface TaskRecord {
  source: "session" | "project" | "kanboard" | string;
  id: string;
  title: string;
  status: string;
  priority?: number | string;
  assignee?: string;
  updatedAt?: string;
  dueAt?: string;
  url?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface ProviderRecord {
  id: string;
  label: string;
  status: string;
  modelCount?: number;
  authPreference?: string;
  usageSummary?: string;
  metadata?: Record<string, unknown>;
}

export interface StatusSnapshotEntry {
  id: string;
  name: string;
  icon?: string;
  cached: boolean;
  data: GroupData | null;
  updatedAt: number;
}

export interface StatusHubSnapshot {
  generatedAt: number;
  groups: StatusSnapshotEntry[];
}
