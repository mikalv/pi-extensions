import type { AccountRecord } from "../../types/account.ts";
import type { ResolvedAuth } from "../../types/auth.ts";

export function resolveCursorAuth(account: AccountRecord | undefined): ResolvedAuth {
  if (!account) return { kind: "oauth", diagnostic: "No Cursor account selected" };
  return {
    kind: account.authKind,
    headers: account.headers,
    diagnostic: account.status === "invalid" ? "Cursor account is invalid" : undefined,
  };
}
