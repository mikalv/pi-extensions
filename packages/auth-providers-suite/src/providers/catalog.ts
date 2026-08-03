import type { ProviderDescriptor } from "../types/provider.ts";

export const PROVIDER_CATALOG: ProviderDescriptor[] = [
  { id: "claude", label: "Claude", family: "subscription", authPreference: "custom-suite", supportsMultiAccount: true, supportsQuotaProbe: true },
  { id: "codex", label: "Codex", family: "oauth", authPreference: "native-pi", notes: "Prefer Pi's built-in /login openai-codex flow; CLI import is bootstrap/recovery only.", supportsMultiAccount: true, supportsQuotaProbe: true },
  { id: "copilot", label: "Copilot", family: "oauth", authPreference: "native-pi", notes: "Prefer Pi/provider-owned GitHub Copilot OAuth when available.", supportsMultiAccount: false, supportsQuotaProbe: true },
  { id: "chatgpt", label: "ChatGPT", family: "subscription", authPreference: "custom-suite", supportsMultiAccount: true, supportsQuotaProbe: true },
  { id: "google-antigravity", label: "Google Antigravity", family: "oauth", authPreference: "custom-suite", supportsMultiAccount: false, supportsModelDiscovery: true, supportsQuotaProbe: true },
  { id: "cursor", label: "Cursor", family: "subscription", authPreference: "custom-suite", supportsMultiAccount: true, supportsQuotaProbe: true },
  { id: "kilo", label: "Kilo", family: "subscription", authPreference: "custom-suite", supportsMultiAccount: false, supportsQuotaProbe: true },
  { id: "zai", label: "Z.ai", family: "subscription", authPreference: "custom-suite", supportsMultiAccount: false, supportsQuotaProbe: true },
  { id: "openai-compatible", label: "OpenAI-compatible", family: "api-key", authPreference: "custom-suite", supportsMultiAccount: true, supportsModelDiscovery: true },
  { id: "ollama", label: "Ollama", family: "local", authPreference: "custom-suite", supportsModelDiscovery: true },
  { id: "nvidia", label: "Nvidia", family: "api-key", authPreference: "custom-suite", supportsMultiAccount: true, supportsModelDiscovery: true },
  { id: "mistral", label: "Mistral", family: "api-key", authPreference: "custom-suite", supportsMultiAccount: true, supportsModelDiscovery: true },
  { id: "minimax", label: "Minimax", family: "api-key", authPreference: "custom-suite", supportsMultiAccount: true, supportsModelDiscovery: true },
];
