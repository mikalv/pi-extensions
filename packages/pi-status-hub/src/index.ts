import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { DEFAULT_STATUS_HUB_SETTINGS } from "./config.ts";
import { createDefaultGroups } from "./groups/index.ts";
import { StatusRegistry } from "./registry.ts";
import { registerStatusCommand } from "./commands/status.ts";
import { registerStatusSnapshotTool } from "./tools/status_hub_snapshot.ts";

export * from "./types.ts";
export * from "./registry.ts";
export * from "./api/index.ts";

export default function statusHub(pi: ExtensionAPI): void {
  let latestCtx: ExtensionContext | undefined;
  const registry = new StatusRegistry(DEFAULT_STATUS_HUB_SETTINGS.defaultTtlMs);
  const getCtx = () => latestCtx;

  for (const group of createDefaultGroups(getCtx, DEFAULT_STATUS_HUB_SETTINGS.kanboard)) {
    registry.registerGroup(group);
  }

  registerStatusCommand(pi, registry, getCtx);
  registerStatusSnapshotTool(pi, registry, getCtx);

  pi.on("session_start", async (_event, ctx) => {
    latestCtx = ctx;
    void registry.refreshAll(ctx);
  });

  pi.on("session_switch", async (_event, ctx) => {
    latestCtx = ctx;
    void registry.refreshAll(ctx);
  });
}
