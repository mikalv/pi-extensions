# Pi Discord Announcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a privacy-safe terminal GIF and publish one concise, polite announcement for `pi-copy-code` in the Pi Discord packages channel.

**Architecture:** Keep the demonstration deterministic and offline by loading a checked-in synthetic Pi session, then drive the real extension and Pi TUI with VHS. Commit only the reproducible session, tape, post copy, and tests; keep the generated GIF out of Git and attach it manually in Discord.

**Tech Stack:** Pi 0.82.1, Node.js 22.19+, TypeScript tests, VHS, ffmpeg/ffprobe, macOS `pbcopy`/`pbpaste`, GitHub, Discord

## Global Constraints

- Post only once in the Pi Discord packages channel.
- Use natural, concise English with a personal, problem-first tone.
- Use the exact public repository `https://github.com/Vangalle/pi-copy-code`.
- Use the install command `pi install git:github.com/Vangalle/pi-copy-code`.
- The GIF must be silent, automatically looping, no longer than 15 seconds, and smaller than 5 MiB.
- The recording must contain no API keys, personal usernames, private paths, or unrelated notifications.
- Do not add runtime dependencies or modify extension behavior.
- Do not automate Discord posting; preview and submit it manually.

---

## File Map

- Create `demo/session.jsonl`: deterministic synthetic Pi conversation with two fenced code blocks.
- Create `demo/discord-post.md`: exact text to paste into Discord.
- Create `demo/copy-code.tape`: reproducible VHS recording script that drives the real Pi TUI and extension.
- Create `demo/run-demo.sh`: path-safe shell launcher for the Pi demo process.
- Create `test/demo-assets.test.ts`: validates fixture behavior, publication copy, privacy constraints, tape requirements, and launcher arguments.
- Modify `.gitignore`: ignore generated media under `demo/output/`.
- Generate but do not commit `demo/output/pi-copy-code.gif`: Discord attachment.

---

### Task 1: Deterministic Demo Session and Announcement Copy

**Files:**
- Create: `demo/session.jsonl`
- Create: `demo/discord-post.md`
- Create: `test/demo-assets.test.ts`

**Interfaces:**
- Consumes: `extractCodeBlocks(markdown: string): CodeBlock[]` from `src/code-blocks.ts`.
- Produces: a Pi v3 JSONL session whose latest assistant text has exactly two known blocks, and the exact Discord post consumed during publication.

- [ ] **Step 1: Write failing fixture and copy tests**

Create `test/demo-assets.test.ts`:

```ts
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
});
```

- [ ] **Step 2: Run the tests and verify the missing assets fail**

Run:

```bash
npm test -- --test-name-pattern="Discord announcement assets"
```

Expected: FAIL with `ENOENT` for `demo/session.jsonl`.

- [ ] **Step 3: Create the synthetic Pi session**

Create `demo/session.jsonl` with exactly these three JSONL records:

```jsonl
{"type":"session","version":3,"id":"2db8542f-4d31-43f2-8608-d4aaf3990f16","timestamp":"2026-07-29T12:30:00.000Z","cwd":"/tmp/pi-copy-code-demo"}
{"type":"message","id":"a1b2c3d4","parentId":null,"timestamp":"2026-07-29T12:30:01.000Z","message":{"role":"user","content":"Show me a small Python example and a shell loop.","timestamp":1785328201000}}
{"type":"message","id":"b2c3d4e5","parentId":"a1b2c3d4","timestamp":"2026-07-29T12:30:02.000Z","message":{"role":"assistant","content":[{"type":"text","text":"Here are two quick examples:\n\n```python\nprint(\"Hello from Pi!\")\n```\n\n```bash\nfor file in *.md; do\n  echo \"$file\"\ndone\n```"}],"api":"openai-responses","provider":"openai-codex","model":"gpt-5.1-codex","usage":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"totalTokens":0,"cost":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"total":0}},"stopReason":"stop","timestamp":1785328202000}}
```

- [ ] **Step 4: Create the exact Discord post**

Create `demo/discord-post.md`:

```markdown
Hey! I often wanted a quicker way to copy code from Pi’s responses, so I made a small extension called pi-copy-code.

It adds a `/copy-code` command:

- One code block → copies it immediately
- Multiple code blocks → opens a selector
- `/copy-code 2` → copies a specific block directly
- Supports backtick and tilde fences, including interrupted responses

Install:

`pi install git:github.com/Vangalle/pi-copy-code`

