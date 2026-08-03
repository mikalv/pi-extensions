export interface KanboardSettings {
  enabled: boolean;
  baseUrl?: string;
  projectId?: string;
  token?: string;
}

export interface StatusHubSettings {
  defaultTtlMs: number;
  enabledGroups: string[];
  kanboard: KanboardSettings;
}

export const DEFAULT_STATUS_HUB_SETTINGS: StatusHubSettings = {
  defaultTtlMs: 30_000,
  enabledGroups: ["tasks", "usage", "providers"],
  kanboard: {
    enabled: false,
  },
};
