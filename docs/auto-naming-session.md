# @cnife/pi-auto-naming-session

**Auto-generate and refresh session titles at turn boundaries.**

## Tools / commands / hooks provided

*   **`message_end` event hook**: Intercepts the first `user` or `custom` message to generate the initial session title immediately (without waiting for the assistant's reply).
*   **`agent_end` event hook**: Tracks conversation turns and regenerates the session title when the conversation exceeds a predefined threshold.
*   **`session_start` event hook**: Sets up internal state regarding existing titles and synchronizes the session name externally if applicable.
*   **Herdr Synchronization**: Syncs the active session title to the `herdr` terminal pane orchestrator when running in a Herdr environment.

## Key files

*   **`extensions/index.ts`**: The main entry point. Sets up event listeners (`message_end`, `agent_end`, `session_start`), handles config loading and validation, issues LLM generation requests via `completeSimple`, manages the `auto-naming-title` state events, and integrates with Herdr.
*   **`extensions/transcript.ts`**: Contains pure, testable logic isolated from the Pi runtime. Responsible for traversing session branches (`SessionEntry[]`), extracting clean text content (stripping `<skill>` blocks, tool calls, and thinking blocks), and deciding when the threshold (`auto_refresh_turns`) has been breached.

## How it works

When a new session starts, the extension waits for the user's first prompt (`message_end`). It builds a transcript using this prompt, asks the configured LLM for a concise 60-character title, applies it via `pi.setSessionName()`, and drops a custom `auto-naming-title` marker entry into the session history. If the current active model uses a custom provider unsupported by the `completeSimple` API (such as `cursor-agent`), it transparently switches to a `fallback_model`. 

As the conversation progresses, the `agent_end` hook evaluates whether the turn count since the last `auto-naming-title` marker exceeds `auto_refresh_turns`. When it does, it builds a full-arc transcript, asks the LLM to generate an updated title reflecting the evolved context, and overwrites the session name. To respect user autonomy, it will abort automatic regeneration if it detects that the user has manually renamed the session using `/name`. Additionally, any title changes are synchronized to the `herdr` pane metadata CLI if running under `HERDR_ENV=1`.

## Configuration

The extension stores its configuration as a JSON file at `~/.pi/agent/cnife-auto-naming-session.json`.

*   **`auto_refresh_turns`** *(number | null)*: How many conversational turns must pass before the title is automatically regenerated. Set to `null` to disable automatic refresh. Default is `10`.
*   **`model`** *(string | null)*: The model ID to use for title generation, formulated as `provider/modelId`. If `null`, it uses the currently active conversation model.
*   **`fallback_model`** *(string | null)*: The fallback model to use when the primary model relies on custom APIs (e.g., `cursor-agent`) that aren't supported natively by `completeSimple`.
*   **`language`** *(string)*: Output language for the generated title. Default is `"english"`.

## Dependencies

No external NPM dependencies beyond the core `@earendil-works/pi-coding-agent` ecosystem. Leverages Node.js core modules (`fs`, `path`, `child_process`).
