# Spec: Unified Subagent & Workflow Control Plane (`pi-agent-core`)

**Date:** 2026-08-18  
**Status:** Draft / Approved Design  
**Target Package:** `packages/pi-agent-core` (or `packages/pi-unified-agents`)  

---

## 1. Overview & Vision

`pi-agent-core` merges the best capabilities from three major subagent architectures into one unified, production-grade system:
1. **`pi-subagent-fleet` (Ryan Nook)**: Robust control-plane state machine, live steering, session replay, and cluster/RPC readiness.
2. **`pi-superagents` (Teelicht / Obra Superpowers)**: Disciplined development methodology (`/sp-brainstorm`, `/sp-plan`, `/sp-implement`, review agents, git-worktree isolation).
3. **`pi-subagent-workflow` (Zhushanwen)**: High-performance JS worker workflow engine (`chain`, `parallel`, `scatter-gather`, `map-reduce`), 9 orthogonal agent roles, orchestrator guardrails (`Depth: N/10`), concurrency pool, crash-recovery cache, and persistent session indexing.

---

## 2. Core Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             PI-AGENT-CORE                                   │
│                                                                             │
│  [Universal Discovery]  ~/.pi/agents, ~/.claude/agents, bundled, workflows  │
│  [Workflow Engine]      JS Worker threads: parallel(), pipeline(), agent()  │
│  [Control Plane]        State Machine, Steering, Concurrency Pool, Replay   │
│  [Superpowers & Roles]  /sp-* integration + 9 Orthogonal Agents + Guardrails│
│  [Interactive TUI]      Active Widget, /sub:peek, /sub:steer, /workflows    │
│  [Observability]        sessions-index (80ms cold scan), JSONL audit log    │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
      ┌──────────────────┬─────────────┴───────────────┬──────────────────┐
      │                  │                             │                  │
      ▼                  ▼                             ▼                  ▼
┌─────────────┐   ┌─────────────┐               ┌─────────────┐    ┌─────────────┐
│ in-process  │   │ subprocess  │               │ claude-cli  │    │  codex-cli  │
│   (light)   │   │   (heavy)   │               │   runner    │    │   runner    │
└─────────────┘   └─────────────┘               └─────────────┘    └─────────────┘
Direct loop       `pi --mode json`              Claude Code CLI    OpenAI Codex
Zero-spawn cost   Isolated worktree/context     Subprocess         Subprocess
```

---

## 3. Pluggable Runtimes

Each agent frontmatter specifies its execution runtime:

1. **`pi-inprocess` (Lightweight)**
   - Executes inside the active Pi process using lightweight mini-turns (`completeSimple` / isolated agent turn).
   - Demos: Fast code checks, documentation queries, AST searches, prompt refinement.
   - Overhead: ~0ms startup time, shared in-memory state.

2. **`pi-subprocess` (Heavy / Isolated)**
   - Spawns `pi --mode json` in an isolated child process.
   - Features: Clean context window, custom tool contracts, optional Git worktree isolation (`worktree: true`).
   - Overhead: Node/Bun startup latency (~200ms).

3. **`claude` (Claude Code CLI)**
   - Bridges to `claude -p <prompt> --output-format json` or Claude Agent SDK.
   - Supports native Claude Code tools and workflows.

4. **`codex` (OpenAI Codex CLI)**
   - Bridges to OpenAI Codex binary CLI wrapper.

---

## 4. Universal Discovery & Agent Definition

Agent definitions are loaded with precedence:
1. Bundled built-in roles (`explorer`, `planner`, `coder`, `reviewer`, `debugger`, `analyst`, `researcher`, `orchestrator`, `general-purpose`, `sp-*`).
2. Global Pi agents: `~/.pi/agent/agents/*.md`
3. Claude Code agents: `~/.claude/agents/**/*.md`
4. Project-local agents: `.pi/agents/*.md`

### Standard Frontmatter Schema
```markdown
---
name: code-reviewer
description: Rigorous code reviewer focusing on correctness, security, and tests
runtime: pi-subprocess # [pi-inprocess | pi-subprocess | claude | codex]
model: vllm-local/qwen3.6-27b-awq # optional override
thinking: high # [off | minimal | low | medium | high | xhigh]
tools: [read, grep, find, diff]
worktree: false # [true | false]
turnBudget: 15 # maximum turns before wrap-up
---

You are a senior reviewer...
```

---

## 5. Workflow Orchestration Engine (JS Worker)

Enables complex multi-agent execution scripts inside sandboxed Worker threads:

```javascript
const meta = { name: "refactor-pipeline", description: "Audit and refactor module", phases: ["scan", "code", "verify"] };

// Phase 1: Scan
phase("scan");
const analysis = await agent({ agent: "explorer", prompt: "Locate all deprecated API calls in src/" });

// Phase 2: Parallel Code Refactoring
phase("code");
const [libFix, testsFix] = await parallel([
  { agent: "coder", prompt: `Refactor src/lib based on: ${analysis.output}`, worktree: true },
  { agent: "coder", prompt: `Update test fixtures based on: ${analysis.output}`, worktree: true }
]);

// Phase 3: Verification
phase("verify");
const review = await agent({ agent: "reviewer", prompt: `Review git diff: ${libFix.diff}` });
return { status: review.verdict, diff: libFix.diff };
```

---

## 6. Control Plane & Concurrency Management

- **State Machine**: `PENDING` → `RUNNING` → `DONE` (sub-states: `completed`, `aborted`, `failed`, `budget_limited`, `time_limited`).
- **Live Steering**: `/sub:steer <id> <message>` or `steer_agent` tool injects real-time instructions into running subagents without restart.
- **Concurrency Pool**: Configurable max concurrent subagents (prevents saturating local vLLM / memory).
- **Crash Recovery & Replay Cache**: Completed subagent steps in a workflow are cached to disk; if a worker crashes, completed tasks are not re-executed.
- **Recursion Guard**: Built-in `Depth: N/10` depth guard prevents infinite orchestrator delegation loops.

---

## 7. Interactive TUI & Observability

1. **Active TUI Widget**: Displays running subagents, active turns, and token counts above the editor.
2. **Modal Peek (`/sub:peek <id>`)**: Live stream viewer showing subagent thoughts and tool calls in real time.
3. **Workflows View (`/workflows`)**: Phase-grouped visual execution tree.
4. **Performance Sessions Index (`sessions-index.json`)**: High-speed cache for cold history scanning (80ms cold scan).
5. **Audit Logging & Telemetry**: Every run writes structured JSONL records to `~/.pi/agent/subagent-history/` and is queryable via `inspect_run`.

---

## 8. Migration & Rollout Plan

1. **Phase 1: Foundation (`packages/pi-agent-core`)**
   - Core types, agent registry, and runtime adapters (`pi-inprocess`, `pi-subprocess`, `claude`, `codex`).
2. **Phase 2: Execution Engine & Control Plane**
   - Lifecycle manager, concurrency pool, steering, and crash-recovery cache.
3. **Phase 3: Workflow Engine & Discovery**
   - Sandboxed worker runtime, universal discovery (~/.pi and ~/.claude), and orchestrator guardrails.
4. **Phase 4: TUI & Superpowers Bridge**
   - Active widget, peek modal, `/sp-*` command aliases, and audit logging.
5. **Phase 5: Package Registration & Verification**
   - Register in `package.json`, run comprehensive unit & functional test suites, and deploy.
