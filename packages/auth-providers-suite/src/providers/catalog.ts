import type { ProviderDescriptor } from "../types/provider.ts";

export const PROVIDER_CATALOG: ProviderDescriptor[] = [
  { id: "claude", label: "Claude", family: "subscription", supportsMultiAccount: true, supportsQuotaProbe: true },
  { id: "codex", label: "Codex", family: "oauth", supportsMultiAccount: true, supportsQuotaProbe: true },
  { id: "copilot", label: "Copilot", family: "oauth", supportsMultiAccount: false, supportsQuotaProbe: true },
  { id: "chatgpt", label: "ChatGPT", family: "subscription", supportsMultiAccount: true, supportsQuotaProbe: true },
  { id: "google-antigravity", label: "Google Antigravity", family: "oauth", supportsMultiAccount: false, supportsModelDiscovery: true, supportsQuotaProbe: true },
  { id: "cursor", label: "Cursor", family: "subscription", supportsMultiAccount: true, supportsQuotaProbe: true },
  { id: "kilo", label: "Kilo", family: "subscription", supportsMultiAccount: false, supportsQuotaProbe: true },
  { id: "zai", label: "Z.ai", family: "subscription", supportsMultiAccount: false, supportsQuotaProbe: true },
  { id: "openai-compatible", label: "OpenAI-compatible", family: "api-key", supportsMultiAccount: true, supportsModelDiscovery: true },
  { id: "ollama", label: "Ollama", family: "local", supportsModelDiscovery: true },
  { id: "nvidia", label: "Nvidia", family: "api-key", supportsMultiAccount: true, supportsModelDiscovery: true },
  { id: "mistral", label: "Mistral", family: "api-key", supportsMultiAccount: true, supportsModelDiscovery: true },
  { id: "minimax", label: "Minimax", family: "api-key", supportsMultiAccount: true, supportsModelDiscovery: true },
];
