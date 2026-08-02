// =============================================================================
// PI Backoffice Reporter — Protocol Definition
// =============================================================================
//
// Enabled only when PI_EXTERNAL_REPORTER=1 is set.
//
// Fire-and-forget events (no response needed):   StatusEvent
// Interactive events (server must reply):         PermissionEvent | QuestionEvent
//
// All events are identified by a stable `reporterId` derived from:
//   hostname + sessionId + sessionStartTime  → sha256 (hex, first 16 chars)
// This makes every event from the same PI session traceable across hosts.
//
// =============================================================================

// ---------------------------------------------------------------------------
// Common envelope — wraps every event sent to the server
// ---------------------------------------------------------------------------

export interface ReporterIdentity {
  /**
   * Stable ID for this PI session on this machine.
   * sha256(hostname + sessionId + sessionStartIso).slice(0, 16)
   * Included in every event — use as the primary correlation key.
   */
  reporterId: string;

  /** OS hostname — identifies which machine this is */
  hostname: string;

  /** Primary non-loopback IPv4 (or IPv6) of the host, best-effort */
  hostIp: string;

  /** PI session ID (internal) */
  sessionId: string;

  /** Session display name if /name was used */
  sessionName?: string;

  /** Absolute path to the session JSONL file (undefined if ephemeral) */
  sessionFile?: string;

  /** Working directory */
  cwd: string;

  /** ISO-8601 timestamp of when this session started */
  sessionStartIso: string;
}

export interface EventEnvelope<T extends BackofficeEvent> {
  /** Unique ID for this specific event emission (UUID) */
  id: string;

  /** Reporter identity — same for all events in one session */
  reporter: ReporterIdentity;

  /** Active model id, e.g. "anthropic/claude-sonnet-4" */
  model?: string;

  /** Unix timestamp (ms) of this event */
  ts: number;

  /** The event payload */
  event: T;
}

// ---------------------------------------------------------------------------
// Usage / context types (reused across events)
// ---------------------------------------------------------------------------

export interface TurnUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  costUsd: number;
}

export interface ContextUsage {
  tokens: number;
  /** 0–100 */
  percentage: number;
  model: string;
}

// ---------------------------------------------------------------------------
// Status events — fire and forget, no reply needed
// ---------------------------------------------------------------------------

export type AgentState = "running" | "idle" | "error";

// --- Session ---

export interface SessionStartEvent {
  type: "session:start";
  reason: "startup" | "new" | "resume" | "fork" | "reload";
  /**
   * Full system prompt text at session start.
   * Can be large — server should store compressed.
   */
  systemPrompt: string;
  /** Absolute path to session JSONL (undefined if ephemeral) */
  sessionFile?: string;
}

export interface SessionRenamedEvent {
  type: "session:renamed";
  name: string | undefined;
}

export interface SessionEndEvent {
  type: "session:end";
  reason: "quit" | "reload" | "new" | "resume" | "fork";
  /** Accumulated turns in this session */
  totalTurns: number;
  totalCostUsd: number;
  totalTokens: number;
}

// --- Model ---

export interface ModelChangedEvent {
  type: "model:changed";
  model: string;
  previousModel?: string;
}

// --- Agent lifecycle ---

export interface AgentStartEvent {
  type: "agent:start";
  /** User prompt that triggered the agent run */
  prompt: string;
  /**
   * System prompt at the time this agent run begins.
   * May differ from session start if extensions modify it per-turn.
   */
  systemPrompt: string;
  /** Session JSONL path — snapshot so the server can correlate */
  sessionFile?: string;
}

export interface AgentSettledEvent {
  type: "agent:settled";
  turnCount: number;
  totalCostUsd?: number;
  totalTokens?: number;
}

// --- Turns ---

export interface TurnStartEvent {
  type: "turn:start";
  turnIndex: number;
  /** Context window fill at turn start */
  contextUsage?: ContextUsage;
}

export interface TurnEndEvent {
  type: "turn:end";
  turnIndex: number;
  toolCallCount: number;
  stopReason: "stop" | "length" | "toolUse" | "error" | "aborted";
  usage?: TurnUsage;
  /** Context window fill after this turn */
  contextUsage?: ContextUsage;
  /** Model that handled this turn (may differ from session model) */
  model?: string;
  provider?: string;
}

