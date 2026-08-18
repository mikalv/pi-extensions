# Unified Subagents & Workflow Control Plane (`pi-agent-core`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a unified, high-performance subagent and workflow control-plane package (`packages/pi-agent-core`) merging in-process/subprocess/external runtimes, universal agent discovery, JS worker workflow orchestration, TUI steering/peeking, and persistent session indexing.

**Architecture:** A modular TypeScript package divided into: (1) Discovery & Manifests, (2) Multi-Runtime Execution Layer (`pi-inprocess`, `pi-subprocess`, `claude`, `codex`), (3) Workflow Worker Engine with concurrency & crash-replay, (4) Control Plane State Machine with live steering, and (5) Interactive TUI Overlays & Superpowers bridge.

**Tech Stack:** TypeScript, Node.js / Bun, `@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`, `@earendil-works/pi-tui`, TypeBox, Worker Threads.

**Spec:** `docs/superpowers/specs/2026-08-18-unified-subagents-design.md`

## Global Constraints

- Runtime support: Node.js >= 18 and Bun.
- Zero mandatory external network dependencies for local subagent execution.
- Strict isolation: Subprocess worktrees must not pollute parent repository state.
- Depth guard: Recursion depth limit hard-capped at 10 (`Depth: N/10`).
- Strict TDD: Unit tests for each module before implementation.

---

### Task 1: Package Scaffolding & Core Types

**Files:**
- Create: `packages/pi-agent-core/package.json`
- Create: `packages/pi-agent-core/tsconfig.json`
- Create: `packages/pi-agent-core/src/types.ts`
- Test: `packages/pi-agent-core/test/types.test.ts`

**Interfaces:**
- Produces: `AgentDefinition`, `RuntimeType`, `RunRecord`, `WorkflowState`, `ExecutionOptions`.

- [ ] **Step 1: Write test for core types and validation**
- [ ] **Step 2: Create package.json and tsconfig.json**
- [ ] **Step 3: Implement core type definitions in `src/types.ts`**
- [ ] **Step 4: Run test to verify passes (`bun test packages/pi-agent-core/test/types.test.ts`)**
- [ ] **Step 5: Commit `feat(agent-core): scaffold package and define core type interfaces`**

---

### Task 2: Universal Agent Discovery

**Files:**
- Create: `packages/pi-agent-core/src/discovery/agent-loader.ts`
- Create: `packages/pi-agent-core/src/discovery/frontmatter.ts`
- Test: `packages/pi-agent-core/test/discovery.test.ts`

**Interfaces:**
- Consumes: `AgentDefinition` from `src/types.ts`
- Produces: `discoverAgents(opts?: { cwd?: string }): Promise<Map<string, AgentDefinition>>`

- [ ] **Step 1: Write test for frontmatter parsing and multi-source agent discovery (`~/.pi`, `~/.claude`, bundled)**
- [ ] **Step 2: Implement robust YAML frontmatter parser and validation**
- [ ] **Step 3: Implement `discoverAgents` with precedence resolution**
- [ ] **Step 4: Run test to verify discovery works across sources**
- [ ] **Step 5: Commit `feat(agent-core): implement universal agent discovery across pi and claude paths`**

---

### Task 3: Pluggable Runtime Adapters (`in-process`, `subprocess`, `claude`, `codex`)

**Files:**
- Create: `packages/pi-agent-core/src/runtimes/in-process-runner.ts`
- Create: `packages/pi-agent-core/src/runtimes/subprocess-runner.ts`
- Create: `packages/pi-agent-core/src/runtimes/claude-runner.ts`
- Create: `packages/pi-agent-core/src/runtimes/codex-runner.ts`
- Create: `packages/pi-agent-core/src/runtimes/runtime-factory.ts`
- Test: `packages/pi-agent-core/test/runtimes.test.ts`

**Interfaces:**
- Consumes: `AgentDefinition`, `ExecutionOptions` from `src/types.ts`
- Produces: `AgentRunner` interface with `execute(agent, options, signal, onUpdate): Promise<RunResult>`

- [ ] **Step 1: Write tests for `in-process` (fast direct turn) and `subprocess` (`pi --mode json`) execution contracts**
- [ ] **Step 2: Implement `InProcessRunner` using direct Pi `completeSimple` / mini-turn**
- [ ] **Step 3: Implement `SubprocessRunner` with process spawning, stream parser, and worktree isolation**
- [ ] **Step 4: Implement `ClaudeRunner` and `CodexRunner` external CLI adapters**
- [ ] **Step 5: Run tests to verify runtime isolation and error handling**
- [ ] **Step 6: Commit `feat(agent-core): implement dual in-process/subprocess and external CLI runtime adapters`**

---

### Task 4: Control Plane, State Machine & Live Steering

**Files:**
- Create: `packages/pi-agent-core/src/control/state-machine.ts`
- Create: `packages/pi-agent-core/src/control/concurrency-pool.ts`
- Create: `packages/pi-agent-core/src/control/steer-channel.ts`
- Create: `packages/pi-agent-core/src/control/replay-cache.ts`
- Test: `packages/pi-agent-core/test/control-plane.test.ts`

