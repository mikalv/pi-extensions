import type { AccountRecord } from "../types/account.ts";

export function selectPreferredAccount(accounts: AccountRecord[]): AccountRecord | undefined {
  return accounts.find((account) => account.enabled && account.status !== "invalid") ?? accounts[0];
}
