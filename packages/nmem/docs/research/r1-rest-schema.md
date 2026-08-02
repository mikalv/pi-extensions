# R1 research: nmem backend REST endpoint response schemas + config format

> Research findings for wayfinder ticket #61. Fact input for ticket A (slim tool return schemas).
> Research date: 2026-07-15

> **⚠ Correction (verified 2026-07-15)**: §§1–5 record CLI `nmem --json` transformed output, **not raw REST responses**. The CLI extracts/renames/aggregates fields in Rust (e.g. computing `total`/`search_mode`, mapping `similarity_score` → `score`, parsing `labels`). For the real data source of a pi-nmem “pure REST” implementation, see **§7 Real REST response shapes** below; the REST client module must reimplement equivalent transforms in TypeScript.

## 1. POST /memories/search

**Source**: CLI `nmem --json m search '<query>' --limit 1`

### Top-level fields

| Field | Type | Optional | Notes |
|------|------|--------|------|
| `query` | `string` | no | Search query string |
| `total` | `number` (int) | no | Match count |
| `search_mode` | `string` | no | Search mode, e.g. `"fast_bm25_vector"` (normal) or `"3_strategy_hybrid"` (deep) |
| `memories` | `array` | no | Memory object array |

### `memories[]` element fields

| Field | Type | Optional | Notes |
|------|------|--------|------|
| `id` | `string` (UUID) | no | e.g. `"70da4c22-0000-4000-8000-000000000000"` |
| `title` | `string` | no | Memory title |
| `content` | `string` | no | Memory body |
| `score` | `number` (float) | no | Search relevance score, e.g. `0.8475` |
| `importance` | `number` (float) | no | Importance 0.0–1.0 |
| `unit_type` | `string` (enum) | no | `fact`/`preference`/`decision`/`plan`/`procedure`/`learning`/`context`/`event` |
| `labels` | `string[]` | yes | Label list; always returned, may be empty |
| `source` | `string` | no | Source id, e.g. `"cli"`, `"agent"` |
| `created_at` | `string` (ISO 8601) | no | e.g. `"2026-07-08T09:40:47+00:00"` |
| `space_id` | `string` | no | Space ID, e.g. `"default"` |

**Key**: search memory objects include `score` (search score) — the main difference vs list/show.

## 2. GET /threads/search

**Source**: CLI `nmem --json t search '<query>' --limit 1`

### Top-level fields

| Field | Type | Optional | Notes |
|------|------|--------|------|
| `query` | `string` | no | Search query |
| `total` | `number` (int) | no | Match count |
| `threads` | `array` | no | Thread object array |

### `threads[]` element fields

| Field | Type | Optional | Notes |
|------|------|--------|------|
| `id` | `string` | no | e.g. `"pi-019eaa4d-d53f-7072-a70d-6626988f56d3"` |
| `title` | `string` | no | Thread title |
| `message_count` | `number` (int) | no | Total messages |
| `matches` | `number` (int) | no | Match count (at least 1) |
| `source` | `string` | no | Source, e.g. `"pi"` |
| `space_id` | `string` | no | Space ID |

**vs `t list`**: `t list` uses field name `messages` (not `message_count`), includes `created_at` (human-readable e.g. `"Jul 15, 2026"`), and does **not** include `matches`.

## 3. GET /threads/{id}

**Source**: CLI `nmem --json t show <id> --limit 1`

### Top-level fields

| Field | Type | Optional | Notes |
|------|------|--------|------|
| `id` | `string` | no | Thread ID |
| `title` | `string` | no | Thread title |
| `source` | `string` | no | Source, e.g. `"pi"` |
| `created_at` | `string` (ISO 8601) | no | e.g. `"2026-07-15T08:13:50.824403Z"` |
| `space_id` | `string` | no | Space ID |
| `total_messages` | `number` (int) | no | Total message count |
| `message_count` | `number` (int) | no | Messages actually returned (affected by `--limit`) |
| `messages` | `array` | no | Message object array |

### `messages[]` element fields

| Field | Type | Optional | Notes |
|------|------|--------|------|
| `index` | `number` (int) | no | Message index (0-based) |
| `role` | `string` | no | `"user"` or `"assistant"` |
| `content` | `string` | no | Full message text |

**Note**: message objects only expose `index`/`role`/`content` — no `id`/`timestamp`. `content` may contain HTML; storage is plain text underneath.

