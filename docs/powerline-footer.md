# Powerline Footer

A rich, powerline-inspired status footer for the Pi terminal UI. It displays comprehensive real-time information including Git status, environment details, context usage, accumulated cost, and session duration.

## Tools / commands / hooks provided
- **Hooks**: Listens to the `session_start` event to register and render the custom footer using `ctx.ui.setFooter`.

## Key files
- `index.ts`: The main entry point. Contains the `PowerlineFooter` class implementing the `Component` interface, along with the extension factory function.

## How it works
When the `session_start` event is triggered, the extension checks if the context has a UI. If so, it mounts a custom `PowerlineFooter` component.

The `PowerlineFooter` component renders a single line that fits the terminal width, displaying:
- The session name and a shortened current working directory.
- Git branch and repository status (staged, unstaged, untracked, ahead, behind), fetched asynchronously every 10 seconds via `child_process.exec`.
- The current AI model, token context utilization percentage, and the total cost incurred in the session.
- The session duration and active Python virtual environment (detected via `CONDA_DEFAULT_ENV` or `VIRTUAL_ENV`).
- Current local time and active extension statuses.

## Configuration
There are no specific `settings.json` configuration keys. The extension automatically detects standard environment variables:
- `HOME` or `USERPROFILE` for directory shortening.
- `CONDA_DEFAULT_ENV` or `VIRTUAL_ENV` to display Python environment details.

## Dependencies
- `@earendil-works/pi-coding-agent` (peer dependency for `ExtensionAPI`, `ExtensionContext`, etc.)
- `@earendil-works/pi-tui` (peer dependency for `Component`, `TUI`, `truncateToWidth`, etc.)
- Node.js `child_process` (built-in, used for non-blocking Git status checks)