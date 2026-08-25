# Changelog

All notable changes to the `pi-extensions` repository and its bundled extensions will be documented in this file.

## [Unreleased]

### Added
- **`pi-agent-core` Unified Subagent & Workflow Engine (`packages/pi-agent-core`)**:
  - **Unified Subagent Control Plane**:
    - Robust `RunLifecycle` state machine managing execution states (`pending`, `running`, `completed`, `failed`, `aborted`, `time_limited`, `budget_limited`).
    - Concurrency pool with queue tracking and abort signal integration.
    - Real-time steering channel (`SteeringManager`) allowing dynamic guidance injection (`/sub:steer`) into active subagent loops.
    - Memoized crash-recovery replay cache (`ReplayCache`) for deterministic run reuse.
    - Recursion depth tracking and guardrails enforcing max depth limit (up to `Depth: N/10`).
  - **Pluggable Multi-Runtime Execution Adapters**:
    - `pi-inprocess`: Real in-process multi-turn `agentLoop` execution integrating Pi tool resolution (`read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`), token usage tracking, and `completeSimple` fallback.
    - `pi-subprocess`: Child process isolation via `pi --mode json`, ephemeral git worktree isolation, and execution streaming.
    - External CLI runners for `claude` (`claude -p`), `codex`, `gemini`, `copilot`, and extensible `custom` runners.
  - **Universal Agent Discovery**:
    - Priority-ranked agent discovery across `<cwd>/.pi/agents/*.md`, `~/.pi/agents/*.md`, `~/.claude/agents/**/*.md`, and bundled system agents (`worker`, `explorer`, `planner`, `reviewer`, `verifier`, `coder`, `debugger`, `analyst`, `researcher`, `orchestrator`, `sp-*`).
    - Markdown frontmatter parser supporting custom models, thinking levels, tools, skills, and worktree requirements.
  - **Sandboxed JS Worker Workflow Orchestrator**:
    - Declarative workflow primitives (`parallel()`, `pipeline()`, `phase()`, `agent()`, `state`, `sleep`) running in sandboxed Worker threads.
    - Workflow script linter validating syntax, forbidding unsafe APIs (`process.exit`, `eval`), and detecting unawaited async agent invocations.
  - **Fast Sessions-Index Observability & Telemetry**:
    - Sub-100ms cold scanning and atomic disk caching (`sessions-index.json`) for quick session queries.
    - Structured JSONL audit logging (`AuditLogger`) tracking run history, durations, tokens, and verdicts.
    - Formatted XML `<task-notification>` blocks for agent coordinator protocols.
  - **Interactive TUI Overlays & Slash Commands**:
    - Real-time active execution status widget with spinners and depth metrics.
    - Interactive transcript inspection modal (`/sub:peek`).
    - Workflow phase and run tree viewer (`/workflows`).
    - Management slash commands (`/sub:list`, `/sub:steer`, `/sub:abort`, `/sub:history`).
    - Superpowers methodology integration (`/sp-brainstorm`, `/sp-plan`, `/sp-implement`).
- **Comprehensive Architectural Documentation**:
  - Added in-depth architecture and design documentation at `docs/pi-agent-core.md`.

### Fixed
- **`mm-observational-memory`**:
  - Implemented entry token budget slicing (`sliceEntriesByTokenBudget`) to cap observer chunk sizes on massive sessions, preventing observer LLM timeouts and context overflow.
- **Subagent TUI Formatting & Rendering**:
  - Formatted subagent `onUpdate` progress payloads into valid content blocks to prevent crashes with downstream TUI filters.
  - Added dedicated `renderSubagentToolCall` and `renderSubagentToolResult` TUI renderers supporting collapsed summaries (status, runtime, duration, tokens) and expanded views with Markdown-rendered responses and tool call logs.
