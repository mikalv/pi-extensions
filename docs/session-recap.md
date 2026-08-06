# session-recap

"While you were away" recap shown above the editor when returning to a Pi session. Modeled after Claude Code's away-summary, it keeps you in the flow when multi-tasking or managing multiple agents.

## Tools / commands / hooks provided
- **Command:** `/recap` — Force-generate a recap of recent session activity right now.

## Key files
- `index.ts`: The sole entry file. Handles lifecycle hooks (`turn_end`, `turn_start`, `input`, `agent_start`, `agent_end`, `session_start`, `session_shutdown`), terminal focus tracking, transcript building, deduplication caching, and recap generation.

## How it works
The extension detects when you're away from the Pi terminal and generates a high-level summary of what happened while you were gone:
- **Terminal Focus Tracking**: Uses DECSET `?1004` to track terminal blur/focus events. If the terminal is continuously blurred for a threshold period (default 90 seconds), a recap is drafted.
- **Turn-End While Away**: If the agent finishes a turn while you are tabbed away (a prime "multi-tab" moment), a recap is queued after a short debounce.
- **Idle Fallback**: For terminals that do not support focus reporting, it drafts a recap when there has been no input for an idle period (default 120 seconds) following the end of an agent turn.
- **Session Resume**: The recap also triggers automatically on `/resume` or `/fork` to re-orient you to where the prior session left off.

The recap generation relies on the currently active model (with reasoning/thinking and cache writes disabled to reduce cost). It feeds the model a two-tier transcript: recent task-framing context (prior compactions, recent user prompts) and the latest detailed activity. Deduplication is handled by hashing the payload (SHA256) so unchanged state doesn't cause redundant generations.

## Configuration
Controlled via command-line flags (which can be defined in `settings.json`):
- `--recap-away-seconds <n>`: Continuous blur duration in seconds before an away recap is generated (default 90)
- `--recap-idle-seconds <n>`: Idle-fallback delay in seconds after `turn_end` (default 120)
- `--recap-disable-focus`: Disable DECSET `?1004` focus reporting entirely
- `--recap-during-active`: Allow away recaps to generate while an agent turn is actively running
- `--recap-disable`: Disable the automatic recap feature entirely
- `--recap-model <p/id>`: Explicitly override the model used for recap generation (defaults to the currently active model)

## Dependencies
- `@earendil-works/pi-ai` (peer)
- `@earendil-works/pi-coding-agent` (peer)
