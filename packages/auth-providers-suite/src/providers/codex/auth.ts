import type { AccountRecord } from "../../types/account.ts";
import type { ResolvedAuth } from "../../types/auth.ts";

export function resolveCodexAuth(account: AccountRecord | undefined): ResolvedAuth {
  if (!account) {
    return { kind: "oauth", diagnostic: "No Codex account selected" };
  }
  return {
    kind: account.authKind,
    headers: account.headers,
    diagnostic: account.status === "invalid" ? "Codex account is invalid" : undefined,
  };
}

export function resolveCodexAuthKind(account: AccountRecord | undefined): "oauth" | "none" {
  return account ? "oauth" : "none";
}
