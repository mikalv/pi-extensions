import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { WikiStore } from "../src/store.ts";

const roots = [];

test.afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function makeStore() {
  const root = await mkdtemp(path.join(os.tmpdir(), "mm-wiki-"));
  roots.push(root);
  const store = new WikiStore(root);
  await store.initialize();
  return { root, store };
}

function document(name, body, options = {}) {
  const description = options.description ?? `Memory about ${name}`;
  const sources = options.sources ?? ["pi"];
  const aliases = options.aliases;
  return [
    "---",
    `name: ${name}`,
    `description: ${description}`,
    `sources: [${sources.join(", ")}]`,
    ...(aliases ? [`aliases: [${aliases.join(", ")}]`] : []),
    "---",
    "",
    body,
  ].join("\n");
}

test("creates, lists, and reads a versioned Wiki-format document", async () => {
  const { store } = await makeStore();
  const content = document("food", "- [stated] user likes tea");
  const created = await store.write("/topics/food.md", content, "new");
  assert.equal(created.ok, true);
  assert.match(created.version, /^[a-f0-9]{12}$/);

  const read = await store.read("/topics/food.md");
  assert.equal(read.content, content);
  assert.equal(read.version, created.version);
  assert.equal(read.metadata.description, "Memory about food");

  const listed = await store.list({ pathPrefix: "/topics/", includePreview: true });
  assert.deepEqual(listed.entries.map((entry) => entry.path), ["/topics/food.md"]);
  assert.equal(listed.entries[0].preview, "Memory about food");
  assert.equal("version" in listed.entries[0], false);
});

test("new cannot overwrite and stale versions return current content", async () => {
  const { store } = await makeStore();
  const original = document("schedule", "- [stated] user prefers morning meetings");
  const created = await store.write("/topics/schedule.md", original, "new");
  const duplicate = await store.write("/topics/schedule.md", original, "new");
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.code, "already_exists");

  const updatedContent = document("schedule", "- [stated] user prefers afternoon meetings");
  const updated = await store.write("/topics/schedule.md", updatedContent, created.version);
  assert.equal(updated.ok, true);

  const stale = await store.write("/topics/schedule.md", original, created.version);
  assert.equal(stale.ok, false);
  assert.equal(stale.code, "version_conflict");
  assert.equal(stale.currentContent, updatedContent);
  assert.equal(stale.currentVersion, updated.version);
});

test("patch requires one exact match and carries versions forward", async () => {
  const { store } = await makeStore();
  const original = document("communication", "- [stated] user prefers prose\n- [stated] user prefers concise answers");
  const created = await store.write("/topics/communication.md", original, "new");

  const patched = await store.patch(
    "/topics/communication.md",
    "- [stated] user prefers prose",
    "- [stated] user prefers bullets",
    created.version,
  );
  assert.equal(patched.ok, true);
  const read = await store.read("/topics/communication.md");
  assert.match(read.content, /prefers bullets/);

  const missing = await store.patch("/topics/communication.md", "not present", "replacement", patched.version);
  assert.equal(missing.ok, false);
  assert.equal(missing.code, "match_not_found");

  const ambiguousSource = document("duplicate", "- [stated] same phrase\n- [stated] same phrase");
  const ambiguousCreated = await store.write("/topics/duplicate.md", ambiguousSource, "new");
  const ambiguous = await store.patch("/topics/duplicate.md", "same phrase", "other", ambiguousCreated.version);
  assert.equal(ambiguous.ok, false);
  assert.equal(ambiguous.code, "match_ambiguous");
  assert.equal(ambiguous.matchCount, 2);
});

test("append adds one line and delete requires the latest version", async () => {
  const { store } = await makeStore();
  const original = document("auth", "- [stated] user chose passkeys", { aliases: ["login project"] });
  const created = await store.write("/areas/auth.md", original, "new");
  const appended = await store.append("/areas/auth.md", "- [stated] launch is planned for October", created.version);
  assert.equal(appended.ok, true);
  const read = await store.read("/areas/auth.md");
  assert.match(read.content, /planned for October$/);

  const staleDelete = await store.delete("/areas/auth.md", created.version);
  assert.equal(staleDelete.ok, false);
  assert.equal(staleDelete.code, "version_conflict");

  const deleted = await store.delete("/areas/auth.md", appended.version);
  assert.equal(deleted.ok, true);
  assert.equal(await store.read("/areas/auth.md"), null);
});

