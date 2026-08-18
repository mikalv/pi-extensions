# `pi-project-setup` — Interactive Project Setup & Extension Selector

`pi-project-setup` provides an interactive TUI wizard and CLI tool to configure `.pi/settings.json` on a per-project basis. It allows you to selectively enable, disable, and preset-load extensions from the repository, ensuring fast session startups and tailored workflows for different projects (e.g. Minimal, Full-Stack Web, Backend/Services, or Offline/Private).

---

## Table of Contents

- [Overview](#overview)
- [Commands](#commands)
- [Interactive TUI Dialog](#interactive-tui-dialog)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Command Line Interface (CLI Flags)](#command-line-interface-cli-flags)
- [Preset Profiles](#preset-profiles)
- [Extension Categories](#extension-categories)
- [Generated `.pi/settings.json` Structure](#generated-pisettingsjson-structure)
- [Architecture & Programmatic API](#architecture--programmatic-api)

---

## Overview

When developing across diverse codebases (such as backend APIs, frontend apps, Elixir microservices, or sensitive environments), loading all 50+ extensions can bloat system prompts, register unnecessary tools, and consume token budget.

`pi-project-setup` solves this by:
1. **Scanning the extension catalog** in `pi-extensions` and categorizing each module.
2. **Opening an interactive TUI modal** (`/setup-pi`) where you can check/uncheck extensions with `[Space]` and switch presets with `[1-5]`.
3. **Writing `.pi/settings.json` atomically** in the active directory while preserving custom settings and package configurations.
4. **Providing fast CLI commands** (`/setup-pi --preset web`, `/setup-pi --enable python`, `/setup-pi --status`) for automation and scripting.

---

## Commands

All three slash commands are registered as aliases:

- `/setup-pi [args]`
- `/project-setup [args]`
- `/pi-setup [args]`

---

## Interactive TUI Dialog

Running `/setup-pi` without arguments in an interactive terminal session opens the full-screen setup dialog:

```text
╭────────────────── Pi Project Setup: Extension Selector ──────────────────╮
│ Project: /Users/mikalv/Repos/MeehProjects/my-service                     │
│ Active:  12 of 52 extensions enabled (Presets: 1-5 • Filter: /)          │
├──────────────────────────────────────────────────────────────────────────┤
│ Tabs: [All (52)]  🧠 Memory (7)  🤖 Agents (6)  ⚡ Tools (18)  🎨 UI (11)  🛠️ Diag (10) │
│ Search: (press / to filter extensions)                                   │
├──────────────────────────────────────────────────────────────────────────┤
│ › [x] ⚡ Clipboard — OS clipboard integration and OSC52 copy            │
│   [x] 🤖 Agent Core — Unified subagent and workflow control plane       │
│   [x] 🧠 Long-Term Memory — Prism long-term memory integration           │
│   [ ] ⚡ Execute Python — In-process Python script execution environment │
│   [x] 🎨 Powerline Footer — Context and token metrics statusbar         │
│   [ ] 🛠️ Model Restriction — Enforce local-only LLM models for privacy   │
│   ...                                                                    │
├──────────────────────────────────────────────────────────────────────────┤
│ Presets: [1] Minimal   [2] Web   [3] Backend   [4] Offline   [5] All     │
│ [Space] Toggle • [1-5] Preset • [a] All • [Tab] Tab • [/] Search • [Enter] Save │
╰──────────────────────────────────────────────────────────────────────────╯
```

---

## Keyboard Shortcuts

| Key | Action | Description |
|---|---|---|
| `Space` | **Toggle Extension** | Invert `[x]` / `[ ]` for the currently highlighted extension |
| `1`–`5` | **Apply Preset** | `1`: Minimal, `2`: Web, `3`: Backend, `4`: Offline, `5`: All |
| `a` / `Ctrl+A` | **Toggle Category** | Select all / deselect all extensions in the active category |
| `Tab` / `Shift+Tab` | **Cycle Tabs** | Switch between All, Memory, Agents, Tools, UI, Diagnostics |
| `↑` / `↓` / `j` / `k` | **Navigate** | Move cursor up and down through extension list |
| `PgUp` / `PgDn` | **Page Jump** | Jump up or down by 10 items |
| `Home` / `End` | **List Jump** | Jump to first or last item in the list |
| `/` | **Search / Filter** | Focus search input to filter by name, path, tag, or description |
| `c` | **Clear Search** | Clear current search filter |
| `Enter` / `s` | **Save** | Atomically write `.pi/settings.json` and exit modal |
| `Esc` / `q` | **Cancel** | Close dialog without saving changes |

---

## Command Line Interface (CLI Flags)

You can script or quickly configure projects using CLI flags:

### 1. Apply a Preset Profile
```bash
/setup-pi --preset minimal
/setup-pi --preset web
/setup-pi --preset backend
/setup-pi --preset offline
/setup-pi --preset all
```
*Note: Positional syntax also works: `/setup-pi minimal` or `/setup-pi web`.*

### 2. Enable an Extension
```bash
/setup-pi --enable python
/setup-pi --enable ./packages/execute-python/extensions
/setup-pi --enable clipboard
```

### 3. Disable an Extension
```bash
/setup-pi --disable python
/setup-pi --disable session-recap
```

### 4. Toggle an Extension
```bash
/setup-pi --toggle files-widget
```

### 5. List Available Extensions
```bash
/setup-pi --list
```
Prints all available extensions in the catalog with category, ID, and `[x]`/`[ ]` enabled status.

### 6. View Project Status
```bash
/setup-pi --status
```
Displays whether `.pi/settings.json` exists in current directory, number of active extensions, and package sources.

### 7. Help Reference
```bash
/setup-pi --help
```

---

## Preset Profiles

| Preset | ID | Extensions Included | Best For |
|---|---|---|---|
| **Minimal / Core** | `minimal` | `clipboard`, `notify`, `pi-agent-core` | Lightweight, fast session startup with core essentials |
| **Full Stack / Web** | `web` | `clipboard`, `notify`, `pi-agent-core`, `mm-memory`, `pi-atelier`, `powerline-footer`, `files-widget`, `code-actions`, `shortcuts-help` | Full-stack web frontend and app development |
| **Backend & Systems** | `backend` | `clipboard`, `notify`, `pi-agent-core`, `mm-memory`, `execute-python`, `scheduler`, `pi-worktree`, `pi-adhd-tasks`, `context-control` | Backend APIs, microservices, data scripts, automation |
| **Offline & Private** | `offline` | `clipboard`, `notify`, `pi-agent-core`, `mm-memory`, `pi-model-restriction`, `mm-observational-memory`, `mm-wiki` | Airgapped or privacy-sensitive projects with local LLMs |
| **All Extensions** | `all` | All extensions found in the repository | Complete capability suite |

---

## Extension Categories

Extensions are automatically categorized by `src/catalog.ts`:

- 🧠 **`memory`**: `mm-memory`, `mm-observational-memory`, `mm-wiki`, `context-control`, `prune-context`, `pi-prism`, `pi-context`.
- 🤖 **`agents`**: `pi-agent-core`, `pi-agent-memory`, `pi-task-notifications`, `agent-guidance`, `agent-loop-reflection`.
- ⚡ **`tools`**: `execute-python`, `clipboard`, `copymsgs`, `shortcuts-help`, `scheduler`, `pi-adhd-tasks`, `pi-worktree`, `auto-retry`, `code-actions`, `pi-input-shortcuts`, `pi-plan-mode`, `pi-review`, `pi-rtk`, `pi-grill-me`, `pi-background-tasks`, `mm-adhd`, `mm-btw`, `mm-elixir`, `mm-qq`, `mm-lazy`, `ask-user-question`.
- 🎨 **`ui`**: `pi-atelier`, `powerline-footer`, `tab-status`, `files-widget`, `claude-spinner`, `amphetamine`, `pi-status-hub`, `pi-image-drop`, `mm-usage-center`.
- 🛠️ **`diagnostics`**: `pi-model-restriction`, `token-rate`, `session-recap`, `pi-auth-extension`, `provider-retry-proxy`, `cursor-runtime`, `auto-naming-session`, `execution-time`, `pi-backoffice-reporter`, `notify`, `system-prompt`, `pi-project-setup`.

---

## Generated `.pi/settings.json` Structure

When you save your selection, `.pi/settings.json` is generated or updated in the project folder:

```json
{
  "packages": [
    {
      "source": "/Users/mikalv/Repos/MeehProjects/pi-extensions",
      "extensions": [
        "./packages/clipboard/index.ts",
        "./packages/notify/extensions/index.ts",
        "./packages/pi-agent-core/src/index.ts",
        "./packages/mm-memory/src/index.ts"
      ]
    }
  ]
}
```

- **Atomic Writes**: Uses temporary files with atomic rename to prevent file corruption.
- **Preservation**: Existing custom keys (e.g. `defaultModel`, `thinkingLevel`, `compaction`) and external packages are preserved.

---

## Architecture & Programmatic API

You can also import and use `pi-project-setup` programmatically in tests or custom extensions:

```typescript
import {
  loadExtensionCatalog,
  readProjectSettings,
  writeProjectSettings,
  applyPresetToProject,
  enableProjectExtension,
  disableProjectExtension,
  getPreset,
  listPresets,
} from "./packages/pi-project-setup/src/index.js";

// 1. Read existing project settings
const state = await readProjectSettings(process.cwd());

// 2. Load catalog
const catalog = await loadExtensionCatalog();

// 3. Apply a preset programmatically
await applyPresetToProject(process.cwd(), "web", catalog.map((c) => c.path));

// 4. Enable or disable individual extensions
await enableProjectExtension(process.cwd(), "./packages/execute-python/extensions");
```
