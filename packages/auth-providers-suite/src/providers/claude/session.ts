import type { ClaudeAccount } from "./keychain.ts";

export interface ClaudeSessionHints {
  source?: "keychain" | "file" | "unknown";
  multiAccount?: boolean;
  activeSource?: string;
}

export function buildClaudeSessionHints(accounts: ClaudeAccount[], activeSource?: string | null): ClaudeSessionHints {
  const source = !activeSource ? undefined : activeSource === "file" ? "file" : "keychain";
  return {
    ...(source ? { source } : {}),
    multiAccount: accounts.length > 1,
    ...(activeSource ? { activeSource } : {}),
  };
}
