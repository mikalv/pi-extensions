export type ProviderId =
  | "claude"
  | "codex"
  | "copilot"
  | "chatgpt"
  | "google-antigravity"
  | "cursor"
  | "kilo"
  | "zai"
  | "openai-compatible"
  | "ollama"
  | "nvidia"
  | "mistral"
  | "minimax";

export type ProviderFamily =
  | "subscription"
  | "api-key"
  | "local"
  | "oauth"
  | "session";

export interface ProviderDescriptor {
  id: ProviderId;
  label: string;
  family: ProviderFamily;
  notes?: string;
  supportsMultiAccount?: boolean;
  supportsModelDiscovery?: boolean;
  supportsQuotaProbe?: boolean;
}
