# tab-status

## Title and one-line purpose
Terminal tab status indicators for Pi sessions. It dynamically updates the terminal window/tab title to reflect the current activity state of the Pi agent (e.g., new, running, done, error).

## Tools / commands / hooks provided
- **Tools**: None
- **Commands**: None
- **Hooks (Events listened to)**:
  - `session_start`
  - `session_switch`
  - `before_agent_start`
  - `agent_start`
  - `turn_start`
  - `tool_call`
  - `tool_result`
  - `agent_end`
  - `session_shutdown`

## Key files
- `tab-status.ts`: The main entry file and core logic for the extension.

## How it works
The extension maintains a state machine (`StatusTracker`) tracking whether the agent is `running`, and if it `sawCommit`. It listens to various Pi session and agent lifecycle events to transition this state and updates the terminal tab title via `ctx.ui.setTitle(...)`.

When an agent run begins (`agent_start`), the title updates to `:running...` and a 180-second inactivity timer starts. Each subsequent event (`turn_start`, `tool_call`, `tool_result`) resets this inactivity timer. If the agent calls the `bash` tool with a command matching `git commit`, the extension sets a flag marking that work was committed.

Upon completion (`agent_end`), the extension checks if the stop reason was an error and transitions to `:🛑`. Otherwise, based on whether a git commit was seen, it transitions to `:✅` (committed) or `:🚧` (done but not committed). Finally, it clears the title decorations when the session shuts down.

## Configuration
- No specific configuration keys or environment variables. The 180,000ms (3 minutes) inactivity timeout is hardcoded.

## Dependencies
- `@earendil-works/pi-agent-core`
- `@earendil-works/pi-ai`
- `@earendil-works/pi-coding-agent`