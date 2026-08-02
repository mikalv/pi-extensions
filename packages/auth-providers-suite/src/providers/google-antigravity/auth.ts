import type { AccountRecord } from "../../types/account.ts";
import type { ResolvedAuth } from "../../types/auth.ts";

export function resolveGoogleAntigravityAuth(account: AccountRecord | undefined): ResolvedAuth {
  if (!account) {
    return { kind: "oauth", diagnostic: "No Google Antigravity account selected" };
  }
  return {
    kind: "oauth",
    headers: account.headers,
    diagnostic: account.status === "invalid" ? "Google Antigravity account is invalid" : undefined,
  };
}
