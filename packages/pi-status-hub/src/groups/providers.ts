import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { PROVIDER_CATALOG } from "../../../auth-providers-suite/src/providers/catalog.ts";
import type { GroupData, ProviderRecord, StatusGroup } from "../types.ts";

function modelCounts(ctx?: ExtensionContext): Map<string, number> {
  const counts = new Map<string, number>();
  const add = (provider: string | undefined) => {
    if (!provider) return;
    counts.set(provider, (counts.get(provider) ?? 0) + 1);
  };
  const registry = ctx?.modelRegistry as any;
  for (const model of registry?.getAvailable?.() ?? []) add((model as any)?.provider);
  return counts;
}

export function createProvidersGroup(getCtx: () => ExtensionContext | undefined): StatusGroup {
  return {
    id: "providers",
    name: "Providers",
    icon: "⚡",
    priority: 30,
    ttlMs: 15_000,
    async dataProvider(): Promise<GroupData> {
      const ctx = getCtx();
      const counts = modelCounts(ctx);
      const items: ProviderRecord[] = PROVIDER_CATALOG.map((provider) => ({
        id: provider.id,
        label: provider.label,
        status: (counts.get(provider.id) ?? 0) > 0 ? "available" : "known",
        modelCount: counts.get(provider.id) ?? 0,
        authPreference: provider.authPreference,
        metadata: {
          family: provider.family,
          supportsQuotaProbe: provider.supportsQuotaProbe ?? false,
          supportsModelDiscovery: provider.supportsModelDiscovery ?? false,
        },
      }));

      const available = items.filter((item) => item.status === "available");
      return {
        source: "auth-providers-suite",
        healthy: true,
        summary: available.length > 0
          ? `${available.length} available · ${available.slice(0, 3).map((item) => item.label).join(", ")}`
          : `0 available · ${items.length} known`,
        metrics: [
          { id: "available", label: "Available", value: available.length },
          { id: "known", label: "Known", value: items.length },
        ],
        items,
        updatedAt: Date.now(),
      };
    },
  };
}
