# files-widget

In-terminal file browser and diff viewer widget for Pi that allows you to navigate, view, and comment on files without leaving the terminal or interrupting the agent.

## Tools / commands / hooks provided
- **Commands**:
  - `/readfiles` - Open the file browser in the current directory.
  - `/readfiles <path>` - Open the file browser rooted at `<path>` (absolute, relative, or `~`-prefixed).
- **Hooks**:
  - Listens to `tool_result` to track agent-modified files (via `write` and `edit` tools).
  - Listens to `session_start` to check for missing dependencies and clear agent modification tracking.
  - Listens to `session_switch` to clear agent modification tracking.
- **Shortcuts (Browser)**: `j/k` (navigate), `Enter` (open), `h/l` (collapse/expand), `/` (search), `c` (toggle changed-only), `q` (close), etc.
- **Shortcuts (Viewer)**: `j/k` (scroll), `d` (toggle diff), `m` (markdown rendered/raw), `v` (select mode), `c` (comment on selection and send to agent), `q` (back).

## Key files
- `index.ts`: The entry point. Registers the `/readfiles` command, resolves paths, sets up tool and session event listeners, and manages dependency checks.
- `browser.ts`: Logic and UI for the file tree browser, handling navigation, search, directory expansion, and git status rendering.
- `viewer.ts` & `file-viewer.ts`: Logic and UI for viewing individual files, showing git diffs (`delta`), markdown (`glow`), and syntax highlighting (`bat`), as well as the text selection and commenting interface.
- `git.ts`: Utilities for gathering Git status (modified, untracked, staged).
- `comment.ts`: Formatting logic for sending inline code comments to the agent.

## How it works
The extension registers a `/readfiles` slash command that opens a full-screen TUI overlay using `ctx.ui.custom()`. When invoked, it reads the current directory (or a provided path) and renders an interactive file tree. It uses native shell execution to gather Git status (`git status --porcelain`) and tracks files modified dynamically by the agent during the session by listening to `tool_result` events from the `write` and `edit` tools.

When a user selects a file in the browser, the extension opens a file viewer modal. The viewer leverages external CLI tools (`bat` for syntax highlighting, `git-delta` for diffs, `glow` for markdown rendering) to provide a rich reading experience. The viewer supports toggling between standard and diff views for tracked files.

The core value prop is the inline review loop: inside the viewer, a user can enter visual selection mode (`v`), highlight a block of code, and press `c` to write a comment. The extension then formats this as a clear contextual message containing the file path, line numbers, code snippet, and user comment, sending it to the agent via `pi.sendUserMessage(..., { deliverAs: "followUp" })`.

## Configuration
No explicit configuration parameters or environment variables are provided. The extension relies entirely on the presence of the required CLI tools in the user's `PATH`.

## Dependencies
- **Runtime Dependencies**:
  - `bat`: For syntax highlighting and line numbers.
  - `delta` (`git-delta`): For side-by-side formatted git diffs.
  - `glow`: For markdown rendering.
- **Peer Dependencies**: `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`.
