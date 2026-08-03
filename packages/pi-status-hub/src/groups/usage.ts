import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { queryAllLiveUsage } from "../../../mm-usage-center/src/live.ts";
import type { GroupData, StatusGroup } from "../types.ts";

export function createUsageGroup(getCtx: () => ExtensionContext | undefined): StatusGroup {
  return {
    id: "usage",
    name: "Usage",
    icon: "◔",
    priority: 20,
    ttlMs: 60_000,
    async dataProvider(): Promise<GroupData> {
      const ctx = getCtx();
      if (!ctx) {
        return {
          source: "mm-usage-center",
          healthy: false,
          summary: "No session context yet",
          items: [],
          updatedAt: Date.now(),
        };
      }

      const rows = await queryAllLiveUsage(ctx);
      const ready = rows.filter((row) => row.status === "ready");
      const errorCount = rows.filter((row) => row.status === "error").length;
      return {
        source: "mm-usage-center",
        healthy: errorCount === 0,
        summary: ready.length > 0
          ? `${ready.length} live · ${ready.slice(0, 2).map((row) => row.providerName).join(", ")}`
          : `${rows.length} checked · no live snapshots`,
        metrics: [
          { id: "ready", label: "Live", value: ready.length },
          { id: "error", label: "Errors", value: errorCount },
          { id: "total", label: "Total", value: rows.length },
        ],
        items: rows.map((row) => ({
          providerId: row.providerId,
          providerName: row.providerName,
          status: row.status,
          summary: row.snapshot?.windows?.map((window) => window.label).join(" · ") || row.message || row.snapshot?.source || "",
          metrics: row.snapshot?.metrics ?? [],
        })),
        updatedAt: Date.now(),
      };
    },
  };
}
