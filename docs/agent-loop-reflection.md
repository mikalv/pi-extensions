# Agent Loop Reflection

**Purpose:** Inject reflection reminders into long-running pi agent loops to ensure the agent regularly evaluates its goal alignment, evidence, and progress.

## Tools / commands / hooks provided
- **Hooks:** Subscribes to Pi lifecycle events (`session_start`, `session_tree`, `session_compact`, `agent_start`, `agent_end`, `input`, and `turn_end`) to track assistant turns and trigger reminders.
- Does not register any custom tools, slash commands, or keyboard shortcuts.

## Key files
- `extensions/index.ts`: The single entry point that handles configuration loading, state tracking (countdown), and event subscription logic.

## How it works
The extension relies on a simple state machine consisting of a single countdown integer (`turnsUntilNextReminder`). It resets this countdown to the configured interval whenever a significant session event occurs (`session_start`, `session_tree`, `session_compact`, `agent_start`, `agent_end`) or when manual user input is detected. 

As the agent operates continuously, the extension listens to the `turn_end` event. If the ending turn was made by the assistant, it decrements the countdown. Once the countdown hits zero (and specifically when the stop reason is `toolUse`), the extension mutates the session by injecting a steering message directly to the agent using `pi.sendUserMessage(..., { deliverAs: "steer" })`. This injected message forces the agent to pause, reflect on its goals, and optionally consult an `advisor` subagent before proceeding. After injecting the reminder, the countdown is reset.

If configuration parsing fails on startup, it will also mutate the UI by setting a warning status on the TUI via `ctx.ui.setStatus`.

## Configuration
Reads configuration from `~/.pi/agent/cnife-agent-loop-reflection.json` (resolves via `getAgentDir()`). If the file is missing, it will automatically create it with default values.

Supported keys:
- `reminderTurnsInterval` (number): The number of continuous assistant turns allowed before the reflection reminder is triggered. Default is `10`.
- `reminderText` (string): The specific prompt text sent to the agent during a reminder event.

## Dependencies
- **Peer Dependencies:** `@earendil-works/pi-coding-agent`