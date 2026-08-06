# mm-adhd

**Title and purpose**  
Attention management for Pi — sticky notes, side-chat, and reminders.

## Tools, commands, and hooks provided

**Commands:**
- `/note` — Open the two-column notes TUI.
- `/note <text>` — Capture a quick note. Uses an AI classifier (or heuristic fallback) to categorize it.
- `/btw` — Open the side-chat overlay (a secondary chat interface).
- `/btw <text>` — Open side-chat pre-filled with the provided message text.

**Shortcuts:**
- `Ctrl+Shift+N` — Open notes TUI.
- `Ctrl+Alt+B` — Open side-chat.

**Hooks (Event subscriptions):**
- `session_start` — Resolves the repository slug and loads pinned notes.
- `turn_end` — Increments the reminder tracker and flashes a notification/status if the threshold is met.
- `session_shutdown` — Checks for orphaned notes and prompts a best-effort shutdown overlay to pin them.
- `context` — Filters out custom messages starting with `pi-adhd-` from the main LLM context.
- `pi-baml:ready` — Registers BAML functionality if available for note classification.

## Key files
- `src/index.ts` — Main extension entry point; wires up commands, shortcuts, and lifecycle hooks.
- `src/config.ts` — Configuration parsing for the `pi-adhd` block in settings.
- `src/notes/capture.ts` — Handles the multi-tier classification logic (BAML -> LLM -> Heuristic) for incoming quick notes.
- `src/notes/tui.ts` — Renders the two-column notes overlay (list view on the left, preview on the right).
- `src/chat/tui.ts` — Renders the side-chat overlay with model picking and streaming capabilities.
- `src/reminders/tracker.ts` — Monitors turn counts to show reminder indicators in the status bar.

## How it works
The extension operates across three primary feature sets:
1. **Notes**: A session-scoped sticky note system. When users capture a note via `/note <text>`, the system uses a classifier (BAML, an LLM call, or a keyword heuristic) to categorize it as a `prompt`, `reminder`, or `reference`. The `/note` TUI allows users to review, pin, or inject notes. When injected, prompt notes act as user messages, while reference notes act as hidden custom messages (`pi-adhd-context`).
2. **Side-chat**: The `/btw` command launches a secondary, ephemeral chat interface (`createChatTUI`). This uses a dedicated `ChatEngine` to stream responses, allowing users to brainstorm or get quick answers without polluting the main conversation. The chat's output can be injected back into the main conversation as a summary or note.
3. **Reminders**: A tracker listens to the `turn_end` event. After a configurable number of turns since the last interaction, it updates the Pi status bar to show a flashing ⚡ indicator, nudging the user to review their pending notes.

The extension aggressively protects the primary context window; it subscribes to the `context` event to filter out its own `pi-adhd-*` custom payloads before they are passed to the primary model.

## Configuration
Reads the `pi-adhd` object from `~/.pi/agent/settings.json`.
- `reminderTurns` (number) — The number of conversational turns before the pending note reminder indicator flashes. Defaults to `8`.

## Dependencies
- `@earendil-works/pi-ai`
- `@earendil-works/pi-coding-agent`
- `@earendil-works/pi-tui`
- Note: It optionally integrates with `pi-baml` (via the `pi-baml:ready` event) for superior AI classification accuracy, but falls back gracefully if absent.