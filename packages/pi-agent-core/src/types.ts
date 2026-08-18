import { randomUUID } from "node:crypto";

/**
 * Constants & Guardrails
 */
export const MAX_RECURSION_DEPTH = 10;
export const DEFAULT_TURN_BUDGET = 20;
export const DEFAULT_MAX_CONCURRENT_RUNS = 4;
export const DEFAULT_SUBAGENT_TIMEOUT_MS = 300_000; // 5 minutes

export const SUPPORTED_RUNTIMES = [
  "pi-inprocess",
  "pi-subprocess",
  "claude",
  "codex",
] as const;

export type RuntimeType = (typeof SUPPORTED_RUNTIMES)[number];

export const SUPPORTED_THINKING_LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

export type ThinkingLevel = (typeof SUPPORTED_THINKING_LEVELS)[number];

export type AgentSource =
  | "bundled"
  | "user"
  | "claude"
  | "project"
  | "inline";

export type ModelTier = "cheap" | "balanced" | "max";

/**
 * Agent Definition schema
 */
export interface AgentDefinition {
  name: string;
  description: string;
  runtime?: RuntimeType;
  model?: string;
  thinking?: ThinkingLevel | boolean;
  tools?: string[];
  worktree?: boolean;
  turnBudget?: number;
  timeout?: number;
  systemPrompt?: string;
  prompt?: string;
  source?: AgentSource;
  path?: string;
  tier?: ModelTier;
  skills?: string[];
  params?: Record<string, unknown>;
}

/**
 * Run State Machine
 */
export type RunState = "PENDING" | "RUNNING" | "DONE";

export type RunStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "aborted"
  | "budget_limited"
  | "time_limited";

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
  total: number;
}

export interface ToolCallRecord {
  tool: string;
  args: unknown;
  result?: unknown;
  timestamp: number;
}

/**
 * Execution Options for dispatching an agent
 */
export interface ExecutionOptions {
  agent: string | AgentDefinition;
  prompt: string;
  cwd?: string;
  worktree?: boolean | string;
  runtime?: RuntimeType;
  model?: string;
  thinking?: ThinkingLevel | boolean;
  tools?: string[];
  turnBudget?: number;
  timeout?: number;
  parentRunId?: string;
  depth?: number;
  env?: Record<string, string>;
  onUpdate?: (update: RunUpdate) => void;
  signal?: AbortSignal;
  replayKey?: string;
  sessionId?: string;
  taskForDisplay?: string;
}

export interface RunUpdate {
  runId: string;
  status: RunStatus;
  turns?: number;
  lastMessage?: string;
  thought?: string;
  toolCall?: { tool: string; args: unknown; result?: unknown };
  tokens?: TokenUsage;
}

/**
 * Complete record of a single subagent execution
 */
export interface RunRecord {
  id: string;
  runId?: string;
  agent: string;
  runtime: RuntimeType;
  status: RunStatus;
  state: RunState;
  prompt: string;
  output: string;
  error?: string;
  exitCode?: number;
  turns: number;
  turnBudget: number;
  tokens: TokenUsage;
  cost?: number;
  model?: string;
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  depth: number;
  parentRunId?: string;
  worktreePath?: string;
  verdict?: "PASS" | "FAIL" | "PARTIAL" | string;
  diff?: string;
  artifacts?: string[];
  toolCalls?: ToolCallRecord[];
  replayKey?: string;
}

/**
 * Workflow Orchestration Types
 */
export interface WorkflowMeta {
  name: string;
  description?: string;
  phases?: string[];
}

export interface WorkflowPhase {
  name: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  error?: string;
}

export interface WorkflowResult {
  id: string;
  name: string;
  status: "running" | "completed" | "failed" | "aborted";
  output?: unknown;
  phases: WorkflowPhase[];
  runs: RunRecord[];
  error?: string;
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
}

/**
 * Validation & Factory Utilities
 */

const AGENT_NAME_REGEX = /^[a-zA-Z0-9_.-]+$/;

export interface ValidationResult<T> {
  valid: boolean;
  errors: string[];
  agent?: T;
  options?: T;
}

