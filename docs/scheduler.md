# Scheduler

**Purpose:** Schedule reminders, shell commands, and self-waking prompts for Pi.

## Tools, Commands, and Hooks

**Tools:**
- `list_scheduled_tasks`: List active or all scheduled tasks visible to the current Pi session.
- `cancel_scheduled_task`: Cancel a scheduled task by its unique ID or prefix.
- `manage_scheduled_task`: Enable, disable, remove, update, or cleanup scheduled tasks.

**Slash Commands:**
- `/schedule`: Schedule a new task. Syntax: `/schedule [notify|prompt|shell|message] <when> <payload>`. 
  - Examples of `<when>`: "in 5m", "tomorrow at 3pm", "every 2h", "cron 0 0 * * *".
  - Actions:
    - `notify`: Show a UI notification popup.
    - `prompt`: Wake the agent and send it a user prompt.
    - `shell`: Run a shell command in the background (can optionally wake the agent on success/failure).
    - `message`: Record a custom message in the session history.

## Key Files
- `index.ts`: The main Pi extension entry point. Handles state I/O, UI integration (widgets and status bar), timer execution loop, tool implementations, and Pi API calls (`sendUserMessage`, `exec`).
- `scheduler-core.cjs`: Core logic module, written in plain CommonJS for isolated testing. Handles natural language time parsing, cron validation, schedule math, and pure state transitions.

## How it works

The scheduler maintains persistent task state in a JSON file at `~/.pi/agent/state/scheduler/tasks.json`. When the extension initializes, it loads these tasks into memory. For each pending task visible to the current session (or global tasks), it computes the `nextRun` date and registers a timer. 

It handles `once`, `interval`, and `cron` schedules. It manages native Node timers within a `Map`. Because `setTimeout` has a ~24.8 day maximum delay limit, longer delays are chunked automatically. When the maximum timer fires, the scheduler checks if the true due date has arrived; if not, it reschedules the remaining delay. For cron jobs, it delegates to the `croner` library.

When a task's timer fires, the extension executes its assigned action. If the action requires the agent's attention (e.g., `prompt` or a `shell` command with a `wakeOn` condition met), it calls `pi.sendUserMessage()` to wake up the agent context and trigger a turn. Shell commands are executed transparently via `pi.exec()`. If the agent needs to review the shell command, the extension builds a prompt enclosing the `stdout`/`stderr` and exit code.

The extension also maintains real-time UI components: a status indicator showing the number of active tasks, and a dedicated widget (`belowEditor`) listing the next 3 upcoming tasks.

## Configuration
- **Task Scopes:** Tasks are scoped to `session`, `cwd`, or `global`. Session-scoped tasks only execute and display within the specific session that created them.
- **State File:** Automatically managed at `~/.pi/agent/state/scheduler/tasks.json`.

## Dependencies
- `croner`: Used for parsing and executing complex cron expressions.
- Standard Pi peer dependencies (`@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`, `@earendil-works/pi-tui`, `typebox`).