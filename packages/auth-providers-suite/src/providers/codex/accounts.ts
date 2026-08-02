import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface CodexCredential {
  type: "oauth";
  access: string;
  refresh: string;
  expires: number;
  accountId?: string;
  [key: string]: unknown;
}

export interface CodexSavedAccount {
  credential: CodexCredential;
  savedAt: number;
  lastUsedAt?: number;
}

export interface CodexAccountsStore {
  accounts: Record<string, CodexSavedAccount>;
  active?: string;
}

function getAgentDir(): string {
  const override = process.env.PI_CODING_AGENT_DIR;
  if (override && override.trim().length > 0) {
    const trimmed = override.trim();
    if (trimmed === "~") return homedir();
    if (trimmed.startsWith("~/")) return join(homedir(), trimmed.slice(2));
    return trimmed;
  }
  return join(homedir(), ".pi", "agent");
}

export function getCodexAuthPath(): string {
  return join(getAgentDir(), "auth.json");
}

export function getCodexAccountsStorePath(): string {
  return join(getAgentDir(), "codex-accounts.json");
}

function readJsonFile<T>(path: string, fallback: T): T {
  try {
    if (!existsSync(path)) return fallback;
    const raw = readFileSync(path, "utf-8").trim();
    if (!raw.length) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJsonFileSecure(path: string, data: unknown): void {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(path, JSON.stringify(data, null, 2), {
    encoding: "utf-8",
    mode: 0o600,
  });
  try { chmodSync(path, 0o600); } catch {}
}

export function isCodexCredential(value: unknown): value is CodexCredential {
  if (!value || typeof value !== "object") return false;
  const credential = value as Record<string, unknown>;
  return credential.type === "oauth" && typeof credential.access === "string" && typeof credential.refresh === "string";
}

export function readActiveCodexCredential(): CodexCredential | undefined {
  const auth = readJsonFile<Record<string, unknown>>(getCodexAuthPath(), {});
  const credential = auth["openai-codex"];
  return isCodexCredential(credential) ? credential : undefined;
}

export function writeActiveCodexCredential(credential: CodexCredential): void {
  const authPath = getCodexAuthPath();
  const auth = readJsonFile<Record<string, unknown>>(authPath, {});
  auth["openai-codex"] = {
    ...credential,
    type: "oauth",
    expires: 0,
  };
  writeJsonFileSecure(authPath, auth);
}

export function loadCodexAccountsStore(): CodexAccountsStore {
  const store = readJsonFile<Partial<CodexAccountsStore>>(getCodexAccountsStorePath(), {});
  return {
    accounts: store.accounts && typeof store.accounts === "object" ? store.accounts : {},
    active: typeof store.active === "string" ? store.active : undefined,
  };
}

export function saveCodexAccountsStore(store: CodexAccountsStore): void {
  writeJsonFileSecure(getCodexAccountsStorePath(), store);
}

export function detectActiveCodexLabel(
  store: CodexAccountsStore,
  active: CodexCredential | undefined,
): string | undefined {
  if (!active) return undefined;
  for (const [label, account] of Object.entries(store.accounts)) {
    const c = account.credential;
    if (active.accountId && c.accountId && active.accountId === c.accountId) return label;
  }
  for (const [label, account] of Object.entries(store.accounts)) {
    if (account.credential.refresh === active.refresh) return label;
  }
  return store.active;
}

export function saveNamedCodexAccount(label: string, credential: CodexCredential): void {
  const store = loadCodexAccountsStore();
  store.accounts[label] = {
    credential: { ...credential, type: "oauth" },
    savedAt: Date.now(),
    lastUsedAt: store.accounts[label]?.lastUsedAt,
  };
  store.active = label;
  saveCodexAccountsStore(store);
}

export function switchNamedCodexAccount(label: string): CodexCredential | undefined {
  const store = loadCodexAccountsStore();
  const account = store.accounts[label];
  if (!account) return undefined;

  const active = readActiveCodexCredential();
  if (active) {
    const activeLabel = detectActiveCodexLabel(store, active);
    if (activeLabel && store.accounts[activeLabel]) {
      store.accounts[activeLabel] = {
        ...store.accounts[activeLabel]!,
        credential: { ...active, type: "oauth" },
      };
    }
  }

  writeActiveCodexCredential(account.credential);
  account.lastUsedAt = Date.now();
  store.active = label;
  saveCodexAccountsStore(store);
  return account.credential;
}
