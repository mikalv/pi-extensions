import type { AccountRecord } from "../types/account.ts";
import type { ResolvedAuth } from "../types/auth.ts";

export function resolveAuthFromAccount(account: AccountRecord | undefined): ResolvedAuth {
  if (!account) return { kind: "none", diagnostic: "No account selected" };
  return {
    kind: account.authKind,
    headers: account.headers,
    diagnostic: account.status === "invalid" ? "Account is marked invalid" : undefined,
  };
}
