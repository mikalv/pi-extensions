# mm-memory — Prism long-term memory for Pi

LTM surface for Pi on [Prism](https://github.com/mikalv/prism). This is the durable layer in an observational-memory style stack:

```
short-term   observe → reflect → stable summary (prompt-cache friendly)
wiki         mm-wiki curated topical pages (profile/topics/areas/…)
long-term    Prism collections via mm-memory  ← this package
```

`pi-prism` remains HTTP transport/tools. `mm-memory` owns remember/recall/mine semantics and LTM collections. `mm-wiki` is the compiled topical layer — not a Prism replacement.

## Collections

| Collection | Purpose |
| --- | --- |
| `ltm-memories` | Durable facts, preferences, decisions, insights |
| `ltm-sessions` | Session summaries / recap docs / precompact checkpoints |

Document fields: `id`, `kind`, `text`, `project`, `tags[]`, `created_at`, `source`.

## Patterns (inspired by MemPalace, Prism-backed)

1. **Mine** — `memory_mine` / `/memory mine [path]` ingests project text files into Prism.
2. **Scoped recall** — `memory_recall` filters by `project` (wing), `kind` (room), and `tags`.
3. **Precompact checkpoint** — on `session_before_compact`, writes a session summary into `ltm-sessions` (default on).

## Config

`~/.pi/agent/mm-memory.json` (+ Prism connection via `pi-prism` / env):

```json
{
  "memoriesCollection": "ltm-memories",
  "sessionsCollection": "ltm-sessions",
  "injectOnStart": false,
  "injectLimit": 5,
  "injectCollection": "memories",
  "checkpointOnCompact": true
}
```

## Commands / tools

| Surface | Description |
| --- | --- |
| `/memory status` | Config + health |
| `/memory remember\|recall\|mine` | Write / search / ingest |
| `/memory inject on\|off` | Start inject (default off) |
| `/memory checkpoint on\|off` | Precompact checkpoint (default on) |
| `memory_remember` | Store durable LTM doc |
| `memory_recall` | Scoped semantic recall |
| `memory_mine` | Ingest files into Prism |
| `/memory assess` / `memory_assess` | Coverage confidence (wiki + Prism + gaps) |
| `/memory gap` / `memory_gap` | Record a known knowledge gap |

Gaps are stored in `~/.pi/agent/mm-knowledge-gaps.md`.

## License

MIT