Repo: https://github.com/Vangalle/pi-copy-code

It’s a small personal project, but I hope it saves others a few clicks too. Feedback and suggestions are very welcome!
```

- [ ] **Step 5: Run the focused and full checks**

Run:

```bash
npm test -- --test-name-pattern="Discord announcement assets"
npm run check
```

Expected: the two new asset tests PASS; the full suite reports 23 tests passing and zero failures.

- [ ] **Step 6: Commit the deterministic content**

```bash
git add demo/session.jsonl demo/discord-post.md test/demo-assets.test.ts
git commit -m "test: add deterministic Discord demo assets"
```

Expected: one commit containing only the session, post copy, and asset tests.

---

### Task 2: Reproducible VHS Recording

**Files:**
- Create: `demo/copy-code.tape`
- Create: `demo/run-demo.sh`
- Modify: `.gitignore`
- Modify: `test/demo-assets.test.ts`
- Generate, do not commit: `demo/output/pi-copy-code.gif`

**Interfaces:**
- Consumes: `demo/session.jsonl`, the real `src/index.ts` extension, Pi 0.82.1, and VHS.
- Produces: `demo/output/pi-copy-code.gif`, showing selection of block two and clipboard verification.

- [ ] **Step 1: Add a failing tape contract test**

Append this test inside the existing `describe("Discord announcement assets", ...)` block in `test/demo-assets.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
npm test -- --test-name-pattern="records the approved workflow"
```

Expected: FAIL with `ENOENT` for `demo/copy-code.tape`.

- [ ] **Step 3: Ignore generated media**

Append to `.gitignore`:

```gitignore
demo/output/
```

Run:

```bash
mkdir -p demo/output
```

Expected: `demo/output/` exists and remains absent from `git status --short`.

- [ ] **Step 4: Create the path-safe demo runner and VHS tape**

Create `demo/run-demo.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

repo=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
demo_dir=/tmp/pi-copy-code-demo

rm -rf "$demo_dir"
mkdir -p "$demo_dir"
cp "$repo/demo/session.jsonl" "$demo_dir/session.jsonl"
cd "$demo_dir"

exec pi --offline \
  --provider openai-codex \
  --model gpt-5.5 \
  --session "$demo_dir/session.jsonl" \
  --no-extensions \
  --no-skills \
  --no-prompt-templates \
  --no-themes \
  --no-context-files \
  -e "$repo/src/index.ts"
```

Create `demo/copy-code.tape`:

```text
Output demo/output/pi-copy-code.gif

Require pi
Require pbpaste

Set Shell "bash"
Set FontFamily "JetBrains Mono NL"
Set FontSize 22
Set Width 1100
Set Height 700
Set Padding 20
Set Theme "Catppuccin Mocha"
Set Framerate 12
Set TypingSpeed 35ms
Set WindowBar Colorful
Set WindowBarSize 36

