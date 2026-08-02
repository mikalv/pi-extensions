import type { AccountRecord } from "../types/account.ts";
import type { ProviderId } from "../types/provider.ts";

export class AccountRegistry {
  private readonly accounts = new Map<string, AccountRecord>();

  constructor(initialAccounts: AccountRecord[] = []) {
    for (const account of initialAccounts) this.accounts.set(account.id, account);
  }

  all(): AccountRecord[] {
    return [...this.accounts.values()];
  }

  listByProvider(provider: ProviderId): AccountRecord[] {
    return this.all().filter((account) => account.provider === provider);
  }

  get(id: string): AccountRecord | undefined {
    return this.accounts.get(id);
  }

  upsert(account: AccountRecord): void {
    this.accounts.set(account.id, account);
  }

  remove(id: string): boolean {
    return this.accounts.delete(id);
  }
}
