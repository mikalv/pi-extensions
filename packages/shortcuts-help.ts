/**
 * shortcuts-help — show the ALT+S keyboard shortcuts reference in a popup.
 *
 * Binds ALT+H to open a read-only popup listing the kill-ring / stash /
 * thinking / register shortcuts. Closes with Escape (editor dialog restores
 * the input field automatically).
 */
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

const SHORTCUTS_TABLE = `## Shortcuts

| Chord | Action | Description |
|-------|--------|-------------|
| \`ALT+S → S\` | Stash/Restore | Save input to stash register, or restore it |
| \`ALT+S → U\` | Undo | Pop from undo buffer |
| \`ALT+S → R\` | Redo | Push current text forward, restore previous |
| \`ALT+S → Y\` | Copy | Copy input to system clipboard |
| \`ALT+S → D\` | Cut | Copy to clipboard, then clear input |
| \`ALT+S → T\` | Toggle Thinking | Cycle: off → low → medium → high → xhigh → off |
| \`ALT+S → A → [0-9]\` | Append Register | Append from numbered register 0-9 |
| \`ALT+S → A → S\` | Append Stash | Append from stash register |
| \`ALT+I\` | Tab Insert | Insert literal tab character |

— Press Escape to close.`;

export default function (pi: ExtensionAPI): void {
  pi.registerShortcut("alt+h", {
    description: "Show keyboard shortcuts reference",
    handler: async (ctx: ExtensionContext) => {
      // ctx.ui.editor() opens a multi-line editor dialog with a title bar.
      // It restores the original input field automatically when closed
      // (Escape = cancel -> returns undefined). This gives us a free,
      // reliable read-only popup without building a custom TUI component.
      await ctx.ui.editor("Keyboard Shortcuts", SHORTCUTS_TABLE);
    },
  });
}
