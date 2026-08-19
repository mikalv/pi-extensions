# Theme Switcher

[![npm](https://img.shields.io/npm/v/@codewithkenzo/pi-theme-switcher?color=3B82F6&style=flat-square)](https://www.npmjs.com/package/@codewithkenzo/pi-theme-switcher)
[![Bun](https://img.shields.io/badge/Bun-%23000?style=flat-square&logo=bun&logoColor=white)](https://bun.sh)
[![Effect](https://img.shields.io/badge/Effect--TS-black?style=flat-square)](https://effect.website)
[![TypeScript](https://img.shields.io/badge/TypeScript-%23007ACC?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)

`@codewithkenzo/pi-theme-switcher` — Runtime theme selection and preview for the [Pi coding agent](https://github.com/badlogic/pi-mono).

Part of the [Pi Rig suite](https://github.com/codewithkenzo/pi-rig).

Theme Switcher lets the agent switch, preview, and cycle themes during a live session. It persists the active theme across restarts and injects current-theme context into each session.

## Quick demo

[![Theme Switcher demo](../../docs/media/demos/theme-switcher-demo.gif)](../../docs/media/demos/theme-switcher-demo.mp4)

Shows live preview, theme changes, and session-aware runtime theming in action.

## Surfaces

| Type | Name | Purpose |
|------|------|---------|
| Tool | `theme_set` | Set the active theme by name |
| Tool | `theme_list` | List available themes |
| Tool | `theme_preview` | Preview a theme without committing |
| Command | `/theme status` | Show the current active theme |
| Command | `/theme set <name>` | Set the active theme |
| Command | `/theme list` | List available themes |
| Command | `/theme preview <name>` | Preview a theme |
| Command | `/theme cycle` | Cycle to the next theme |

## Palette preview (compact)

`accent · header · success · warning · error` swatches (flat-square, no rounded corners).

| NF | Palette | Variant | Preview |
|---|---|---|---|
| `` | `catppuccin-mocha` | dark | ![#89b4fa](https://img.shields.io/badge/%20-89b4fa-89b4fa?style=flat-square) ![#cba6f7](https://img.shields.io/badge/%20-cba6f7-cba6f7?style=flat-square) ![#a6e3a1](https://img.shields.io/badge/%20-a6e3a1-a6e3a1?style=flat-square) ![#f9e2af](https://img.shields.io/badge/%20-f9e2af-f9e2af?style=flat-square) ![#f38ba8](https://img.shields.io/badge/%20-f38ba8-f38ba8?style=flat-square) |
| `` | `catppuccin-latte` | light | ![#1e66f5](https://img.shields.io/badge/%20-1e66f5-1e66f5?style=flat-square) ![#8839ef](https://img.shields.io/badge/%20-8839ef-8839ef?style=flat-square) ![#40a02b](https://img.shields.io/badge/%20-40a02b-40a02b?style=flat-square) ![#df8e1d](https://img.shields.io/badge/%20-df8e1d-df8e1d?style=flat-square) ![#d20f39](https://img.shields.io/badge/%20-d20f39-d20f39?style=flat-square) |
| `` | `nord` | dark | ![#88c0d0](https://img.shields.io/badge/%20-88c0d0-88c0d0?style=flat-square) ![#5e81ac](https://img.shields.io/badge/%20-5e81ac-5e81ac?style=flat-square) ![#a3be8c](https://img.shields.io/badge/%20-a3be8c-a3be8c?style=flat-square) ![#ebcb8b](https://img.shields.io/badge/%20-ebcb8b-ebcb8b?style=flat-square) ![#bf616a](https://img.shields.io/badge/%20-bf616a-bf616a?style=flat-square) |
| `` | `dracula` | dark | ![#bd93f9](https://img.shields.io/badge/%20-bd93f9-bd93f9?style=flat-square) ![#bd93f9](https://img.shields.io/badge/%20-bd93f9-bd93f9?style=flat-square) ![#50fa7b](https://img.shields.io/badge/%20-50fa7b-50fa7b?style=flat-square) ![#f1fa8c](https://img.shields.io/badge/%20-f1fa8c-f1fa8c?style=flat-square) ![#ff5555](https://img.shields.io/badge/%20-ff5555-ff5555?style=flat-square) |
| `` | `tokyo-night` | dark | ![#7aa2f7](https://img.shields.io/badge/%20-7aa2f7-7aa2f7?style=flat-square) ![#bb9af7](https://img.shields.io/badge/%20-bb9af7-bb9af7?style=flat-square) ![#9ece6a](https://img.shields.io/badge/%20-9ece6a-9ece6a?style=flat-square) ![#e0af68](https://img.shields.io/badge/%20-e0af68-e0af68?style=flat-square) ![#f7768e](https://img.shields.io/badge/%20-f7768e-f7768e?style=flat-square) |
| `` | `electric-midnight` | dark | ![#8B5CF6](https://img.shields.io/badge/%20-8B5CF6-8B5CF6?style=flat-square) ![#E4E4E7](https://img.shields.io/badge/%20-E4E4E7-E4E4E7?style=flat-square) ![#3B82F6](https://img.shields.io/badge/%20-3B82F6-3B82F6?style=flat-square) ![#8B5CF6](https://img.shields.io/badge/%20-8B5CF6-8B5CF6?style=flat-square) ![#DC2626](https://img.shields.io/badge/%20-DC2626-DC2626?style=flat-square) |
| `` | `cadet` | dark | ![#7D39EB](https://img.shields.io/badge/%20-7D39EB-7D39EB?style=flat-square) ![#F5F4EE](https://img.shields.io/badge/%20-F5F4EE-F5F4EE?style=flat-square) ![#C6FF33](https://img.shields.io/badge/%20-C6FF33-C6FF33?style=flat-square) ![#C6FF33](https://img.shields.io/badge/%20-C6FF33-C6FF33?style=flat-square) ![#FF6B6B](https://img.shields.io/badge/%20-FF6B6B-FF6B6B?style=flat-square) |
| `` | `soho` | dark | ![#C4A7E7](https://img.shields.io/badge/%20-C4A7E7-C4A7E7?style=flat-square) ![#EA9A97](https://img.shields.io/badge/%20-EA9A97-EA9A97?style=flat-square) ![#9CCFD8](https://img.shields.io/badge/%20-9CCFD8-9CCFD8?style=flat-square) ![#F6C177](https://img.shields.io/badge/%20-F6C177-F6C177?style=flat-square) ![#EB6F92](https://img.shields.io/badge/%20-EB6F92-EB6F92?style=flat-square) |
| `` | `orchid` | dark | ![#81A1C1](https://img.shields.io/badge/%20-81A1C1-81A1C1?style=flat-square) ![#81A1C1](https://img.shields.io/badge/%20-81A1C1-81A1C1?style=flat-square) ![#A3BE8C](https://img.shields.io/badge/%20-A3BE8C-A3BE8C?style=flat-square) ![#DFCA9A](https://img.shields.io/badge/%20-DFCA9A-DFCA9A?style=flat-square) ![#E8A4CC](https://img.shields.io/badge/%20-E8A4CC-E8A4CC?style=flat-square) |
| `` | `storm` | dark | ![#7AA2F7](https://img.shields.io/badge/%20-7AA2F7-7AA2F7?style=flat-square) ![#BB9AF7](https://img.shields.io/badge/%20-BB9AF7-BB9AF7?style=flat-square) ![#9ECE6A](https://img.shields.io/badge/%20-9ECE6A-9ECE6A?style=flat-square) ![#E0AF68](https://img.shields.io/badge/%20-E0AF68-E0AF68?style=flat-square) ![#F7768E](https://img.shields.io/badge/%20-F7768E-F7768E?style=flat-square) |

More palettes are available in runtime (`/theme list`) and the picker.

## Architecture

```
index.ts              Extension entry — registers tools, commands, session hooks
src/
  types.ts            TypeBox schemas + tagged errors
  state.ts            Active theme state (in-memory)
  runtime.ts          Theme application and validation
  tools.ts            theme_set, theme_list, theme_preview
  commands.ts         /theme command handler
  picker.ts           Interactive theme picker
  lifecycle.ts        Session restore and agent-end persistence
  session.ts          Theme context injection into session entries
  renderers.ts        Theme preview rendering
  ui.ts               TUI helpers
skills/
  theme-switcher/
    SKILL.md          Bundled skill for agent context
```

## Key patterns

- **Session persistence** — active theme is saved on `agent_end` and restored on `session_start`.
- **Context injection** — current theme is injected into the session so the agent is always aware of the active state.
- **Effect at boundaries** — async operations use Effect-TS. All exits to the pi API surface use `Effect.runPromise`.

## Install

```bash
pi install npm:@codewithkenzo/pi-theme-switcher
```

Or install all Pi Rig extensions at once:

```bash
bunx @codewithkenzo/pi-rig@latest
```

<details>
<summary>From source</summary>

```bash
bun run setup
# or individually:
pi install ./extensions/theme-switcher
```

</details>

## Prerequisites

- [Bun](https://bun.sh) >= 1.3
- [Pi coding agent](https://github.com/badlogic/pi-mono) installed and on your PATH

## Development

```bash
cd extensions/theme-switcher
bun install
bun run build       # runtime bundle for the Pi coding agent
bun run typecheck   # typecheck
bun test            # tests
```

## Links

- [Pi Rig suite](https://github.com/codewithkenzo/pi-rig) — monorepo with all extensions, installer, and docs
- [Pi coding agent](https://github.com/badlogic/pi-mono) — upstream runtime
- [npm: @codewithkenzo/pi-theme-switcher](https://www.npmjs.com/package/@codewithkenzo/pi-theme-switcher)
- Related: [@codewithkenzo/pi-dispatch](https://github.com/codewithkenzo/pi-dispatch), [@codewithkenzo/pi-gateway-messaging](https://github.com/codewithkenzo/pi-rig/tree/main/extensions/gateway-messaging), [@codewithkenzo/pi-notify-cron](https://github.com/codewithkenzo/pi-rig/tree/main/extensions/notify-cron)
