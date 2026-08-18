# pi-agent-core

**Unified Subagent Control Plane, Pluggable Multi-Runtime Engine & Workflow Orchestrator**

`pi-agent-core` (`packages/pi-agent-core`) is a next-generation subagent and workflow engine for Pi. It unifies and elevates three distinct architectures:
1. **Control Plane & Concurrency** (from `pi-subagent-fleet`): Live steering channels, concurrency pools, deterministic crash-recovery replay caching, and cluster/RPC readiness.
2. **Superpowers Methodology & Review Disciplines** (from `pi-superagents`): Rigorous TDD planning, brainstorming, adversarial review loops, and git-worktree isolation (`/sp-*`).
3. **High-Performance JS Worker Workflow Orchestrator** (from `pi-subagent-workflow`): Multi-agent pipelines (`parallel()`, `pipeline()`, `phase()`, `agent()`) running inside sandboxed Worker threads, paired with sub-100ms atomic session indexing (`sessions-index.json`).

---

## 1. Core Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             PI-AGENT-CORE                                   │
│                                                                             │
│  [Universal Discovery]  ~/.pi/agents, ~/.claude/agents, bundled, workflows  │
│  [Workflow Engine]      JS Worker threads: parallel(), pipeline(), agent()  │
│  [Control Plane]        State Machine, Steering, Concurrency Pool, Replay   │
│  [Superpowers Bridge]   /sp-* integration + TDD discipline + Guardrails     │
│  [Interactive TUI]      Active Widget, /sub:peek, /sub:steer, /workflows    │
│  [Observability]        sessions-index (<100ms scan), JSONL audit logger    │
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

## 2. Tools, Commands & Hooks

### Tools Provided
- **`subagent`**: Unified subagent execution tool for LLM orchestrators and coordinators.
  - **Parameters:**
    - `agent` (`string`, required): Name of target agent definition (e.g. `'worker'`, `'explorer'`, `'planner'`, `'reviewer'`, `'verifier'`, `'sp-brainstorm'`).
    - `prompt` (`string`, required): Concrete task instructions for the subagent.
    - `runtime` (`string`, optional): Runtime override (`'pi-inprocess'`, `'pi-subprocess'`, `'claude'`, `'codex'`, `'gemini'`, `'copilot'`, `'custom'`).
    - `model` (`string`, optional): Model override (e.g. `'vllm-local/qwen3.6-27b-awq'`).
    - `thinking` (`string | boolean`, optional): Thinking level (`'off'`, `'low'`, `'medium'`, `'high'`, `'max'`).
    - `worktree` (`boolean`, optional): Run inside an isolated ephemeral Git worktree.
    - `turnBudget` (`number`, optional): Turn budget limit (default: 20).
    - `depth` (`number`, optional): Current recursion depth (enforced `Depth: N/10`).
    - `useReplayCache` (`boolean`, optional): Enable memoized replay cache for deterministic recovery.

### Slash Commands
- **`/sub:list`**: Discover and list all available agents across all sources with source and runtime tags.
- **`/sub:peek [runId]`**: Interactive modal transcript viewer displaying live turns, tool calls, and streaming output.
- **`/sub:steer <runId> <message>`**: Send a live guidance/steering message directly into an active subagent's message loop.
- **`/sub:abort [runId]`**: Gracefully terminate an active subagent run or workflow.
- **`/sub:history`**: Display execution history, success rates, token usage summaries, and recent run metrics.
- **`/workflows`**: Interactive tree viewer for active and past multi-phase workflow scripts.
- **`/sp-brainstorm [topic]`**: Launch Superpowers structured design and requirement exploration.
- **`/sp-plan [feature]`**: Generate a bite-sized, test-driven implementation plan.
- **`/sp-implement [task]`**: Execute implementation tasks under strict TDD and review disciplines.

---

## 3. Pluggable Execution Runtimes

| Runtime | Target / Execution Mechanism | Use Case | Startup Overhead |
|---|---|---|---|
| **`pi-inprocess`** | Direct in-memory turn via Pi agent session | AST inspection, quick lookups, prompt refiners, unit validations | ~0 ms |
| **`pi-subprocess`** | Isolated child process via `pi --mode json` | Heavy refactorings, multi-file code editing, git worktree runs | ~200 ms |
| **`claude`** | External Claude Code CLI bridge (`claude -p`) | Anthropic Claude ecosystem tools & specialized prompts | Process spawn |
| **`codex`** | OpenAI Codex CLI bridge | OpenAI Codex engine tasks | Process spawn |
| **`gemini`** | Google Gemini CLI adapter | Multimodal search & long-context processing | Process spawn |
| **`copilot`** | GitHub Copilot CLI adapter | Enterprise Copilot workspace actions | Process spawn |
| **`custom`** | User-defined runtime handler registry | Custom clusters, remote SSH, containerized workers | Extensible |

---

## 4. Universal Agent Discovery

Agents are discovered automatically across multiple tiers with strict precedence resolution:

