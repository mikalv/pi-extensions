import type { AccountRecord } from "../../types/account.ts";
import type { ResolvedAuth } from "../../types/auth.ts";

export function resolveCodexAuth(account: AccountRecord | undefined): ResolvedAuth {
  if (!account) {
    return { kind: "oauth", diagnostic: "No Codex account selected" };
  }
  const metadata = account.metadata || {};
  return {
    kind: account.authKind,
    headers: account.headers,
    accessToken: typeof metadata.accessToken === "string" ? metadata.accessToken : undefined,
    refreshToken: typeof metadata.refreshToken === "string" ? metadata.refreshToken : undefined,
    expiresAt: typeof metadata.expiresAt === "number" ? metadata.expiresAt : undefined,
    diagnostic: account.status === "invalid" ? "Codex account is invalid" : undefined,
  };
}

export function resolveCodexAuthKind(account: AccountRecord | undefined): "oauth" | "none" {
  return account ? "oauth" : "none";
}
