# pi-status-hub

**Purpose:** A shared status registry, TUI overlay, and API-ready snapshot layer for Pi.

## Tools, Commands, and Hooks
- **Slash Command:** `/status` - Opens the status hub overlay TUI, or prints a summary snapshot if UI is not available.
- **Tool:** `status_hub_snapshot` - Retrieves a normalized JSON snapshot of registered status groups, with options for a specific `groupId` and `forceRefresh`.
- **Events (Internal Hooks):** Re-fetches all group data on `session_start` and `session_switch`.

## Key Files
- `src/index.ts`: The main entry point that registers the status registry, default groups, command, tool, and session event listeners.
- `src/registry.ts`: Core `StatusRegistry` class handling group registration, caching, TTLs, and subscriber notifications.
- `src/types.ts`: Type definitions for `StatusGroup`, `GroupData`, `TaskRecord`, `StatusHubSnapshot`, etc.
- `src/commands/status.ts`: Registers the `/status` command and launches the `StatusOverlay` TUI.
- `src/tools/status_hub_snapshot.ts`: Exposes the registry state to agents via the `status_hub_snapshot` tool.

## How it works
`pi-status-hub` operates around a centralized `StatusRegistry`. Extension groups (like tasks, providers, or usage) register themselves via `registry.registerGroup()`, supplying an ID, name, TTL, and a `dataProvider` async function. The registry handles fetching this data, applying TTL-based caching to prevent redundant API calls, and keeping an in-flight map to deduplicate concurrent refresh requests for the same group.

It ties into Pi's lifecycle events by listening to `session_start` and `session_switch`, triggering background refreshes of all registered status groups automatically. A publish-subscribe pattern allows UI components or other extensions to listen for updates via `registry.subscribeAll()`. 

The data can be exposed visually via a dedicated TUI overlay (triggered by `/status`) or programmatically to LLM agents through the `status_hub_snapshot` tool, allowing the agent to poll project health, task boards, or other unified status metrics dynamically.

## Configuration
- Default TTL is configured internally via `DEFAULT_STATUS_HUB_SETTINGS.defaultTtlMs` (30 seconds). 
- Additional configuration (like Kanboard settings) appears to be pulled from `DEFAULT_STATUS_HUB_SETTINGS.kanboard`.

## Dependencies
- **Peer Dependencies:** `@earendil-works/pi-coding-agent` (>=0.80.0), `@earendil-works/pi-tui` (>=0.80.0)