1. **Project Local Agents**: `<cwd>/.pi/agents/*.md` (Highest priority)
2. **User Global Pi Agents**: `~/.pi/agent/agents/*.md` and `~/.pi/agents/*.md`
3. **Claude Code Agents**: `~/.claude/agents/**/*.md` (Discovered recursively)
4. **Bundled Starter Agents**: (`worker`, `explorer`, `planner`, `reviewer`, `verifier`, `coder`, `debugger`, `analyst`, `researcher`, `orchestrator`, `sp-*`)

### Standard Markdown Frontmatter Schema
```markdown
---
name: security-auditor
description: Rigorous security and vulnerability auditor
runtime: pi-subprocess
model: vllm-local/qwen3.6-27b-awq
thinking: high
tools: [read, grep, find, diff]
skills: [vulnerability-scan]
worktree: false
turnBudget: 15
---

You are a principal security engineer conducting adversarial code audits...
```

---

## 5. JS Worker Workflow Orchestration Engine

Complex multi-agent pipelines execute within sandboxed JavaScript Worker threads, providing safe concurrency, lifecycle hooks, and phase tracking.

### Workflow Primitives
- **`agent(nameOrConfig, prompt)`**: Dispatch a subagent task and await its completion.
- **`parallel(tasks)`**: Execute multiple subagent tasks concurrently up to the concurrency pool limit.
- **`pipeline(tasks)`**: Execute sequential tasks, forwarding output from step $N$ to step $N+1$.
- **`phase(name)`**: Declare a named workflow phase (`WorkflowPhase`) with live UI progression.
- **`state`**: Shared mutable state dictionary across phases.
- **`sleep(ms)`**: Non-blocking sleep with abort signal cancellation.

### Example Workflow Script (`refactor-feature.js`)
```javascript
const meta = {
  name: "refactor-feature",
  description: "End-to-end multi-agent refactoring workflow",
  phases: ["analyze", "implement", "review"]
};

// Phase 1: Architecture & Analysis
phase("analyze");
const analysis = await agent("explorer", "Analyze src/auth module dependencies");

// Phase 2: Parallel Worktree Implementation
phase("implement");
const [coreDiff, testsDiff] = await parallel([
  { agent: "coder", prompt: `Refactor auth logic: ${analysis.output}`, worktree: true },
  { agent: "coder", prompt: `Update authentication test cases: ${analysis.output}`, worktree: true }
]);

// Phase 3: Adversarial Review
phase("review");
const review = await agent("reviewer", `Review diff:\n${coreDiff.output}`);
return { status: review.verdict, diff: coreDiff.output };
```

---

## 6. Control Plane & Concurrency Pool

- **State Machine**: Tracks runs through `PENDING` -> `RUNNING` -> `DONE` (`completed` | `failed` | `aborted` | `time_limited` | `budget_limited`).
- **Live Steering (`SteeringManager`)**: Allows human or parent agents to inject mid-flight corrections into running subagents without aborting.
- **Concurrency Pool (`ConcurrencyPool`)**: Throttles simultaneous background runs (default: 4 concurrent) with FIFO queueing and abort signal support.
- **Crash-Recovery Replay Cache (`ReplayCache`)**: Persists deterministic hash keys (`replayKey`) to disk, enabling instant recovery of completed steps during crashed or restarted workflows.
- **Recursion Guardrail**: Hard ceiling on nested subagent spawning (`Depth: N/10`) to prevent runaway recursive execution loops.

---

## 7. High-Speed Observability & Caching

### Sessions-Index (`sessions-index.json`)
- Maintains atomic metadata cache (`<baseDir>/<encoded-cwd>/sessions-index.json`).
- Checks file `mtime` and `size` stat-tags for instant sub-100ms cold scans across hundreds of session JSONL files.
- Tracks session titles, total token usages, message counts, models, and timestamps.

### Structured Audit Logger (`AuditLogger`)
- Persists full execution telemetry to `~/.pi/agent/subagent-history/<sessionId>.jsonl`.
- Records run duration, turn usage, prompt, output, error, tokens (input, output, total), cost, depth, and verdict.
- Formats structured `<task-notification>` XML messages for coordinator protocols:

```xml
<task-notification status="completed" agent="reviewer">
  <run-id>run_a1b2c3d4e5f6</run-id>
  <summary>Review authentication refactor diff</summary>
  <result>PASS: All tests passing with zero regressions.</result>
  <verdict>PASS</verdict>
  <usage turns="3" total-tokens="420" duration-ms="1850" />
</task-notification>
```

---

## 8. Interactive TUI Overlays

- **Active TUI Widget (`ActiveWidgetController`)**: Dynamically displays running subagents, active phases, recursion depths, and token counters directly above the editor.
- **Peek Modal Viewer (`openPeekModal`)**: Scrollable transcript viewer with syntax highlighting and live updates.
- **Workflows Visualizer (`openWorkflowsView`)**: Tree visualizer for multi-phase worker workflows.

---

## 9. Configuration

Configured via `settings.json` or project `.pi/settings.json`:

```json
{
  "subagent": {
    "defaultRuntime": "pi-inprocess",
    "maxConcurrent": 4,
    "defaultTurnBudget": 20,
    "timeoutMs": 300000,
    "historyDir": "~/.pi/agent/subagent-history",
    "sessionsDir": "~/.pi/agent/sessions"
  }
}
```
