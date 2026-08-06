# pi-grill-me

Deterministic design interview workflow that records question-by-question decisions and saves Markdown results. 
Use this extension to stress-test a plan, be interviewed about a design, walk through assumptions one-by-one, or save structured planning Q&A into a reusable Markdown artifact.

## Tools, commands, and hooks provided

**Slash Commands**:
- `/grill-me [plan]`: Starts a deterministic design interview, initializing the state and automatically sending a structured prompt to instruct the agent to ask exactly one question at a time and provide recommendations.

**Tools**:
- `grill_record_turn`: Records one `/grill-me` question, recommended answer, user answer, and decision status (`resolved`, `open`, or `needs-codebase-check`) in the project state.
- `grill_save_results`: Saves the active `/grill-me` interview state and decisions as a Markdown file inside the project directory (defaults to `GRILL-ME.md`).

## Key files

- `src/index.ts`: Main extension entry point containing the slash command registration, state management functions, tool definitions, and markdown rendering logic.
- `skills/pi-grill-me/SKILL.md`: Documentation and instructions outlining when and how the agent should utilize this extension during design interviews.

## How it works

When a user initiates the `/grill-me` command with a plan, the extension initializes a state JSON file inside `.pi/grill-me/state.json` capturing the plan and empty turns. It then automatically sends a structured message instructing the agent to begin the design interview following strict rules (e.g., asking exactly one question at a time, providing recommendations, and checking the codebase if possible). 

During the conversation, as each question is answered or resolved by codebase exploration, the agent uses the `grill_record_turn` tool to append the interaction to the local `state.json` file. The tool enforces the structure of the recorded turn (question, answers, status, notes).

Once the interview reaches a shared understanding or the user asks to save/stop, the agent uses the `grill_save_results` tool. This tool reads the persistent state, combines it with any final summary, agreed decisions, and open risks, and renders a structured Markdown document (by default `GRILL-ME.md`), saving it safely within the project root.

## Configuration

This package does not expose specific configuration keys or environment variables.
- **State storage**: Persistent working state is always saved to `.pi/grill-me/state.json`.
- **Output file**: The markdown output path defaults to `GRILL-ME.md` relative to the project directory, but can be customized by the agent via the `path` parameter of the `grill_save_results` tool. Path traversal outside the project directory is prevented.

## Dependencies

- `@earendil-works/pi-coding-agent` (peer)
- `@earendil-works/pi-tui` (peer)
- `typebox` (peer)
