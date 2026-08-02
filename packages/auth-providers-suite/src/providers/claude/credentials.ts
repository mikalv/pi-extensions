import { execFileSync, execSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  readAllClaudeAccounts,
  refreshClaudeAccount,
  writeBackClaudeCredentials,
  type ClaudeAccount,
  type ClaudeCredentials,
} from "./keychain.ts";

const CREDENTIAL_CACHE_TTL_MS = 30_000;
const accountCacheMap = new Map<string, { creds: ClaudeCredentials; cachedAt: number }>();
let activeAccountSource: string | null = null;
let allAccounts: ClaudeAccount[] = [];

export const CLAUDE_OAUTH_TOKEN_URL = "https://claude.ai/v1/oauth/token";
export const CLAUDE_OAUTH_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";

function getPiAgentDir(): string {
  return process.env.PI_CODING_AGENT_DIR || join(process.env.HOME || "", ".pi", "agent");
}

function getAuthJsonPath(): string {
  return join(getPiAgentDir(), "auth.json");
}

function getAccountStateFile(): string {
  return join(getPiAgentDir(), "claude-account-source.txt");
}

export function initClaudeAccounts(accounts: ClaudeAccount[]): void {
  allAccounts = accounts;
}

export function getClaudeAccounts(): ClaudeAccount[] {
  return allAccounts;
}

export function setActiveClaudeAccountSource(source: string): void {
  activeAccountSource = source;
  accountCacheMap.delete(source);
}

export function refreshClaudeAccountsList(): ClaudeAccount[] {
  allAccounts = readAllClaudeAccounts();
  return allAccounts;
}

function getActiveAccount(): ClaudeAccount | null {
  if (allAccounts.length === 0) return null;
  if (activeAccountSource) {
    const found = allAccounts.find((account) => account.source === activeAccountSource);
    if (found) return found;
  }
  return allAccounts[0] ?? null;
}

export function loadPersistedClaudeAccountSource(): string | null {
  try {
    const path = getAccountStateFile();
    if (existsSync(path)) return readFileSync(path, "utf-8").trim() || null;
  } catch {}
  return null;
}

export function saveClaudeAccountSource(source: string): void {
  try {
    const path = getAccountStateFile();
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(path, source, "utf-8");
  } catch {}
}

function syncToPath(authPath: string, creds: ClaudeCredentials): void {
  let auth: Record<string, unknown> = {};
  if (existsSync(authPath)) {
    const raw = readFileSync(authPath, "utf-8").trim();
    if (raw) {
      try { auth = JSON.parse(raw); } catch {}
    }
  }
  auth.anthropic = {
    type: "oauth",
    access: creds.accessToken,
    refresh: creds.refreshToken,
    expires: creds.expiresAt,
  };
  const dir = dirname(authPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(authPath, JSON.stringify(auth, null, 2), { encoding: "utf-8", mode: 0o600 });
  if (process.platform !== "win32") chmodSync(authPath, 0o600);
}

export function syncClaudeAuthJson(creds: ClaudeCredentials): void {
  syncToPath(getAuthJsonPath(), creds);
}

export function parseClaudeOAuthResponse(
  raw: string,
  currentRefreshToken: string,
  now: number = Date.now(),
): ClaudeCredentials | null {
  let data: { access_token?: string; refresh_token?: string; expires_in?: number };
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data.access_token) return null;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? currentRefreshToken,
    expiresAt: now + (data.expires_in ?? 36_000) * 1000,
  };
}

export function refreshClaudeViaOAuth(refreshToken: string): ClaudeCredentials | null {
  const script = `
process.stdin.resume();
let input = '';
process.stdin.on('data', c => input += c);
process.stdin.on('end', () => {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: '${CLAUDE_OAUTH_CLIENT_ID}',
    refresh_token: input.trim()
  });
  fetch('${CLAUDE_OAUTH_TOKEN_URL}', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  })
  .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
  .then(d => { process.stdout.write(JSON.stringify(d)); })
  .catch(() => { process.exit(1); });
});`;
  try {
    const result = execFileSync(process.execPath, ["-e", script], {
      input: refreshToken,
      timeout: 15_000,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
    });
    return parseClaudeOAuthResponse(result, refreshToken);
  } catch {
    return null;
  }
}

function refreshClaudeViaCli(): void {
  const maxAttempts = 2;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      execSync("claude -p . --model haiku", {
        timeout: 60_000,
        encoding: "utf-8",
        env: { ...process.env, TERM: "dumb" },
        stdio: "ignore",
        cwd: tmpdir(),
      });
      return;
    } catch {}
  }
}

export function refreshClaudeIfNeeded(account?: ClaudeAccount): ClaudeCredentials | null {
  const target = account ?? getActiveAccount();
  if (!target) return null;

  if (target.source === "file") {
    const onDisk = refreshClaudeAccount(target.source);
    if (onDisk) target.credentials = onDisk;
  }

  const creds = target.credentials;
  if (creds.expiresAt > Date.now() + 60_000) return creds;

  if (creds.refreshToken) {
    const oauthCreds = refreshClaudeViaOAuth(creds.refreshToken);
    if (oauthCreds && oauthCreds.expiresAt > Date.now() + 60_000) {
      target.credentials = oauthCreds;
      writeBackClaudeCredentials(target.source, oauthCreds);
      return oauthCreds;
    }
  }

  refreshClaudeViaCli();
  const refreshed = refreshClaudeAccount(target.source);
  if (refreshed && refreshed.expiresAt > Date.now() + 60_000) {
    target.credentials = refreshed;
    return refreshed;
  }
  return null;
}

export function forceRefreshActiveClaudeCredentials(): ClaudeCredentials | null {
  const account = getActiveAccount();
  if (!account) return null;
  accountCacheMap.delete(account.source);

  const onDisk = refreshClaudeAccount(account.source);
  if (onDisk) account.credentials = onDisk;
  if (account.credentials.expiresAt > Date.now() + 60_000) {
    accountCacheMap.set(account.source, { creds: account.credentials, cachedAt: Date.now() });
    return account.credentials;
  }

  const fresh = refreshClaudeIfNeeded(account);
  if (fresh) accountCacheMap.set(account.source, { creds: fresh, cachedAt: Date.now() });
  return fresh;
}

export function getClaudeCredentialsForSync(): ClaudeCredentials | null {
  const account = getActiveAccount();
  if (!account) return null;
  return account.credentials.expiresAt > Date.now() + 60_000 ? account.credentials : null;
}

export function getCachedClaudeCredentials(): ClaudeCredentials | null {
  const account = getActiveAccount();
  if (!account) return null;

  const now = Date.now();
  const cached = accountCacheMap.get(account.source);
  if (cached && now - cached.cachedAt < CREDENTIAL_CACHE_TTL_MS && cached.creds.expiresAt > now + 60_000) {
    return cached.creds;
  }

  const fresh = refreshClaudeIfNeeded(account);
  if (!fresh) {
    accountCacheMap.delete(account.source);
    return null;
  }
  accountCacheMap.set(account.source, { creds: fresh, cachedAt: now });
  return fresh;
}
