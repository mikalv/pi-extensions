# mm-memory

**Title:** Prism long-term memory for Pi
**Purpose:** Provides a durable Long-Term Memory (LTM) layer using a Prism vector database, offering semantic `remember`, `recall`, and `mine` operations to preserve durable facts, session summaries, and insights across sessions.

## Tools, Commands, and Hooks

### Tools
- `memory_remember`: Store a durable long-term memory in Prism (facts, preferences, decisions, insights).
- `memory_recall`: Semantic recall from Prism LTM (scopable to memories or past sessions).
- `memory_sessions`: Search past conversation session summaries.
- `memory_mine`: Ingest project files and directories into the Prism database.
- `memory_assess`: Evaluate knowledge coverage and confidence for a topic across wiki, Prism, and recorded gaps.
- `memory_gap`: Record a known knowledge gap (stored in `~/.pi/agent/mm-knowledge-gaps.md`).

### Slash Commands
- `/memory status`: View configuration and Prism health.
- `/memory recall <query>`: Scoped semantic search.
- `/memory remember <text>`: Index a durable memory note.
- `/memory sessions <query>`: Search past session summaries.
- `/memory mine [path]`: Ingest files into Prism (defaults to current working directory).
- `/memory assess <topic>`: Coverage and confidence assessment.
- `/memory gap <description>`: Record a knowledge gap.
- `/memory inject on|off`: Toggle session-start Prism injection.
- `/memory checkpoint on|off`: Toggle pre-compaction LTM checkpoints.
- `/memory sync on|off`: Toggle ambient session sync to `ltm-sessions`.
- `/memory help`: Display command usage help.

### Event Subscriptions (Hooks)
- `before_agent_start`: Injects memory startup guidance into the system prompt and optionally performs a Prism semantic search to inject relevant context hits (if `injectOnStart` is true).
- `session_before_compact`: Automatically writes a pre-compaction session summary checkpoint into the `ltm-sessions` collection before context is lost.
- `session_start`, `tool_execution_end`, `turn_end`: Updates the Atelier sidebar status.
- **Ambient Sync**: Subscribes to agent/session events (e.g., `agent_end`) to perform a rolling, debounced upsert of the live session into `ltm-sessions`.

## Key Files
- `src/index.ts`: The extension entry point. Registers tools, commands, and pi event listeners.
- `src/memory.ts`: Core memory operations (`remember`, `recall`, `recallForInjection`).
- `src/prism-client.ts`: The HTTP client for communicating with the Prism vector database.
- `src/config.ts`: Configuration state management (loading/saving `~/.pi/agent/mm-memory.json`).
- `src/metacognition.ts`: Logic for knowledge gaps and topic assessment.
- `src/ambient.ts`: Handles the ambient rolling session sync and provides startup guidance.
- `src/checkpoint.ts`: Implements the pre-compaction checkpoint logic.
- `src/mine.ts`: File ingestion logic (`memory_mine`).

## How it works

**Architecture:** `mm-memory` acts as the durable layer in a multi-tiered memory stack (short-term observations -> wiki curated pages -> Prism semantic long-term memory). It manages two main document collections within Prism: `ltm-memories` (for discrete facts, decisions, insights, and preferences) and `ltm-sessions` (for session summaries, recap docs, and checkpoints). 

**Events and Mutations:** The package automatically enriches the AI's context silently in the background. Before compaction (`session_before_compact`), it saves a summary of the session to preserve it forever. Concurrently, it maintains a debounced rolling sync of the active session to Prism. When a new agent starts (`before_agent_start`), the extension injects memory tool guidelines and can optionally pre-fetch relevant past context. User knowledge gaps are mutated directly to a local Markdown file (`~/.pi/agent/mm-knowledge-gaps.md`).

**Integrations:** 
- **Prism:** Heavily integrates with the Prism semantic search API via a custom HTTP client (`PrismClient`).
- **Atelier (`pi-atelier`):** Emits `atelier:memory-status` events to render the current Prism connection state and operation metrics (remembers/recalls/syncs) in the TUI sidebar.
- **`mm-wiki` / Observational Memory:** Works in tandem with these layers. While `mm-wiki` curates topics, `mm-memory` is the semantic safety net for unstructured durable knowledge.

## Configuration

Configuration is managed in `~/.pi/agent/mm-memory.json`. Default settings:
```json
{
  "memoriesCollection": "ltm-memories",
  "sessionsCollection": "ltm-sessions",
  "injectOnStart": false,
  "injectLimit": 5,
  "injectCollection": "memories",
  "checkpointOnCompact": true,
  "ambientSync": true
}
```
*Note: The actual Prism connection details (Base URL, API Key) are typically resolved via environment variables or shared `pi-prism` config.*

## Dependencies
- **Peer Dependencies:** `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, `typebox` (for tool parameter schema definition).
- **Runtime Environment:** Relies on the host environment having access to a running Prism database instance.
