import type { AccountRecord } from "../../types/account.ts";
import type { ResolvedAuth } from "../../types/auth.ts";
import { buildClaudeUserAgent } from "./headers.ts";

export function resolveClaudeAuth(account: AccountRecord | undefined): ResolvedAuth {
  if (!account) {
    return { kind: "subscription", diagnostic: "No Claude account selected" };
  }
  return {
    kind: account.authKind,
    headers: {
      "user-agent": buildClaudeUserAgent(),
      ...(account.headers ?? {}),
    },
    diagnostic: account.status === "invalid" ? "Claude account is invalid" : undefined,
  };
}
