# Usage Extension

A visual dashboard and analytics tool for tracking token usage, costs, cache hits, and session statistics across all AI providers and models.

## Tools / commands / hooks provided

- `/usage` slash command: Opens the interactive usage statistics dashboard.

## Key files

- `index.ts`: The extension entry point. Contains the interactive TUI components (`UsageComponent`), table layouts, key bindings, and registers the `/usage` command.
- `data.ts`: The core data engine. Handles recursively scanning `~/.pi/agent/sessions/`, extracting usage data from session JSONL files, aggregating statistics, and managing the on-disk cache.
- `graph.ts`: Renders terminal-based charts to visualize metrics (cost, tokens, messages) over different time periods.
- `export.ts`: Provides functionality to export the collected usage data and insights to CSV or JSON files.

## How it works

When the `/usage` command is executed, the extension scans the user's local session history (`~/.pi/agent/sessions/`). It parses the JSON lines for `usage` fields on assistant messages, calculating input tokens, output tokens, prompt cache reads/writes, and overall cost. 

To maintain high performance, the extension uses an incremental on-disk cache (`~/.pi/agent/usage-extension-cache.json`) keyed by file size and modification time. This ensures that only new or modified session log chunks are parsed on subsequent runs.

The data is presented in a rich, interactive TUI (using `ctx.ui.custom()`). The dashboard provides multiple views (Table, Graph, Insights) and time filters (Today, This Week, Last Week, All Time). Users can navigate with arrow keys to drill down into specific providers and models, or press `e` to export the current view.

## Configuration

Settings can be configured in your `settings.json` file under the `usage-extension` key:

- `"usage-extension": { "exportDir": "~/Downloads" }`: Sets the default directory where data exports (CSV/JSON) are saved when pressing `e` in the dashboard.

## Dependencies

- `@earendil-works/pi-coding-agent`
- `@earendil-works/pi-tui`