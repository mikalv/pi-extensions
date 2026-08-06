# PI Backoffice Reporter

**Purpose**: A PI extension that streams agent state, permission requests, and user questions to a remote backoffice server (e.g., an Elixir backend), allowing external monitoring and control.

## Tools, Commands, and Hooks
This extension does not provide tools, slash commands, or shortcuts. It heavily leverages **event subscriptions** to observe and intercept agent behavior:
- **Status telemetry**: Listens to `session_start`, `session_info_changed`, `session_shutdown`, `model_select`, `before_agent_start`, `agent_settled`, `turn_start`, `turn_end`, `tool_execution_start`, and `tool_execution_end`.
- **Permission gating**: Subscribes to `tool_call` and can block execution for `bash`, `write`, and `edit`.
- **Question interception**: Subscribes to `tool_call` to flag `AskUserQuestion` and `tool_result` to pause execution and fetch the remote answer.

## Key Files
- `src/index.ts`: Main entry point. Registers event listeners, aggregates usage metrics, and manages blocking logic for permissions and user questions.
- `src/protocol.ts`: The definitive TypeScript definitions outlining the API contract (e.g., `EventEnvelope`, `StatusPost`, `PermissionPost`, `QuestionPost`), acting as the source of truth for the external backend.
- `src/transport.ts`: Handles building the stable reporter identity, loading configuration, and performing the HTTP `fetch` requests (both fire-and-forget and blocking long-polls).

## How It Works
The reporter fundamentally acts as a telemetry pipeline and remote permission gate. When enabled, it calculates a stable identity based on the host and session. 

For routine observability (like a model change, session start, or turn completion), it posts fire-and-forget status updates to `/api/events`. It also periodically snapshots the agent's context usage.

When the agent attempts to run potentially destructive tools (`bash`, `write`, `edit`), the extension intercepts the `tool_call` event and issues a blocking POST request to `/api/permissions`. It updates the PI UI status to reflect it's waiting for approval and will block the tool call if the remote decision is anything other than `"allow"`. Similarly, if the agent uses `AskUserQuestion`, it halts on the `tool_result` event, fetches the remote answer from `/api/questions`, and injects it back to the model as if the user typed it.

## Configuration
It reads the following environment variables on startup:
- `PI_EXTERNAL_REPORTER`: Must be set to `1` to enable the extension.
- `BACKOFFICE_URL`: The base URL of the remote backend (e.g., `https://backoffice.example.com`).
- `BACKOFFICE_API_KEY`: Optional Bearer token for HTTP Authorization.
- `BACKOFFICE_TIMEOUT_MS`: Optional timeout for blocking requests (defaults to 5 minutes, or 300,000ms).

## Dependencies
- `@earendil-works/pi-coding-agent`: Peer dependency.