## 4. POST /memories

**Source**: CLI `nmem m add '<content>' -t '<title>' --unit-type <type> -i <importance> -j`

### Return fields

| Field | Type | Optional | Notes |
|------|------|--------|------|
| `success` | `boolean` | no | Always `true` |
| `id` | `string` (UUID) | no | New memory ID |
| `action` | `string` | no | Always `"created"` |
| `title` | `string` | yes | Returned only if provided on create |
| `unit_type` | `string` (enum) | yes | Returned only if provided on create |

**Note**: successful create does not return a full memory object — only a summary confirmation. Full object requires a follow-up `GET /memories/{id}`.

## 5. PATCH /memories/{id}

**Source**: CLI `nmem --json m update <id> -t '<title>'`

### Return fields

| Field | Type | Optional | Notes |
|------|------|--------|------|
| `success` | `boolean` | no | Always `true` |
| `action` | `string` | no | Always `"updated"` |
| `id` | `string` (UUID) | no | Updated memory ID |
| `updated_fields` | `string[]` | no | Which fields were updated, e.g. `["title"]` |
| `unit_type` | `string` (enum) | yes | Memory's original `unit_type` |

**Updatable fields** (CLI `--help`): `title`, `content`, `importance`, `unit_type`, `space`/`space_id`.

## 6. Config file format

### Location

- Path: `~/.nowledge-mem/config.json`
- Source: CLI `nmem config show` + source `client.py::CONFIG_PATH`

### JSON structure (redacted)

```json
{
  "apiUrl": "http://127.0.0.1:14242",
  "apiKey": "sk-..."
}
```

| Key | Type | Optional | Notes |
|------|------|--------|------|
| `apiUrl` / `api_url` | `string` | yes | API base URL; default `http://127.0.0.1:14242` |
| `apiKey` / `api_key` | `string` | yes | API key; no auth if unset |

**Note**: with no local `config.json`, CLI uses the default URL. Fallback order: env → config.json → defaults.

### Environment variables

| Variable | Notes |
|------|------|
| `NMEM_API_URL` | Overrides API base URL; higher priority than config.json |
| `NMEM_API_KEY` | Overrides API key; higher priority than config.json |
| `NMEM_SPACE` | Default space name (for `m add`/`m search` `--space`) |
| `NMEM_SPACE_ID` | Default space ID (Hermes client in `client.py` also aliases this as `NMEM_SPACE`) |

## 7. Real REST response shapes (curl-verified 2026-07-15)

> Verified via curl against backend `http://127.0.0.1:14242` (nmem v0.10.27). This section is the actual data source for a pi-nmem “pure REST” implementation. The CLI shapes in §§1–5 are the LLM-facing target schemas (token-efficient); the REST client module owns field mapping between them.

