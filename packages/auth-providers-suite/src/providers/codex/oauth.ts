import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  type CodexCredential,
  importCodexCliIntoPiAuth,
  readActiveCodexCredential,
} from "./accounts.ts";

const DEVICE_AUTH_URL = "https://auth.openai.com/codex/device";
const DEFAULT_LOGIN_TIMEOUT_MS = 16 * 60 * 1000;
const POLL_INTERVAL_MS = 1500;

export interface CodexOAuthCredentials extends CodexCredential {
  type: "oauth";
}

export interface CodexLoginCallbacksLike {
  onAuth: (info: { url: string; instructions?: string; code?: string }) => void;
  onProgress?: (message: string) => void;
  signal?: AbortSignal;
  timeoutMs?: number;
}

interface CodexAuthFile {
  auth_mode?: string;
  OPENAI_API_KEY?: string;
  last_refresh?: string;
  tokens?: {
    access_token?: string;
    refresh_token?: string;
    account_id?: string;
  };
}

function getCodexHome(): string {
  const override = process.env.CODEX_HOME?.trim();
  if (override) {
    if (override === "~") return homedir();
    if (override.startsWith("~/")) return join(homedir(), override.slice(2));
    return override;
  }
  return join(homedir(), ".codex");
}

export function getCodexCliAuthPath(): string {
  return join(getCodexHome(), "auth.json");
}

export function readCodexCliAuthFile(): CodexAuthFile | undefined {
  try {
    const path = getCodexCliAuthPath();
    if (!existsSync(path)) return undefined;
    return JSON.parse(readFileSync(path, "utf-8")) as CodexAuthFile;
  } catch {
    return undefined;
  }
}

export function codexCliAuthToCredential(auth: CodexAuthFile | undefined): CodexOAuthCredentials | undefined {
  const tokens = auth?.tokens;
  if (!tokens?.access_token || !tokens.refresh_token) return undefined;
  return {
    type: "oauth",
    access: tokens.access_token,
    refresh: tokens.refresh_token,
    expires: 0,
    ...(tokens.account_id ? { accountId: tokens.account_id } : {}),
  };
}

export function importCodexCliCredential(): CodexOAuthCredentials | undefined {
  return codexCliAuthToCredential(readCodexCliAuthFile());
}

export function validateCodexCredential(credential: CodexCredential | undefined): void {
  if (!credential) throw new Error("No Codex credential available");
  if (!credential.access) throw new Error("Codex credential is missing access token");
  if (!credential.refresh) throw new Error("Codex credential is missing refresh token");
}

function waitForAbort(signal: AbortSignal | undefined): Promise<never> {
  return new Promise((_, reject) => {
    if (signal?.aborted) {
      reject(new Error("Codex login cancelled"));
      return;
    }
    signal?.addEventListener("abort", () => reject(new Error("Codex login cancelled")), { once: true });
  });
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  await Promise.race([
    new Promise<void>((resolve) => setTimeout(resolve, ms)),
    waitForAbort(signal),
  ]);
}

function parseDeviceCode(output: string): string | undefined {
  const match = output.match(/\b([A-Z0-9]{4,}-[A-Z0-9-]{4,})\b/);
  return match?.[1];
}

async function waitForCodexCliCredential(
  baselineRefresh: string | undefined,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<CodexOAuthCredentials> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw new Error("Codex login cancelled");
    const credential = importCodexCliCredential();
    if (credential && credential.refresh && credential.refresh !== baselineRefresh) {
      return credential;
    }
    await sleep(POLL_INTERVAL_MS, signal);
  }
  throw new Error("Codex device login timed out");
}

export function getCodexCredentialSource(): "cli" | "pi" | "none" {
  if (importCodexCliCredential()) return "cli";
  if (readActiveCodexCredential()) return "pi";
  return "none";
}

export async function loginCodex(callbacks: CodexLoginCallbacksLike): Promise<CodexOAuthCredentials> {
  const existing = importCodexCliCredential();
  const baselineRefresh = existing?.refresh;
  const timeoutMs = callbacks.timeoutMs ?? DEFAULT_LOGIN_TIMEOUT_MS;

  callbacks.onAuth({
    url: DEVICE_AUTH_URL,
    instructions: "Codex will print a one-time device code. Open the link and enter the code to finish login.",
  });

  const child = spawn("npx", ["-y", "@openai/codex", "login", "--device-auth"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });

  let combined = "";
  let announcedCode = false;
  const onChunk = (chunk: string) => {
    combined += chunk;
    if (!announcedCode) {
      const code = parseDeviceCode(combined);
      if (code) {
        announcedCode = true;
        callbacks.onAuth({
          url: DEVICE_AUTH_URL,
          code,
          instructions: `Open ${DEVICE_AUTH_URL} and enter code: ${code}`,
        });
      }
    }
  };

  child.stdout?.on("data", (chunk) => onChunk(String(chunk)));
  child.stderr?.on("data", (chunk) => onChunk(String(chunk)));

  const killChild = () => {
    try { child.kill("SIGTERM"); } catch {}
  };
  callbacks.signal?.addEventListener("abort", killChild, { once: true });

  try {
    callbacks.onProgress?.("Waiting for Codex device login...");
    const credential = await Promise.race([
      waitForCodexCliCredential(baselineRefresh, timeoutMs, callbacks.signal),
      waitForAbort(callbacks.signal),
    ]);
    validateCodexCredential(credential);
    const imported = importCodexCliIntoPiAuth(credential);
    callbacks.onProgress?.("Codex login completed and imported into Pi auth.");
    return imported;
  } finally {
    killChild();
  }
}

export async function importCodexCredentialFromCliOrPi(): Promise<CodexOAuthCredentials> {
  const imported = importCodexCliCredential();
  if (imported) {
    return importCodexCliIntoPiAuth(imported);
  }
  const active = readActiveCodexCredential();
  validateCodexCredential(active);
  return { ...active, type: "oauth" };
}

export async function refreshCodexCredential(
  credential: CodexCredential,
): Promise<CodexOAuthCredentials> {
  validateCodexCredential(credential);
  const imported = importCodexCliCredential();
  if (imported?.refresh === credential.refresh || imported?.accountId === credential.accountId) {
    return imported;
  }
  const active = readActiveCodexCredential();
  if (active?.refresh === credential.refresh || active?.accountId === credential.accountId) {
    return { ...active, type: "oauth" };
  }
  return { ...credential, type: "oauth", expires: 0 };
}
