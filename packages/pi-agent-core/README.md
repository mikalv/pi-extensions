# @meeh/pi-agent-core

Unified subagent and workflow control plane for [pi](https://github.com/earendil-works/pi).

`pi-agent-core` combines in-process multi-turn loop execution, isolated subprocess runners, external CLI runners (Claude, Codex, Gemini, Copilot), universal agent discovery, lightweight JavaScript worker workflows, atomic fast sessions indexing, and live TUI widgets into a single robust control plane.

---

## Key Features

- **In-Process Multi-Turn Loop (`pi-inprocess`)**: Direct, low-latency execution inside the host process with tool evaluation, turn budget controls, thinking level settings, and strict recursion guardrails (`Depth: N/10`).
- **Subprocess Runners & CLI Adapters (`pi-subprocess`, `claude`, `codex`, `gemini`, `copilot`)**: Isolated child process execution with streaming JSON telemetry, custom environment propagation, and optional isolated git worktrees.
- **Universal Agent Discovery**: Seamlessly discovers agents across project (`.pi/agents/*.md`), global (`~/.pi/agent/agents/*.md`), Claude Code (`.claude/agents/**/*.md`), and bundled starter packs.
- **Fast Sessions Index & Audit Logging**: Sub-100ms atomic cache for session history indexing, cold scanning with mtime invalidation, structured JSONL audit logs, and coordinator `<task-notification>` XML output.
- **Active Widget TUI & Interactive Overlays**: Real-time status widget displaying active agent runs and workflows, modal transcript viewer (`/sub:peek`), interactive workflow tree viewer (`/workflows`), and live steering channel (`/sub:steer`).
- **JS Worker Workflow Engine**: Declarative multi-agent choreography supporting `parallel()`, `pipeline()`, `phase()`, shared state, abort propagation, and script linting/sandboxing.
- **Superpowers Discipline Bridge**: Built-in commands (`/sp-brainstorm`, `/sp-plan`, `/sp-implement`) integrating deep brainstorming, bite-sized TDD plan generation, and rigorous implementation workflows.

---

## Installation

```bash
pi install npm:@meeh/pi-agent-core
```

Or add as a workspace dependency:

```json
{
  "dependencies": {
    "@meeh/pi-agent-core": "^0.1.0"
  }
}
```

---

## Tool Interface: `subagent`

The extension exposes the `subagent` tool to pi:

```json
{
  "agent": "worker",
  "prompt": "Implement user authentication middleware and run tests",
  "runtime": "pi-inprocess",
  "thinking": "medium",
  "turnBudget": 20,
  "depth": 0
}
```

### Tool Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `agent` | `string` | Agent name (e.g. `worker`, `explorer`, `planner`, `coder`, `reviewer`, `verifier`) |
| `prompt` | `string` | Task prompt and instructions |
| `runtime` | `string` | Optional runtime override (`pi-inprocess`, `pi-subprocess`, `claude`, `codex`, `gemini`, `copilot`) |
| `model` | `string` | Optional model override for execution |
| `thinking` | `string \| boolean` | Optional thinking level (`off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`) |
| `tools` | `string[]` | Whitelist of allowed tools |
| `turnBudget`| `number` | Maximum allowed turns before wrapping up (default: 20) |
| `timeout` | `number` | Timeout in milliseconds |
| `worktree` | `boolean \| string` | Run in an isolated git worktree |
| `depth` | `number` | Current delegation recursion depth (max 10) |

---

## Slash Commands

- `/sub:list` — List all discovered agents (project, global, Claude Code, bundled).
- `/sub:peek [runId]` — Inspect live transcript, tool calls, and outputs of an active or completed run.
- `/sub:steer <runId> <message>` — Send guidance/instructions into a running agent mid-execution.
- `/sub:abort <runId>` — Cancel an active subagent execution.
- `/sub:history` — Display execution statistics and recent audit records.
- `/workflows` — View active and completed workflow execution trees.
- `/sp-brainstorm <topic>` — Run Superpowers brainstorming methodology.
- `/sp-plan <feature>` — Generate a bite-sized TDD implementation plan.
- `/sp-implement <task>` — Execute task with strict TDD implementation discipline.

---

## Programmatic API Exports

```typescript
import {
  ControlPlane,
  InProcessRunner,
  SubprocessRunner,
  ClaudeRunner,
  CodexRunner,
  SessionsIndex,
  AuditLogger,
  ActiveWidgetController,
  WorkflowRunner,
  discoverAgents,
} from "@meeh/pi-agent-core";
```

---

## License

MIT
