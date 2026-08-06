# pi-superagents

## Title and Purpose
**pi-superagents** is a comprehensive Pi extension designed to orchestrate "Superpowers" workflows using subagents. It provides a structured pipeline for robust AI-assisted development, including phases for recon, research, implementation, review, and debugging. By employing role-specific agents, abstract model tiers, and optional Git worktree isolation, it allows complex, multi-step parallel or sequential task execution with a strict synchronous execution model.

## Tools, Commands, and Hooks Provided
- **Tools**:
  - `subagent`: The primary delegation tool (synchronous and blocking).
  - Internal lifecycle tools: `subagent_done` (child intentional completion), `caller_ping` (child blocked-state or help request).
- **Commands**:
  - `/sp-brainstorm <task>`: Brainstorm a task and save a spec (optional Plannotator review).
  - `/sp-plan <task>`: Plan a task (optional Plannotator review).
  - `/sp-implement <task>`: Run an implementation sequentially.
  - `/sp-implement-parallel <task>`: Run dependency-ready implementation Tasks in isolated parallel worktrees.
  - `/subagents-status`: Open TUI overlay for active and recent subagent runs.
  - `/sp-settings`: Open Superpowers and subagent workflow settings.
- **Hooks & Events**:
  - Hooks into Pi lifecycle events (`session_start`, `session_shutdown`, `tool_result`).
  - Supports intercepting specific Superpowers workflow skill commands to handle compaction durability and UI tracking.

## Key Files
- `src/extension/index.ts`: The main entry point for the extension. Initializes lifecycle hooks, compaction handlers, and commands.
- `src/slash/slash-commands.ts`: Registers the core `/sp-*` and utility slash commands based on both configuration and discovered interactive entrypoint agents.
- `src/superpowers/workflow-profile.ts`: Parses command arguments and resolves runtime profiles (like parallel scheduling, TDD flags, and subagent delegation) from config defaults.
- `src/execution/subagent-executor.ts` & `src/execution/child-runner.ts`: Handles spawning, managing, and consuming Pi child processes for subagent delegation.
- `src/ui/sp-settings.ts` & `src/ui/subagents-status.ts`: Interactive TUI components for configuring execution models and viewing parallel task progress.

## How it works
The extension registers a suite of slash commands that trigger "Superpowers" workflows. When a user runs a command like `/sp-implement-parallel`, the extension parses arguments, reads the workflow configuration, and constructs a visible prompt summary combined with a strict hidden workflow contract. It dispatches this prompt via `createSuperpowersPromptDispatcher`.

During execution, the root session decomposes tasks and uses the `subagent` tool to spawn isolated, synchronous Pi child processes (`--mode json`). In parallel scheduling modes, it automatically creates Git worktrees for each task to prevent filesystem conflicts, executing tasks in waves based on dependencies, and merging them in sequence after an `sp-review` pass. It tracks run history in `~/.pi/agent/run-history.jsonl` and renders real-time status in a custom TUI overlay, handling lifecycle sidecars (`subagent_done`, `caller_ping`) without complex async logic.

## Configuration
Configuration is maintained in `~/.pi/agent/extensions/subagent/config.json`. Key settings include:
- **`superagents.commands.*`**: Toggle behavior flags (e.g., `taskScheduling: "parallel"`, `useSubagents: true`, `usePlannotatorReview: true`, `worktrees.enabled: true`) per command.
- **Model Tiers**: Abstract tier assignments (cheap, balanced, max) to dictate models and thinking levels per agent role.
- **Agent Extensions/Tools Defaults**: Allows appending standard tool configurations and local extension paths universally (`superagents.extensions`, `superagents.tools`) across spawned child agents.
- Can be visually configured via the `/sp-settings` command.

## Dependencies
- **Peer Dependencies**: 
  - `@earendil-works/pi-agent-core`
  - `@earendil-works/pi-ai`
  - `@earendil-works/pi-coding-agent` (>= 0.82.1)
  - `@earendil-works/pi-tui`
  - `typebox`
- **External integration**: Superpowers skills package (must be installed via `pi install git:github.com/obra/superpowers`) and optional Plannotator event bridge.