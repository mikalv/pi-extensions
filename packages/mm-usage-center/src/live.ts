import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export type SupportedLiveProvider = "openai-codex" | "anthropic" | "github-copilot" | "openrouter" | "cursor" | "kilo" | "google-antigravity" | "zai";

type PiModelLike = NonNullable<ExtensionContext["model"]> & { baseUrl?: string };

type RequestAuth = {
  apiKey?: string;
  baseUrl?: string;
  headers?: Record<string, string>;
  accountId?: string;
};

let cachedPiAuthFile: Record<string, unknown> | null | undefined;

export interface LiveUsageWindow {
  key: string;
  label: string;
  usedPercent?: number;
  remaining?: number;
  limit?: number;
  unit?: "percent" | "count" | "usd";
  resetsAt?: number;
}

export interface LiveUsageSnapshot {
  providerId: SupportedLiveProvider;
  providerName: string;
  source: string;
  fetchedAt: number;
  windows: LiveUsageWindow[];
  metrics: Array<{ label: string; value: string }>;
}

export interface LiveUsageState {
  providerId: SupportedLiveProvider;
  providerName: string;
  status: "ready" | "unavailable" | "error";
  snapshot?: LiveUsageSnapshot;
  message?: string;
}

const PROVIDERS: Array<{ id: SupportedLiveProvider; name: string; endpoint: string; method?: "GET" | "POST"; body?: Record<string, unknown> }> = [
  { id: "openai-codex", name: "Codex", endpoint: "https://chatgpt.com/backend-api/wham/usage" },
  { id: "anthropic", name: "Claude", endpoint: "https://api.anthropic.com/api/oauth/usage" },
  { id: "github-copilot", name: "Copilot", endpoint: "https://api.github.com/copilot_internal/user" },
  { id: "openrouter", name: "OpenRouter", endpoint: "https://openrouter.ai/api/v1/key" },
  { id: "cursor", name: "Cursor", endpoint: "https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage", method: "POST", body: {} },
  { id: "kilo", name: "Kilo", endpoint: "https://api.kilo.ai/api/profile/balance" },
  { id: "google-antigravity", name: "Google Antigravity", endpoint: "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist", method: "POST", body: { metadata: { ideType: "IDE_UNSPECIFIED", platform: "PLATFORM_UNSPECIFIED", pluginType: "GEMINI" } } },
  { id: "zai", name: "Z.ai", endpoint: "https://api.z.ai/api/monitor/usage/quota/limit" },
];

const OFFICIAL_ORIGINS: Record<SupportedLiveProvider, string[]> = {
  "openai-codex": ["https://chatgpt.com", "https://chat.openai.com", "https://api.openai.com"],
  anthropic: ["https://api.anthropic.com"],
  "github-copilot": ["https://api.github.com", "https://copilot-proxy.githubusercontent.com"],
  openrouter: ["https://openrouter.ai"],
  cursor: ["https://api2.cursor.sh", "https://cursor.com"],
  kilo: ["https://api.kilo.ai"],
  "google-antigravity": ["https://cloudcode-pa.googleapis.com", "https://api.cloudcode-pa.googleapis.com"],
  zai: ["https://api.z.ai"],
};

const MAX_RESPONSE_BYTES = 64 * 1024;
const DEFAULT_TIMEOUT_MS = 12_000;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asEpochMs(value: unknown): number | undefined {
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  const num = asNumber(value);
  if (num === undefined || num <= 0) return undefined;
  return num < 10_000_000_000 ? num * 1000 : num;
}

function providerInfo(providerId: SupportedLiveProvider) {
  return PROVIDERS.find((provider) => provider.id === providerId)!;
}

function originMatches(baseUrl: string | undefined, allowedOrigins: string[]): boolean {
  if (!baseUrl) return true;
  try {
    const origin = new URL(baseUrl).origin;
    return allowedOrigins.includes(origin);
  } catch {
    return allowedOrigins.some((candidate) => baseUrl.startsWith(candidate));
  }
}

