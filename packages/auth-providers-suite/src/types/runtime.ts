import type { ResolvedAuth } from "./auth.ts";
import type { AccountRecord } from "./account.ts";
import type { ProviderDescriptor, ProviderId } from "./provider.ts";

export interface ProviderCapabilities {
  modelDiscovery?: boolean;
  quotaProbe?: boolean;
  multiAccount?: boolean;
}

export interface ResolvedProviderConfig {
  provider: ProviderId;
  descriptor: ProviderDescriptor;
  account?: AccountRecord;
  auth: ResolvedAuth;
  baseUrl?: string;
  capabilities: ProviderCapabilities;
  models?: string[];
}
