# pi-adhd-tasks

**Title and purpose:** Markdown-first shared task system for Pi with `/todo` and `/task` flows. It manages session-scoped and project-scoped tasks, syncing them natively into Markdown files.

## Tools, Commands, and Hooks

- **Tools registered:**
  - `adhd_tasks_list`: Lists all tasks for both `session` and `project` scopes.
  - `adhd_tasks_add`: Appends a new task to a given scope.
  - `adhd_tasks_update`: Updates an existing task (change status, edit text, move between scopes, reorder, or remove).
- **Commands registered:**
  - `/todo`: Manage session todos (supports `list`, `add`, `start`, `done`, `undo`, `edit`, `remove`, `move`, `top`, `up`, `down`).
  - `/task`: Manage project tasks (supports identical subcommands to `/todo`).
- **Event Hooks:**
  - `session_start`: Initializes the session ID and resets task trackers.
  - `user_message` / `assistant_message`: Detects external file modifications to the task lists and updates the TUI widget.
  - `before_agent_start`: Injects an active task reminder into the agent's system prompt (e.g., current task and next steps) based on reminder intervals and recent file touches.

## Key Files

- `src/index.ts`: The main entry point. Registers tools, commands, UI widgets, event hooks, and manages the injection of task reminders into the system prompt.
- `src/store.ts`: The data persistence layer. Reads and writes tasks to `.md` files, parses markdown checkboxes and `<!-- pi-task:id -->` markers, and handles operations like reordering, status updates, and moving tasks.
- `src/types.ts`: Defines interfaces such as `MarkdownTask` and `TaskScope`.

## How it works

The extension operates on a Markdown-first architecture where tasks are simply lines in a markdown file (e.g., `- [ ] My task <!-- pi-task:session-abc12345 -->`). It manages two distinct scopes: **session** (ephemeral tasks for the current work session) and **project** (long-term tasks for the whole repository).

When interacting via slash commands or agent tools, it modifies the corresponding markdown files and re-syncs. It continuously monitors the files on disk, so if a user edits `.pi/tasks/project.md` manually, the extension detects the external change on the next message event and updates its internal snapshot.

A key feature is its cognitive scaffolding: during `before_agent_start`, it can prepend a `<system-reminder>` XML block to the agent's system prompt, reminding the LLM of its current active task or notifying it if the task list was just changed, reducing the chances of the agent wandering off track.

## Configuration

The extension stores tasks in the `.pi/tasks/` directory inside the project root (`process.cwd()`):
- Project tasks: `.pi/tasks/project.md`
- Session tasks: `.pi/tasks/sessions/<sessionId>.md`

It determines the session ID on `session_start` from the event payload, falling back to `process.env.PI_SESSION_ID` or `process.env.PI_SESSION`.

## Dependencies

- **Peer Dependencies:** `@earendil-works/pi-coding-agent` (>= 0.80.0)
- Relies on `@earendil-works/pi-ai` implicitly for type definitions (`Type.Object`, etc.).