function modelHasOfficialOrigin(model: PiModelLike | undefined, providerId: SupportedLiveProvider): boolean {
  if (!model) return false;
  return originMatches((model as any).baseUrl, OFFICIAL_ORIGINS[providerId]);
}

function authHasOfficialOrigin(auth: RequestAuth | undefined, providerId: SupportedLiveProvider): boolean {
  if (!auth) return false;
  return originMatches(auth.baseUrl, OFFICIAL_ORIGINS[providerId]);
}

function authorizationFrom(auth: RequestAuth): string | undefined {
  const headers = auth.headers;
  if (headers && typeof headers === "object") {
    const authorization = (headers.Authorization ?? headers.authorization) as unknown;
    if (typeof authorization === "string" && authorization.trim()) return authorization.trim();
  }
  if (typeof auth.apiKey === "string" && auth.apiKey.trim()) {
    return auth.apiKey.startsWith("Bearer ") ? auth.apiKey : `Bearer ${auth.apiKey}`;
  }
  return undefined;
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  const lower = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === lower);
}

function copyAllowedHeaders(source: Record<string, string> | undefined): Record<string, string> {
  if (!source) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    const lower = key.toLowerCase();
    if (lower === "authorization" || lower === "cookie" || lower.startsWith("x-")) {
      out[key] = value;
    }
  }
  return out;
}

