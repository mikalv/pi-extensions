import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("registers the complete tool surface and injects dynamic memory context", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pi-wiki-extension-"));
  process.env.MM_WIKI_DIR = root;
  try {
    const { default: extension } = await import(`../src/index.ts?test=${Date.now()}`);
    const events = new Map();
    const tools = new Map();
    const commands = new Map();
    const pi = {
      on(name, handler) {
        const handlers = events.get(name) ?? [];
        handlers.push(handler);
        events.set(name, handlers);
      },
      registerTool(tool) { tools.set(tool.name, tool); },
      registerCommand(name, command) { commands.set(name, command); },
    };
    extension(pi);

    assert.deepEqual([...tools.keys()].sort(), [
      "wiki_extend",
      "wiki_forget",
      "wiki_index",
      "wiki_inscribe",
      "wiki_recall",
      "wiki_revise",
    ]);
    assert.ok(commands.has("wiki-status"));

    const ctx = { ui: { notify() {} } };
    await events.get("session_start")[0]({}, ctx);
    const initial = await events.get("before_agent_start")[0]({ systemPrompt: "base" }, ctx);
    assert.match(initial.systemPrompt, /<wiki_listing>\n\(empty\)/);
    assert.match(initial.systemPrompt, /`mythic-memory` skill/);

    const content = [
      "---",
      "name: communication",
      "description: How the user wants Pi to communicate",
      "sources: [pi]",
      "---",
      "",
      "- [stated] user prefers concise answers",
    ].join("\n");
    const written = await tools.get("wiki_inscribe").execute("1", {
      path: "/topics/communication.md",
      content,
      if_version: "new",
    });
    assert.match(written.content[0].text, /\[version: [a-f0-9]{12}\]/);

    const read = await tools.get("wiki_recall").execute("2", { path: "/topics/communication.md" });
    assert.match(read.content[0].text, /user prefers concise answers/);

    const next = await events.get("before_agent_start")[0]({ systemPrompt: "base" }, ctx);
    assert.match(next.systemPrompt, /\/topics\/communication\.md — How the user wants Pi to communicate/);
    assert.doesNotMatch(next.systemPrompt, /was created outside this conversation/);

    const largeContent = [
      "---",
      "name: large",
      "description: Large output truncation test",
      "sources: [pi]",
      "---",
      "",
      `- [stated] ${"x".repeat(62_000)}`,
    ].join("\n");
    const largeWrite = await tools.get("wiki_inscribe").execute("3", {
      path: "/topics/large.md",
      content: largeContent,
      if_version: "new",
    });
    assert.match(largeWrite.content[0].text, /Saved \/topics\/large\.md/);
    const largeRead = await tools.get("wiki_recall").execute("4", { path: "/topics/large.md" });
    assert.ok(Buffer.byteLength(largeRead.content[0].text, "utf8") <= 50 * 1024);
    assert.match(largeRead.content[0].text, /Output truncated/);
  } finally {
    delete process.env.MM_WIKI_DIR;
    await rm(root, { recursive: true, force: true });
  }
});
