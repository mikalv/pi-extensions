# R2 research: nowledge-mem-pi extension sync + injection implementation

> Research findings for wayfinder ticket #62. Baseline for ticket D (ambient sync fork change points).
> Research date: 2026-07-15

## Source locations

- **Main extension file**: `~/.pi/agent/npm/node_modules/nowledge-mem-pi/extensions/nowledge-mem.ts`
  - Single-file implementation, ~550 lines TypeScript
  - Registered via `package.json` `pi.extensions`
  - Exports default function `nowledgeMemPi(pi: ExtensionAPI)`
- **Historical bulk sync CLI**: `~/.pi/agent/npm/node_modules/nowledge-mem-pi/scripts/sync-history.mjs`
  - Standalone Node.js CLI (bin: `nowledge-mem-pi-sync`) for backfilling old sessions
  - Similar logic to the extension but duplicated — when forking, focus on the extension only
- **Skills**: five subdirs under `~/.pi/agent/npm/node_modules/nowledge-mem-pi/skills/` (read-working-memory, search-memory, distill-memory, save-thread, status)

## 1. Ambient sync (automatic)

### 1.1 Pi events hooked

Extension registers 5 events via `pi.on()`:

| Event | Callback | Role |
|------|------|------|
| `agent_end` | `scheduleFlush(ctx, "agent_end")` | Debounced sync after each agent reply |
| `session_before_compact` | `await flush(ctx, "session_before_compact")` | Immediate sync before compaction (no data loss) |
| `session_before_switch` | `await flush(ctx, event.reason === "new" ? "session_new" : "session_resume")` | Immediate sync before session switch; also evicts old session startup-context cache |
| `session_shutdown` | `await flush(ctx, "session_shutdown:${event.reason}")` | Immediate sync on close; evict cache |

**Key points**:
- `turn_end` and `message_end` are **not** hooked — high-frequency sync only uses debounced `agent_end`; low-frequency/hard sync uses **flush()** (immediate) on `session_before_compact`/`switch`/`shutdown`.
- `session_start` is reserved for refreshing the startup context cache (see below).

### 1.2 Debounce scheduling (`scheduleFlush` → `flushPayload`)

**Code**: `nowledge-mem.ts:210-225`

```ts
const FLUSH_DELAY_MS = 750; // line 18

function scheduleFlush(ctx: ExtensionContext, reason: string): void {
  const payload = buildSyncPayload(ctx, reason);
  if (!payload) return;
  const key = payload.threadId;
  const state = syncStates.get(key) || {};
  syncStates.set(key, state);
  if (state.timer) clearTimeout(state.timer);
  state.timer = setTimeout(() => {
    state.timer = undefined;
    void flushPayload(payload);
  }, FLUSH_DELAY_MS);
}
```

- Each `agent_end` **resets** the 750ms timer
- **Only the latest payload is kept**: `buildSyncPayload()` runs at schedule time; when the timer fires, that snapshot is what flushes

### 1.3 Sync flow (`flushPayload` → `flushOnce` → `postJson`)

**`flushPayload`** (lines 190-208): serial control via `pending`/`inFlight`:

```ts
async function flushPayload(payload: SyncPayload): Promise<void> {
  const state = syncStates.get(key) || {};
  if (state.inFlight) {
    state.pending = true;   // in-flight request; mark pending
    await state.inFlight;   // wait for it
    return;                 // caller then retries via do..while
  }
  do {
    state.pending = false;
    state.inFlight = flushOnce(payload, state).finally(() => { state.inFlight = undefined; });
    await state.inFlight;
  } while (state.pending);  // if new pending arrived, flush again
}
```

**`flushOnce`** (lines 169-188): two-phase strategy:

1. **First time = POST /threads** (create thread)
2. **Later = POST /threads/{threadId}/append** (append messages with `deduplicate: true` + `idempotency_key`)
   - If append returns 404 (thread not found), reset `state.created = false` and POST /threads again

### 1.4 REST calls (`postJson`)

**Code**: `nowledge-mem.ts:101-140`

