import { Type } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getStatusGroup, getStatusSnapshot } from "../api/handlers.ts";
import type { StatusRegistry } from "../registry.ts";

export function registerStatusSnapshotTool(pi: ExtensionAPI, registry: StatusRegistry, getCtx: () => ExtensionContext | undefined): void {
  pi.registerTool({
    name: "status_hub_snapshot",
    label: "Status Hub Snapshot",
    description: "Get a normalized snapshot of registered status groups.",
    parameters: Type.Object({
      groupId: Type.Optional(Type.String({ description: "Optional single group id to refresh and return." })),
      forceRefresh: Type.Optional(Type.Boolean({ description: "Refresh before returning." })),
    }),
    async execute(_id, params: { groupId?: string; forceRefresh?: boolean }) {
      const ctx = getCtx();
      if (params.groupId) {
        const group = await getStatusGroup(registry, params.groupId, ctx, { forceRefresh: params.forceRefresh });
        return { content: [{ type: "text", text: JSON.stringify(group, null, 2) }], details: group };
      }
      const snapshot = await getStatusSnapshot(registry, ctx, { forceRefresh: params.forceRefresh });
      return { content: [{ type: "text", text: JSON.stringify(snapshot, null, 2) }], details: snapshot };
    },
  });
}
