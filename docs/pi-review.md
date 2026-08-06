# pi-review

Isolated or local read-only code review extension for Pi.

## Tools / commands / hooks provided

**Slash Commands:**
- `/review [thinking] [target]` - Read-only code review of current project state (default preset).
- `/review:uncommitted [thinking] [target]` - Review staged, unstaged, and untracked changes.
- `/review:branch [thinking] [target]` - Review the current branch against its upstream or default base branch, plus local changes.
- `/review:custom [thinking] [target]` - Review a custom target, focus area, or specific git range.

**Events:**
- Emits `pi-review:run` - Requests an isolated review execution.
- Listens to `pi-review:run` - Handles the execution of an isolated read-only review.

**Hooks:**
- `session_start` - Resets the review mode state.
- `tool_call` - Enforces read-only mode by blocking tools not in `SAFE_REVIEW_TOOLS` and intercepting potentially destructive `bash` commands using regex patterns.
- `before_agent_start` - Injects read-only review guidance and optionally the contents of `REVIEW.md` into the system prompt.
- `agent_settled` - Cleans up and exits local review mode, restoring previous active tools and thinking levels.

## Key files

- `extensions/index.ts` - Main extension logic handling command registration, event communication, tool restrictions, and isolated subprocess execution.
- `package.json` - Package definition and `pi` extension configuration.

## How it works

When a `/review` command is executed, the extension first attempts an isolated review by emitting the `pi-review:run` event. If the event is accepted (the extension itself listens for this event), it spawns a separate `pi` subprocess using `--mode json` and the built-in `reviewer` agent. This isolated process inspects the Git state and codebase using read-only tools and returns a structured JSON response containing a summary and specific findings (severity, file, line, issue, evidence). The extension then formats this JSON into Markdown and delivers it to the user.

If the isolated review is unavailable or rejected, the extension falls back to "local review" mode within the current session. It temporarily modifies the session's active tools to a restricted `SAFE_REVIEW_TOOLS` allowlist, intercepts `bash` tool calls to block destructive commands (like `rm`, `git commit`, `npm install`), and appends review instructions to the system prompt. The prompt is then sent as a follow-up message to the current agent. Once the agent finishes its response (`agent_settled`), the extension automatically restores the previous toolset and exits review mode.

The extension also checks for a `REVIEW.md` file in the project's root directory and includes its content as custom guidance during the review.

## Configuration

- Reads `REVIEW.md` from the current working directory (`cwd`) for project-specific review guidelines.

## Dependencies

- `@earendil-works/pi-coding-agent` (peer dependency)
- `typebox` (peer dependency)
