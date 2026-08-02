import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";

const gifUrl = new URL("../assets/pi-copy-code.gif", import.meta.url);

describe("README showcase", () => {
  it("tracks the approved GIF within the Discord size limit", () => {
    const gif = readFileSync(gifUrl);

    assert.equal(gif.subarray(0, 6).toString("ascii"), "GIF89a");
    assert.ok(statSync(gifUrl).size < 5 * 1024 * 1024);
  });

  it("documents the demo-first install and supported behavior", () => {
    const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");

    for (const required of [
      "# pi-copy-code",
      "Copy fenced code blocks from [Pi]",
      '<img src="./assets/pi-copy-code.gif" alt="Selecting and copying a fenced code block in Pi" width="900">',
      "pi install git:github.com/Vangalle/pi-copy-code",
      "/copy-code 2",
      "latest assistant message",
      "Backtick",
      "tilde",
      "Pi 0.82.1",
      "Node.js 22.19",
      "no runtime dependencies",
      "no network requests",
      "npm run check",
    ]) {
      assert.ok(readme.includes(required), `README is missing: ${required}`);
    }

    assert.doesNotMatch(readme, /best|must-have|revolutionary|game-changing/i);
    assert.doesNotMatch(readme, /once this repository has a public remote/i);
  });
});
