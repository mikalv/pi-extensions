import { loadCodexAccountsStore, readActiveCodexCredential } from "./accounts.ts";
import { getCodexCredentialSource, getCodexCliAuthPath } from "./oauth.ts";
import { validateCodexSetup } from "./validate.ts";

export interface CodexStatusSnapshot {
  source: "cli" | "pi" | "none";
  cliAuthPath: string;
  hasActivePiCredential: boolean;
  activePiAccountId?: string;
  savedAccountLabels: string[];
  activeSavedLabel?: string;
  validation: ReturnType<typeof validateCodexSetup>;
}

export function getCodexStatusSnapshot(): CodexStatusSnapshot {
  const store = loadCodexAccountsStore();
  const active = readActiveCodexCredential();
  return {
    source: getCodexCredentialSource(),
    cliAuthPath: getCodexCliAuthPath(),
    hasActivePiCredential: !!active,
    activePiAccountId: typeof active?.accountId === "string" ? active.accountId : undefined,
    savedAccountLabels: Object.keys(store.accounts).sort(),
    activeSavedLabel: store.active,
    validation: validateCodexSetup(),
  };
}
