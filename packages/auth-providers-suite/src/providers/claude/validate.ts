import type { ClaudeAccount, ClaudeCredentials } from "./keychain.ts";

export interface ClaudeValidationResult {
  ok: boolean;
  reason?: string;
}

export function validateClaudeAccountPresence(hasAccount: boolean): ClaudeValidationResult {
  return hasAccount ? { ok: true } : { ok: false, reason: "No Claude account configured" };
}

export function validateClaudeCredentials(creds: ClaudeCredentials | null | undefined): ClaudeValidationResult {
  if (!creds) return { ok: false, reason: "No Claude credentials available" };
  if (!creds.accessToken || !creds.refreshToken) return { ok: false, reason: "Claude credentials are incomplete" };
  return { ok: true };
}

export function validateClaudeAccounts(accounts: ClaudeAccount[]): ClaudeValidationResult {
  return accounts.length > 0 ? { ok: true } : { ok: false, reason: "No Claude accounts discovered" };
}
