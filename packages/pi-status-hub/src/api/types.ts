export interface ApiGroupResponse {
  id: string;
  name: string;
  icon?: string;
  cached: boolean;
  updatedAt: number;
  summary?: string;
  healthy?: boolean;
  source?: string;
  metrics?: Array<{ id: string; label: string; value: string | number | boolean }>;
  items?: unknown[];
  error?: string;
}

export interface ApiSnapshotResponse {
  generatedAt: number;
  groups: ApiGroupResponse[];
}

export interface ApiRefreshResponse {
  ok: true;
  refreshedAt: number;
  groups: string[];
}

export interface ApiErrorResponse {
  ok: false;
  error: string;
}
