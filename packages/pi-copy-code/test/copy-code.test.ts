import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExtensionAPI, SessionEntry } from "@earendil-works/pi-coding-agent";
import copyCodeExtension from "../src/index.ts";
import {
  formatCodeBlockLabel,
  getLatestAssistantTextParts,
  resolveRequestedIndex,
  runCopyCodeCommand,
} from "../src/copy-code.ts";

function entry(message: unknown, id: string): SessionEntry {
  return {
    type: "message",
    id,
    parentId: null,
    timestamp: "2026-07-29T00:00:00.000Z",
    message,
  } as SessionEntry;
}

describe("copy-code helpers", () => {
  it("returns undefined when no assistant message exists", () => {
    assert.equal(getLatestAssistantTextParts([]), undefined);
  });

  it("uses only text parts from the latest assistant message", () => {
    const entries = [
      entry({ role: "assistant", content: [{ type: "text", text: "```sh\nold\n```" }] }, "old"),
      entry({ role: "user", content: [{ type: "text", text: "ignore" }] }, "user"),
      entry(
        {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "ignore" },
            { type: "text", text: "first" },
            { type: "toolCall", id: "call", name: "read", arguments: {} },
            { type: "text", text: "second" },
          ],
        },
        "latest",
      ),
    ];

    assert.deepEqual(getLatestAssistantTextParts(entries), ["first", "second"]);
  });

  it("does not fall back when the latest assistant message has no text", () => {
    const entries = [
      entry({ role: "assistant", content: [{ type: "text", text: "old" }] }, "old"),
      entry({ role: "assistant", content: [{ type: "toolCall", id: "call", name: "read", arguments: {} }] }, "latest"),
    ];
    assert.deepEqual(getLatestAssistantTextParts(entries), []);
  });

  it("formats normalized and truncated previews", () => {
    const block = { code: "\n  const   value = 123456789;\n", language: "ts", info: "ts" };
    assert.equal(formatCodeBlockLabel(block, 2, 18), "2. ts — const value = 123…");
    assert.equal(formatCodeBlockLabel({ ...block, code: " \n\t" }, 1), "1. ts — (empty)");
  });

  it("validates optional one-based block numbers", () => {
    assert.deepEqual(resolveRequestedIndex("", 3), {});
    assert.deepEqual(resolveRequestedIndex(" 2 ", 3), { index: 1 });
    assert.deepEqual(resolveRequestedIndex("0", 3), { error: "Block number must be a one-based integer." });
    assert.deepEqual(resolveRequestedIndex("two", 3), { error: "Block number must be a one-based integer." });
    assert.deepEqual(resolveRequestedIndex("4", 3), {
      error: "Code block 4 is out of range; available blocks: 1-3.",
    });
  });
});

function assistantWith(textParts: string[]): SessionEntry[] {
  return [
    entry(
      { role: "assistant", content: textParts.map((text) => ({ type: "text", text })) },
      "assistant",
    ),
  ];
}

function commandHarness(entries: SessionEntry[], selected?: string) {
  const notifications: Array<{ message: string; type?: "info" | "warning" | "error" }> = [];
  const selections: Array<{ title: string; options: string[] }> = [];
  const copied: string[] = [];
  return {
    context: {
      sessionManager: { getBranch: () => entries },
      ui: {
        notify: (message: string, type?: "info" | "warning" | "error") => notifications.push({ message, type }),
        select: async (title: string, options: string[]) => {
          selections.push({ title, options });
          return selected;
        },
      },
    },
    notifications,
    selections,
    copied,
    writeClipboard: async (text: string) => {
      copied.push(text);
    },
  };
}

describe("runCopyCodeCommand", () => {
  it("warns when there is no assistant message or no block", async () => {
    const missing = commandHarness([]);
    await runCopyCodeCommand("", missing.context, missing.writeClipboard);
    assert.deepEqual(missing.notifications, [{ message: "No assistant message to copy from.", type: "warning" }]);

    const noBlock = commandHarness(assistantWith(["plain"]));
    await runCopyCodeCommand("", noBlock.context, noBlock.writeClipboard);
    assert.deepEqual(noBlock.notifications, [
      { message: "The latest assistant message has no fenced code blocks.", type: "warning" },
    ]);
  });

  it("copies a single block without opening a selector", async () => {
    const harness = commandHarness(assistantWith(["```sh\necho ok\n```"]));
    await runCopyCodeCommand("", harness.context, harness.writeClipboard);
    assert.deepEqual(harness.copied, ["echo ok"]);
    assert.deepEqual(harness.selections, []);
    assert.deepEqual(harness.notifications, [{ message: "Copied code block 1 (sh).", type: "info" }]);
  });

  it("selects among multiple blocks and supports cancellation", async () => {
    const text = "```sh\none\n```\n```python\ntwo\n```";
    const chosen = commandHarness(assistantWith([text]), "2. python — two");
    await runCopyCodeCommand("", chosen.context, chosen.writeClipboard);
    assert.deepEqual(chosen.copied, ["two"]);
    assert.equal(chosen.selections.length, 1);

    const cancelled = commandHarness(assistantWith([text]));
    await runCopyCodeCommand("", cancelled.context, cancelled.writeClipboard);
    assert.deepEqual(cancelled.copied, []);
    assert.deepEqual(cancelled.notifications, []);
  });

  it("copies an explicit number without a selector", async () => {
    const harness = commandHarness(assistantWith(["```sh\none\n```", "```py\ntwo\n```"]));
    await runCopyCodeCommand("2", harness.context, harness.writeClipboard);
    assert.deepEqual(harness.copied, ["two"]);
    assert.deepEqual(harness.selections, []);
  });

  it("reports invalid numbers and clipboard failures", async () => {
    const invalid = commandHarness(assistantWith(["```sh\none\n```"]));
    await runCopyCodeCommand("two", invalid.context, invalid.writeClipboard);
    assert.deepEqual(invalid.notifications, [
      { message: "Block number must be a one-based integer.", type: "error" },
    ]);

    const failed = commandHarness(assistantWith(["```sh\none\n```"]));
    await runCopyCodeCommand("", failed.context, async () => {
      throw new Error("clipboard unavailable");
    });
    assert.deepEqual(failed.notifications, [{ message: "clipboard unavailable", type: "error" }]);
  });
});

describe("extension registration", () => {
  it("registers /copy-code", () => {
    let registeredName = "";
    let description = "";
    const pi = {
      registerCommand(name: string, options: { description?: string }) {
        registeredName = name;
        description = options.description || "";
      },
    } as unknown as ExtensionAPI;

    copyCodeExtension(pi);
    assert.equal(registeredName, "copy-code");
    assert.match(description, /fenced code block/i);
  });
});