// --- Tools ---

export interface ToolStartEvent {
  type: "tool:start";
  toolCallId: string;
  toolName: string;
  /** Redacted/summarized args */
  argsSummary: string;
}

export interface ToolEndEvent {
  type: "tool:end";
  toolCallId: string;
  toolName: string;
  isError: boolean;
  durationMs: number;
  /** bash exit code if applicable */
  exitCode?: number;
  /** Approximate result size in chars */
  resultSize?: number;
}

// --- Periodic context snapshot ---

export interface ContextSnapshotEvent {
  type: "context:snapshot";
  contextUsage: ContextUsage;
  /** Which turn triggered this snapshot */
  turnIndex: number;
}

// --- Union ---

export type StatusEvent =
  | SessionStartEvent
  | SessionRenamedEvent
  | SessionEndEvent
  | ModelChangedEvent
  | AgentStartEvent
  | AgentSettledEvent
  | TurnStartEvent
  | TurnEndEvent
  | ToolStartEvent
  | ToolEndEvent
  | ContextSnapshotEvent;

// ---------------------------------------------------------------------------
// Permission events — server MUST reply before PI continues
// ---------------------------------------------------------------------------

export interface PermissionRequestEvent {
  type: "permission:request";
  toolName: string;
  /** Human-readable summary */
  summary: string;
  /**
   * Tool input args.
   * bash:  { command: string }
   * write: { path: string }         ← content intentionally omitted
   * edit:  { path: string, editCount: number }
   */
  input: Record<string, unknown>;
}

export interface PermissionReply {
  decision: "allow" | "deny" | string;
}

// ---------------------------------------------------------------------------
// Question events — server MUST reply before PI continues
// ---------------------------------------------------------------------------

export interface QuestionOption {
  id: string;
  label: string;
  description: string;
  recommended?: boolean;
}

export interface QuestionItem {
  id: string;
  question: string;
  header: string;
  multiSelect: boolean;
  options: QuestionOption[];
  required: boolean;
}

export interface QuestionRequestEvent {
  type: "question:request";
  questions: QuestionItem[];
}

export interface QuestionReply {
  answers: Record<string, string | string[]>;
}

// ---------------------------------------------------------------------------
// Union of all event types
// ---------------------------------------------------------------------------

export type BackofficeEvent =
  | StatusEvent
  | PermissionRequestEvent
  | QuestionRequestEvent;

// ---------------------------------------------------------------------------
// Transport — what the extension POSTs and what it expects back
// ---------------------------------------------------------------------------

export type StatusPost      = EventEnvelope<StatusEvent>;
export type PermissionPost  = EventEnvelope<PermissionRequestEvent>;
export type QuestionPost    = EventEnvelope<QuestionRequestEvent>;

// ---------------------------------------------------------------------------
// Server API surface — canonical reference for Elixir Phoenix router
// ---------------------------------------------------------------------------

/**
 * POST /api/events
 *   Body:    StatusPost
 *   Returns: 200 | 204
 *
 * POST /api/permissions
 *   Body:    PermissionPost
 *   Returns: PermissionReply    (blocks, up to timeoutMs)
 *
 * POST /api/questions
 *   Body:    QuestionPost
 *   Returns: QuestionReply      (blocks, up to timeoutMs)
 *
 * GET  /api/pending
 *   Returns: PendingItem[]      (web UI polling or SSE source)
 *
 * GET  /api/sessions
 *   Returns: SessionStatus[]    (all known live sessions)
 *
 * GET  /api/sessions/:reporterId
 *   Returns: SessionStatus
 */

export interface PendingItem {
  id: string;
  reporter: ReporterIdentity;
  ts: number;
  kind: "permission" | "question";
  payload: PermissionRequestEvent | QuestionRequestEvent;
}

export interface SessionStatus {
  reporterId: string;
  hostname: string;
  hostIp: string;
  sessionName?: string;
  sessionFile?: string;
  cwd: string;
  model?: string;
  state: AgentState;
  contextUsage?: ContextUsage;
  lastTool?: {
    name: string;
    startedAt: number;
    endedAt?: number;
    isError?: boolean;
  };
  turnCount: number;
  totalCostUsd: number;
  totalTokens: number;
  updatedAt: number;
}
