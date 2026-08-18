# mm-memory — Prism long-term memory for Pi

LTM surface for Pi on [Prism](https://github.com/mikalv/prism). This is the durable layer in an observational-memory style stack:

```
short-term   observe → reflect → stable summary (prompt-cache friendly)
wiki         mm-wiki curated topical pages (profile/topics/areas/…)
long-term    Prism collections via mm-memory  ← this package
```

`pi-prism` remains HTTP transport/tools. `mm-memory` owns remember/recall/mine semantics, LTM collections, and Data Governance isolation policies. `mm-wiki` is the compiled topical layer — not a Prism replacement.

## Collections

| Collection | Purpose |
| --- | --- |
| `ltm-memories` | Durable facts, preferences, decisions, insights (default) |
| `ltm-sessions` | Session summaries / recap docs / precompact checkpoints (default) |

Document fields: `id`, `kind`, `text`, `project`, `tags[]`, `created_at`, `source`.

## Data Governance & Privacy Isolation (Local Model Restrict)

For sensitive projects (e.g., health data, internal IP, confidential business domains), `mm-memory` supports strict provider-level access control to guarantee data stored in Prism is never accessed or sent to cloud/external AI models.

### Project-Local Collection & Security Config

Place `.pi/mm-memory.json` (or `.mm-memory.json`) in the project root:

```json
{
  "memoriesCollection": "health-project-memories",
  "sessionsCollection": "health-project-sessions",
  "localOnly": true
}
```

Or specify an explicit provider allowlist:

```json
{
  "memoriesCollection": "sensitive-client-memories",
  "sessionsCollection": "sensitive-client-sessions",
  "allowedProviders": ["vllm-local", "gemma4-local", "ollama"]
}
```

### Security Guarantees:
1. **Tool Access Protection**: `memory_recall`, `memory_remember`, `memory_mine`, and `memory_forget` verify the active session model's provider. If an external model (e.g. Claude, OpenAI, GLM) tries to query or write to a restricted collection, the operation is blocked with a security violation error (`[LTM Data Governance] Provider is NOT permitted to access collection...`).
2. **Auto-Injection Suppression**: In `before_agent_start`, auto-injection of past memories into the system prompt is automatically suppressed if the active model provider is not in the allowed local list, preventing sensitive context from being transmitted to external providers.
3. **Multi-Tenant / Multi-Project Isolation**: Sensitive projects use dedicated Prism collections, preventing global cross-project queries from exposing data.

---

## Patterns (MemPalace + nmem, Prism-backed)

1. **Mine** — `memory_mine` / `/memory mine [path]` ingests project text files into Prism.
2. **Scoped recall** — `memory_recall` filters by `project` (wing), `kind` (room), and `tags`.
3. **Precompact checkpoint** — on `session_before_compact`, writes a session summary into `ltm-sessions` (default on).
4. **Ambient session sync** (from nmem) — debounced upsert of the live session into `ltm-sessions` on `agent_end`, hard flush on compact/switch/shutdown (default on; `/memory sync off` to disable).
5. **Session search** — `memory_sessions` / `/memory sessions <query>` searches past session summaries.
6. **Startup guidance** — always injected; optional hit inject via `/memory inject on`.

## Config

Global config at `~/.pi/agent/mm-memory.json` (with project-level override support in `.pi/mm-memory.json`):

```json
{
  "memoriesCollection": "ltm-memories",
  "sessionsCollection": "ltm-sessions",
  "injectOnStart": false,
  "injectLimit": 5,
  "injectCollection": "memories",
  "checkpointOnCompact": true,
  "ambientSync": true,
  "localOnly": false,
  "allowedProviders": []
}
```

## Commands / tools

| Surface | Description |
| --- | --- |
| `/memory status` | Config, security policy, and Prism health |
| `/memory remember\|recall\|mine` | Write / search / ingest |
| `/memory forget <text>` | Delete a memory by matching text |
| `/memory inject on\|off` | Start inject (default off) |
| `/memory checkpoint on\|off` | Precompact checkpoint (default on) |
| `/memory sync on\|off` | Ambient session sync (default on) |
| `memory_remember` | Store durable LTM doc |
| `memory_recall` | Scoped semantic recall |
| `memory_sessions` | Search past session summaries |
| `memory_mine` | Ingest files into Prism |
| `memory_forget` | Delete memory document from Prism |
| `/memory assess` / `memory_assess` | Coverage confidence (wiki + Prism + gaps) |
| `/memory gap` / `memory_gap` | Record a known knowledge gap |

Gaps are stored in `~/.pi/agent/mm-knowledge-gaps.md`.

## License

MIT
