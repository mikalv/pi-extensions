# Context and Memory Stack Architecture

This repository (`pi-extensions`) implements a three-layered context and memory architecture for AI agents. These layers work together to provide static instructions, dynamic conversation management, and durable metacognition across sessions.

## The Three Layers

| Layer | Package | Role | Modality | Persistence |
| --- | --- | --- | --- | --- |
| **Layer 1: Project-Context** | `context-control` | Static instructions and rules | Injects `.md` files (like `CLAUDE.md`) into a `<project_context>` system prompt block. | Config file (`context-control.json`) stores disabled files. |
| **Layer 2: Session History** | `pi-context` | Agentic Context Management (ACM) | Provides tools for agents to navigate, checkpoint, and compact their own conversation history tree. | Session conversation database. |
| **Layer 3: Metacognition** | `mm-observational-memory` | Durable Learnings and Reflections | Background workers extract chronologic *observations* and promote them to durable *reflections* that survive context clears. | Session ledger injected into conversation; accessible via tools. |

## Data Flow and Interaction

1. **Initialization (Layer 1):** When a session starts, `context-control` reads standard context files (`CLAUDE.md`, `AGENTS.md`) and prepends them to the system prompt. It provides a TUI (`/context`) allowing the user to exclude specific files if they are irrelevant to the current task.
2. **Execution & Navigation (Layer 2):** As the agent interacts, the context window grows. `pi-context` empowers the agent to manage its own memory budget. Using internal tools, the agent can map out its history (`context_timeline`), drop anchors (`context_checkpoint`), and prune dead-ends or verbose logs by summarizing its path (`context_compact`).
3. **Distillation & Persistence (Layer 3):** Behind the scenes, `mm-observational-memory` monitors token usage. At set intervals, a background `observer` agent reads recent turns and records discrete events. A `reflector` agent synthesizes these into broader, durable insights. When Layer 2 performs a compaction, Layer 3 intercepts the event (`compaction-hook`) to ensure the Ledger of learnings is correctly folded and carried over to the new branch, ensuring the agent remembers its insights even after the raw conversation history is erased.

## Deep Dives

- [Context Control (`context-control.md`)](./context-control.md)
- [Pi Context (`pi-context.md`)](./pi-context.md)
- [Observational Memory (`mm-observational-memory.md`)](./mm-observational-memory.md)