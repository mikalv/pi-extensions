# todos

Stores and manages project todo items as standalone markdown files with JSON front matter.

## Tools / Commands / Hooks Provided
- **Tool**: `todo` - Allows agents to manage task lists with actions: `list`, `list-all`, `get`, `create`, `update`, `append`, `delete`, `claim`, `release`.
- **Command**: `/todos` - Opens a visual interactive todo manager in the terminal UI for listing, searching, and managing tasks.

## Key Files
- `packages/todos/index.ts`: The main and only entry point. It manages file system operations, lock mechanisms for concurrency, LLM tool definitions, and terminal UI components (e.g., `TodoSelectorComponent`).

## How it works
Todos are stored as standalone markdown files inside a dedicated directory (defaulting to `.pi/todos/`). Each file is named `<id>.md` and contains a JSON block at the top representing the front matter (with fields like `id`, `title`, `tags`, `status`, `created_at`, `assigned_to_session`), followed by an optional markdown body for long-form details. 

To prevent concurrent modification issues across different agent sessions, a file-locking mechanism creates temporary `<id>.lock` files when an item is being edited (locks have a 30-minute TTL). The extension also includes an automatic garbage collection (GC) mechanism that runs during startup, sweeping and deleting closed todos that exceed a configured age threshold.

The `/todos` slash command opens an interactive overlay where users can search, filter (e.g., by status or tag), view, claim, release, and delete tasks directly within the Pi TUI.

## Configuration
- **Environment Variable**: `PI_TODO_PATH` - Overrides the default `.pi/todos` directory path.
- **Settings File**: `<todo-dir>/settings.json` supports the following keys:
  - `gc` (boolean): Whether to delete old closed todos on startup (default: `true`).
  - `gcDays` (number): The age threshold in days for the garbage collector (default: `7`).

## Dependencies
This package relies primarily on the core Pi ecosystem:
- `@earendil-works/pi-coding-agent`
- `@earendil-works/pi-ai`
- `@earendil-works/pi-tui`
- `@sinclair/typebox`
