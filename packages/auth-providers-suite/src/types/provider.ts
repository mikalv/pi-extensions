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

export type ProviderAuthPreference = "native-pi" | "custom-suite" | "bootstrap-import";

export interface ProviderDescriptor {
  id: ProviderId;
  label: string;
  family: ProviderFamily;
  notes?: string;
  authPreference?: ProviderAuthPreference;
  supportsMultiAccount?: boolean;
  supportsModelDiscovery?: boolean;
  supportsQuotaProbe?: boolean;
}
