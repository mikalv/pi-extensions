# prune-context

**Deterministic context economy for Pi** — zero-LLM prune→format compaction, plus cheap ingestion and mid-session reclaim patterns.

## Tools, commands, and hooks provided
- **Commands**: `/prune` (triggers a deterministic context clipping with zero LLM overhead)
- **Tools**: `recall_pruned_tool_call` (recovers full tool args/results by JSONL anchor, e.g., `#14.1`)
- **Hooks**: `session_before_compact` (intercepts compactions to provide deterministic pruning instead of LLM summaries for threshold overflow or `/prune`, leaving manual `/compact` to use native LLM summaries)

## Key files
- `extensions/index.ts`: The entry point that orchestrates the prune pipeline, registers the `/prune` command, intercepts the compaction hook, and installs cheap-context plugins.
- `extensions/prune.ts` & `extensions/format.ts`: Core pruning logic and deterministic structured markdown formatting.
- `extensions/extract-state.ts`: Extracts state catalogs (Decisions, Errors, Open loops) from messages to include in compact summaries.
- `extensions/tool.ts`: Provides the `recall_pruned_tool_call` tool to fetch details discarded during compaction.
- `extensions/crop.ts`: Implements tool-result cropping (head/tail truncation).
- `extensions/rtk.ts`: Implements optional bash command rewriting via `rtk`.
- `extensions/context-trim.ts`: Implements mid-session context trimming (stripping old thinking and purging large args from cooled-down errored tool calls).

## How it works
This extension aims to replace expensive LLM summarization during context compaction with deterministic data extraction. When a compaction is triggered (via auto-threshold or the `/prune` command), the `session_before_compact` hook intercepts it. Instead of sending the context to an LLM, it extracts live messages, parses active file edits and tool usage, and constructs a structured State Catalog (tracking decisions, errors, and open loops). 

Additionally, it aggressively manages the context footprint mid-session:
- **RTK Rewrite**: Pipes shell commands through `rtk` (if available on PATH) for token-efficient bash output.
- **Tool-result crop**: Automatically truncates oversized tool outputs (head and tail) to save tokens, optionally writing full output to a spill file.
- **Context Trim**: Actively strips out old model thinking paths and large arguments from old errored tool calls.

## Configuration
Configuration is done via environment variables:
- `PRUNE_RTK`: `on` (default). Set to `0` or `off` to disable RTK rewrite. Can be bypassed per-command by prefixing bash commands with `RTK_DISABLE_REWRITE=1`.
- `PRUNE_CROP_CHARS`: `12000` (default). Maximum tool-result characters kept. Set to `0` to disable cropping.
- `PRUNE_CONTEXT_TRIM`: `on` (default). Set to `0` or `off` to disable mid-session context trimming.

## Dependencies
- `@toon-format/toon` (runtime)
- `@earendil-works/pi-coding-agent` (peer)