# README Showcase Design

**Date:** 2026-07-29
**Project:** `Vangalle/pi-copy-code`

## Goal

Turn the repository README into a concise, polished landing page that immediately demonstrates the extension, gives Pi users a copyable installation command, and accurately documents the focused behavior without marketing exaggeration.

## Reference Pattern

Follow the effective structure used by established Pi packages such as `pi-tasks` and `pi-mcp-adapter`:

1. State the value in one sentence.
2. Show the product immediately.
3. Put installation near the top.
4. Explain the core workflow with short bullets and examples.
5. Keep compatibility and development details below the user-facing content.

The README should remain shorter than feature-heavy package manuals because `pi-copy-code` intentionally solves one narrow workflow problem.

## Media Asset

- Commit the approved recording as `assets/pi-copy-code.gif`.
- Embed it near the top of `README.md` in a centered HTML paragraph.
- Render it at a maximum displayed width of 900 pixels while allowing GitHub to scale it down on narrower screens.
- Use descriptive alt text: `Selecting and copying a fenced code block in Pi`.
- The committed GIF must be the privacy-reviewed recording that shows two blocks, the selector, the copied notification, and `pbpaste` output.
- The GIF must remain below 5 MiB and no longer than 15 seconds.

## README Structure

### Title and Value Proposition

Use the existing project name as the H1. Follow it with this concise value statement:

> Copy fenced code blocks from Pi responses without mouse selection.

Mention that it is a dependency-free Pi extension, but do not place implementation details before the demo.

### Demo

Place the centered GIF directly below the value statement so visitors understand the workflow before reading installation details.

### Install

Show the public Git package command first:

```bash
pi install git:github.com/Vangalle/pi-copy-code
```

Tell users to run `/reload` if Pi is already open. Keep local development loading out of this primary installation section.

### Usage

Document the two commands:

```text
/copy-code
/copy-code 2
```

Explain the behavior in three bullets:

- One code block is copied immediately.
- Multiple blocks open a selector.
- A one-based argument copies that block without opening the selector.

### Supported Input

State that the parser supports:

- backtick fences
- tilde fences
- fence lengths of three or greater
- an unclosed final fence from an interrupted response

State precisely that copied output excludes the fence, info string/language label, and structural boundary line breaks while preserving code content.

### Scope and Compatibility

State these limits and guarantees:

- Only the latest assistant message is inspected; the extension never falls back to older replies.
- The extension makes no network requests.
- The extension has no runtime dependencies.
- The current release is verified against Pi 0.82.1 and Node.js 22.19 or newer.

### Development

Retain concise local loading and verification commands:

```bash
pi -e /absolute/path/to/pi-copy-code/src/index.ts
npm install --ignore-scripts
npm run check
```

Mention that automated tests do not require network access, model credentials, or the real clipboard.

## Style Constraints

- Use natural, direct English.
- Avoid claims such as “best,” “must-have,” “revolutionary,” or “game-changing.”
- Do not add decorative badge clutter.
- Keep headings and sections easy to scan.
- Prefer concrete behavior over promotional adjectives.
- Keep the GitHub installation command copyable as a single line.

## Publication Sequence

1. Add and verify the GIF asset.
2. Rewrite and test the README links, commands, wording, and media reference.
3. Merge the feature branch into `main`.
4. Push `main` to GitHub and verify the embedded GIF renders publicly.
5. Publish the approved message and GIF in the Pi Discord packages channel.
6. After the Discord post is confirmed, remove the feature branch and its worktree.

## Success Criteria

- A visitor understands the extension before scrolling past the demo.
- The GIF renders directly in the GitHub README.
- The install command works when copied verbatim.
- Every documented behavior matches the tested implementation.
- The README remains concise and resembles a mature focused plugin rather than a long internal manual.
- No private information appears in the README or media asset.
