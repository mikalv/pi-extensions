# auto-retry
**Purpose:** Detects malformed tool calls (JSON parse errors) produced by the LLM and automatically triggers a retry to recover from the error.

## Tools / Commands / Hooks Provided
- **Background hooks only**: Operates silently in the background via event listeners. No user-facing tools or slash commands are provided.
- **UI Notifications**: Triggers flash notifications using `ctx.ui.notify` when an auto-retry occurs or fails.

## Key Files
- `src/index.ts`: The main entry point containing the logic for detecting JSON parse errors, managing consecutive retry counts, and sending the follow-up message to the LLM.

## How It Works
The extension hooks into Pi's event bus, primarily listening to the `agent_end` event. When an agent run finishes, it inspects the final assistant message. If the message's `stopReason` is `"error"` and the `errorMessage` indicates a JSON parse failure (such as "unexpected token", "unterminated string", or "bad control character"), the extension kicks into action.

Upon detecting a failure, it increments a consecutive retry counter (up to a maximum of 2) and surfaces a warning notification in the TUI. It then triggers a fresh turn by invoking `pi.sendUserMessage()` with `deliverAs: "followUp"`. The message instructs the LLM that its tool call failed due to malformed JSON (often caused by large edit blocks with special characters) and asks it to retry the change using smaller, separate edit calls.

To prevent infinite retry loops, the extension resets its counter whenever a turn completes successfully (via the `turn_end` event where `stopReason` is not `"error"`). If the limit of 2 consecutive retries is reached, it displays an error notification and gives up.

## Configuration
There are no configuration keys required in `settings.json`. The maximum consecutive retry limit is hardcoded to `2` within the extension (`MAX_RETRIES`).

## Dependencies
- `@earendil-works/pi-coding-agent`: Peer dependency for types and extension API.
