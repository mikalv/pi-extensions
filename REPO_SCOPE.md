# Repo Scope

## Purpose
This repo is for building a **Pi-native, TUI-first multi-agent control plane** — roughly "Cursor in TUI", but focused on Pi as the runtime node.

## In scope
Build and keep code here that directly supports:

### Always in scope families
The following broad areas belong in this repo:

- **Pi-related packages and extensions**
- **memory-related systems and packages**
- **themes**
- **TUI-related systems, widgets, panels, and operator UI**

1. **Basic subagent runtime**
   - spawn/list/focus/interrupt/resume subagents
   - session identity and lifecycle
   - per-agent state, logs, and status

2. **Execution / orchestration layer**
   - task execution across agents
   - scheduling, delegation, retries
   - dependency / DAG support
   - review / approval / rework flows

3. **TUI control plane / observer UI**
   - left sidebar with workspaces and agents
   - right main pane showing the currently observed Pi instance
   - alerts, approval requests, AskUserTool events, permission events
   - switching between running agents/sessions

4. **Shared event / reporting model**
   - structured events from Pi instances
   - health, status, blockers, approvals, and resource signals
   - foundations for a later central overview

5. **Pi-native integration points**
   - extensions or packages that help Pi act as a node in the system
   - lightweight per-instance status/reporting hooks
   - local runtime adapters needed for orchestration

## Explicit keep list
These should remain in the repo even if they are not the narrowest core of the TUI control-plane work:

- `packages/mm-memory`
- `packages/mm-observational-memory`
- `packages/mm-wiki`
- `packages/pi-prism`
- `packages/mm-elixir`
- `packages/mm-btw`
- `packages/mm-qq`
- `packages/prune-context`
- `themes/`
- `packages/dracula-themes`
- `packages/nightfox-themes`

## Maybe later, but not core right now
These are allowed only if they clearly support the main goal:

- central telemetry sink
- web dashboard / remote overview
- external-agent adapters (ACP, Codex, Gemini, etc.)
- richer planning / role-routing systems
- workspace automation and isolation

## Out of context / do not let this repo become
Do **not** let this repo drift into being mainly:

1. **A generic collection of unrelated Pi extensions**
2. **A dumping ground for every interesting inspiration project**
3. **A broad agent coordination system with no direct TUI/runtime goal**
4. **A web-first control plane before the local TUI works well**
5. **An all-purpose memory / collaboration platform unless it directly serves orchestration**
6. **A repo for random experiments not tied to subagents, orchestration, or the operator UI**

## Specific guidance on imported ideas
- Harvest from inspiration repos selectively.
- Prefer extracting primitives and patterns, not copying whole systems wholesale.
- Keep only code that serves the target product direction.
- If something is cool but not clearly part of the TUI-first Pi control plane, treat it as reference, not product code.

## Current product picture
The likely product shape is:

- **Pi instances as runtime nodes**
- **an orchestration layer above them**
- **a TUI observer/controller as the primary interface**
- **optional central/web visibility later**

## Practical decision rule
A change belongs in this repo if it helps one of these:

- Pi extensions or Pi runtime integration
- memory systems or memory UX
- themes
- TUI/operator experience
- subagent execution
- orchestration/execution control
- operator visibility
- alerts/approvals/permissions
- observing or switching between Pi instances

If it does not clearly help one of those, it is probably out of scope for this repo.