**Interfaces:**
- Consumes: `AgentRunner`, `RunRecord`
- Produces: `ControlPlane` managing active runs, cancellation, steering, and concurrency limits

- [ ] **Step 1: Write test for run lifecycle transitions (`PENDING` -> `RUNNING` -> `DONE`), steering injection, and concurrency throttling**
- [ ] **Step 2: Implement state machine and concurrency pool**
- [ ] **Step 3: Implement live steering channel (inject messages into running subagents)**
- [ ] **Step 4: Implement crash-recovery replay cache for memoizing completed tasks**
- [ ] **Step 5: Run tests to verify state consistency under concurrent load**
- [ ] **Step 6: Commit `feat(agent-core): implement control plane state machine, steering, and replay cache`**

---

### Task 5: JS Worker Workflow Orchestration Engine

**Files:**
- Create: `packages/pi-agent-core/src/workflow/worker-runtime.ts`
- Create: `packages/pi-agent-core/src/workflow/script-linter.ts`
- Create: `packages/pi-agent-core/src/workflow/workflow-runner.ts`
- Test: `packages/pi-agent-core/test/workflow.test.ts`

**Interfaces:**
- Consumes: `ControlPlane`, `discoverAgents`
- Produces: `runWorkflow(script, options): Promise<WorkflowResult>` exposing `agent()`, `parallel()`, `pipeline()`, `phase()`

- [ ] **Step 1: Write test for script linter (catching unawaited IIFEs) and multi-phase worker execution**
- [ ] **Step 2: Implement script validation and linter**
- [ ] **Step 3: Implement sandboxed Worker thread execution bridge with injected globals**
- [ ] **Step 4: Run workflow test asserting correct sequence, parallel branches, and phase tracking**
- [ ] **Step 5: Commit `feat(agent-core): implement sandboxed JS worker workflow execution engine`**

---

### Task 6: Sessions-Index & Fast Observability Cache

**Files:**
- Create: `packages/pi-agent-core/src/observability/sessions-index.ts`
- Create: `packages/pi-agent-core/src/observability/audit-logger.ts`
- Test: `packages/pi-agent-core/test/sessions-index.test.ts`

**Interfaces:**
- Produces: `scanSessionsIndex(): Promise<SessionIndexRecord[]>`, `appendAuditRecord(record): Promise<void>`

- [ ] **Step 1: Write test verifying atomic writing, version validation, and sub-100ms cold scan**
- [ ] **Step 2: Implement atomic `<enc>/sessions-index.json` caching with stat-tag validation**
- [ ] **Step 3: Implement structured JSONL audit logger under `~/.pi/agent/subagent-history/`**
- [ ] **Step 4: Run benchmark tests to verify performance targets**
- [ ] **Step 5: Commit `feat(agent-core): implement high-speed sessions-index and structured audit logging`**

---

### Task 7: Interactive TUI Overlays & Superpowers Bridge

**Files:**
- Create: `packages/pi-agent-core/src/ui/active-widget.ts`
- Create: `packages/pi-agent-core/src/ui/peek-modal.ts`
- Create: `packages/pi-agent-core/src/ui/workflows-view.ts`
- Create: `packages/pi-agent-core/src/index.ts`
- Test: `packages/pi-agent-core/test/extension.test.ts`

**Interfaces:**
- Consumes: `ControlPlane`, `WorkflowRunner`, `discoverAgents`
- Produces: Extension entrypoint registering `subagent` tool, `/sub:*` commands, and `/sp-*` Superpowers aliases

- [ ] **Step 1: Write extension registration and command dispatch tests**
- [ ] **Step 2: Implement TUI active widget (status/turns/tokens above editor)**
- [ ] **Step 3: Implement `/sub:peek` modal viewer and `/sub:steer` prompt injection**
- [ ] **Step 4: Implement `/sp-brainstorm`, `/sp-plan`, `/sp-implement` Superpowers command bridges**
- [ ] **Step 5: Register extension in package root and verify end-to-end integration**
- [ ] **Step 6: Commit `feat(agent-core): assemble interactive TUI overlays, Superpowers bridge, and extension entrypoint`**

---

### Task 8: Verification & Package Integration

**Files:**
- Modify: `package.json` (register `./packages/pi-agent-core/src/index.ts`)
- Create: `docs/pi-agent-core.md`
- Test: `packages/pi-agent-core/test/e2e-workflow.test.ts`

- [ ] **Step 1: Write full End-to-End test running parallel subagents and verified workflow output**
- [ ] **Step 2: Run all unit and functional tests across the whole package (`bun test packages/pi-agent-core`)**
- [ ] **Step 3: Update root `package.json` and generate comprehensive documentation in `docs/pi-agent-core.md`**
- [ ] **Step 4: Verify live `/reload` in Pi**
- [ ] **Step 5: Commit `chore(agent-core): integrate pi-agent-core into package.json and complete docs`**