test("enforces taxonomy, provenance, source preservation, and secret scanning", async () => {
  const { store } = await makeStore();
  await assert.rejects(() => store.write("/other/file.md", document("file", "- [stated] fact"), "new"), /Memory path must/);
  await assert.rejects(() => store.write("/topics/Food.md", document("Food", "- [stated] fact"), "new"), /Memory path must/);
  await assert.rejects(() => store.write("/topics/food.md", document("food", "- fact without provenance"), "new"), /provenance|fact lines/i);
  await assert.rejects(() => store.write("/topics/food.md", document("food", "- [stated] token=ghp_12345678901234567890"), "new"), /credential|sensitive identifier/i);

  const imported = document("preferences", "- [stated] user prefers bullets", { sources: ["chat"] });
  await assert.rejects(() => store.write("/preferences.md", imported, "new"), /include 'pi'/);

  const original = document("preferences", "- [stated] user prefers bullets", { sources: ["chat", "pi"] });
  const created = await store.write("/preferences.md", original, "new");
  const removedSource = document("preferences", "- [stated] user prefers concise bullets", { sources: ["pi"] });
  await assert.rejects(() => store.write("/preferences.md", removedSource, created.version), /Existing source 'chat'/);
});

test("only one concurrent writer can publish from the same version", async () => {
  const { store } = await makeStore();
  const original = document("editor", "- [stated] user uses VS Code");
  const created = await store.write("/topics/editor.md", original, "new");
  const one = document("editor", "- [stated] user uses Zed");
  const two = document("editor", "- [stated] user uses Neovim");

  const results = await Promise.all([
    store.write("/topics/editor.md", one, created.version),
    store.write("/topics/editor.md", two, created.version),
  ]);
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(results.filter((result) => !result.ok && result.code === "version_conflict").length, 1);
  const final = await store.read("/topics/editor.md");
  assert.ok(final.content === one || final.content === two);
});

test("an aborted lock acquisition does not poison later mutations", async () => {
  const { store } = await makeStore();
  const original = document("abort-test", "- [stated] original fact");
  const created = await store.write("/topics/abort-test.md", original, "new");
  const controller = new AbortController();
  controller.abort();

  await assert.rejects(
    () => store.write("/topics/abort-test.md", document("abort-test", "- [stated] aborted update"), created.version, controller.signal),
    /aborted/i,
  );

  const retried = await store.write(
    "/topics/abort-test.md",
    document("abort-test", "- [stated] successful update"),
    created.version,
  );
  assert.equal(retried.ok, true);
});

test("concurrent cross-collection creates preserve globally unique names", async () => {
  const { store } = await makeStore();
  const content = document("shared", "- [stated] shared fact");
  const results = await Promise.allSettled([
    store.write("/topics/shared.md", content, "new"),
    store.write("/areas/shared.md", content, "new"),
  ]);
  const successes = results.filter((result) => result.status === "fulfilled" && result.value.ok);
  const rejections = results.filter((result) => result.status === "rejected");
  assert.equal(successes.length, 1);
  assert.equal(rejections.length, 1);
  assert.match(rejections[0].reason.message, /already used/);
});

test("cross-process lock and version check allow only one publisher", async () => {
  const { root, store } = await makeStore();
  const original = document("editor", "- [stated] user uses VS Code");
  const created = await store.write("/topics/editor.md", original, "new");
  const candidates = [
    document("editor", "- [stated] user uses Zed"),
    document("editor", "- [stated] user uses Neovim"),
  ];

  const runChild = (content) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(import.meta.dirname, "concurrent-writer.mjs")], {
      env: {
        ...process.env,
        MEMORY_TEST_ROOT: root,
        MEMORY_TEST_VERSION: created.version,
        MEMORY_TEST_CONTENT: Buffer.from(content, "utf8").toString("base64"),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(`child exited ${code}: ${stderr}`));
      else resolve(JSON.parse(stdout));
    });
  });

  const results = await Promise.all(candidates.map(runChild));
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(results.filter((result) => !result.ok && result.code === "version_conflict").length, 1);
});

test("refuses a symlinked collection directory", async (t) => {
  if (process.platform === "win32") {
    t.skip("Creating symlinks generally requires Windows Developer Mode or elevation");
    return;
  }
  const { root } = await makeStore();
  const outside = await mkdtemp(path.join(os.tmpdir(), "mm-wiki-outside-"));
  roots.push(outside);
  await rm(path.join(root, "topics"), { recursive: true });
  await symlink(outside, path.join(root, "topics"), "dir");
  const store = new WikiStore(root);
  await assert.rejects(() => store.initialize(), /symbolic links/);
});
