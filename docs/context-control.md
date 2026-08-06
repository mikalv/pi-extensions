# Context Control (Layer 1)

**Package:** `packages/context-control`

Context Control operates at the outermost layer of the stack. It is responsible for gathering project-level context files (like `CLAUDE.md`, `AGENTS.md`, or `API.md`) and injecting them directly into the agent's system prompt.

## Core Features

- **Prompt Injection:** Intercepts Pi's `before_agent_start` event to append a `<project_context>` block to the agent's system instructions.
- **TUI Management:** Provides the `/context` command, rendering a Terminal User Interface (TUI) overlay. This TUI features a split view (list panel and preview panel) allowing users to inspect the exact contents of context files and toggle them on or off.
- **Path Resolution & Scoping:** Classifies context files into three scopes based on directory proximity:
  - `User`: Global files loaded from the `~/.pi/agent` directory.
  - `Current project`: Files loaded from the active working directory (`cwd`).
  - `Inherited`: Files inherited from higher up the directory tree.
- **Persistence:** Disabled files are saved to `context-control.json` within the agent directory (`getAgentDir()`). This ensures that if a user disables a context file, it remains excluded across sessions.

## API and Hooks

The extension uses the `filterProjectContext` function to string-replace the original `<project_context>` block provided by Pi with one that excludes disabled files. If it cannot find the block, it gracefully fails and notifies the user with a warning.