```ts
async function postJson(path: string, body: JsonObject): Promise<{ ok, status, data }>
```

- URL resolved from config (see 1.7)
- Headers: `Content-Type: application/json` + optional `Authorization: Bearer <key>` + `X-NMEM-API-Key`
- Timeout: `API_TIMEOUT_MS = 8_000` (8s)
- Auto-injects `space_id` into body
- URL fallback (handles `/remote-api` → `/` path rewrite)

### 1.5 Message building (`buildMessages` / `entryToMessage`)

**Code**: `nowledge-mem.ts:160-198` (build) + `nowledge-mem.ts:62-157` (convert)

Core logic:

1. Get current branch entries via `ctx.sessionManager.getBranch()`
2. Convert each entry by type:
   - **message**: map role to `user`/`assistant`; if role = `custom`, **skip** (exclude extension-injected context)
   - **custom_message**: become `user`, tagged with custom type
   - **compaction / branch_summary**: become `assistant`
   - `bashExecution` → `user`, formatted as a code block
3. Add metadata per message: `external_id`, `pi_entry_id`, `pi_entry_type`, `pi_message_role`, etc.
4. **Content truncation**: `MAX_MESSAGE_CHARS = 20_000`

**Filter**: `shouldSync` (line 158) — sync only if there is at least one user message AND at least one assistant message.

### 1.6 Degradation

- **Backend unreachable**: on fetch failure (network/timeout), `postJson` walks all URL fallbacks; if all fail returns `{ ok: false, status: 0, data: { error: ... } }`
- **Flush failure**: `flushOnce` records `state.lastError` and `console.warn`s — **no retry** (next `agent_end` or harder event triggers a new flush)
- **Space config**: if `space` is set, all REST calls inject `space_id`. Reusable when forking.

### 1.7 Config resolution

**Code**: `nowledge-mem.ts:44-66`

Priority: env vars > shared config `~/.nowledge-mem/config.json` > defaults

| Setting | Env var | config.json field | Default |
|--------|----------|-----------------|--------|
| API URL | `NMEM_API_URL` | `apiUrl` / `api_url` | `http://127.0.0.1:14242` |
| API Key | `NMEM_API_KEY` | `apiKey` / `api_key` | none |
| Space | `NMEM_SPACE` / `NMEM_SPACE_ID` | `space` / `spaceId` / `space_id` | none |
| Agent ID | `NMEM_AGENT_ID` | `agentId` / `agent_id` | none |
| Host Agent ID | `NMEM_HOST_AGENT_ID` | `hostAgentId` / `host_agent_id` | none |

## 2. Startup context injection

### 2.1 Events hooked

```ts
pi.on("session_start", async (_event, ctx) => {
  await refreshStartupContext(ctx);           // cache refresh only
});

pi.on("before_agent_start", async (event, ctx) => {
  return { systemPrompt: await appendMemoryContext(event.systemPrompt, ctx) };  // actual injection
});
```

- `session_start`: **async** refresh of Context Bundle cache; does not block startup
- `before_agent_start`: **mutates systemPrompt**, appending Context Bundle + Guidance text. This is the injection point

### 2.2 Context read strategy (`readStartupContext`)

**Code**: `nowledge-mem.ts:286-314`

Tries 4 paths in **priority order** (up to 4 `nmem` CLI invocations):

| Order | Path | CLI command | Parser |
|------|------|---------|---------|
| 1 | Context Bundle (with space) | `nmem --json context --source-app pi --space <space> --agent-id ... --host-agent-id ...` | `parseContextBundleMarkdown` → `rendered_markdown` |
| 2 | Context Bundle (no-space fallback) | same, `space` undefined | same |
| 3 | Working Memory (with space) | `nmem --json wm read --space <space>` | `parseWorkingMemoryMarkdown` → `content`, check `exists` |
| 4 | Working Memory (no-space fallback) | same, `space` undefined | same |

**Local fallback after all fail** (lines 306-308):
- Condition: config is default local API URL (`http://127.0.0.1:14242`) and no space/agent customization
- Read `~/.ai-now/memory.md`

