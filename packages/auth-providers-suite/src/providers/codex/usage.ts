import { homedir } from "node:os";
import { join } from "node:path";
import { readActiveCodexCredential, type CodexCredential } from "./accounts.ts";

const CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";

export interface CodexUsageWindow {
  usedPercent: number;
  resetsAt?: number;
  windowDurationMins?: number;
  key?: string;
  label?: string;
}

export interface CodexUsageCredits {
  hasCredits: boolean;
  unlimited: boolean;
  balance?: string;
}

export interface CodexUsageSnapshot {
  limitId: string;
  limitName?: string;
  primary?: CodexUsageWindow;
  secondary?: CodexUsageWindow;
  credits?: CodexUsageCredits;
}

export interface CodexUsageReport {
  capturedAt: number;
  planType?: string;
  snapshots: CodexUsageSnapshot[];
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function assertObject(value: unknown, description: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${description} was not an object`);
  }
  return value as Record<string, unknown>;
}

function parseEpochMs(value: unknown): number | undefined {
  const n = asNumber(value);
  return n === undefined ? undefined : n * 1000;
}

export async function resolveCodexUsageAuth(): Promise<{ token?: string; accountId?: string }> {
  const env = process.env;
  const token = (
    env.OPENAI_CODEX_OAUTH_TOKEN ||
    env.OPENAI_CODEX_ACCESS_TOKEN ||
    env.CODEX_OAUTH_TOKEN ||
    env.CODEX_ACCESS_TOKEN
  )?.trim();
  const accountId = (env.OPENAI_CODEX_ACCOUNT_ID || env.CHATGPT_ACCOUNT_ID)?.trim();
  if (token) return { token, accountId };

  const piCodex = readActiveCodexCredential();
  if (piCodex?.access) {
    return {
      token: piCodex.access,
      accountId: accountId || (typeof piCodex.accountId === "string" ? piCodex.accountId : undefined),
    };
  }

  try {
    const codexAuthPath = join(env.CODEX_HOME?.trim() || join(homedir(), ".codex"), "auth.json");
    const auth = JSON.parse(await (await import("node:fs/promises")).readFile(codexAuthPath, "utf-8")) as Record<string, unknown>;
    if (typeof auth.OPENAI_API_KEY === "string" && auth.OPENAI_API_KEY) {
      return { token: auth.OPENAI_API_KEY, accountId };
    }
    const tokens = (auth.tokens ?? {}) as Record<string, unknown>;
    if (typeof tokens.access_token === "string" && tokens.access_token) {
      return {
        token: tokens.access_token,
        accountId: accountId || (typeof tokens.account_id === "string" ? tokens.account_id : undefined),
      };
    }
  } catch {}

  return { accountId };
}

function labelFromSeconds(seconds: number | undefined, fallback: "Primary" | "Secondary"): string {
  if (!seconds) return fallback;
  if (seconds < 24 * 3600) return `${Math.round(seconds / 3600)}h`;
  if (seconds < 144 * 3600) return "Day";
  return "Week";
}

function parseWindow(raw: Record<string, unknown>, key: string, label: string): CodexUsageWindow {
  const sec = typeof raw.limit_window_seconds === "number" ? raw.limit_window_seconds : undefined;
  return {
    key,
    label,
    usedPercent: typeof raw.used_percent === "number" ? raw.used_percent : 0,
    resetsAt: parseEpochMs(raw.reset_at),
    windowDurationMins: sec ? Math.round(sec / 60) : undefined,
  };
}

function normalizeUsageCredits(value: unknown): CodexUsageCredits | undefined {
  if (value === null || value === undefined) return undefined;
  const credits = assertObject(value, "credits");
  const hasCredits = asBoolean(credits.has_credits);
  const unlimited = asBoolean(credits.unlimited);
  if (hasCredits === undefined || unlimited === undefined) return undefined;
  return { hasCredits, unlimited, balance: asString(credits.balance) };
}

function normalizeUsageSnapshot(
  limitId: string,
  limitName: string | undefined,
  rateLimit: unknown,
  credits: unknown,
): CodexUsageSnapshot | undefined {
  const normalizedCredits = normalizeUsageCredits(credits);
  if (rateLimit === null || rateLimit === undefined) {
    return normalizedCredits ? { limitId, limitName, credits: normalizedCredits } : undefined;
  }

  const details = assertObject(rateLimit, "rate limit");
  const primaryRaw = details.primary_window as Record<string, unknown> | undefined;
  const secondaryRaw = details.secondary_window as Record<string, unknown> | undefined;
  const primary = primaryRaw && Object.keys(primaryRaw).length > 0
    ? parseWindow(primaryRaw, "primary", labelFromSeconds(primaryRaw.limit_window_seconds as number | undefined, "Primary"))
    : undefined;
  const secondary = secondaryRaw && Object.keys(secondaryRaw).length > 0
    ? parseWindow(secondaryRaw, "secondary", labelFromSeconds(secondaryRaw.limit_window_seconds as number | undefined, "Secondary"))
    : undefined;
  if (!primary && !secondary && !normalizedCredits) return undefined;
  return { limitId, limitName, primary, secondary, credits: normalizedCredits };
}

export function normalizeCodexUsagePayload(payload: Record<string, unknown>, capturedAt: number): CodexUsageReport {
  const snapshots: CodexUsageSnapshot[] = [];
  const planType = asString(payload.plan_type);

  const primary = normalizeUsageSnapshot("codex", undefined, payload.rate_limit, payload.credits);
  if (primary) snapshots.push(primary);

  const additional = Array.isArray(payload.additional_rate_limits) ? payload.additional_rate_limits : [];
  additional.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const additionalLimit = item as Record<string, unknown>;
    const limitId = asString(additionalLimit.metered_feature) ?? asString(additionalLimit.limit_name);
    if (!limitId) return;
    const snapshot = normalizeUsageSnapshot(
      limitId,
      asString(additionalLimit.limit_name),
      additionalLimit.rate_limit,
      undefined,
    );
    if (snapshot) snapshots.push(snapshot);
  });

  if (snapshots.length === 0) {
    throw new Error("usage endpoint returned no displayable rate-limit windows");
  }

  return { capturedAt, planType, snapshots };
}

export async function queryCodexUsage(
  credential: CodexCredential,
  timeoutMs = 15_000,
): Promise<CodexUsageReport> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(CODEX_USAGE_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${credential.access}`,
        Accept: "application/json",
        ...(credential.accountId ? { "ChatGPT-Account-Id": credential.accountId } : {}),
      },
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Codex usage endpoint returned ${response.status}: ${text.slice(0, 300)}`);
    }
    const payload = JSON.parse(text) as Record<string, unknown>;
    return normalizeCodexUsagePayload(payload, Date.now());
  } finally {
    clearTimeout(timeout);
  }
}
