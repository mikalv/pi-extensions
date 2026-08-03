import type { AccountRecord } from "../../types/account.ts";
import { AccountRegistry } from "../../accounts/registry.ts";
import {
  buildCodexAccountRecord,
  importAndSaveNamedCodexAccount,
  type CodexCredential,
} from "./accounts.ts";
import {
  importCodexCredentialFromCliOrPi,
  loginCodex,
  type CodexLoginCallbacksLike,
} from "./oauth.ts";

export interface CodexLoginAndSaveOptions extends CodexLoginCallbacksLike {
  label?: string;
}

function defaultCodexLabel(credential: CodexCredential): string {
  if (credential.accountId) return `account-${credential.accountId.slice(0, 8)}`;
  return `codex-${Date.now().toString(36)}`;
}

export async function loginAndSaveCodexAccount(
  options: CodexLoginAndSaveOptions,
): Promise<AccountRecord> {
  const credential = await loginCodex(options);
  const label = options.label?.trim() || defaultCodexLabel(credential);
  return importAndSaveNamedCodexAccount(label, credential);
}

export async function importAndDescribeCodexAccount(
  label?: string,
): Promise<AccountRecord> {
  const credential = await importCodexCredentialFromCliOrPi();
  if (label?.trim()) {
    return importAndSaveNamedCodexAccount(label.trim(), credential);
  }
  return buildCodexAccountRecord(defaultCodexLabel(credential), credential, "ready");
}

export async function loginSaveAndRegisterCodexAccount(
  registry: AccountRegistry,
  options: CodexLoginAndSaveOptions,
): Promise<AccountRecord> {
  const account = await loginAndSaveCodexAccount(options);
  registry.upsert(account);
  return account;
}

export async function importSaveAndRegisterCodexAccount(
  registry: AccountRegistry,
  label?: string,
): Promise<AccountRecord> {
  const account = await importAndDescribeCodexAccount(label);
  registry.upsert(account);
  return account;
}
