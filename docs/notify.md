# @async23/pi-notify

Native macOS completion notifications for Pi with tmux click-to-focus.

## Tools, Commands, and Hooks Provided
- **Slash Commands**:
  - `/pi-notify-setup`: Installs the dedicated macOS "Pi Notifier.app" to `~/Applications/` for a custom sender app and icon.
  - `/pi-notify-test`: Sends a test desktop notification and verifies tmux click-to-focus behavior.
- **Events Listened To**: 
  - `input`: Captures the user's raw prompt text.
  - `before_agent_start`: Resets tracking variables for the new run.
  - `message_end`: Tracks the assistant's latest response text, stop reasons (error or aborted), and errors.
  - `agent_settled`: Fires the actual desktop notification once the agent is fully settled and idle (after any retries, compactions, or queued follow-ups).

## Key Files
- `extensions/index.ts`: The main extension entry point containing event listeners, text truncation/formatting logic, tmux target parsing, and `terminal-notifier` execution.
- `scripts/focus-tmux.sh`: Bash script that handles bringing Ghostty to the foreground and focusing the specific tmux session, window, and pane when a notification is clicked.
- `scripts/install-notifier-app.sh`: Script to install the dedicated Pi Notifier macOS application wrapper.

## How it works
The extension tracks the conversation state by listening to `input` and `message_end` events to record the user's latest prompt and the assistant's final response or error. It waits for the `agent_settled` event to ensure all automatic follow-ups, compactions, and retries are completely finished before interrupting the user.

When the agent settles in `tui` mode, it uses `terminal-notifier` to dispatch a macOS desktop notification. The notification displays the user's prompt as the subtitle (truncated cleanly for wide/CJK characters) and the assistant's summarized outcome or error message as the body. It also determines the current tmux pane coordinates if applicable.

When the user clicks the notification, the macOS notification center executes the provided `focus-tmux.sh` script, which activates the terminal application (default Ghostty) and switches tmux to the exact session, window, and pane where the Pi task was running. The extension prefers the dedicated `Pi Notifier.app` if installed via `/pi-notify-setup`, falling back to Homebrew's `terminal-notifier` or a bundled terminal-notifier if necessary.

## Configuration
Controlled via the following environment variables:
- `PI_NOTIFY_DISABLED`: Set to `1` to completely disable notifications.
- `PI_NOTIFY_SOUND`: Name of the sound to play (e.g., `default`).
- `PI_NOTIFY_APP`: Custom path to the Pi Notifier app (default: `~/Applications/Pi Notifier.app`).
- `PI_NOTIFY_FOCUS_SCRIPT`: Custom script to run on notification click (defaults to the bundled `focus-tmux.sh`).
- `PI_NOTIFY_LOG_PATH`: Path for notification logs (default: `~/.pi/agent/logs/pi-notify.log`).
- `PI_NOTIFY_DISABLE_LOG`: Set to `1` to disable file logging.

## Dependencies
- macOS (`darwin` OS).
- Expects `terminal-notifier` (either the installed app wrapper, Homebrew version, or embedded fallback).
- Ghostty and tmux are targeted by default for click-to-focus functionality.
- No additional runtime dependencies beyond the `pi-coding-agent` peer dependency.