Hide
Type "bash demo/run-demo.sh"
Enter
Sleep 4s
Show
Sleep 1500ms
Type "/copy-code"
Enter
Sleep 1s
Down
Sleep 700ms
Enter
Sleep 1s
Type "!pbpaste"
Enter
Sleep 2500ms
```

- [ ] **Step 5: Validate the tape and contract test**

Run:

```bash
vhs validate demo/copy-code.tape
bash -n demo/run-demo.sh
npm test -- --test-name-pattern="records the approved workflow"
```

Expected: VHS reports a valid tape, Bash reports no syntax errors, and the focused test PASSes.

- [ ] **Step 6: Render the real Pi workflow**

Run from the repository root:

```bash
vhs demo/copy-code.tape
```

Expected: VHS exits 0 and creates `demo/output/pi-copy-code.gif`.

- [ ] **Step 7: Verify duration, size, type, and Git exclusion**

Run:

```bash
file demo/output/pi-copy-code.gif
bytes=$(stat -f %z demo/output/pi-copy-code.gif)
duration=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 demo/output/pi-copy-code.gif)
printf 'bytes=%s duration=%ss\n' "$bytes" "$duration"
test "$bytes" -lt 5242880
awk -v duration="$duration" 'BEGIN { exit !(duration <= 15) }'
test -z "$(git status --short -- demo/output)"
```

Expected: `file` identifies a GIF image, size is below 5,242,880 bytes, duration is at most 15 seconds, and generated output is ignored by Git.

- [ ] **Step 8: Inspect the complete GIF manually**

Run:

```bash
open demo/output/pi-copy-code.gif
```

Watch at least two complete loops. Confirm all of the following:

1. Both code blocks are readable before the command is entered.
2. `/copy-code` opens the selector.
3. The second block is selected.
4. `Copied code block 2.` is visible.
5. `!pbpaste` prints the shell loop without fences.
6. No username, `/Users/` path, credential, or unrelated notification appears.
7. The final clipboard output remains visible before the loop restarts.

Expected: every item is visibly satisfied. If any item is not satisfied, do not publish; adjust only the sleep, font, width, or height setting responsible, rerender, and repeat Steps 7–8.

- [ ] **Step 9: Run checks and commit recording sources**

Run:

```bash
npm run check
git diff --check
git status --short
```

Expected: 24 tests PASS, no whitespace errors, and only `.gitignore`, `demo/copy-code.tape`, `demo/run-demo.sh`, `test/demo-assets.test.ts`, and this corrected plan are tracked changes.

Commit:

```bash
git add .gitignore demo/copy-code.tape demo/run-demo.sh test/demo-assets.test.ts docs/superpowers/plans/2026-07-29-discord-announcement.md
git commit -m "docs: add reproducible copy-code demo recording"
```

Expected: generated `demo/output/pi-copy-code.gif` remains untracked and invisible to Git.

---

### Task 3: Publication Verification and Manual Discord Post

**Files:**
- Read: `demo/discord-post.md`
- Read: `demo/output/pi-copy-code.gif`
- No repository files modified.

**Interfaces:**
- Consumes: the verified GIF, approved copy, public GitHub repository, and Pi Discord packages channel.
- Produces: one manually reviewed Discord message with one attached GIF.

- [ ] **Step 1: Run final project verification**

Run:

```bash
npm run check
npm pack --dry-run --json > /tmp/pi-copy-code-pack.json
git diff --check
test -z "$(git status --porcelain)"
```

Expected: all 24 tests PASS, dry-run packaging succeeds, no whitespace errors exist, and the working tree is clean.

- [ ] **Step 2: Integrate the reviewed feature branch before pushing**

Use the `finishing-a-development-branch` workflow to merge `feature/discord-announcement` into `main`. Only after the merge, run from the main checkout:

```bash
git push origin main
```

Expected: the merged `main` pushes successfully to `https://github.com/Vangalle/pi-copy-code`; the remote contains `demo/session.jsonl`, `demo/discord-post.md`, `demo/copy-code.tape`, and `demo/run-demo.sh`.

- [ ] **Step 3: Verify the public repository and installation command**

Run:

```bash
curl -fsSL -o /dev/null https://github.com/Vangalle/pi-copy-code
tmp_agent_dir=$(mktemp -d /tmp/pi-copy-code-install.XXXXXX)
PI_CODING_AGENT_DIR="$tmp_agent_dir" pi install git:github.com/Vangalle/pi-copy-code
PI_CODING_AGENT_DIR="$tmp_agent_dir" pi list
rm -rf "$tmp_agent_dir"
```

Expected: GitHub returns successfully, Pi installs the Git package, and `pi list` includes `git:github.com/Vangalle/pi-copy-code`.

- [ ] **Step 4: Recheck the attachment immediately before posting**

Run:

```bash
bytes=$(stat -f %z demo/output/pi-copy-code.gif)
test "$bytes" -lt 5242880
open demo/output/pi-copy-code.gif
```

Expected: the current file is below 5 MiB and still matches the approved storyboard with no private information.

- [ ] **Step 5: Copy the approved message and open the correct Discord channel**

Run:

```bash
pbcopy < demo/discord-post.md
open 'https://discord.com/channels/1456806362351669492/1457744485428629628'
```

Expected: the approved English post is on the clipboard and the Pi packages channel opens.

- [ ] **Step 6: Preview and publish manually**

In Discord:

1. Paste the clipboard text into the message editor.
2. Attach `demo/output/pi-copy-code.gif`.
3. Confirm the inline code and bullet formatting render correctly.
4. Confirm the GitHub URL is clickable.
5. Confirm the GIF preview plays and remains readable.
6. Send exactly one message.

Expected: one concise announcement appears with the GIF, installation command, repository link, and feedback invitation.

- [ ] **Step 7: Perform a post-publication link check**

Open the posted GitHub link from Discord in a private browser window and verify the README loads without authentication.

Expected: the repository is publicly accessible. Reply politely to questions, disclose known limitations when relevant, and avoid reposting until a meaningful future release.
