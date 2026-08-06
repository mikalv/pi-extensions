# mm-usage-center

**Purpose**: Unified usage, quota, cost, and observability extension for Pi.

## Tools, Commands, and Hooks

- **Slash Commands**:
  - `/usage-center` - Opens the interactive TUI dashboard by default.
  - `/usage-center dashboard` - Opens the usage dashboard.
  - `/usage-center hide` - Hides the inline widget.
  - `/usage-center status` - Refreshes the usage status bar.
  - `/usage-center live` - Shows a widget with live provider quotas.
  - `/usage-center graph [tab] [metric] [groupBy] [cumulative]` - Displays a usage graph in the inline widget.
  - `/usage-center export [view] [tab]` - Exports usage data to a CSV or JSON file.
- **Hooks**:
  - `session_start` - Refreshes the usage status when a session starts.
  - `agent_end` - Refreshes the usage status when the agent completes a turn.
  - `model_select` - Refreshes the usage status when a new model is selected.
  - `session_shutdown` - Clears the status and inline widget on shutdown.

## Key Files

- `src/index.ts`: The main entry point. Registers the slash commands, binds event hooks, and orchestrates the different usage components.
- `src/dashboard.ts`: Contains `UsageDashboardComponent` for the interactive TUI overlay dashboard and rendering primitives (cards, panels, graphs).
- `src/collector.ts`: Collects tool usage summary statistics.
- `src/live.ts`: Handles fetching real-time quotas from AI providers.
- `src/offline.ts`: Handles aggregating local, historical usage data (tokens, cost, sessions).
- `src/legacy/*`: Various modules for parsing historical ledgers, generating graph models, and building CSV/JSON exports.

## How It Works

The extension gathers observability data from two main sources:
1. **Offline Data**: Aggregated metrics from Pi's local usage ledgers (costs, tokens, messages, and tool statistics).
2. **Live Data**: Real-time quota metrics fetched directly from configured provider APIs.

It unifies these metrics and projects them across three TUI surfaces:
1. A status bar summary string (via `ctx.ui.setStatus`).
2. An inline, non-blocking bordered widget (via `ctx.ui.setWidget`) for quick views of quotas or graphs.
3. A full interactive dashboard overlay (via `ctx.ui.custom`) that provides tabbed views for overview, live quotas, providers, tools, graphs, and insights, navigable via keyboard shortcuts.

The dashboard uses the `pi-tui` rendering engine to construct bordered UI panels and ASCII-based progress bars/graphs using current theme colors.

## Configuration

- Reads `settings.json` located in the agent's directory (via `getAgentDir()`) to resolve a configured export directory for `/usage-center export`. If not configured, exports default to `/tmp` or the user's home directory.

## Dependencies

- **Peer Dependencies**:
  - `@earendil-works/pi-coding-agent` (for extension API and TUI context)
  - `@earendil-works/pi-tui` (for terminal UI primitives and text truncation utils)
