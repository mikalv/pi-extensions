# mm-memory

**Title:** Prism long-term memory for Pi
**Purpose:** Provides a durable Long-Term Memory (LTM) layer using a Prism vector database, offering semantic `remember`, `recall`, `mine`, and `forget` operations to preserve durable facts, session summaries, and insights across sessions with enterprise data-governance and local-only model restrictions.

## Tools, Commands, and Hooks

### Tools
- `memory_remember`: Store a durable long-term memory in Prism (facts, preferences, decisions, insights).
- `memory_recall`: Semantic recall from Prism LTM (scopable to memories or past sessions).
- `memory_sessions`: Search past conversation session summaries.
- `memory_mine`: Ingest project files and directories into the Prism database.
- `memory_forget`: Delete a memory document from Prism by matching text.
- `memory_assess`: Evaluate knowledge coverage and confidence for a topic across wiki, Prism, and recorded gaps.
- `memory_gap`: Record a known knowledge gap (stored in `~/.pi/agent/mm-knowledge-gaps.md`).

### Slash Commands
- `/memory status`: View configuration, active data governance / security policy, and Prism health.
- `/memory recall <query>`: Scoped semantic search.
- `/memory remember <text>`: Index a durable memory note.
- `/memory sessions <query>`: Search past session summaries.
- `/memory mine [path]`: Ingest files into Prism (defaults to current working directory).
- `/memory forget <text>`: Delete a memory by matching text.
- `/memory assess <topic>`: Coverage and confidence assessment.
- `/memory gap <description>`: Record a knowledge gap.
- `/memory inject on|off`: Toggle session-start Prism injection.
- `/memory checkpoint on|off`: Toggle pre-compaction LTM checkpoints.
- `/memory sync on|off`: Toggle ambient session sync to `ltm-sessions`.
- `/memory help`: Display command usage help.

### Event Subscriptions (Hooks)
- `before_agent_start`: Injects memory startup guidance into the system prompt and optionally performs a Prism semantic search to inject relevant context hits (if `injectOnStart` is true and provider access policy allows it).
- `session_before_compact`: Automatically writes a pre-compaction session summary checkpoint into the `ltm-sessions` collection before context is lost.
- `session_start`, `tool_execution_end`, `turn_end`: Updates the Atelier sidebar status.
- **Ambient Sync**: Subscribes to agent/session events (e.g., `agent_end`) to perform a rolling, debounced upsert of the live session into `ltm-sessions`.

## Data Governance & Privacy Isolation

For sensitive projects (e.g. medical/health records, proprietary codebases), `mm-memory` supports strict provider-level access control to guarantee data stored in Prism is never accessed by or sent to cloud/external AI models.

### Setup in Project Root (`.pi/mm-memory.json` or `.mm-memory.json`)
```json
{
  "memoriesCollection": "health-project-memories",
  "sessionsCollection": "health-project-sessions",
  "localOnly": true
}
```
Or allowlist specific providers:
```json
{
  "memoriesCollection": "restricted-memories",
  "sessionsCollection": "restricted-sessions",
  "allowedProviders": ["vllm-local", "gemma4-local", "ollama"]
}
```

### Security Enforcement:
- **Zero-Leak Prompt Injection:** Auto-injection (`before_agent_start`) will silently suppress memory injection if the active session model is not provided by an authorized local provider.
- **Zero-Leak Tool Operations:** `memory_recall`, `memory_remember`, `memory_mine`, and `memory_forget` reject requests with a hard error if invoked from an external provider session.

## Key Files
- `src/index.ts`: The extension entry point. Registers tools, commands, and pi event listeners.
- `src/memory.ts`: Core memory operations (`remember`, `recall`, `recallForInjection`).
- `src/prism-client.ts`: The HTTP client with query-escaping for communicating with the Prism vector database.
- `src/config.ts`: Configuration state management (loading/saving `~/.pi/agent/mm-memory.json` and project overrides `.pi/mm-memory.json`, provider restriction policy).
- `src/metacognition.ts`: Logic for knowledge gaps and topic assessment.
- `src/ambient.ts`: Handles the ambient rolling session sync and provides startup guidance.
- `src/checkpoint.ts`: Implements the pre-compaction checkpoint logic.
- `src/mine.ts`: File ingestion logic (`memory_mine`).

## How it works

**Architecture:** `mm-memory` acts as the durable layer in a multi-tiered memory stack (short-term observations -> wiki curated pages -> Prism semantic long-term memory). It manages discrete document collections within Prism (defaulting to `ltm-memories` and `ltm-sessions`, or project-isolated collections).

**Integrations:** 
- **Prism:** Heavily integrates with the Prism semantic search API via a custom HTTP client (`PrismClient`).
- **Atelier (`pi-atelier`):** Emits `atelier:memory-status` events to render the current Prism connection state and operation metrics (remembers/recalls/syncs) in the TUI sidebar.
- **`mm-wiki` / Observational Memory:** Works in tandem with these layers. While `mm-wiki` curates topics, `mm-memory` is the semantic safety net for unstructured durable knowledge.

## Dependencies
- **Peer Dependencies:** `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, `typebox` (for tool parameter schema definition).
- **Runtime Environment:** Relies on the host environment having access to a running Prism database instance.
