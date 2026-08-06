# pi-subagent-fleet

**Title and one-line purpose**
A large control-plane package providing asynchronous subagent delegation for pi with run, batch, chain, and continuation workflows.

## Tools / commands / hooks provided
**Tools:**
- `subagent`: CLI-style subagent delegation tool for LLM interface.
- `list-agents`: List available subagent definitions (name, source, model, thinking, tools, description).

**Commands:**
- `/sub:isolate`: Run a subagent in a dedicated sub-session.
- `/sub:main`: Run a subagent with main-session context inheritance.
- `/subagents`: List available subagents and offer the starter pack when none are configured.
- `/sub:peek`: Show the latest response from a subagent in an overlay.
- `/sub:open`: Open a subagent session replay overlay.
- `/sub:history`: Show all subagent run history.
- `/sub:rm`: Remove one /sub job entry.
- `/sub:clear`: Clear /sub job widget entries.
- `/sub:abort`: Abort running subagent job(s).

**Shortcuts:**
- `>>`: Run subagent task.
- `#<runId>`: Resume subagent run.
- `<<`: Abort or clear subagent runs.
- `<<<`: Clear finished subagent jobs.

**Events/Hooks:**
- Hook on `before_agent_start` to inject persona.
- Hooks on `session_start` and `session_shutdown` for lifecycle management.
- Hooks on `input` for agent mentions transformation and shortcut intercepts.

## Key files
- `index.ts`: Thin boot orchestrator that imports constants, registers proxies synchronously, and lazily loads the heavy core module graph.
- `commands.ts`: Registers all slash commands, tools, and shortcuts, and processes subagent executions.
- `store.ts`: Defines the shared state (`SubagentStore`) and state-mutation helpers.
- `runner.ts`: Handles subagent process execution, agent matching, and concurrency.
- `lifecycle.ts`: Handles hang detection sweeps and shutdown cleanup.
- `escalation.ts`: Handles child-to-parent escalation (`ask_master`).

## How it works
`pi-subagent-fleet` spawns a separate `pi` process for each subagent invocation (via `runner.ts` using `node:child_process`), isolating their context windows. It supports a single run mode through the `subagent` tool via CLI-style inputs, utilizing JSON mode to capture structured output from subagents.
The package lazy-loads its core (commands, store, lifecycle, escalation) to prevent blocking extension boot. Proxies are registered synchronously in `index.ts` so Pi immediately has autocomplete capabilities.
Background loops check for hung runs and manage persistence across sessions, updating TUI widgets above the editor to reflect live state. It supports context sharing (`--main`) vs isolated context, and robust completion handling.

## Configuration
Read from `settings.json` (global) or `.pi/subagent.json` (project):
- `subagent.claudeRuntime`: `sdk` or `cli`.
- `subagent.defaultAgent`: e.g. `"worker"`.
- `subagent.symbolMap`: Mapping from characters to agent aliases.

## Dependencies
- `@anthropic-ai/claude-agent-sdk` (optional, loaded dynamically)
- `yaml` (optional, loaded dynamically)
- Peer dependencies: `@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`, `@earendil-works/pi-agent-core`, `@earendil-works/pi-tui`, `typebox`.
