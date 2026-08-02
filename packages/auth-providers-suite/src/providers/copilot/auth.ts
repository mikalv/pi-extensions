import type { AccountRecord } from "../../types/account.ts";
import type { ResolvedAuth } from "../../types/auth.ts";

export function resolveCopilotAuth(account: AccountRecord | undefined): ResolvedAuth {
  if (!account) return { kind: "oauth", diagnostic: "No Copilot account selected" };
  return {
    kind: account.authKind,
    headers: account.headers,
    diagnostic: account.status === "invalid" ? "Copilot account is invalid" : undefined,
  };
}
