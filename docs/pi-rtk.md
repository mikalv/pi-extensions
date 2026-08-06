# pi-rtk

**Title and purpose**: `pi-rtk` is a Pi extension that optimizes bash commands by intercepting and routing them through the `rtk rewrite` tool, saving context tokens while preserving command intent.

## Tools / commands / hooks provided

- **Commands**:
  - `/rtk enable`: Enables RTK command rewriting for the current session.
  - `/rtk disable`: Disables RTK command rewriting for the current session.
  - `/rtk status`: Shows the current status of RTK command rewriting (enabled/disabled, version, cache status).
- **Hooks**:
  - `session_start`: Validates the `rtk` binary presence and resets the per-session toggle.
  - `session_shutdown`: Clears the RTK status indicator.
  - `before_agent_start`: Injects a system prompt notice letting the agent know that its bash commands are transparently rewritten.
  - `tool_call`: Intercepts `bash` tool calls and replaces `event.input.command` with the `rtk rewrite`-optimized version if safe.
  - `user_bash`: Intercepts and rewrites user-initiated bash commands by overriding the `exec` operation.
- **UI Integrations**:
  - Sets a status indicator (`pi-rtk`) in the Pi UI (`rtk ✓` or `rtk ✗`).
  - Notifies the user of rewritten commands via `ctx.ui.notify`.

## Key files

- `extensions/index.ts`: The main extension entry point. Handles tool call/user bash interceptions, executes `rtk rewrite`, manages session states, checks version requirements, and injects the system prompt.
- `extensions/findFallback.js`: Provides `hasUnsupportedRtkFind` logic to reject rewrites that use specific `find` tokens unsupported by `rtk find` (like `-exec`, `-mtime`, `-regex`).

## How it works

The extension intercepts both agent tool calls (`tool_call` event specifically checking `isToolCallEventType("bash", event)`) and user-initiated bash commands (`user_bash` event). 

Before executing a bash command, it passes the original command to `rtk rewrite <command>`. The resulting optimized command is parsed and subjected to safety checks:
1. It validates that the `rtk` version is at least `0.23.0`.
2. It blocks the rewrite if the command is a direct script evaluation (e.g., `node -e`, `python -c`).
3. It blocks the rewrite if the initial program changed or if the rewritten command introduces potentially dangerous shell operators.
4. It blocks the rewrite if it falls back to `rtk find` with unsupported operators.

If all checks pass, the extension mutates the `event.input.command` (for agents) or provides an overridden `exec` function (for users), executing the optimized bash string while hiding the token cost.

## Configuration

- **Environment variables**:
  - `RTK_DISABLED=1` (or `true`, `yes`, `y`): Bypasses all `rtk rewrite` operations at the environment level.

## Dependencies

- **System Requirements**: Requires the `rtk` binary to be installed in the system `PATH` at version `0.23.0` or higher.
- **Peer Dependencies**: `@earendil-works/pi-coding-agent`.