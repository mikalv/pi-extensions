import {
  GOOGLE_ANTIGRAVITY_DAILY_ENDPOINT,
  getGoogleAntigravityHeaders,
} from "./protocol.ts";

interface RawAntigravityModel {
  displayName?: unknown;
  isInternal?: unknown;
  maxOutputTokens?: unknown;
  maxTokens?: unknown;
  minThinkingBudget?: unknown;
  recommended?: unknown;
  supportedMimeTypes?: unknown;
  supportsImages?: unknown;
  supportsThinking?: unknown;
  thinkingBudget?: unknown;
}

export interface DiscoveredGoogleAntigravityModel {
  id: string;
  displayName?: string;
  internal: boolean;
  recommended: boolean;
  contextWindow?: number;
  maxOutputTokens?: number;
  supportsThinking: boolean;
  supportsImages: boolean;
  thinkingBudget?: number;
  minThinkingBudget?: number;
  supportedMimeTypes: string[];
}

export interface GoogleAntigravityDiscoveryResult {
  capturedAt: string;
  endpoint: string;
  models: DiscoveredGoogleAntigravityModel[];
}

export interface GoogleAntigravityDiscoveryOptions {
  accessToken: string;
  fetchImplementation?: typeof fetch;
  signal?: AbortSignal;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function supportedMimeTypes(value: unknown): string[] {
  if (!isRecord(value)) return [];
  return Object.entries(value)
    .filter((entry): entry is [string, true] => entry[1] === true)
    .map(([mimeType]) => mimeType)
    .sort();
}

function normalizeModel(id: string, value: RawAntigravityModel): DiscoveredGoogleAntigravityModel {
  const displayName = optionalString(value.displayName);
  const contextWindow = optionalNumber(value.maxTokens);
  const maxOutputTokens = optionalNumber(value.maxOutputTokens);
  const thinkingBudget = optionalNumber(value.thinkingBudget);
  const minThinkingBudget = optionalNumber(value.minThinkingBudget);
  return {
    id,
    ...(displayName ? { displayName } : {}),
    internal: value.isInternal === true,
    recommended: value.recommended === true,
    ...(contextWindow !== undefined ? { contextWindow } : {}),
    ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
    supportsThinking: value.supportsThinking === true,
    supportsImages: value.supportsImages === true,
    ...(thinkingBudget !== undefined ? { thinkingBudget } : {}),
    ...(minThinkingBudget !== undefined ? { minThinkingBudget } : {}),
    supportedMimeTypes: supportedMimeTypes(value.supportedMimeTypes),
  };
}

export async function discoverGoogleAntigravityModels({
  accessToken,
  fetchImplementation = fetch,
  signal,
}: GoogleAntigravityDiscoveryOptions): Promise<GoogleAntigravityDiscoveryResult> {
  const response = await fetchImplementation(`${GOOGLE_ANTIGRAVITY_DAILY_ENDPOINT}/v1internal:fetchAvailableModels`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...getGoogleAntigravityHeaders(),
    },
    body: "{}",
    signal,
  });

  if (!response.ok) {
    throw new Error(`Google Antigravity model discovery failed with HTTP ${response.status}`);
  }

  const payload: unknown = await response.json();
  if (!isRecord(payload) || !isRecord(payload.models)) {
    throw new Error("Google Antigravity model discovery returned an invalid catalog");
  }

  return {
    capturedAt: new Date().toISOString(),
    endpoint: GOOGLE_ANTIGRAVITY_DAILY_ENDPOINT,
    models: Object.entries(payload.models)
      .filter((entry): entry is [string, RawAntigravityModel] => isRecord(entry[1]))
      .map(([id, model]) => normalizeModel(id, model))
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
}

export function normalizeGoogleAntigravityModelIds(models: readonly DiscoveredGoogleAntigravityModel[]): string[] {
  return [...new Set(models.filter((model) => !model.internal).map((model) => model.id))].sort();
}
