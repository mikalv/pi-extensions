# pi-worktree

**Pi extension for safe interactive Git worktree management and workspace switching.**

## Tools / commands / hooks provided
- **Slash Commands**: 
  - `/worktree`: Opens an interactive TUI menu to manage Git worktrees. Includes actions to Add, Switch, Remove, and Prune worktrees, as well as configure the default worktree root.
- **Hooks (Events Listened)**: 
  - `session_start`: Reloads settings and displays warnings (e.g., if the settings file is invalid) when a new session starts.
  - `session_shutdown`: Flushes and persists settings changes.

## Key files
- `src/index.ts`: Extension entry point.
- `src/worktree.ts`: Main extension setup; registers the `/worktree` command and session event hooks.
- `src/command.ts`: Implements the interactive TUI flows (Add, Switch, Remove, Prune, Configure) using `pi-tui-kit`.
- `src/git.ts`: Git interoperability layer. Wraps `git worktree` and other git commands using `pi.exec`. Includes safety checks to prevent data loss.
- `src/session.ts`: Manages Pi sessions, implementing the logic to fork the active session context into a new directory and smoothly transition the conversation (`switchToWorktree`, `createTargetSession`).
- `src/settings.ts`: Manages loading, validating, and saving the `pi-worktree.json` configuration file.

## How it works
Running `/worktree` triggers an interactive TUI menu powered by `@narumitw/pi-tui-kit`. The extension heavily leverages Git's worktree functionality by executing underlying commands (e.g., `git worktree list --porcelain`) via `pi.exec`.

When adding a worktree, the extension guides the user to select a branch, a start point (important if on a detached HEAD), and a destination path. It invokes `git worktree add`, then automatically uses the Pi `SessionManager` to fork the current conversation session and update the working directory (cwd). It then seamlessly switches the user to this new session in the target worktree via `ctx.switchSession()`.

When removing or pruning worktrees, `pi-worktree` implements safe administrative checks (e.g., verifying if a detached HEAD is unreachable and risks garbage collection) before modifying the filesystem.

## Configuration
Configuration is saved in `~/.pi/agent/pi-worktree.json` (resolves via `getAgentDir()`).
- `worktreeRoot`: (String) Defines the default absolute path or `~/`-prefixed directory where new worktrees should be placed. If absent, the default is `~/.worktrees`.

## Dependencies
- **Runtime Dependencies**: `@narumitw/pi-tui-kit` (for building interactive TUI menus).
- **Peer Dependencies**: `@earendil-works/pi-coding-agent` (for core extension APIs and session management).
