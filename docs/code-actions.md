# pi-code-actions

**Purpose**: Pick code blocks or inline snippets from recent assistant messages to easily copy to the clipboard, insert into the input editor, or run in the shell.

## Tools / Commands / Hooks
- **Slash command**: `/code [scope] [action] [index] [inline|blocks] [limit=N]`
  - Extract and pick code blocks/snippets from the assistant's previous responses.
  - `scope`: `last` (only the most recent assistant message) or `all` (all assistant messages in the branch).
  - `action`: `copy` (to clipboard), `insert` (to the TUI editor), or `run` (execute in a shell).
  - `index`: Automatically pick the snippet at the 1-based index (e.g., `/code 1 copy`).
  - `inline` / `blocks`: Toggles whether inline backticks are included or only fenced blocks.
  - `limit=N`: Maximum number of snippets to extract (default 200).

## Key Files
- `index.ts`: The extension entry point. Registers the `/code` command, parses its arguments, and stitches together the extraction and UI logic.
- `src/snippets.ts`: Core extraction logic. Parses fenced code blocks and inline snippets using regular expressions, while intelligently filtering out mundane commands and short phrases.
- `src/ui.ts`: Provides a custom TUI overlay (using `ctx.ui.custom()`) to display, filter, and pick extracted snippets, and pick an action.
- `src/search.ts`: Provides a robust scoring and ranking system for filtering snippets interactively in the TUI.
- `src/actions.ts`: Implements the underlying system actions: shelling out to `pbcopy`/`Set-Clipboard`/`xclip` for clipboard copy, updating editor text for `insert`, and executing code via `pi.exec` for `run`.

## How It Works
1. **Extraction**: When `/code` is triggered, the extension reads `ctx.sessionManager.getBranch()` to scan previous assistant messages. It extracts fenced code blocks and selectively extracts inline code blocks (applying heuristics like `shouldIncludeInlineSnippet` to ignore non-actionable strings and basic Git/NPM commands).
2. **Selection**: If specific arguments aren't passed, it displays a TUI overlay. The user can navigate, use fuzzy filtering to find the desired snippet, and confirm their selection.
3. **Execution**:
   - `copy`: Uses platform-specific OS commands (`pbcopy`, `wl-copy`, PowerShell's `Set-Clipboard`) with a temporary file to securely place the snippet on the user's clipboard.
   - `insert`: Appends the code snippet string directly into the pi input editor using `ctx.ui.setEditorText()`.
   - `run`: Executes the snippet via `pi.exec()` using `bash` or `powershell` based on the platform, and displays a scrollable/truncated view of `stdout` and `stderr` in a TUI overlay.

## Configuration
No dedicated `settings.json` keys or environment variables are provided. Behavior is customized per-invocation through the `/code` command arguments.

## Dependencies
- `@earendil-works/pi-coding-agent`
- `@earendil-works/pi-tui`
- Utilizes Node.js built-ins (`node:fs`, `node:os`, `node:path`).
