import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractCodeBlocks } from "../src/code-blocks.ts";

describe("extractCodeBlocks", () => {
  it("returns no blocks when no fence exists", () => {
    assert.deepEqual(extractCodeBlocks("plain text"), []);
  });

  it("extracts a backtick block and language", () => {
    assert.deepEqual(extractCodeBlocks("before\n```bash\nprintf 'ok\\n'\n```\nafter"), [
      { code: "printf 'ok\\n'", language: "bash", info: "bash" },
    ]);
  });

  it("extracts multiple backtick and tilde blocks in source order", () => {
    assert.deepEqual(extractCodeBlocks("```ts\nconst x = 1;\n```\n\n~~~ python linenums\nprint(1)\n~~~~"), [
      { code: "const x = 1;", language: "ts", info: "ts" },
      { code: "print(1)", language: "python", info: "python linenums" },
    ]);
  });

  it("requires a compatible closing fence", () => {
    assert.deepEqual(extractCodeBlocks("````md\n```\nstill code\n`````"), [
      { code: "```\nstill code", language: "md", info: "md" },
    ]);
  });

  it("accepts up to three leading spaces", () => {
    assert.deepEqual(extractCodeBlocks("   ```json\n{\"ok\":true}\n   ```"), [
      { code: "{\"ok\":true}", language: "json", info: "json" },
    ]);
  });

  it("keeps an unclosed final block", () => {
    assert.deepEqual(extractCodeBlocks("text\n```sh\necho partial\n"), [
      { code: "echo partial\n", language: "sh", info: "sh" },
    ]);
  });

  it("keeps an empty unclosed final block", () => {
    assert.deepEqual(extractCodeBlocks("```"), [{ code: "", language: "plain", info: "" }]);
  });

  it("supports empty and unlabeled blocks", () => {
    assert.deepEqual(extractCodeBlocks("```\n```"), [{ code: "", language: "plain", info: "" }]);
  });

  it("preserves CRLF inside content while removing boundary line breaks", () => {
    assert.deepEqual(extractCodeBlocks("```text\r\none\r\ntwo\r\n```"), [
      { code: "one\r\ntwo", language: "text", info: "text" },
    ]);
  });

  it("rejects a backtick opener whose info string contains a backtick", () => {
    assert.deepEqual(extractCodeBlocks("```bad`info\ncode\n"), []);
  });
});
