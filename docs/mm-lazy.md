# mm-lazy

**Title and one-line purpose**  
`mm-lazy` is a LazyVim-style extension manager for Pi Coding Agent — it defers loading packages until after start or on demand for faster startup.

## Tools / Commands / Hooks Provided

- **Commands:**
  - `/lazy [status|list|profile|load <name>|migrate|auto on|off|init|config]` - Manage lazy-loaded extensions.
- **Tools:**
  - `lazy_load` - Tool for the agent to explicitly load a deferred package by name.
- **Hooks (Events listened to):**
  - `before_agent_start` - Evaluates the prompt against keywords to auto-load extensions right before an agent turn.
  - `session_start` - Rebuilds the extension catalog and schedules "VeryLazy" (after-start) packages to load without blocking the event loop.
  - `session_shutdown` - Cleans up session context and load queues.

## Key Files

- **`src/index.ts` (compiled to `dist/index.js`)**: Main entry point. Registers stubs for commands/tools/shortcuts, hooks events, and handles the `/lazy` command.
- **`src/loader.ts`**: The core dynamic loader. Uses native `import()` or `jiti` (for TypeScript) to load extensions at runtime and captures the tools/commands they register.
- **`src/config.ts`**: Handles reading, writing, and defaulting `~/.pi/agent/lazy.json`.
- **`src/migrate.ts`**: Logic for `/lazy migrate`, rewriting `settings.json` to prevent Pi from eager-loading managed extensions.
- **`src/resolve.ts`**: Helper to find package roots and extension entry files (e.g. `index.ts`, `index.js`).

## How it works

`mm-lazy` improves Pi startup time by avoiding eager loading of all extensions. It builds a catalog of managed packages based on its configuration. For packages set to load on demand, it registers lightweight "stubs" for their commands, tools, and keyboard shortcuts.

When a user or the LLM triggers a stub (e.g., calling a command like `/mcp` or a tool), `mm-lazy` dynamically resolves the actual package entry files, uses `jiti` to compile and load TypeScript at runtime, and then passes control to the real extension. For commands, it directly invokes the real handler if captured, or sends a follow-up user message. For tools, the stub responds instructing the agent to call the newly loaded tool.

To prevent Pi from loading these packages upfront, users run `/lazy migrate`. This modifies Pi's `settings.json` by setting `"extensions": []` for managed packages, leaving dependencies resolvable but stopping Pi from evaluating their entry files. `mm-lazy` also supports auto-loading based on prompt keywords (`before_agent_start`) and background loading ("VeryLazy" / `after-start`) after the TUI has rendered.

## Configuration

Settings are stored in `~/.pi/agent/lazy.json`. Configuration includes:
- `auto` (boolean) - Enable or disable auto-loading via keywords/events.
- `autoLoadLimit` - Max packages to auto-load before an agent turn.
- `afterStartBatchSize` / `afterStartDelayMs` - Control the flow of background package loading.
- `specs` - Array of package definitions with fields:
  - `name`, `source`, `lazy` (`true` | `false` | `"after-start"`), `priority`, `cmd`, `tools`, `keys`, `keywords`, `event`, and `dependencies`.

## Dependencies

- **Runtime / Peer:** `@earendil-works/pi-coding-agent`, `typebox`.
- **Implicit Runtime:** `jiti` (Resolved dynamically from the host environment to evaluate TypeScript at runtime).
