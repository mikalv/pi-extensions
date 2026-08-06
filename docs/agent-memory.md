# Agent Memory (`pi-agent-memory`)

The `pi-agent-memory` package provides file-based, per-agent-type persistent memory for the Pi coding agent. It enables agents to read and save durable facts, user preferences, and project context that survive across individual sessions and context window clears. It is a direct port of the `agentMemory.ts` concept from Claude Code.

## What it does

Instead of relying on ephemeral conversation history, agents can explicitly record learnings. The memory system is categorized by **agent type** (e.g., `worker`, `coordinator`, `verifier`) and **scope** (`user`, `project`, `local`), allowing for both global user preferences and project-specific constraints.

Each storage location consists of a flat `MEMORY.md` index file containing pointers to individual markdown memory files, ensuring that the AI can quickly scan the index before deep-diving into specific facts.

## Tools & APIs

The extension exposes two primary tools to the agent:

### `read_agent_memory`
Reads the memory index and all associated memory files for a specific agent type and scope.
- **Parameters:**
  - `agent_type` (string, required): The agent type name (e.g., `"worker"`).
  - `scope` (string, optional): One of `"user"`, `"project"`, or `"local"`. Defaults to `"project"`.
- **Guidelines:** Call this at the start of a run to recall prior learnings.

### `save_agent_memory`
Saves a new memory file and automatically updates the `MEMORY.md` index.
- **Parameters:**
  - `agent_type` (string, required): The agent type name.
  - `filename` (string, required): Short file name (e.g., `"user_prefers_bun"`).
  - `title` (string, required): Human-readable title.
  - `hook` (string, required): One-line summary used as the index pointer.
  - `body` (string, required): The full markdown content of the memory.
  - `scope` (string, optional): One of `"user"`, `"project"`, or `"local"`. Defaults to `"project"`.
- **Guidelines:** Save only durable facts or constraints (not transient task states).

## Path Conventions

Memories are saved to the file system using the following structure, where `<cwd>` is the current working directory and `~` is the user's home directory.

| Scope | Location | Use Case |
|-------|----------|----------|
| **User** | `~/.pi/agent/agent-memory/<agentType>/` | General, cross-project learnings (e.g., global coding style preferences). |
| **Project** | `<cwd>/.pi/agent-memory/<agentType>/` | Shared via Version Control System (VCS), project-specific facts (e.g., architectural decisions). |
| **Local** | `<cwd>/.pi/agent-memory-local/<agentType>/` | Project and machine-specific facts, excluded from VCS (e.g., local database credentials or paths). |

*Note: The agent type is sanitized for cross-platform compatibility (e.g., replacing spaces and special characters with hyphens).*

## Usage Example

### Saving a memory
When an agent learns that the project uses Bun instead of NPM, it can save this fact:
```json
{
  "agent_type": "worker",
  "filename": "package-manager",
  "title": "Use Bun",
  "hook": "Project uses Bun, do not use npm",
  "body": "Always use `bun install`, `bun run`, and `bun test` in this repository.",
  "scope": "project"
}
```
This generates `.pi/agent-memory/worker/package-manager.md` and appends a link to `.pi/agent-memory/worker/MEMORY.md`.

### Reading a memory
At the start of the next run, the agent invokes `read_agent_memory`:
```json
{
  "agent_type": "worker",
  "scope": "project"
}
```
Which returns a formatted prompt-style summary:
```md
# Persistent Agent Memory — worker [project]
Directory: /path/to/repo/.pi/agent-memory/worker/

## MEMORY.md (index)
- [Use Bun](package-manager.md) — Project uses Bun, do not use npm

## Memory files (1)
### package-manager.md
```md
---
name: Use Bun
description: Project uses Bun, do not use npm
---
Always use `bun install`, `bun run`, and `bun test` in this repository.
```
```

## Multi-Agent Cluster Observability

This package natively supports multi-agent clusters by strictly partitioning memory by **agent type**. 
- A `verifier` agent does not pollute the `worker` agent's memory.
- Subagents spawned to handle specific domains can consult their own historical learnings to prevent recurring mistakes.
- Because the `project` scope is file-based and designed to be committed to VCS, a distributed team of developers—and their respective agent clusters—automatically share and inherit the same learned constraints and architectural decisions simply by pulling the latest codebase.
