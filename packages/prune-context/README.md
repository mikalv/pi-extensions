# @cnife/pi-prune-context

Deterministic context economy for Pi — zero-LLM prune→format compaction, plus cheap ingestion/mid-session reclaim patterns ported from smart-compact / condense / distill / rtk-rewrite.

## What it does

| Layer | Behavior |
| --- | --- |
| **`/prune`** | Manual deterministic compaction (structured Markdown summary) |
| **`session_before_compact`** | Auto/threshold compact uses prune→format instead of LLM summary |
| **`/compact`** | Untouched — native Pi LLM summary |
| **RTK rewrite** | Optional bash command rewrite via `rtk` (if on PATH) |
| **Tool-result crop** | Head/tail truncate oversized successful tool outputs (+ spill file) |
| **Context trim** | Strip old thinking; purge large args on cooled-down errored toolCalls |
| **State catalog** | Compact summaries include Decisions / Errors / Open loops |

`recall_pruned_tool_call` recovers full tool args/results by JSONL anchor (`#14.1`).

## Config (env)

| Env | Default | Meaning |
| --- | --- | --- |
| `PRUNE_RTK` | on | Set `0`/`off` to disable RTK rewrite |
| `PRUNE_CROP_CHARS` | `12000` | Max tool-result chars kept (`0` disables crop) |
| `PRUNE_CONTEXT_TRIM` | on | Set `0`/`off` to disable mid-session trim |

Per-command RTK opt-out: prefix with `RTK_DISABLE_REWRITE=1`. Distill-style escape: tool output starting with `RAW`.

## Tests

```bash
npx tsx --test packages/prune-context/test/*.test.ts
```

## Credits

Compaction pipeline originally from CNife. Cheap-context patterns adapted from community `pi-smart-compact`, `pi-condense`, `pi-distill`, and `pi-rtk-rewrite` (deterministic subsets only — no LLM summarizers).