function readPiAuthFile(): Record<string, unknown> | null {
  if (cachedPiAuthFile !== undefined) return cachedPiAuthFile;
  try {
    const path = join(process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent"), "auth.json");
    if (!existsSync(path)) {
      cachedPiAuthFile = null;
      return cachedPiAuthFile;
    }
    cachedPiAuthFile = asRecord(JSON.parse(readFileSync(path, "utf8")));
    return cachedPiAuthFile;
  } catch {
    cachedPiAuthFile = null;
    return cachedPiAuthFile;
  }
}

function providerAuthKey(providerId: SupportedLiveProvider): string {
  return providerId;
}

function authFromPiAuthFile(providerId: SupportedLiveProvider): RequestAuth | undefined {
  const authFile = readPiAuthFile();
  const entry = asRecord(authFile?.[providerAuthKey(providerId)]);
  const access = asString(entry.access);
  const refresh = asString(entry.refresh);
  const key = asString(entry.key);
  const token = providerId === "github-copilot" ? refresh || access || key : access || key;
  if (!token) return undefined;
  return {
    apiKey: token,
    accountId: asString(entry.accountId),
    headers: {},
  };
}

function candidateModels(ctx: ExtensionContext, providerId: SupportedLiveProvider): PiModelLike[] {
  const models: PiModelLike[] = [];
  const seen = new Set<string>();
  const add = (model: PiModelLike | undefined) => {
    if (!model || model.provider !== providerId) return;
    const key = `${model.provider}/${model.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    models.push(model);
  };
  add(ctx.model as PiModelLike | undefined);
  for (const model of ctx.modelRegistry.getAvailable()) add(model as PiModelLike);
  for (const model of ctx.modelRegistry.getAll()) add(model as PiModelLike);
  return models;
}

async function resolveProviderAuth(ctx: ExtensionContext, providerId: SupportedLiveProvider): Promise<Record<string, string> | undefined> {
  const registry = ctx.modelRegistry as any;
  const currentModel = ctx.model as PiModelLike | undefined;

  if (currentModel?.provider === providerId && modelHasOfficialOrigin(currentModel, providerId) && typeof registry?.getApiKeyAndHeaders === "function") {
    const result = await registry.getApiKeyAndHeaders(currentModel);
    if (result?.ok) {
      const auth: RequestAuth = {
        apiKey: result.apiKey,
        headers: result.headers,
        baseUrl: (currentModel as any).baseUrl,
      };
      const authorization = authorizationFrom(auth);
      if (authorization) {
        const headers = { ...copyAllowedHeaders(result.headers), Authorization: authorization, Accept: "application/json" };
        if (providerId === "anthropic") headers["anthropic-beta"] = "oauth-2025-04-20";
        return headers;
      }
    }
  }

  let auth: RequestAuth | undefined;
  if (typeof registry?.getProviderAuth === "function") {
    const providerResult = await registry.getProviderAuth(providerId);
    const candidate = providerResult?.auth as RequestAuth | undefined;
    if (candidate && authHasOfficialOrigin(candidate, providerId)) {
      auth = candidate;
    }
  }
  if (!auth) auth = authFromPiAuthFile(providerId);
  if (!auth) return undefined;
  const authorization = authorizationFrom(auth);
  if (!authorization) return undefined;
  const headers = { ...copyAllowedHeaders(auth.headers), Authorization: authorization, Accept: "application/json" };
  if (providerId === "openai-codex") {
    const accountId = asString(auth.accountId);
    if (accountId) headers["ChatGPT-Account-Id"] = accountId;
  }
  if (providerId === "anthropic") {
    headers["anthropic-beta"] = "oauth-2025-04-20";
  }
  return headers;
}

async function readBoundedResponse(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const remaining = maxBytes - total;
    if (remaining <= 0) break;
    const nextChunk = value.byteLength > remaining ? value.subarray(0, remaining) : value;
    chunks.push(nextChunk);
    total += nextChunk.byteLength;
    if (total >= maxBytes) break;
  }
  return new TextDecoder().decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))));
}

async function fetchJson(
  url: string,
  headers: Record<string, string>,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  method: "GET" | "POST" = "GET",
  requestBody?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    if (!hasHeader(headers, "User-Agent")) headers["User-Agent"] = "mm-usage-center";
    if (method === "POST" && !hasHeader(headers, "Content-Type")) headers["Content-Type"] = "application/json";
    const response = await fetch(url, {
      method,
      headers,
      signal: controller.signal,
      ...(method === "POST" ? { body: JSON.stringify(requestBody ?? {}) } : {}),
    });
    const responseBody = await readBoundedResponse(response, MAX_RESPONSE_BYTES);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}${responseBody ? `: ${responseBody}` : ""}`);
    }
    const data = responseBody ? (JSON.parse(responseBody) as unknown) : {};
    const parsed = asRecord(data);
    if (Object.keys(parsed).length === 0) {
      throw new Error("Empty or invalid JSON response");
    }
    return parsed;
  } catch (error) {
    if ((error as { name?: string })?.name === "AbortError") {
      throw new Error(`Timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function pushPercentWindow(target: LiveUsageWindow[], key: string, label: string, source: Record<string, unknown>) {
  const usedPercent = asNumber(source.used_percent ?? source.usedPercent ?? source.utilization);
  if (usedPercent === undefined) return;
  target.push({ key, label, usedPercent, unit: "percent", resetsAt: asEpochMs(source.reset_at ?? source.resetAt) });
}

function parseCodex(payload: Record<string, unknown>): LiveUsageSnapshot {
  const rateLimit = asRecord(payload.rate_limit);
  const windows: LiveUsageWindow[] = [];
  pushPercentWindow(windows, "5h", "5h", asRecord(rateLimit.primary_window));
  pushPercentWindow(windows, "7d", "7d", asRecord(rateLimit.secondary_window));

  const additional = Array.isArray(payload.additional_rate_limits) ? payload.additional_rate_limits : [];
  additional.forEach((entry, index) => {
    const item = asRecord(entry);
    const name = asString(item.limit_name) ?? asString(item.metered_feature) ?? `extra-${index + 1}`;
    const extraRate = asRecord(item.rate_limit);
    pushPercentWindow(windows, `additional-${index}-primary`, `${name} P`, asRecord(extraRate.primary_window));
    pushPercentWindow(windows, `additional-${index}-secondary`, `${name} S`, asRecord(extraRate.secondary_window));
  });

  if (windows.length === 0) throw new Error("No usage windows found");
  return {
    providerId: "openai-codex",
    providerName: "Codex",
    source: "ChatGPT usage API",
    fetchedAt: Date.now(),
    windows,
    metrics: [],
  };
}

function parseAnthropic(payload: Record<string, unknown>): LiveUsageSnapshot {
  const windows: LiveUsageWindow[] = [];
  pushPercentWindow(windows, "5h", "5h", asRecord(payload.five_hour));
  pushPercentWindow(windows, "7d", "7d", asRecord(payload.seven_day));
  if (windows.length === 0) throw new Error("No usage windows found");
  return {
    providerId: "anthropic",
    providerName: "Claude",
    source: "Anthropic OAuth usage API",
    fetchedAt: Date.now(),
    windows,
    metrics: [],
  };
}

function parseOpenRouter(payload: Record<string, unknown>): LiveUsageSnapshot {
  const data = asRecord(payload.data);
  const usage = asNumber(data.usage) ?? 0;
  const limit = asNumber(data.limit);
  const remaining = asNumber(data.limit_remaining ?? data.remaining);
  if (limit === undefined && remaining === undefined && usage === 0) throw new Error("No spend or credit data found");
  return {
    providerId: "openrouter",
    providerName: "OpenRouter",
    source: "OpenRouter key API",
    fetchedAt: Date.now(),
    windows: [{ key: "credit", label: "Credits", remaining, limit, unit: "usd" }],
    metrics: [{ label: "Used", value: `$${usage.toFixed(2)}` }],
  };
}

function parseCursor(payload: Record<string, unknown>): LiveUsageSnapshot {
  const root = asRecord(payload.currentPeriodUsage ?? payload.usage ?? payload.data ?? payload);
  const planUsage = asRecord(root.planUsage);
  const windows: LiveUsageWindow[] = [];
  const metrics: Array<{ label: string; value: string }> = [];

  const resetsAt = asEpochMs(root.billingCycleEnd ?? root.currentPeriodEnd ?? root.resetsAt ?? root.resetAt);
  const totalPercent = asNumber(planUsage.totalPercentUsed ?? root.totalPercentUsed);
  if (totalPercent !== undefined) {
    windows.push({ key: "monthly", label: "Included usage", usedPercent: totalPercent, unit: "percent", resetsAt });
  }

  const apiPercent = asNumber(planUsage.apiPercentUsed ?? root.apiPercentUsed);
  if (apiPercent !== undefined) {
    windows.push({ key: "api", label: "API usage", usedPercent: apiPercent, unit: "percent", resetsAt });
  }

  const autoPercent = asNumber(planUsage.autoPercentUsed ?? root.autoPercentUsed);
  if (autoPercent !== undefined) {
    windows.push({ key: "auto", label: "Auto usage", usedPercent: autoPercent, unit: "percent", resetsAt });
  }

  const spendUsedCents = asNumber(planUsage.totalSpend ?? root.totalSpend);
  const spendLimitCents = asNumber(planUsage.includedSpend ?? planUsage.limit ?? root.includedSpend ?? root.spendLimit);
  if (spendUsedCents !== undefined || spendLimitCents !== undefined) {
    const spendUsed = spendUsedCents !== undefined ? spendUsedCents / 100 : undefined;
    const spendLimit = spendLimitCents !== undefined ? spendLimitCents / 100 : undefined;
    windows.push({ key: "spend", label: "Spend", remaining: spendLimit !== undefined && spendUsed !== undefined ? Math.max(0, spendLimit - spendUsed) : undefined, limit: spendLimit, unit: "usd", resetsAt });
    if (spendUsed !== undefined) metrics.push({ label: "Spend used", value: `$${spendUsed.toFixed(2)}` });
  }

  if (windows.length === 0 && metrics.length === 0) throw new Error("No Cursor usage data found");
  return { providerId: "cursor", providerName: "Cursor", source: "Cursor dashboard usage API", fetchedAt: Date.now(), windows, metrics };
}

function parseKilo(payload: Record<string, unknown>): LiveUsageSnapshot {
  const root = asRecord(payload.data ?? payload);
  const balance = asNumber(root.balance ?? root.remainingCredits ?? root.credits ?? root.available);
  const used = asNumber(root.used ?? root.spent ?? root.totalUsage);
  const total = asNumber(root.totalCredits ?? root.total);
  const depleted = root.isDepleted === true;
  if (balance === undefined && used === undefined && total === undefined && !depleted) throw new Error("No Kilo balance data found");
  return {
    providerId: "kilo",
    providerName: "Kilo",
    source: "Kilo profile balance API",
    fetchedAt: Date.now(),
    windows: [{ key: "credits", label: "Credits", remaining: balance, limit: total, unit: "usd" }],
    metrics: [
      ...(used !== undefined ? [{ label: "Used", value: `$${used.toFixed(2)}` }] : []),
      { label: "Depleted", value: depleted ? "Yes" : "No" },
    ],
  };
}

function parseZai(payload: Record<string, unknown>): LiveUsageSnapshot {
  const root = asRecord(payload.data ?? payload.result ?? payload);
  const windows: LiveUsageWindow[] = [];
  const metrics: Array<{ label: string; value: string }> = [];

  const items = Array.isArray(root.limits) ? root.limits : Array.isArray(root.windows) ? root.windows : [];
  items.forEach((entry, index) => {
    const item = asRecord(entry);
    const type = asString(item.type) ?? `window-${index + 1}`;
    const unit = asNumber(item.unit);
    const number = asNumber(item.number);
    const label = unit === 5 && number === 1 ? "1 day" : unit === 3 && number === 5 ? "5 hours" : type;
    const usedPercent = asNumber(item.percentage ?? item.used_percent ?? item.usedPercent);
    const remaining = asNumber(item.remaining);
    const limit = asNumber(item.usage);
    windows.push({ key: type.toLowerCase(), label, usedPercent, remaining, limit, unit: typeof remaining === "number" || typeof limit === "number" ? "count" : "percent", resetsAt: asEpochMs(item.nextResetTime ?? item.resetAt) });
  });

  const level = asString(root.level);
  if (level) metrics.push({ label: "Level", value: level });

  if (windows.length === 0) throw new Error("No Z.ai quota windows found");
  return {
    providerId: "zai",
    providerName: "Z.ai",
    source: "Z.ai quota API",
    fetchedAt: Date.now(),
    windows,
    metrics,
  };
}

function parseGoogleAntigravity(payload: Record<string, unknown>): LiveUsageSnapshot {
  const root = asRecord(payload);
  const currentTier = asRecord(root.currentTier);
  const allowedTiers = Array.isArray(root.allowedTiers) ? root.allowedTiers : [];
  const tier = Object.keys(currentTier).length > 0 ? currentTier : asRecord(allowedTiers[0]);
  const tierName = asString(tier.name) ?? asString(tier.id) ?? "Unknown";
  return {
    providerId: "google-antigravity",
    providerName: "Google Antigravity",
    source: "Google Antigravity loadCodeAssist API",
    fetchedAt: Date.now(),
    windows: [],
    metrics: [{ label: "Tier", value: tierName }],
  };
}

function parseCopilot(payload: Record<string, unknown>): LiveUsageSnapshot {
  const snapshots = asRecord(payload.quota_snapshots);
  const premium = asRecord(snapshots.premium_interactions);
  const limited = asRecord(payload.limited_user_quotas);
  const monthly = asRecord(payload.monthly_quotas);
  const windows: LiveUsageWindow[] = [];
  const metrics: Array<{ label: string; value: string }> = [];

  if (Object.keys(premium).length > 0) {
    const entitlement = asNumber(premium.entitlement);
    const remaining = asNumber(premium.remaining ?? premium.quota_remaining);
    const used = asNumber(premium.credits_used);
    const unlimited = premium.unlimited === true;
    if (unlimited) {
      metrics.push({ label: "Plan", value: premium.token_based_billing === true ? "AI credits" : "Premium requests" });
    } else if (entitlement !== undefined && remaining !== undefined) {
      windows.push({
        key: "monthly",
        label: premium.token_based_billing === true ? "AI credits" : "Premium requests",
        remaining: Math.max(0, remaining),
        limit: entitlement,
        unit: "count",
        resetsAt: asEpochMs(payload.quota_reset_date_utc ?? payload.quota_reset_date),
      });
      metrics.push({ label: "Used", value: String(used ?? Math.max(0, entitlement - remaining)) });
    }
  } else {
    const remaining = asNumber(limited.chat);
    const limit = asNumber(monthly.chat);
    if (remaining !== undefined && limit !== undefined) {
      windows.push({
        key: "monthly",
        label: "Chat requests",
        remaining,
        limit,
        unit: "count",
        resetsAt: asEpochMs(payload.limited_user_reset_date ?? payload.quota_reset_date),
      });
      metrics.push({ label: "Used", value: String(Math.max(0, limit - remaining)) });
    }
  }

  if (windows.length === 0 && metrics.length === 0) throw new Error("No Copilot allowance data found");
  return {
    providerId: "github-copilot",
    providerName: "Copilot",
    source: "GitHub Copilot user API",
    fetchedAt: Date.now(),
    windows,
    metrics,
  };
}

async function queryProvider(ctx: ExtensionContext, providerId: SupportedLiveProvider): Promise<LiveUsageState> {
  const provider = providerInfo(providerId);
  try {
    const headers = await resolveProviderAuth(ctx, providerId);
    if (!headers) {
      const hasCandidate = candidateModels(ctx, providerId).some((model) => modelHasOfficialOrigin(model, providerId));
      return {
        providerId,
        providerName: provider.name,
        status: "unavailable",
        message: hasCandidate ? "No official runtime auth available" : "Provider not available in this session",
      };
    }

    if (providerId === "cursor") {
      headers["x-cursor-client-type"] = headers["x-cursor-client-type"] || "cli";
      headers["x-cursor-client-version"] = headers["x-cursor-client-version"] || "cli-2026.01.17-d239e66";
      headers["x-ghost-mode"] = headers["x-ghost-mode"] || "true";
      headers["x-request-id"] = headers["x-request-id"] || crypto.randomUUID();
    }
    if (providerId === "google-antigravity") {
      headers["User-Agent"] = headers["User-Agent"] || "google-api-nodejs-client/9.15.1";
      headers["X-Goog-Api-Client"] = headers["X-Goog-Api-Client"] || "google-cloud-sdk vscode_cloudshelleditor/0.1";
      headers["Client-Metadata"] = headers["Client-Metadata"] || JSON.stringify({ ideType: "IDE_UNSPECIFIED", platform: "PLATFORM_UNSPECIFIED", pluginType: "GEMINI" });
    }

    const payload = await fetchJson(provider.endpoint, headers, DEFAULT_TIMEOUT_MS, provider.method ?? "GET", provider.body);
    const snapshot =
      providerId === "openai-codex"
        ? parseCodex(payload)
        : providerId === "anthropic"
          ? parseAnthropic(payload)
          : providerId === "github-copilot"
            ? parseCopilot(payload)
            : providerId === "openrouter"
              ? parseOpenRouter(payload)
              : providerId === "cursor"
                ? parseCursor(payload)
                : providerId === "kilo"
                  ? parseKilo(payload)
                  : providerId === "zai"
                    ? parseZai(payload)
                    : parseGoogleAntigravity(payload);

    return { providerId, providerName: provider.name, status: "ready", snapshot };
  } catch (error) {
    return {
      providerId,
      providerName: provider.name,
      status: "error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function queryAllLiveUsage(ctx: ExtensionContext): Promise<LiveUsageState[]> {
  return Promise.all(PROVIDERS.map((provider) => queryProvider(ctx, provider.id)));
}

export async function queryCurrentLiveUsage(ctx: ExtensionContext): Promise<LiveUsageState | undefined> {
  const providerId = ctx.model?.provider as SupportedLiveProvider | undefined;
  if (!providerId || !PROVIDERS.some((provider) => provider.id === providerId)) return undefined;
  return queryProvider(ctx, providerId);
}
