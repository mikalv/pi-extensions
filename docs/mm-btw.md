# mm-btw

**Purpose**: A Pi extension that adds a `/btw` side-question command to ask quick side questions without adding them to the main conversation tree.

## Tools / Commands / Hooks Provided
- **Slash Commands**: Registers the `/btw` command.
- **TUI Interfaces**: Provides interactive menus and a custom transcript pager using `ctx.ui.custom` when the command is run. Allows users to scroll through side questions and selectively "bring to main" (append context to the main thread).

## Key Files
- `src/btw.ts`: Main entry point where the `/btw` command is registered and side thread resolution logic is defined.
- `src/settings.ts`: Handles reading and writing `pi-btw.json` configuration safely.
- `src/side-thread.ts`: Manages side thread conversation state and handles prompting the model via `completeSimple`.
- `src/bring-to-main.ts`: Logic and TUI components for selecting snippets of the side thread and formatting them to be brought into the main conversation.
- `src/menu.ts`: Uses `@narumitw/pi-tui-kit` to display an interactive menu to adjust `pi-btw` settings before starting a thread.
- `src/transcript-pager.ts`: TUI components (`BtwAnsweringView` and `BtwTranscriptPager`) for reading side conversations and interacting with the AI.

## How It Works
When a user runs `/btw <question>`, the extension evaluates the prompt independently from the main conversation. It relies on `@earendil-works/pi-ai`'s `completeSimple` function, bypassing the main agent loop. 

It constructs a `SideThread` context that injects the current main conversation as read-only background context (`<conversation_context>`) to help the LLM answer contextually, but enforces a strict `SYSTEM_PROMPT` instructing the side-model not to claim to have changed files or affected the main task.

The user views the conversation in an isolated TUI pager overlay. If the side question produces useful findings, the user can select text and use the "Bring to Main" feature to copy formatted text (`<btw_context>`) back to the main agent's session, avoiding polluting the main conversation with trial-and-error thoughts.

## Configuration
Reads configuration from `pi-btw.json` (typically located in `~/.pi/agent/pi-btw.json`).
Supported keys:
- `model` (string): Specific model to use for side threads (e.g. `provider/model-id`).
- `thinkingLevel` (string): Reasoning level (`off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`).
- `rememberThinkingLevelChanges` (boolean): Whether changes in the UI should save back to `pi-btw.json` automatically.

## Dependencies
- **Peer Dependencies**: `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`.
- **Runtime Dependencies**: `@narumitw/pi-tui-kit` for TUI menu implementations.