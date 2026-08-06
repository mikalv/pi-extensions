# pi-atelier

A responsive status rail and live activity sidebar for [Pi](https://pi.dev).

Pi Atelier replaces Pi's default footer with a calm Status Rail and adds an optional docked sidebar for live agent, turn, tool, context, session, and project information.

## Tools / Commands / Hooks provided

- **Commands**:
  - `/atelier` - Opens the Atelier Control Center.
  - `/atelier display` - Opens the Display Settings Workspace.
  - `/atelier disable` - Disables the Pi Atelier extension for the session.
  - `/atelier enable` - Enables the Pi Atelier extension for the session.
  - `/atelier sidebar` - Toggles the sidebar visibility.
  - `/atelier sidebar on|off` - Enables or disables the sidebar explicitly.
  - `/atelier sidebar tools on|off` - Toggles active tool details.
- **Shortcuts**:
  - `alt+a` (Default) - Opens the Atelier menu. Configurable via `shortcut` in config.
  - `ctrl+shift+r` - Resizes the Pi Atelier sidebar.
- **Hooks**:
  - Listens to Pi events: `session_start`, `session_tree`, `agent_start`, `turn_start`, `before_provider_request`, `message_update`, `message_end`, `tool_execution_start`, `tool_execution_end`, `tool_result`, `agent_settled`, `turn_end`, `model_select`, `thinking_level_select`, `session_compact`, `session_info_changed`, `session_shutdown`.
  - Custom Event: `atelier:memory-status` for Memory status updates (integrates with `mm-memory` and `mm-observational-memory`).

## Key Files

- `package.json` - Defines the extension metadata, scripts, and exports.
- `extensions/index.ts` - Main entry point containing initialization, command and shortcut registration, and all pi event listeners.
- `src/config.ts` - Configuration management, loads from user/project/session layers.
- `src/footer.ts` - Implementation of the Status Rail footer.
- `src/menu.ts` - The Atelier Control Center UI implementation.
- `src/sidebar.ts` - The live activity sidebar implementation.

## How it works

Pi Atelier intercepts the terminal UI by substituting Pi's default footer with its custom Status Rail component via `ctx.ui.setFooter()`. It attaches to numerous lifecycle events (e.g., turns, tool executions, model selections) through the `pi.events.on` / `pi.on` API to maintain an accurate real-time state of the session. 

The extension maintains an internal `AtelierRuntime` instance per session which coordinates the gathering of metrics (tokens, context size, cost), Git repository state (Workspace Pulse), and agent activities. It renders this data continuously by requesting TUI renders (`requestRender()`) whenever state mutations occur, ensuring the Status Rail and sidebar are up to date without polling.

When enabled, the Live Activity Sidebar is mounted as a custom widget rendering alongside the main chat. It aggregates agent state, tool usage, TODO tracking, and system performance metrics. Inter-extension communication is supported via the `atelier:memory-status` event, allowing external memory extensions to push status text directly into Atelier's visual panels.

## Configuration

Settings are resolved by combining User (`~/.pi/agent/pi-atelier.json`), Project (`.pi/agent/pi-atelier.json` if trusted), and Session overrides.

Key configuration options include:
- `preset`: `editorial`, `minimal`, `classic`, or `custom`
- `shortcut`: Keybinding to open the menu (default `alt+a`)
- `density`: `comfortable` or `compact`
- `showSidebarAgent`: Boolean (User-level only)
- `showSidebarTodos`: Boolean (Default `true`)
- `showSidebarToolNames`: Boolean
- `completionNotifications`: Boolean (User-level only)
- `segmentLayout`: Controls order and visibility of footer segments (`brand`, `activity`, `metrics`, `performance`, `context`, `model`, `git`, `statuses`, `menu`)

## Dependencies

- **Peer Dependencies**:
  - `@earendil-works/pi-coding-agent`: `>=0.80.7`
  - `@earendil-works/pi-tui`: `>=0.80.7`
- **Other Notables**:
  - Requires Node.js `>=22.19.0`
  - Utilizes `node:fs`, `node:path`, and system processes for notifications (e.g. `osascript` on macOS, PowerShell on Windows).