# PI Backoffice Reporter

PI extension that streams agent state, permission requests, and user questions to a remote backoffice server.

## Features

| Feature | Description |
|---|---|
| **Status** | Real-time agent state: idle/running, current tool, turn count |
| **Permissions** | Routes tool-call approval (bash/write/edit) to remote server |
| **Questions** | Routes `AskUserQuestion` calls to remote server |

## Protocol

Three HTTP endpoints the server must implement:

### `POST /api/events`  *(fire-and-forget)*
Status stream — agent lifecycle, tool start/end, model changes.  
No reply needed. Extension ignores errors.

### `POST /api/permissions`  *(blocking long-poll)*
Tool call needs approval. Extension waits for reply (default 5 min timeout).  
Server must respond with `{ "decision": "allow" }` or `{ "decision": "deny" }`.

### `POST /api/questions`  *(blocking long-poll)*
`AskUserQuestion` was intercepted. Extension waits for reply.  
Server must respond with `{ "answers": { "<questionId>": "<optionId>" } }`.

See `src/protocol.ts` for all TypeScript types. These are the canonical source of truth for the Elixir backend contract.

## Configuration

Set environment variables before starting PI:

```bash
export BACKOFFICE_URL="https://your-backoffice.example.com"
export BACKOFFICE_API_KEY="your-secret-key"     # optional
export BACKOFFICE_TIMEOUT_MS=300000              # optional, default 5 min
```

## Event shapes

All events are wrapped in a common envelope:

```typescript
{
  id: string,           // unique event ID (UUID)
  sessionId: string,    // PI session ID
  sessionName?: string, // if /name was used
  cwd: string,          // working directory
  ts: number,           // unix ms
  model?: string,       // e.g. "anthropic/claude-sonnet-4"
  event: { type: "...", ...payload }
}
```

### Status event types

| type | payload |
|---|---|
| `session:start` | `{ reason }` |
| `session:renamed` | `{ name }` |
| `model:changed` | `{ model, previousModel? }` |
| `agent:start` | `{ prompt }` |
| `agent:settled` | `{ turnCount }` |
| `turn:start` | `{ turnIndex }` |
| `turn:end` | `{ turnIndex, toolCallCount }` |
| `tool:start` | `{ toolCallId, toolName, argsSummary }` |
| `tool:end` | `{ toolCallId, toolName, isError, durationMs }` |

### Session status (for the web UI to display)

```typescript
{
  sessionId, sessionName?, cwd, model?,
  state: "running" | "idle" | "error",
  lastTool?: { name, startedAt, endedAt?, isError? },
  turnCount,
  updatedAt
}
```
