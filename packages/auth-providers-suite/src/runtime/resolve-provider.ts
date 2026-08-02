import { PROVIDER_CATALOG } from "../providers/catalog.ts";
import type { ProviderDescriptor, ProviderId } from "../types/provider.ts";

export function resolveProvider(provider: ProviderId): ProviderDescriptor {
  const descriptor = PROVIDER_CATALOG.find((entry) => entry.id === provider);
  if (!descriptor) throw new Error(`Unknown provider: ${provider}`);
  return descriptor;
}
