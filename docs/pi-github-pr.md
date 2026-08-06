# pi-github-pr

**Purpose:** A Pi extension that displays live GitHub pull request status in the terminal, including review decisions, CI checks, and comment counts.

## Tools / Commands / Hooks Provided

- **Hooks Listeners:**
  - `session_start`: Initializes a file watcher on the `.git/HEAD` file to detect branch changes and triggers an initial fetch of the PR status.
  - `agent_end`: Refreshes the PR status automatically when the agent finishes a turn.
  - `session_shutdown`: Clears the PR status and cleans up the file watcher and periodic timers.
- **UI:** Uses `ctx.ui.setStatus()` to render an ambient PR status widget in the terminal (showing Checks, Reviews, Comments, and PR state).

## Key Files

- `src/index.ts`: The main entry point that exports the extension factory.
- `src/github-pr.ts`: The core implementation containing the extension lifecycle, `git` branch watching, and execution logic for the GitHub CLI (`gh`).

## How it works

When a Pi session starts (`session_start`), the extension runs `git rev-parse --git-path HEAD` to locate the local Git repository's `HEAD` file and attaches a Node.js `fs.watch` to it. This allows the extension to detect branch checkouts in real time.

Once active, it fetches the current branch's associated pull request data by invoking the GitHub CLI (`gh pr view --json ...`) and executing a GraphQL query (`gh api graphql`) to get accurate comment and review counts. The raw output is parsed, normalized, and summarized into counts (e.g., checks passed/failed/pending, reviews approved/requested changes).

The summarized PR status is then rendered in the Pi terminal UI as an ambient status badge. The extension automatically refreshes the status periodically (default every 60 seconds), on local branch changes, or whenever the AI agent finishes a response (`agent_end`).

## Configuration

The extension accepts an options object when initialized:
- `refreshIntervalMs`: Number of milliseconds between periodic PR status refreshes. Defaults to `60000` (1 minute).

## Dependencies

- **CLI Dependencies:** Requires `gh` (GitHub CLI, must be authenticated) and `git` to be installed and available in the system PATH.
- **Peer Dependencies:** `@earendil-works/pi-coding-agent`.
