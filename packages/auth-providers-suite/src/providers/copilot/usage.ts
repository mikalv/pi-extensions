export interface CopilotUsageBucket {
  id: string;
  label: string;
  used?: number;
  remaining?: number;
  limit?: number;
  unit: "count";
  period?: "monthly";
  resetsAt?: number;
}

export interface CopilotUsageReport {
  providerId: "github-copilot";
  providerName: "GitHub Copilot";
  capturedAt: number;
  accountLabel?: string;
  buckets: CopilotUsageBucket[];
  notes?: string[];
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asNonnegativeNumber(value: unknown): number | undefined {
  const number = asFiniteNumber(value);
  return number === undefined || number < 0 ? undefined : number;
}

function resetTimestamp(payload: Record<string, unknown>): { resetsAt?: number } {
  const raw =
    asString(payload.quota_reset_date_utc) ??
    asString(payload.quota_reset_date) ??
    asString(payload.limited_user_reset_date);
  if (!raw) return {};
  const milliseconds = Date.parse(raw);
  return Number.isNaN(milliseconds) ? {} : { resetsAt: Math.floor(milliseconds / 1000) };
}

export function normalizeCopilotUsagePayload(
  payload: Record<string, unknown>,
  capturedAt: number,
): CopilotUsageReport {
  const snapshots = asObject(payload.quota_snapshots);
  const premium = asObject(snapshots?.premium_interactions);
  let bucket: CopilotUsageBucket;
  const notes: string[] = [];

  if (premium) {
    const tokenBasedBilling = premium.token_based_billing === true;
    const id = tokenBasedBilling ? "ai-credits" : "premium-requests";
    const label = tokenBasedBilling ? "AI credits" : "Premium requests";

    if (premium.unlimited === true) {
      bucket = { id, label, unit: "count" };
    } else {
      const entitlement = asNonnegativeNumber(premium.entitlement);
      const rawRemaining = asFiniteNumber(premium.remaining) ?? asFiniteNumber(premium.quota_remaining);
      if (entitlement === undefined || rawRemaining === undefined) {
        throw new Error(`GitHub Copilot ${label.toLowerCase()} quota was incomplete.`);
      }
      bucket = {
        id,
        label,
        used: asNonnegativeNumber(premium.credits_used) ?? Math.max(0, entitlement - rawRemaining),
        remaining: Math.max(0, rawRemaining),
        limit: entitlement,
        unit: "count",
        period: "monthly",
        ...resetTimestamp(payload),
      };
    }
  } else {
    const limited = asObject(payload.limited_user_quotas);
    const monthly = asObject(payload.monthly_quotas);
    const remaining = asNonnegativeNumber(limited?.chat);
    const entitlement = asNonnegativeNumber(monthly?.chat);
    if (remaining === undefined || entitlement === undefined) {
      throw new Error("GitHub Copilot usage response contained no supported quota.");
    }
    bucket = {
      id: "chat-requests",
      label: "Chat requests",
      used: Math.max(0, entitlement - remaining),
      remaining,
      limit: entitlement,
      unit: "count",
      period: "monthly",
      ...resetTimestamp(payload),
    };
  }

  const plan = asString(payload.copilot_plan) ?? asString(payload.access_type_sku);
  if (plan) notes.push(`Plan: ${plan}`);

  return {
    providerId: "github-copilot",
    providerName: "GitHub Copilot",
    capturedAt,
    accountLabel: asString(payload.login),
    buckets: [bucket],
    ...(notes.length > 0 ? { notes } : {}),
  };
}
