import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { runCopyCodeCommand } from "./copy-code.ts";

export default function copyCodeExtension(pi: ExtensionAPI): void {
  pi.registerCommand("copy-code", {
    description: "Copy a fenced code block from the latest assistant message",
    handler: async (args, ctx) => {
      await runCopyCodeCommand(args, ctx);
    },
  });
}
