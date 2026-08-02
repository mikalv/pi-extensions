import { copyToClipboard } from "@earendil-works/pi-coding-agent";
import type { ExtensionUIContext, SessionEntry } from "@earendil-works/pi-coding-agent";
import { type CodeBlock, extractCodeBlocks } from "./code-blocks.ts";

export function getLatestAssistantTextParts(entries: readonly SessionEntry[]): string[] | undefined {
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index];
    if (entry.type !== "message" || entry.message.role !== "assistant") continue;
    return entry.message.content.flatMap((content) => (content.type === "text" ? [content.text] : []));
  }
  return undefined;
}

function truncatePreview(preview: string, maxLength: number): string {
  const characters = Array.from(preview);
  if (characters.length <= maxLength) return preview;
  return `${characters.slice(0, Math.max(0, maxLength - 1)).join("")}…`;
}

export function formatCodeBlockLabel(block: CodeBlock, oneBasedIndex: number, maxPreviewLength = 72): string {
  const firstNonEmptyLine = block.code
    .split(/\r\n|\n|\r/)
    .map((line) => line.trim().replace(/\s+/g, " "))
    .find(Boolean);
  const preview = truncatePreview(firstNonEmptyLine || "(empty)", maxPreviewLength);
  return `${oneBasedIndex}. ${block.language} — ${preview}`;
}

export function resolveRequestedIndex(argument: string, blockCount: number): { index?: number; error?: string } {
  const trimmed = argument.trim();
  if (!trimmed) return {};
  if (!/^[1-9]\d*$/.test(trimmed)) {
    return { error: "Block number must be a one-based integer." };
  }

  const requested = Number(trimmed);
  if (!Number.isSafeInteger(requested) || requested > blockCount) {
    return { error: `Code block ${trimmed} is out of range; available blocks: 1-${blockCount}.` };
  }
  return { index: requested - 1 };
}

export interface CopyCodeContext {
  sessionManager: { getBranch(): SessionEntry[] };
  ui: Pick<ExtensionUIContext, "notify" | "select">;
}

export type ClipboardWriter = (text: string) => Promise<void>;

export async function runCopyCodeCommand(
  argument: string,
  ctx: CopyCodeContext,
  writeClipboard: ClipboardWriter = copyToClipboard,
): Promise<void> {
  const textParts = getLatestAssistantTextParts(ctx.sessionManager.getBranch());
  if (!textParts) {
    ctx.ui.notify("No assistant message to copy from.", "warning");
    return;
  }

  const blocks = textParts.flatMap(extractCodeBlocks);
  if (blocks.length === 0) {
    ctx.ui.notify("The latest assistant message has no fenced code blocks.", "warning");
    return;
  }

  const requested = resolveRequestedIndex(argument, blocks.length);
  if (requested.error) {
    ctx.ui.notify(requested.error, "error");
    return;
  }

  let selectedIndex = requested.index;
  if (selectedIndex === undefined) {
    if (blocks.length === 1) {
      selectedIndex = 0;
    } else {
      const labels = blocks.map((block, index) => formatCodeBlockLabel(block, index + 1));
      const selected = await ctx.ui.select("Copy code block", labels);
      if (selected === undefined) return;
      selectedIndex = labels.indexOf(selected);
      if (selectedIndex < 0) return;
    }
  }

  const block = blocks[selectedIndex];
  try {
    await writeClipboard(block.code);
    ctx.ui.notify(`Copied code block ${selectedIndex + 1} (${block.language}).`, "info");
  } catch (error) {
    ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
  }
}
