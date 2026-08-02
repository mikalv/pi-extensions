// =============================================================================
// PI Backoffice Reporter — Transport + Identity
// =============================================================================

import { createHash } from "node:crypto";
import { networkInterfaces, hostname as osHostname } from "node:os";
import type {
  BackofficeEvent,
  EventEnvelope,
  PermissionPost,
  PermissionReply,
  QuestionPost,
  QuestionReply,
  ReporterIdentity,
  StatusPost,
} from "./protocol.js";

// ---------------------------------------------------------------------------
// Identity — computed once per session startup
// ---------------------------------------------------------------------------

/** Best-effort primary non-loopback IP (IPv4 preferred, fallback IPv6) */
function resolveHostIp(): string {
  const ifaces = networkInterfaces();
  let fallbackV6: string | undefined;

  for (const iface of Object.values(ifaces)) {
    if (!iface) continue;
    for (const addr of iface) {
      if (addr.internal) continue;
      if (addr.family === "IPv4") return addr.address;
      if (!fallbackV6) fallbackV6 = addr.address;
    }
  }
  return fallbackV6 ?? "unknown";
}

/**
 * Build a stable reporter identity for one PI session.
 * reporterId = sha256(hostname + sessionId + sessionStartIso).slice(0, 16)
 */
export function buildIdentity(
  sessionId: string,
  sessionStartIso: string,
  sessionFile?: string,
  sessionName?: string,
  cwd?: string,
): ReporterIdentity {
  const hostname = osHostname();
  const hostIp = resolveHostIp();

  const reporterId = createHash("sha256")
    .update(`${hostname}:${sessionId}:${sessionStartIso}`)
    .digest("hex")
    .slice(0, 16);

  return {
    reporterId,
    hostname,
    hostIp,
    sessionId,
    sessionName,
    sessionFile,
    cwd: cwd ?? process.cwd(),
    sessionStartIso,
  };
}

// ---------------------------------------------------------------------------
// Transport config
// ---------------------------------------------------------------------------

export interface TransportConfig {
  /** e.g. "https://backoffice.example.com" */
  baseUrl: string;
  /** Bearer token for auth */
  apiKey?: string;
  /** Timeout for blocking requests (permission/question), default 5 min */
  timeoutMs?: number;
}

export function loadConfig(): TransportConfig | null {
  if (!process.env.PI_EXTERNAL_REPORTER || process.env.PI_EXTERNAL_REPORTER === "0") {
    return null;
  }
  const baseUrl = process.env.BACKOFFICE_URL;
  if (!baseUrl) {
    console.warn("[pi-backoffice-reporter] PI_EXTERNAL_REPORTER=1 but BACKOFFICE_URL is not set");
    return null;
  }
  return {
    baseUrl,
    apiKey: process.env.BACKOFFICE_API_KEY,
    timeoutMs: process.env.BACKOFFICE_TIMEOUT_MS
      ? Number(process.env.BACKOFFICE_TIMEOUT_MS)
      : undefined,
  };
}

// ---------------------------------------------------------------------------
// Envelope builder
// ---------------------------------------------------------------------------

export function buildEnvelope<T extends BackofficeEvent>(
  event: T,
  identity: ReporterIdentity,
  model?: string,
): EventEnvelope<T> {
  return {
    id: crypto.randomUUID(),
    reporter: identity,
    model,
    ts: Date.now(),
    event,
  };
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function headers(config: TransportConfig): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (config.apiKey) h["Authorization"] = `Bearer ${config.apiKey}`;
  return h;
}

/** Fire-and-forget. Errors are swallowed — reporter must never crash PI. */
export async function postStatus(
  config: TransportConfig,
  envelope: StatusPost,
): Promise<void> {
  try {
    await fetch(`${config.baseUrl}/api/events`, {
      method: "POST",
      headers: headers(config),
      body: JSON.stringify(envelope),
    });
  } catch {
    // silently ignore — backoffice is optional infrastructure
  }
}

/** Blocking POST — waits for server to reply with a decision. */
export async function postPermission(
  config: TransportConfig,
  envelope: PermissionPost,
  signal?: AbortSignal,
): Promise<PermissionReply> {
  const timeoutMs = config.timeoutMs ?? 5 * 60 * 1000;
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  try {
    const res = await fetch(`${config.baseUrl}/api/permissions`, {
      method: "POST",
      headers: headers(config),
      body: JSON.stringify(envelope),
      signal: combined,
    });
    if (!res.ok) return { decision: `server_error_${res.status}` };
    return (await res.json()) as PermissionReply;
  } catch (err) {
    if ((err as Error)?.name === "AbortError") return { decision: "deny" };
    return { decision: "deny" };
  }
}

/** Blocking POST — waits for server to reply with answers. */
export async function postQuestion(
  config: TransportConfig,
  envelope: QuestionPost,
  signal?: AbortSignal,
): Promise<QuestionReply | null> {
  const timeoutMs = config.timeoutMs ?? 5 * 60 * 1000;
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  try {
    const res = await fetch(`${config.baseUrl}/api/questions`, {
      method: "POST",
      headers: headers(config),
      body: JSON.stringify(envelope),
      signal: combined,
    });
    if (!res.ok) return null;
    return (await res.json()) as QuestionReply;
  } catch {
    return null;
  }
}
