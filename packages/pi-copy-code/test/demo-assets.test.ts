import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { extractCodeBlocks } from "../src/code-blocks.ts";

const sessionUrl = new URL("../demo/session.jsonl", import.meta.url);
const postUrl = new URL("../demo/discord-post.md", import.meta.url);

describe("Discord announcement assets", () => {
  it("uses a private-data-free Pi session with two demonstrable code blocks", () => {
    const raw = readFileSync(sessionUrl, "utf8");
    const entries = raw.trim().split("\n").map((line) => JSON.parse(line));
    const assistant = entries.find(
      (entry) => entry.type === "message" && entry.message?.role === "assistant",
    );

    assert.equal(entries[0].type, "session");
    assert.equal(entries[0].version, 3);
    assert.ok(assistant);

    const text = assistant.message.content
      .filter((part: { type: string }) => part.type === "text")
      .map((part: { text: string }) => part.text)
      .join("");

    assert.deepEqual(extractCodeBlocks(text), [
      { code: 'print("Hello from Pi!")', language: "python", info: "python" },
      {
        code: 'for file in *.md; do\n  echo "$file"\ndone',
        language: "bash",
        info: "bash",
      },
    ]);
    assert.doesNotMatch(raw, /\/Users\/|gho_|github_pat_|sk-[A-Za-z0-9]/);
  });

  it("contains the approved post and exact public links", () => {
    const post = readFileSync(postUrl, "utf8");

    assert.match(post, /^Hey! I often wanted a quicker way/m);
    assert.match(post, /`\/copy-code 2`/);
    assert.match(post, /`pi install git:github\.com\/Vangalle\/pi-copy-code`/);
    assert.match(post, /https:\/\/github\.com\/Vangalle\/pi-copy-code/);
    assert.match(post, /Feedback and suggestions are very welcome!/);
    assert.doesNotMatch(post, /best|must-have|revolutionary|game-changing/i);
  });

  it("records the approved workflow without private paths", () => {
    const tape = readFileSync(new URL("../demo/copy-code.tape", import.meta.url), "utf8");
    const runner = readFileSync(new URL("../demo/run-demo.sh", import.meta.url), "utf8");

    for (const required of [
      "Output demo/output/pi-copy-code.gif",
      'Type "bash demo/run-demo.sh"',
      'Type "/copy-code"',
      "Down",
      'Type "!pbpaste"',
    ]) {
      assert.match(tape, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }

    for (const required of [
      "pi --offline",
      "--provider openai-codex",
      "--model gpt-5.5",
      "--session",
      "--no-extensions",
      "-e",
    ]) {
      assert.ok(runner.includes(required), `missing runner argument: ${required}`);
    }

    assert.doesNotMatch(
      `${tape}\n${runner}`,
      /\/Users\/|PI_CODING_AGENT_DIR|gho_|github_pat_|sk-[A-Za-z0-9]/,
    );
  });
});