**Timeout**: `deadline = Date.now() + API_TIMEOUT_MS` (8s); all 4 attempts share this deadline. On timeout mark `timedOut`.

### 2.3 Injection text format (`appendMemoryContext`)

**Code**: `nowledge-mem.ts:328-337`

```ts
async function appendMemoryContext(systemPrompt: string, ctx: ExtensionContext): Promise<string> {
  const sections: string[] = [];
  if (entry?.context) {
    sections.push(`## Nowledge Mem Context Bundle\n\n${entry.context}`);
  } else if (entry?.degradedReason) {
    sections.push(`## Nowledge Mem Context Bundle\n\n[Nowledge Mem startup context unavailable: ${entry.degradedReason}.]`);
  }
  sections.push(startupGuidance());
  return `${systemPrompt}\n\n${sections.join("\n\n")}`;
}
```

Appends two sections at the end of systemPrompt:
1. **## Nowledge Mem Context Bundle** — Context Bundle `rendered_markdown` or degradation note
2. **## Nowledge Mem Guidance** — fixed text telling the LLM when to use nmem skills

**`startupGuidance()`** (lines 36-51) produces ~15 lines of guidance covering:
- Context Bundle already injected — do not re-read
- When to search memory / search threads / save memory
- When to create a handoff thread
- Setting `source_app`

### 2.4 Caching

- `startupContextCache: Map<string, StartupContextEntry>` — keyed by session ID
- `refreshStartupContext(ctx)` — fill cache
- `evictStartupContext(ctx)` — clear on session switch/shutdown
- Lifetime: one session_start → session_shutdown

### 2.5 Degradation

- **CLI missing or timeout**: `console.warn`, return `{ degradedReason: "startup context reads timed out" }` or `"startup context reads failed"`
- **Final fallback**: still inject **Guidance text** (without Context Bundle) so the LLM at least knows how to use nmem skills
- Degradation reason is injected into systemPrompt so the LLM is aware

## 3. Fork change-point baseline

### Designs reusable as-is

| Design | Why |
|--------|------|
| Event hook pattern (`session_start` + `before_agent_start` + `agent_end` + hard-event flush) | Generic pi extension pattern |
| Two-phase thread sync (POST /threads → POST /threads/{id}/append) | Unchanged if backend unchanged |
| `deduplicate: true` + `idempotency_key` | Idempotency |
| Debounce + pending/inFlight serial control | Reliable and simple |
| `entryToMessage` role normalize logic | pi session format is stable |
| Startup context cache + evict lifecycle | Clean |

### Parts that need change

| Change point | Reason |
|--------|------|
| **REST calls → pi-native custom tools** | Core motive of pi-nmem ADR-0001: drop `nmem` CLI middle layer; use `pi.registerTool()` |
| CLI spawn inside `readStartupContext` | Currently `execFile("nmem", ...)`; after fork, fetch Context Bundle / Working Memory via REST directly |
| Config path | Currently hardcoded `~/.nowledge-mem/config.json`; pi-nmem should use its own path or env vars |
| Space injection | Currently injected twice (CLI args + REST body); after fork, unify via REST body |
| Fixed text in `startupGuidance()` | Product name / host label should become `pi-nmem` or `CNife's Pi` |
| `source_app` tag | Currently hardcoded `pi`; pi-nmem should use a custom source id |
| All `console.warn` degradation logs | Consider pi extension logger API |
| Local WM fallback path | `~/.ai-now/memory.md` is nowledge-mem desktop path; remove or replace for pi-nmem |

### Clean module boundaries

- **Message conversion** (`entryToMessage`, `messageToText`, `partToText`, `truncate`) — reusable unchanged
- **Two-phase sync logic** (`flushOnce`, `flushPayload`) — swap interface to pi-native
- **Startup context read strategy** (4-level try + degrade) — keep strategy, implement via REST not CLI spawn
- **Cache layer** (`startupContextCache`, `refreshStartupContext`, `evictStartupContext`) — reusable unchanged
