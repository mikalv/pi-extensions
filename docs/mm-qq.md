# mm-qq

**Purpose:** Quick questions with `/qq` — ask the LLM about the current session without affecting the main conversation.

## Tools, Commands, and Hooks
- **Slash Commands:** `/qq <question>` — Ask a quick side question (ephemeral, no history).
- **Event Hooks:** Subscribes to the `context` event to filter out any messages with `customType: "qq"` from the LLM context (ensuring any accidental inclusion doesn't pollute the context).

## Key Files
- `extensions/index.ts`: The entry point containing the `/qq` command handler, the streaming logic, and the custom TUI scrollable box component.

## How it works
The `mm-qq` extension allows you to ask the LLM quick questions based on the current conversation context, but strictly in an ephemeral manner. When you run `/qq <question>`, the extension grabs the current session context, appends your question, and sends it to the active model using `streamSimple`. It modifies the system prompt by appending `[SIDE QUESTION MODE]`, which explicitly disables tool access (like `bash` or `read`) and instructs the model to be concise.

The response streams directly into a custom TUI widget placed above the editor. This widget includes a custom renderer (`renderQqBox`) that handles line wrapping, right-rail scrollbars, and dynamic resizing up to a maximum viewport height. 

To handle user interaction while the model streams, it mounts a "ghost" interactive modal (`ctx.ui.custom({ overlay: true })`) that captures terminal input. This allows users to scroll the text with arrow keys, cancel the stream instantly with `Escape`, or dismiss the widget with `Space` or `Enter` (safeguarded by a 500ms delay to prevent accidental dismissal while typing). The answer is never written to the session ledger.

## Configuration
This package requires no special configuration. It uses the active model and API key configured in the session.

## Dependencies
- **Peer Dependencies:** 
  - `@earendil-works/pi-agent-core`
  - `@earendil-works/pi-ai`
  - `@earendil-works/pi-coding-agent`
  - `@earendil-works/pi-tui`
