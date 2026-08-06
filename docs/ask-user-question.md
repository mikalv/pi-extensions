# AskUserQuestion

**Title and Purpose:**
Interactive AskUserQuestion tool for Pi — pause and ask the user structured questions in the TUI with stable ID-based results. It allows agents to resolve ambiguity or collect preferences interactively.

## Tools / Commands / Hooks Provided

- **Tool:** `AskUserQuestion`
  - Asks the user one or more structured questions in the TUI.
  - Collects answers keyed by stable IDs.
  - Supports single-select, multi-select, custom "Other..." answers, notes, and a review/submit flow.

*(This package does not register any slash commands, keybindings, or events.)*

## Key Files

- `index.ts` / `extensions/index.ts`: The extension factory and tool registration entry point.
- `extensions/dialog.ts`: The TUI component logic, rendering, and input handling for the interactive dialog.
- `extensions/schema.ts`: TypeBox schema definitions for tool parameters (questions, options).
- `extensions/result.ts`: Answer and annotation serialization logic.
- `extensions/state.ts` & `extensions/render.ts`: State management and UI rendering helpers.

## How it works

When the `AskUserQuestion` tool is invoked by an agent, the extension performs the following steps:
1. **Validation & Checks:** Validates the input questions and options against the TypeBox schema. It also verifies that Pi is running in interactive TUI mode (fails gracefully if not).
2. **Interactive Dialog:** It hides the agent "working" indicator and spawns a custom TUI dialog overlay (`ctx.ui.custom`). The user navigates through the questions, selects choices (single or multi-select), and can optionally provide custom text for an automatically added "Other..." option.
3. **Submission:** A review tab summarizes the choices. Once the user submits (or aborts via escape), the dialog is dismissed, the "working" indicator is restored, and the structured answers are returned to the agent.
4. **Rendering:** The extension provides custom `renderCall` and `renderResult` functions to display neat summaries of the questions and answers in the chat transcript.

## Configuration

This package does not expose specific configuration keys in `settings.json` or environment variables. The tool behavior is driven entirely by the `AskUserQuestionParams` passed during invocation:
- `questions`: Array of 1 to 8 questions, each containing an ID, prompt text, header, and 2-4 options.
- `metadata`: Optional metadata like `source` and `flowId` that will be echoed back in the result.

## Dependencies

- **Runtime:** `@sinclair/typebox` (for tool schema definitions and validation).
- **Peer Dependencies:** `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`.