> **R3 correction (2026-07-16, [r3-rest-api-docs.md](./r3-rest-api-docs.md))**: curl findings in this section were re-checked against OpenAPI (`/openapi.json`, API v0.9.15, 276 paths; nmem CLI now 0.10.28) + a second runtime pass — **all still correct**, except §7.4/§7.7 error-body wording: change “FastAPI/Pydantic standard” to “**axum/serde Rust plain text**” (backend is Rust/axum emitting FastAPI-style OpenAPI). Three OpenAPI-vs-runtime mismatches: (1) `offset` on search works at runtime but is undeclared on `MemorySearchRequest`; (2) missing `query` returns `200 []`, not 422; (3) 422 bodies are `text/plain`, not the JSON OpenAPI claims. Implement against **runtime observation**. Also found dedicated label association endpoint `POST /memories/{id}/labels/{label_id}` (#72 option d).

### 7.0 Field mapping table (REST → spec schema)

| Spec schema field | Real REST location | Notes |
|---|---|---|
| memories `total` | `array.length` | Returned count, not true match total (REST has no total field) |
| memories `score` | element `similarity_score` | Direct |
| memories `labels` | **field removed (#73)** | search does not return labels; no longer a return field (`GET /memories/{id}` returns `label_ids`; N+1 enrichment rejected) |
| other memories fields | `memory.{id,title,content,importance,unit_type,created_at}` | nested memory object |
| threads `total` | top-level `total_found` | CLI `total` maps from this |
| threads `matches` | element `total_matches` | CLI `matches` maps from this |
| threads `id` | element `thread_id` (pi- prefix) | usable with read_thread; GET /threads/{id} accepts both internal id and thread_id |
| thread `title`/`created_at` | nested `thread.title`/`thread.created_at` | not top-level |
| thread `total_messages` | top-level `total_messages` | Direct |
| messages `index` | `order_index` | renamed |
| save created `id` | `memory.id` (POST response) | nested |
| save created `action` | `action` (POST response, value `"created"`) | Direct |
| save updated `action` | **synthesize `"updated"`** | PATCH response has no this field |
| save updated `id` | `memory.id` (PATCH response) or request id | nested |
| save updated `updated_fields` | **infer** (request body keys) | PATCH response has no this field |
| context bundle injection text | top-level `rendered_markdown` | Direct; same as CLI |

### 7.1 POST /memories/search

**Request**: `POST /memories/search`, body `{"query": string, "limit"?: int, "offset"?: int}`

**Response** (HTTP 200): an **array** (not an object), each element:

```json
{
  "memory": {
    "id", "node_type": "Memory", "created_at", "updated_at",
    "metadata": { "score_breakdown", "graph_traversal", "search_context_snapshot" },
    "content", "title", "importance", "confidence", "pagerank_score", "embedding",
    "source_range", "source", "space_id", "semantic_field", "unit_type",
    "is_latest", "version", ...
  },
  "similarity_score": 0.8435,
  "relevance_reason": "Text Match (65%) + Keyword Match (35%)",
  "related_entities": [],
  "evolves_context": null,
  "related_memory_links": []
}
```

- **Empty result**: `[]` (HTTP 200)
- **Missing query**: returns `[]` (HTTP 200, not an error)
- **No top-level `total`/`search_mode`/`query`** (CLI computes these; `total` = `array.length`)
- **`labels` absent** (search endpoint does not return them; GET /memories/{id} returns `label_ids` not resolved names; CLI resolves separately)
- `metadata` carries heavy debug info (score_breakdown/graph_traversal/search_context_snapshot) — drop in implementation
- Supports `offset` paging (offset=0 vs offset=2 return different items)

### 7.2 GET /threads/search

**Request**: `GET /threads/search?query=string&limit=int`

**Response** (HTTP 200):

```json
{
  "threads": [{
    "id": "internal-UUID",
    "thread_id": "pi-<session>",
    "title", "summary",
    "message_count": 359,
    "source": "pi", "space_id": "default", "participants": [],
    "last_activity": "ISO",
    "relevance_score": 8.01,
    "total_matches": 1,
    "matched_messages": [{ "message_id", "message_index", "role", "snippet", "match_score" }]
  }],
  "total_found": 67,
  "search_metadata": { "query", "mode", "matched_messages_count", "error", "search_engine" }
}
```

- Top-level `total` (CLI) = `total_found` (REST)
- Element `matches` (CLI) = `total_matches` (REST)
- Elements have both `id` (internal UUID) and `thread_id` (pi- prefix); **return `thread_id` to the LLM** (read_thread can use it directly)

### 7.3 GET /threads/{id}

**Request**: `GET /threads/{id}?limit=int&offset=int`

- `{id}` **accepts both internal UUID and thread_id (pi- prefix)** — both return 200
- `limit`/`offset` optional; omit to return all messages

**Response** (HTTP 200):

```json
{
  "thread": {
    "id", "node_type": "Thread", "created_at", "updated_at", "metadata",
    "thread_id", "title", "summary", "message_count", "participants",
    "source", "space_id", "project", "workspace", "tool_version", "import_date"
  },
  "messages": [{
    "id", "node_type": "Message", "created_at", "updated_at",
    "metadata": { "external_id", "pi_entry_id", "pi_entry_type", "pi_message_role", "source_app" },
    "content", "role", "order_index": 0, "timestamp", "token_count"
  }],
  "related_memories": [], "entities": [],
  "total_messages": 359, "total_tokens": 0, "covered_message_ids": []
}
```

- `title`/`created_at`/`source`/`space_id` live on the **nested `thread` object** (not top-level)
- messages use `order_index` (not `index`)
- `total_messages` is top-level (total count, unaffected by limit)
- **offset past end**: returns `messages: []` with unchanged `total_messages` (HTTP 200) — empty state
- **404**: `{"detail":"Thread not found"}` HTTP 404

### 7.4 POST /memories

**Request**: `POST /memories`, body `{title?, content, unit_type?, importance?, source?, ...}`

**Response** (HTTP 200):

```json
{
  "memory": { "id", "title", "content", "importance", "unit_type", "source", "space_id", "created_at", ... },
  "action": "created",
  "extracted_entities": [], "assigned_labels": [],
  "created_relationships": [], "warnings": []
}
```

- `action` is `"created"`; `id` = `memory.id`
- **Missing content**: HTTP **422**, **plain text** body (not JSON; historically described as FastAPI/Pydantic — actually axum/serde):

  ```text
  Failed to deserialize the JSON body into the target type: missing field `content` at line 1 column 22
  ```

### 7.5 PATCH /memories/{id}

**Request**: `PATCH /memories/{id}`, body `{title?, content?, importance?, unit_type?, space?}`

**Response** (HTTP 200): **full memory object** (not an operation summary)

```json
{
  "id", "title", "content", "source", "time", "created_at", "importance",
  "rating", "confidence", "space_id", "unit_type", "metadata",
  "label_ids": [], "is_favorite", "source_thread", "is_crystal", "review_status"
}
```

- **No `action`/`updated_fields`/`success`** (CLI computes these)
  - `action`: implementation synthesizes `"updated"`
  - `updated_fields`: implementation infers from request body keys (e.g. `{title, content}` → `updated_fields: ["title","content"]`)
- **404**: `{"detail":"Memory not found: <id>"}` HTTP 404

### 7.6 GET /context/bundle

**Request**: `GET /context/bundle` (optional `?source_app=pi`; v1 does not pass space)

**Response** (HTTP 200):

```json
{
  "schema_version", "generated_at", "bundle_kind",
  "owner_profile", "agent_profile", "active_space", "rule_stack", "working_memory",
  "kfs_roots", "authorship", "warnings",
  "rendered_markdown": "# Nowledge Mem Context Bundle\n...",
  "compiled_hash"
}
```

- `rendered_markdown` is directly available at REST top level (same as CLI `nmem --json context`); inject this field, no local rendering needed
- `working_memory.content` also has full WM text (already in bundle; no separate fallback needed)

### 7.7 Error response shapes

| Scenario | HTTP status | Body format | Notes |
|---|---|---|---|
| Backend unreachable (fetch throw) | 0 | - | Connection refused / timeout / DNS / Invalid URL |
| Auth failure | 401 | untested | local without apiKey did not trigger |
| Resource missing | 404 | JSON `{"detail": "..."}` | thread/memory not found |
| Validation failure | **422** | **plain text** `Failed to deserialize...` | not 400, not JSON; FastAPI/Pydantic-style claim in OpenAPI is wrong |
| Backend error | 5xx | untested | - |

> **Spec error-code mapping fix**: the spec maps `bad_request` to HTTP 400, but the backend uses **422** for validation. Implementation should map `bad_request` to **both 400 and 422**. Body parsing must accept JSON and plain text: try `JSON.parse` first; on failure use raw text as detail.

### 7.8 Pagination parameters

| Endpoint | limit | offset | Default if omitted |
|---|---|---|---|
| POST /memories/search | ✓ | ✓ | return all matches |
| GET /threads/search | ✓ | - | - |
| GET /threads/{id} | ✓ | ✓ | return all messages |

### 7.9 Sync endpoints (reuse when forking nowledge-mem-pi)

Endpoints used by ambient sync; mature in nowledge-mem-pi — reuse its `postJson` calls as-is when forking:

- `POST /threads`: create thread (first time)
- `POST /threads/{thread_id}/append`: append messages (`deduplicate: true` + `idempotency_key`); on 404, fall back to recreate

Response handling only checks `ok`/`status`; does not parse body fields (same as nowledge-mem-pi).

## Appendix: endpoint difference highlights

| Endpoint | Key differences |
|------|----------|
| `m search` vs `m list` | `search` has `score`/`query`/`search_mode`; `list` has `returned`, no `labels`, may omit `title` |
| `t search` vs `t list` | `search` uses `message_count`+`matches`; `list` uses `messages`+`created_at` (human-readable) |
| `t show` vs `t list` | `show` has `total_messages`, full `messages[]`, ISO `created_at` |
| `m update` vs `m show` | `update` returns operation confirmation summary, not full object |
