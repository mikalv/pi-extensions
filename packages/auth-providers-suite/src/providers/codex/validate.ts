import type { AccountRecord } from "../../types/account.ts";
import type { CodexCredential } from "./accounts.ts";
import {
  getCodexCredentialSource,
  importCodexCliCredential,
} from "./oauth.ts";
import { readActiveCodexCredential } from "./accounts.ts";

export interface CodexValidationReport {
  ok: boolean;
  source: "cli" | "pi" | "none";
  problems: string[];
  credential?: CodexCredential;
}

export function validateCodexCredentialShape(credential: CodexCredential | undefined): string[] {
  const problems: string[] = [];
  if (!credential) {
    problems.push("missing credential");
    return problems;
  }
  if (!credential.access) problems.push("missing access token");
  if (!credential.refresh) problems.push("missing refresh token");
  return problems;
}

export function validateCodexSetup(): CodexValidationReport {
  const source = getCodexCredentialSource();
  const credential = source === "cli"
    ? importCodexCliCredential()
    : source === "pi"
      ? readActiveCodexCredential()
      : undefined;
  const problems = validateCodexCredentialShape(credential);
  return {
    ok: problems.length === 0,
    source,
    problems,
    ...(credential ? { credential } : {}),
  };
}

export function validateCodexAccountRecord(account: AccountRecord | undefined): string[] {
  if (!account) return ["missing account record"];
  if (account.provider !== "codex") return ["account provider is not codex"];
  const metadata = account.metadata || {};
  const credential: CodexCredential | undefined =
    typeof metadata.accessToken === "string" && typeof metadata.refreshToken === "string"
      ? {
          type: "oauth",
          access: metadata.accessToken,
          refresh: metadata.refreshToken,
          expires: typeof metadata.expiresAt === "number" ? metadata.expiresAt : 0,
          ...(typeof metadata.accountId === "string" ? { accountId: metadata.accountId } : {}),
        }
      : undefined;
  return validateCodexCredentialShape(credential);
}

export function codexAccountRecordLooksUsable(account: AccountRecord | undefined): boolean {
  if (!account) return false;
  if (account.provider !== "codex") return false;
  if (account.enabled === false) return false;
  if (account.status === "invalid") return false;
  const metadata = account.metadata || {};
  return typeof metadata.accessToken === "string" && metadata.accessToken.length > 0
    && typeof metadata.refreshToken === "string" && metadata.refreshToken.length > 0;
}
