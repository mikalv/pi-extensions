# Pi Context (Layer 2)

**Package:** `packages/pi-context`

Pi Context implements Agentic Context Management (ACM). Instead of relying on a human user to manually clear context or summarize a session, this layer gives the agent direct control over its own conversation tree.

## Agentic Tools

The package provides three internal tools (`isInternal: true`) that the agent uses to traverse and manipulate its context:

1. **`context_checkpoint`**: Allows the agent to drop a named, semantic anchor (e.g., `parser-fix-start`) onto a specific conversation node. This is crucial for bookmarking known-good states.
2. **`context_timeline`**: Generates a structural map of the current conversation path. The agent can use this to review its milestones, branch points, and past checkpoints without reading the raw verbose history.
3. **`context_compact`**: The core action tool. It allows the agent to create a summarized continuation branch from an earlier node or checkpoint. The agent provides a summary of the state (decisions, external side-effects, open questions). The tool creates a new node in Pi's session tree, bypassing the raw verbose logs between the target and the present, and places the agent in this fresh, compressed branch.

## How it Works

When `context_compact` is executed, it calculates if the conversation advanced while the summary was generating. If safe, it branches the tree via `SessionManager.branchWithSummary()` and navigates the agent to the new state. This effectively shrinks the active context window (saving tokens and improving LLM focus) while retaining task-critical state.

TUI Command: `/acm` enables the feature for a session.
