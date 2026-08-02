import type { AccountRecord } from "../../types/account.ts";
import type { ResolvedAuth } from "../../types/auth.ts";

export function resolveKiloAuth(account: AccountRecord | undefined): ResolvedAuth {
  if (!account) {
    return { kind: "oauth", diagnostic: "No Kilo account selected" };
  }
  return {
    kind: account.authKind,
    headers: {
      "X-KILOCODE-EDITORNAME": "pi",
      ...(account.headers ?? {}),
    },
    diagnostic: account.status === "invalid" ? "Kilo account is invalid" : undefined,
  };
}
