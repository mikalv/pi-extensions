# pi-plan-mode

**Title and one-line purpose**  
`pi-plan-mode` is a Pi extension that adds a Codex-like read-only collaboration mode, allowing the agent to explore and plan safely before making any file modifications.

## Tools / commands / hooks provided

**Slash Commands & Flags**
- `--plan` CLI flag: Start the Pi session directly in Plan mode.
- `/plan` command: Enter or manage Plan mode. Subcommands include:
  - `/plan`: Enter Plan mode.
  - `/plan show`: Show the stored or currently active plan.
  - `/plan finalize`: Request a final plan submission from the agent.
  - `/plan implement`: Implement the completed plan (exits Plan mode).
  - `/plan save`: Save the active plan for later.
  - `/plan exit` or `/plan off`: Exit Plan mode and clear state.
  - `/plan tools`: Show tool selection menu for Plan mode.

**Tools**
- `plan_mode_question`: Allows the agent to ask the user clarification questions (with meaningful options) during the planning phase.
- `plan_mode_complete`: Submits the final, decision-ready implementation plan for user review.

## Key files

- `src/plan-mode.ts`: Main entry point. Registers the CLI flag, slash commands, tools, and session events.
- `src/tool-policy.ts`: Determines if tools or shell commands are safe (read-only vs. mutating). Whitelists safe shell commands (e.g. `cat`, `ls`) and specific safe `git` and `gh` subcommands.
- `src/settings.ts`: Handles configuration loading and validation from `pi-plan-mode.json`.
- `src/completion-tool.ts` & `src/question-tool.ts`: Implementations of the plan mode specific tools.
- `src/plan-action-menus.ts`: Renders the interactive TUI menus for plan actions using `@narumitw/pi-tui-kit`.

## How it works

When Plan mode is enabled, the extension restricts the agent's active tools to safe, read-only utilities (such as `read` and a limited version of `bash`). The agent explores the codebase without the risk of unintended file mutations. If the agent needs user input on tradeoffs or assumptions, it uses the `plan_mode_question` tool.

Once the agent completes its planning, it uses the `plan_mode_complete` tool to submit a structured implementation plan. The extension intercepts this completion and presents the user with a TUI menu (built with `pi-tui-kit`) to review, save, or implement the plan.

If the user chooses to implement the plan, the extension exits Plan mode, restores the standard toolset (including `edit` and `write`), and injects the plan as context into the ongoing session so the agent can execute it. Plan mode state (like the current plan or saved plans) is persisted across restarts via `pi.appendEntry()`.

## Configuration

Settings are configured via `pi-plan-mode.json` (or the legacy `plan-mode.json`) in the agent's configuration directory (usually `~/.pi/agent/`).

- `thinkingLevel`: Specifies the thinking level used during Plan mode (`inherit`, `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`).
- `defaultPlanTools`: Array of tool names enabled by default in Plan mode.
- `safeSubcommands`:
  - `git`: Array of allowed git subcommands (e.g., `["status", "diff", "blame"]`).
  - `gh`: Array of allowed GitHub CLI subcommands (e.g., `["pr view", "issue list"]`).

## Dependencies

- **Runtime dependency:** `@narumitw/pi-tui-kit` (used for the interactive plan management menus).
- **Peer dependencies:** `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`.
