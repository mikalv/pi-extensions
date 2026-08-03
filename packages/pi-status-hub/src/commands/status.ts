import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getStatusSnapshot } from "../api/handlers.ts";
import type { StatusRegistry } from "../registry.ts";
import { StatusOverlay } from "../tui/overlay.ts";

export function registerStatusCommand(pi: ExtensionAPI, registry: StatusRegistry, getCtx: () => ExtensionContext | undefined): void {
  pi.registerCommand("status", {
    description: "Open the status hub overlay or print a summary snapshot.",
    handler: async (_args, ctx) => {
      const snapshot = await getStatusSnapshot(registry, getCtx(), { forceRefresh: true });
      if (!ctx.hasUI) {
        const text = snapshot.groups.map((group) => `${group.name}=${group.summary || "none"}`).join(" | ");
        if (ctx.ui?.notify) ctx.ui.notify(`Status groups: ${text}`, "info");
        return;
      }

      void ctx.ui.custom<void>(
        async (_tui, _theme, _keybindings, done) => {
          const overlay = new StatusOverlay(registry, async () => {
            await registry.refreshAll(getCtx());
          });
          overlay.onClose = done;
          return overlay;
        },
        {
          overlay: true,
          overlayOptions: {
            width: "70%",
            minWidth: 60,
            maxHeight: "70%",
            anchor: "top-center",
            margin: { top: 1, left: 2, right: 2 },
          },
        },
      );
    },
  });
}
