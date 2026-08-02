# R3 research: authoritative nmem backend REST API docs (OpenAPI + runtime verification)

> Research findings for wayfinder ticket #70. Fact base for #71/#72 decisions; corrects r1 §7.
> Research date: 2026-07-16
> Authoritative sources: `http://127.0.0.1:14242/openapi.json` (OpenAPI 3.1.0, "Nowledge Mem API", info.version `0.9.15`, 276 paths) + runtime probes
> nmem CLI version: `0.10.28` (different version line from API `info.version 0.9.15` — do not conflate)
>
> Update (#95): new `nmem_list_threads` uses `GET /threads` (list by import time, not search). That endpoint is documented in OpenAPI (params limit/offset/source/space_id + pagination.{total,has_more}) and is out of scope for this research; field semantics are defensively parsed in `client.ts`.

## ⚠ Key finding: OpenAPI disagrees with runtime in three places

OpenAPI schema is FastAPI-styled (includes `HTTPValidationError` schema), but backend behavior diverges in three places. **422 error bodies are `text/plain` axum/serde Rust format** (`Failed to deserialize the JSON body into the target type: missing field`), not FastAPI JSON `{"detail":[...]}` — the backend is **Rust/axum**, while OpenAPI mimics FastAPI (including a copied `HTTPValidationError` schema).

| Item | OpenAPI claims | Runtime (2026-07-16) | Conclusion |
|---|---|---|---|
| `offset` on `/memories/search` | absent from `MemorySearchRequest` | works (`offset=0,limit=1` → memory `09b8991f`; `offset=3,limit=1` → memory `crystal_c3b89e83`, different lower-relevance item) | OpenAPI request body incomplete; **offset works in practice** |
| missing `query` on `/memories/search` | `query` required → 422 | `200` returns `[]` | query not required; default empty result |
| 422 error body format | `{"detail":[{"loc":...,"msg":...,"type":...}]}` (FastAPI JSON) | `text/plain` `Failed to deserialize the JSON body into the target type: missing field \`content\` at line 1 column N` (axum/serde Rust) | **Backend is Rust/axum emitting FastAPI-style OpenAPI**; r1 §7.7 observation correct |

**Implementation guidance** (for #66 error handling + REST client module):

- Body parse must accept JSON and plain text: try `JSON.parse`, on failure use raw text as detail (r1 §7.7 already suggested; this research confirms it is required).
- `offset` works but is **not guaranteed documented** — depending on it risks version drift; tool layer should explicitly evaluate if paging is needed (#64 read_thread already uses offset; whether memories search offset is exposed to the LLM is a #71 decision).
- Empty search returns `200 []`, not an error; tool empty-state check is `array.length === 0` (#64 decided).

## Direct answers for #71 / #72

### #71 — `nmem_search` memories `total` semantics

**Conclusion**: `POST /memories/search` REST response is a **bare array** — no top-level `total` / `total_found` / `count`, and no request param that returns a true match total. `total` can only be `array.length` (returned count, affected by `limit`). **r1 §7.1 is correct.**

Contrast: `GET /threads/search` has top-level `total_found` (true match total), which is inconsistent with memories `total = array.length` — that is the core of the #71 conflict; decide in grilling (annotate / remove / promptGuidelines).

### #72 — `nmem_save_memory` labels parameter upsert inconsistency

**Conclusion**: dedicated label association REST endpoints exist; **option (d) is feasible**:

| Endpoint | Method | Notes |
|---|---|---|
| `/memories/{memory_id}/labels` | GET | list labels on memory (response `{labels: [...]}`) |
| `/memories/{memory_id}/labels/{label_id}` | POST | associate label (path params `memory_id` + `label_id`, response `{message: string}`) |
| `/memories/{memory_id}/labels/{label_id}` | DELETE | disassociate |
| `/labels` | GET | list all labels (`id`/`name`/`color`/`description`/`created_at`; supports `limit`/`offset`/`order_by`/`order_desc`) |
| `/labels` | POST | create label (query params: `name` required / `color` / `description`; response label object with `id`) |

**Note**: association endpoints need `label_id` (**not** label name). Associating by name is two steps: `GET /labels` (name→id; `POST /labels` if missing) → `POST /memories/{id}/labels/{label_id}`.

- `POST /memories`: request body `labels` (array of label **names**) works; response returns `assigned_labels`.
- `PATCH /memories/{memory_id}`: `labels` in body is **silently ignored** (OpenAPI body is `additionalProperties: true` with no field constraints; runtime accepts any key but does not process labels). **r1 §7.5 is correct.**

→ #72 decision input: option (d) is technically feasible but needs a two-step path (name→id→associate); grilling must weigh (d)'s full upsert consistency vs (a/b/c) simplicity (throw / annotate / remove labels param).

> **#72 runtime correction (2026-07-16, grilling phase)**: the bullet above saying “`POST /memories`…labels works” was ambiguous. Clarified by probe —
>
> - POST on **create** (no id): labels have **set** semantics (become this set).
> - POST on **upsert** (id already exists): labels have **add** semantics (append, not set); response `assigned_labels` only reports labels assigned **in this operation**, not the memory’s full label set — easy to misread.
> - Backend has **no endpoint that one-shots setting labels on an existing memory** (a set needs full diff: GET current → DELETE extras → POST new).
> - **nmem CLI `m update` has no labels param** (only title/content/importance/unit-type/space); no global label commands either; only labels entry point is `m add -l` (set on create). So the whole nmem ecosystem (backend PATCH + CLI `m update`) cannot update labels on existing memories.
> - Probed `DELETE /memories/{id}` and `DELETE /labels/{id}` — available (not listed in this table / main r3 body).
>
> **#72 final decision**: labels = create-time initial tags; updates do not touch them (align with nmem capability boundary); non-empty labels on update → `warnings`, do not throw. See [#72 resolution](https://github.com/CNife/pi-extensions/issues/72#issuecomment-4987912111).

## Authoritative schemas per endpoint (OpenAPI + runtime)

### POST /memories/search

**Request body** (`MemorySearchRequest`):

| Field | Type | required | Notes |
|---|---|---|---|
| `query` | string | OpenAPI says required; runtime optional (omit → `[]`) | Search query |
| `limit` | integer | no | Max results |
| `offset` | integer | no | **Undeclared in OpenAPI but works at runtime** (paging) |
| `mode` | string \| null | no | `'deep'` (default) or `'fast'` (BM25+vector only) |
| `filter_labels` | array[string] \| null | no | Filter by label name |
| `unit_type` | string \| null | no | `fact`/`preference`/`decision`/`plan`/`procedure`/`learning`/`context`/`event` |
| `include_entities` | boolean | no | Include `related_entities` |
| `metadata_filters` | array[string] \| null | no | metadata `key=value` AND filters |
| `space_id` | string \| null | no | Isolation space (v1 omits) |
| `event_date_from` / `event_date_to` | string \| null | no | Event date filter (`YYYY`/`YYYY-MM`/`YYYY-MM-DD`) |
| `temporal_context` | string \| null | no | `past`/`present`/`future`/`timeless` |
| `recorded_date_from` / `recorded_date_to` | string \| null | no | Recorded date filter |

**Response** [200]: **array**, each element:

| Field | Notes |
|---|---|
| `memory` | Full memory node (see below). **No `labels`/`label_ids`** (needs separate `GET /memories/{id}/labels`) |
| `similarity_score` | Semantic similarity score |
| `relevance_reason` | e.g. `Text Match (65%) + Keyword Match (35%)` |
| `related_entities` | Related entity array |
| `evolves_context` | EVOLVES version-chain context |
| `related_memory_links` | Explicit memory links |

`memory` node fields (excerpt; full node ~40 fields): `id` / `node_type` / `created_at` / `updated_at` / `metadata` (includes `score_breakdown`/`graph_traversal`/`search_context_snapshot` — drop in implementation) / `content` / `title` / `importance` / `confidence` / `pagerank_score` / `embedding` / `source_range` / `source` / `space_id` / `semantic_field` / `access_count` / `appearances` / `clicks` / `decay_score_cached` / `temporal_context` / `event_start` / `event_end` / `unit_type` / `is_latest` / `version` / `is_crystal` / `crystal_title` / `extraction_method` / `review_status`.

**Response** [422]: `text/plain` `Failed to deserialize the JSON body into the target type: ...` (axum format, not JSON).

### GET /threads (list)

> ⚠ OpenAPI did not cover this endpoint at r3 research time; contract below is runtime-probed (2026-07-18, CLI v0.10.30 / server v0.10.30). Drift risk — callers should parse defensively.

**Query params**: `limit` (default 20), `offset` (default 0), `source` (filter integration, e.g. `pi`/`omp`), `space_id`. Unknown params silently ignored.

**Response** [200]:

| Field | Notes |
|---|---|
| `threads` | array; each has `id` (pi-prefixed thread_id) / `title` / `summary` / `source` / `messages` (int, message count) / `date` (date-only `"Jul 18, 2026"`, import date not session start) / `is_favorite` / `space_id` / `metadata` / `agent_id` / `source_app` / `host_agent_id` |
| `pagination` | `{limit, offset, total, has_more}` |

**Notes**:

- Sort: reverse import time (newest first), same as CLI `t list`.
- `date` is day-precision and is the **import date** — not usable for hour-level splitting; precise session start needs `GET /threads/{id}` → `messages[0].timestamp` (see r4, #93).
- `messages` is a count (int), not a message body array; bodies come from `GET /threads/{id}`.
- vs `GET /threads/search`: search requires `query` (semantic; returns `total_found`+`relevance_score`); list has no query (time-ordered; returns `pagination`). Different jobs — list should be its own tool, not a no-query search mode.

### GET /threads/search

**Query params**: `query` (req), `mode` (`'suggestions'`/`'full'`, default `full`), `limit` (default 20), `source`, `space_id`.

**Response** [200]:

| Field | Notes |
|---|---|
| `threads` | array; each has `id` (internal UUID) / `thread_id` (pi- prefix) / `title` / `summary` / `message_count` / `source` / `space_id` / `participants` / `last_activity` / `relevance_score` / `total_matches` / `matched_messages[]` (`message_id`/`message_index`/`role`/`snippet`/`match_score`) |
| `total_found` | True match total (**memories search has no equivalent**) |
| `search_metadata` | `query`/`mode`/`matched_messages_count`/`error`/`search_engine` |

**Response** [422]: same text/plain as above.

### GET /threads/{thread_id}

**Query params**: `thread_id` (path, req), `limit`, `offset` (default 0), `space_id`.

- `{thread_id}` **accepts both internal UUID and thread_id (pi- prefix)** — both return 200. **r1 §7.3 correct.**

**Response** [200]:

| Field | Notes |
|---|---|
| `thread` | Nested thread node (`id`/`thread_id`/`title`/`summary`/`message_count`/`source`/`space_id`/`project`/`workspace`/`tool_version`/`import_date`/...) |
| `messages` | array (`id`/`content`/`role`/`order_index`/`timestamp`/`token_count`/...) |
| `total_messages` | Top-level total (unaffected by limit) |
| `total_tokens` | Total token count |
| `related_memories` / `entities` / `covered_message_ids` | Related data |

- Offset past end: `messages: []` with unchanged `total_messages` (`200`) — empty state.

**Response** [404]: `{"detail":"Thread not found"}` (JSON; runtime-confirmed).

### POST /memories (create / upsert)

**Request body** (`MemoryCreateRequest`, excerpt):

| Field | Type | required | Notes |
|---|---|---|---|
| `content` | string | **yes** | Memory body (**omit → 422**, runtime-confirmed) |
| `title` | string \| null | no | Title |
| `id` | string \| null | no | **Upsert**: if provided and exists, update; response `action="updated"` |
| `labels` | array[string] \| null | no | Label **name** array (**POST works**; `assigned_labels` returned) |
| `importance` | number | no | 0.0–1.0 |
| `confidence` | number | no | Confidence |
| `unit_type` | string | no | `fact`/`preference`/`decision`/`plan`/`procedure`/`learning`/`context`/`event` |
| `source` | string \| null | no | Source app |
| `source_thread_id` / `source_message_id` / `source_message_range` | optional | no | Source message location |
| `space_id` | string \| null | no | Isolation space (v1 omits) |
| `metadata` | object | no | Extra metadata |
| `event_start` / `event_end` | string \| null | no | Event date (`YYYY`/`YYYY-MM`/`YYYY-MM-DD`) |

**Response** [200]:

| Field | Notes |
|---|---|
| `memory` | Full memory node |
| `action` | `'created'` or `'updated'` (upsert hit) |
| `extracted_entities` | Extracted entities |
| `assigned_labels` | Assigned labels (**POST works**) |
| `created_relationships` | New relationship count |
| `warnings` | Non-fatal follow-on issues |

**Response** [422]: `text/plain` `Failed to deserialize the JSON body into the target type: missing field \`content\`...` (**confirmed**, HTTP 422, CT `text/plain; charset=utf-8`).

### PATCH /memories/{memory_id} (update)

**Request body**: OpenAPI declares `{"type":"object","additionalProperties":true,"title":"Request"}` — **generic body, no field constraints**. Runtime accepts `title`/`content`/`importance`/`unit_type`/`space`, etc.; **`labels` silently ignored** (accepted without error, not applied). **r1 §7.5 correct.**

**Response** [200]: full memory object (`id`/`title`/`content`/`source`/`time`/`importance`/`rating`/`label_ids`/`is_favorite`/`source_thread`/`confidence`/`space_id`/`unit_type`/`metadata`). **No `action`/`updated_fields`/`success`** (CLI computes these).

**Response** [404]: `{"detail":"Memory not found: <id>"}` (JSON).

### GET /memories/{memory_id}

**Query params**: `memory_id` (path, req), `space_id`.

**Response** [200]: full memory object (same as PATCH response), **includes `label_ids`** (label **ID** array, not names).

### GET /context/bundle

**Query params**: `agent_id`, `source_app`, `host_agent_id`, `space_id`, `include_working_memory` (boolean, default true).

**Response** [200]: OpenAPI declares generic `{}` (no schema). Runtime (r1 §7.6) includes top-level `rendered_markdown` (directly usable; same as CLI `nmem --json context`), `working_memory.content` (full WM text), `owner_profile`/`agent_profile`/`active_space`/`rule_stack`/`kfs_roots`/`authorship`/`warnings`/`schema_version`/`generated_at`/`bundle_kind`/`compiled_hash`.

### POST /threads (create thread, for sync)

**Request body**: `thread_id` (req, string), `title`, `messages` (req, array), `participants`, `source`, `space_id`, `project`, `workspace`, `tool_version`, `import_date`, `metadata`.

**Response** [200]: `{thread, messages, created_relationships, auto_generated_summary, extracted_memories, auto_extraction_performed}`.

### POST /threads/{thread_id}/append (append messages, for sync)

**Request body**: OpenAPI generic body. Runtime accepts messages array + `deduplicate` / `idempotency_key` (verified by nowledge-mem-pi; reuse on fork — see r2).

**Response** [200]: `{success, thread_id, messages_added, total_messages}`.

## r1 §7 correction summary

| r1 §7 section | r1 original | OpenAPI | Runtime | Final |
|---|---|---|---|---|
| §7.1 search has no total | correct | confirms (array response, no total) | confirms | ✅ keep |
| §7.1 missing query → `[]` | correct | **mismatch** (claims query required→422) | **confirms 200 `[]`** | ✅ keep; note OpenAPI mismatch |
| §7.1 labels absent | correct | confirms (memory node has no label_ids) | confirms | ✅ keep |
| §7.2 threads `total_found` | correct | confirms | confirms | ✅ keep |
| §7.3 dual thread_id accept | correct | confirms | confirms | ✅ keep |
| §7.3 messages `order_index` | correct | confirms | confirms | ✅ keep |
| §7.3 offset past end → empty messages | correct | confirms (offset default 0) | confirms | ✅ keep |
| §7.4 POST missing content 422 | correct | claims JSON `detail` | **probed text/plain** | ⚠️ format fix: text/plain not JSON |
| §7.5 PATCH no action/updated_fields | correct | confirms (generic body) | confirms | ✅ keep |
| §7.5 PATCH labels silently ignored | correct | confirms (additionalProperties:true) | confirms | ✅ keep |
| §7.6 bundle `rendered_markdown` | correct | generic `{}` (undeclared) | confirms | ✅ keep |
| §7.7 422 plain text | correct | **mismatch** (claims JSON HTTPValidationError) | **confirms text/plain** | ✅ keep; note OpenAPI mismatch; backend axum not FastAPI |
| §7.8 offset on search | correct | **mismatch** (`MemorySearchRequest` lacks offset) | **confirms works** | ✅ keep; note incomplete OpenAPI request body |
| §7.8 threads/search no offset | correct | confirms (limit only) | confirms | ✅ keep |
| §7.9 sync endpoints | correct (nowledge-mem-pi verified) | confirms (POST /threads + /append exist) | confirms | ✅ keep |

**Net**: all r1 §7 curl findings **stand**; only §7.4 error-body wording needs “FastAPI/Pydantic standard” → “axum/serde Rust plain text”. OpenAPI mismatches runtime on offset / missing query / 422 format — implement against **runtime**; use OpenAPI only as a field inventory reference.

## Endpoints / fields not covered in r1 §7

| Endpoint / field | Notes |
|---|---|
| `POST /memories/{memory_id}/labels/{label_id}` | Associate label with existing memory (#72 option d) |
| `DELETE /memories/{memory_id}/labels/{label_id}` | Disassociate |
| `GET /memories/{memory_id}/labels` | List memory labels |
| `GET` / `POST /labels` | List / create labels (name→id resolution; prerequisite for association) |
| `POST /memories` `id` field | Upsert semantics (existing id → `action="updated"`) |
| New search request body params | `mode` / `filter_labels` / `unit_type` / `include_entities` / `metadata_filters` / `event_date_*` / `temporal_context` / `recorded_date_*` |
| Search response memory node | `pagerank_score` / `semantic_field` / `decay_score_cached` / `is_crystal` / `extraction_method` / `review_status` etc. (implementation picks 8 fields per #64; drop debug) |
