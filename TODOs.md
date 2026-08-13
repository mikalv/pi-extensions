# TODOs — Remaining Gaps

Source: `packages/files-widget/TODO.md` (Editor Extension Implementation Checklist)

> All items below are unchecked (`[ ]`) entries from the files-widget extension TODO list.

---

## Editor Extension — File Browser Widget

### Pre-requisites
- [ ] Verify pi-tui capabilities for widget sizing and keyboard handling

### Scaffold
- [ ] Register `Ctrl+E` toggle shortcut

### File Tree
- [ ] Respect `.gitignore` (use `fd` or manual parsing)

### Search
- [ ] Fuzzy match file names
- [ ] Highlight matches, Enter to jump

---

## Editor Extension — tuicr UX

### /review Command UX
- [ ] `/review` — review all unstaged changes
- [ ] `/review --staged` — review staged changes
- [ ] `/review HEAD` — review last commit

---

## Editor Extension — critique Integration

### Setup
- [ ] Check for critique availability (requires Bun)
- [ ] Document install: `bun install -g critique`

### /diff Command
- [ ] `/diff --watch` — live monitoring while agent works

### Web Preview
- [ ] `/diff --web` — generates shareable URL
- [ ] Useful for async review or sharing with others

---

## Editor Extension — Agent Awareness

### Track Modifications
- [ ] Store in extension state with timestamps

### Visual Indicators
- [ ] Different indicator for "agent modified this session" vs "human modified"
- [ ] Persist across session reload via `pi.appendEntry()`

### Per-Line Attribution (Stretch)
- [ ] Parse edit tool diffs to get line ranges
- [ ] Store line-level attribution metadata (which model, which tool call)
- [ ] Show in file viewer gutter
- [ ] Differentiate: Tab completions vs agent runs vs human edits

---

## Polish

- [ ] Performance: cache file tree, lazy load
- [ ] Help overlay (`?` key)
- [ ] Configurable keybindings

---

## Other

- [ ] `packages/cursor-runtime/src/provider/model-override.ts:284` — `maxTokens: 30000, // TODO` — determine correct value
