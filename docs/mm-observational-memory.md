# Observational Memory (Layer 3)

**Package:** `packages/mm-observational-memory`

Observational Memory provides metacognition. It acts as an autonomous background system that watches the agent's work and distills durable learnings (Reflections) from chronological events (Observations).

## Observations vs. Reflections

- **Observations:** Short, chronological facts extracted periodically from recent conversation turns. They populate a short-term pool.
- **Reflections:** Durable, higher-level insights synthesized from the pool of observations. Reflections represent lasting architectural decisions, bug root causes, or user preferences.

## Runtime and Triggers

The system operates via a `Runtime` state machine that monitors token usage across the session. 
- **Compaction Trigger:** When `rawTokensSinceLastCompaction` exceeds a configured threshold, the system automatically triggers a summary/compaction.
- **Consolidation Trigger:** Based on `observeAfterTokens` and `reflectAfterTokens`, the system spins up background agents (`observer` and `reflector` phases) to generate and promote new memories.

## The Session Ledger

All generated memory is persisted as `Entry` objects directly inside the session conversation tree. 
- **`foldLedger` / `fullProjection`**: Because the tree branches and compacts (thanks to Layer 2), the ledger must be recalculated from the active branch path. 
- **`compaction-hook`**: Integrates tightly with Pi Context. When a compaction occurs, this hook ensures that active observations and reflections are serialized and injected into the new compressed branch so the agent doesn't suffer amnesia.

## Tools and TUI

- **`recall_observation`**: A tool available to the agent to actively search its past learnings.
- **`/om:status`**: Displays a detailed TUI read-out showing token budgets, next trigger thresholds, visible/active observation pools, and reflection context size.
- **`/om:view`**: Allows human users to inspect the ledger.
- **Status Bar**: Emits real-time background processing status (e.g., `👁 om: 12 obs · 4 refl`).