export function validateAgentDefinition(
  raw: unknown
): ValidationResult<AgentDefinition> {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object") {
    return { valid: false, errors: ["Agent definition must be a non-null object"] };
  }

  const obj = raw as Record<string, unknown>;

  if (typeof obj.name !== "string" || !obj.name.trim()) {
    errors.push("Agent name is required and must be a non-empty string");
  } else if (!AGENT_NAME_REGEX.test(obj.name.trim())) {
    errors.push(`Agent name '${obj.name}' contains invalid characters. Use alphanumeric, dash, dot, or underscore.`);
  }

  if (typeof obj.description !== "string" || !obj.description.trim()) {
    errors.push("Agent description is required and must be a non-empty string");
  }

  let runtime: RuntimeType = "pi-inprocess";
  if (obj.runtime !== undefined) {
    if (
      typeof obj.runtime !== "string" ||
      !SUPPORTED_RUNTIMES.includes(obj.runtime as RuntimeType)
    ) {
      errors.push(
        `Invalid runtime '${String(obj.runtime)}'. Supported: ${SUPPORTED_RUNTIMES.join(", ")}`
      );
    } else {
      runtime = obj.runtime as RuntimeType;
    }
  }

  let thinking: ThinkingLevel | boolean | undefined;
  if (obj.thinking !== undefined) {
    if (typeof obj.thinking === "boolean") {
      thinking = obj.thinking;
    } else if (
      typeof obj.thinking === "string" &&
      SUPPORTED_THINKING_LEVELS.includes(obj.thinking as ThinkingLevel)
    ) {
      thinking = obj.thinking as ThinkingLevel;
    } else {
      errors.push(
        `Invalid thinking level '${String(obj.thinking)}'. Supported: boolean or ${SUPPORTED_THINKING_LEVELS.join(", ")}`
      );
    }
  }

  const turnBudget =
    typeof obj.turnBudget === "number" && obj.turnBudget > 0
      ? obj.turnBudget
      : DEFAULT_TURN_BUDGET;

  const worktree = Boolean(obj.worktree);

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const agent: AgentDefinition = {
    name: (obj.name as string).trim(),
    description: (obj.description as string).trim(),
    runtime,
    model: typeof obj.model === "string" ? obj.model : undefined,
    thinking,
    tools: Array.isArray(obj.tools) ? obj.tools.map(String) : undefined,
    worktree,
    turnBudget,
    timeout: typeof obj.timeout === "number" ? obj.timeout : undefined,
    systemPrompt:
      typeof obj.systemPrompt === "string" ? obj.systemPrompt : undefined,
    prompt: typeof obj.prompt === "string" ? obj.prompt : undefined,
    source: typeof obj.source === "string" ? (obj.source as AgentSource) : "bundled",
    path: typeof obj.path === "string" ? obj.path : undefined,
    tier: typeof obj.tier === "string" ? (obj.tier as ModelTier) : undefined,
    skills: Array.isArray(obj.skills) ? obj.skills.map(String) : undefined,
    params:
      obj.params && typeof obj.params === "object"
        ? (obj.params as Record<string, unknown>)
        : undefined,
  };

  return { valid: true, errors: [], agent };
}

export function validateExecutionOptions(
  raw: unknown
): ValidationResult<ExecutionOptions> {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object") {
    return { valid: false, errors: ["Execution options must be an object"] };
  }

  const obj = raw as Record<string, unknown>;

  if (
    !obj.agent ||
    (typeof obj.agent !== "string" && typeof obj.agent !== "object")
  ) {
    errors.push("Agent must be specified as name string or AgentDefinition");
  } else if (typeof obj.agent === "string" && !obj.agent.trim()) {
    errors.push("Agent name string must not be empty");
  }

  if (typeof obj.prompt !== "string" || !obj.prompt.trim()) {
    errors.push("Prompt is required and must not be empty");
  }

  const depth = typeof obj.depth === "number" ? obj.depth : 0;
  if (depth > MAX_RECURSION_DEPTH) {
    errors.push(
      `Exceeded max recursion depth of ${MAX_RECURSION_DEPTH} (requested depth: ${depth}). Prevented delegation cycle.`
    );
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const options: ExecutionOptions = {
    agent: obj.agent as string | AgentDefinition,
    prompt: (obj.prompt as string).trim(),
    cwd: typeof obj.cwd === "string" ? obj.cwd : undefined,
    worktree: typeof obj.worktree === "boolean" || typeof obj.worktree === "string" ? obj.worktree : undefined,
    runtime: typeof obj.runtime === "string" ? (obj.runtime as RuntimeType) : undefined,
    model: typeof obj.model === "string" ? obj.model : undefined,
    thinking: obj.thinking as ThinkingLevel | boolean | undefined,
    tools: Array.isArray(obj.tools) ? obj.tools.map(String) : undefined,
    turnBudget: typeof obj.turnBudget === "number" ? obj.turnBudget : DEFAULT_TURN_BUDGET,
    timeout: typeof obj.timeout === "number" ? obj.timeout : DEFAULT_SUBAGENT_TIMEOUT_MS,
    parentRunId: typeof obj.parentRunId === "string" ? obj.parentRunId : undefined,
    depth,
    env: obj.env && typeof obj.env === "object" ? (obj.env as Record<string, string>) : undefined,
    onUpdate: typeof obj.onUpdate === "function" ? (obj.onUpdate as (update: RunUpdate) => void) : undefined,
    signal: obj.signal instanceof AbortSignal ? obj.signal : undefined,
    replayKey: typeof obj.replayKey === "string" ? obj.replayKey : undefined,
    sessionId: typeof obj.sessionId === "string" ? obj.sessionId : undefined,
    taskForDisplay: typeof obj.taskForDisplay === "string" ? obj.taskForDisplay : undefined,
  };

  return { valid: true, errors: [], options };
}

export function createRunRecord(
  initial: {
    agent: string;
    prompt: string;
    runtime?: RuntimeType;
    depth?: number;
    parentRunId?: string;
    turnBudget?: number;
    worktreePath?: string;
    replayKey?: string;
  }
): RunRecord {
  const id = `run_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  return {
    id,
    runId: id,
    agent: initial.agent,
    runtime: initial.runtime ?? "pi-inprocess",
    status: "pending",
    state: "PENDING",
    prompt: initial.prompt,
    output: "",
    turns: 0,
    turnBudget: initial.turnBudget ?? DEFAULT_TURN_BUDGET,
    tokens: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
    },
    startedAt: Date.now(),
    depth: initial.depth ?? 0,
    parentRunId: initial.parentRunId,
    worktreePath: initial.worktreePath,
    replayKey: initial.replayKey,
    toolCalls: [],
  };
}

export function createWorkflowResult(meta: WorkflowMeta): WorkflowResult {
  const id = `wf_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const phases: WorkflowPhase[] = (meta.phases ?? []).map((p) => ({
    name: p,
    status: "pending",
  }));

  return {
    id,
    name: meta.name,
    status: "running",
    phases,
    runs: [],
    startedAt: Date.now(),
  };
}
