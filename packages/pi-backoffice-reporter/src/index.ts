// =============================================================================
// PI Backoffice Reporter — Main Extension Entry
// =============================================================================
// Enabled only when PI_EXTERNAL_REPORTER=1 + BACKOFFICE_URL are set.
// =============================================================================

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { ReporterIdentity } from "./protocol.js";
import {
  buildEnvelope,
  buildIdentity,
  loadConfig,
  postPermission,
  postQuestion,
  postStatus,
} from "./transport.js";

const PERMISSION_TOOLS = new Set(["bash", "write", "edit"]);
const ASK_USER_QUESTION_TOOL = "AskUserQuestion";

// How often to emit a context:snapshot (every N turns)
const CONTEXT_SNAPSHOT_EVERY_N_TURNS = 5;

export default function (pi: ExtensionAPI) {
  const config = loadConfig();
  if (!config) return; // disabled

  // -------------------------------------------------------------------------
  // Session-scoped state — reset on session_start
  // -------------------------------------------------------------------------
  let identity: ReporterIdentity;
  let currentModel: string | undefined;
  let turnCount = 0;
  let totalCostUsd = 0;
  let totalTokens = 0;
  let sessionStartIso = new Date().toISOString();

  // Per-tool timing
  const toolStartTimes = new Map<string, number>();

  // Pending AskUserQuestion: toolCallId → eventId (for tool_result override)
  const pendingQuestions = new Map<string, string>();

  function meta() {
    return { identity, model: currentModel };
  }

  // -------------------------------------------------------------------------
  // Session events
  // -------------------------------------------------------------------------

  pi.on("session_start", async (event, ctx) => {
    sessionStartIso = new Date().toISOString();
    turnCount = 0;
    totalCostUsd = 0;
    totalTokens = 0;

    const sessionFile = ctx.sessionManager.getSessionFile() ?? undefined;

    identity = buildIdentity(
      crypto.randomUUID(), // stable for this session runtime
      sessionStartIso,
      sessionFile,
      pi.getSessionName() ?? undefined,
      ctx.cwd,
    );

    await postStatus(
      config,
      buildEnvelope(
        {
          type: "session:start",
          reason: event.reason,
          systemPrompt: ctx.getSystemPrompt(),
          sessionFile,
        },
        identity,
        currentModel,
      ),
    );
  });

  pi.on("session_info_changed", async (event) => {
    identity = { ...identity, sessionName: event.name };
    await postStatus(config, buildEnvelope({ type: "session:renamed", name: event.name }, identity, currentModel));
  });

  pi.on("session_shutdown", async (event) => {
    await postStatus(
      config,
      buildEnvelope(
        {
          type: "session:end",
          reason: event.reason,
          totalTurns: turnCount,
          totalCostUsd,
          totalTokens,
        },
        identity,
        currentModel,
      ),
    );
  });

  pi.on("model_select", async (event) => {
    currentModel = `${event.model.provider}/${event.model.id}`;
    await postStatus(
      config,
      buildEnvelope(
        {
          type: "model:changed",
          model: currentModel,
          previousModel: event.previousModel
            ? `${event.previousModel.provider}/${event.previousModel.id}`
            : undefined,
        },
        identity,
        currentModel,
      ),
    );
  });

  // -------------------------------------------------------------------------
  // Agent lifecycle
  // -------------------------------------------------------------------------

  pi.on("before_agent_start", async (event, ctx) => {
    await postStatus(
      config,
      buildEnvelope(
        {
          type: "agent:start",
          prompt: event.prompt,
          systemPrompt: event.systemPrompt,
          sessionFile: ctx.sessionManager.getSessionFile() ?? undefined,
        },
        identity,
        currentModel,
      ),
    );
  });

  pi.on("agent_settled", async () => {
    await postStatus(
      config,
      buildEnvelope(
        { type: "agent:settled", turnCount, totalCostUsd, totalTokens },
        identity,
        currentModel,
      ),
    );
  });

  // -------------------------------------------------------------------------
  // Turns — with usage + context snapshot
  // -------------------------------------------------------------------------

  pi.on("turn_start", async (event, ctx) => {
    const contextUsage = ctx.getContextUsage() ?? undefined;

    await postStatus(
      config,
      buildEnvelope(
        { type: "turn:start", turnIndex: event.turnIndex, contextUsage },
        identity,
        currentModel,
      ),
    );
  });

  pi.on("turn_end", async (event, ctx) => {
    turnCount++;

    const msg = event.message;
    const usage = msg?.usage
      ? {
          inputTokens: msg.usage.input,
          outputTokens: msg.usage.output,
          cacheReadTokens: msg.usage.cacheRead,
          cacheWriteTokens: msg.usage.cacheWrite,
          totalTokens: msg.usage.totalTokens,
          costUsd: msg.usage.cost?.total ?? 0,
        }
      : undefined;

    if (usage) {
      totalCostUsd += usage.costUsd;
      totalTokens += usage.totalTokens;
    }

    const contextUsage = ctx.getContextUsage() ?? undefined;

    await postStatus(
      config,
      buildEnvelope(
        {
          type: "turn:end",
          turnIndex: event.turnIndex,
          toolCallCount: event.toolResults?.length ?? 0,
          stopReason: msg?.stopReason ?? "stop",
          usage,
          contextUsage,
          model: msg?.model,
          provider: msg?.provider,
        },
        identity,
        currentModel,
      ),
    );

    // Periodic context snapshot every N turns
    if (contextUsage && turnCount % CONTEXT_SNAPSHOT_EVERY_N_TURNS === 0) {
      await postStatus(
        config,
        buildEnvelope(
          { type: "context:snapshot", contextUsage, turnIndex: event.turnIndex },
          identity,
          currentModel,
        ),
      );
    }
  });

  // -------------------------------------------------------------------------
  // Tool lifecycle
  // -------------------------------------------------------------------------

  pi.on("tool_execution_start", async (event) => {
    toolStartTimes.set(event.toolCallId, Date.now());

    const argsSummary = summarizeArgs(event.toolName, event.args as Record<string, unknown>);

    await postStatus(
      config,
      buildEnvelope(
        { type: "tool:start", toolCallId: event.toolCallId, toolName: event.toolName, argsSummary },
        identity,
        currentModel,
      ),
    );
  });

  pi.on("tool_execution_end", async (event) => {
    const startedAt = toolStartTimes.get(event.toolCallId) ?? Date.now();
    toolStartTimes.delete(event.toolCallId);

    const resultText = event.result?.content
      ?.filter((c: { type: string }) => c.type === "text")
      .map((c: { text: string }) => c.text)
      .join("") ?? "";

    await postStatus(
      config,
      buildEnvelope(
        {
          type: "tool:end",
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          isError: event.isError,
          durationMs: Date.now() - startedAt,
          resultSize: resultText.length,
        },
        identity,
        currentModel,
      ),
    );
  });

  // -------------------------------------------------------------------------
  // Permission gate
  // -------------------------------------------------------------------------

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName === ASK_USER_QUESTION_TOOL) {
      // Mark for tool_result interception
      pendingQuestions.set(event.toolCallId, crypto.randomUUID());
      return undefined;
    }

    if (!PERMISSION_TOOLS.has(event.toolName)) return undefined;

    ctx.ui.setStatus("backoffice", "⏳ Waiting for remote approval…");

    const reply = await postPermission(
      config,
      buildEnvelope(
        {
          type: "permission:request",
          toolName: event.toolName,
          summary: summarizeArgs(event.toolName, event.input as Record<string, unknown>),
          input: safePermissionInput(event.toolName, event.input as Record<string, unknown>),
        },
        identity,
        currentModel,
      ),
      ctx.signal,
    );

    ctx.ui.setStatus("backoffice", "");

    if (reply.decision !== "allow") {
      return { block: true, reason: reply.decision };
    }
    return undefined;
  });

  // -------------------------------------------------------------------------
  // Question intercept — override tool_result with remote answer
  // -------------------------------------------------------------------------

  pi.on("tool_result", async (event, ctx) => {
    if (event.toolName !== ASK_USER_QUESTION_TOOL) return;

    const _questionId = pendingQuestions.get(event.toolCallId);
    if (!_questionId) return;
    pendingQuestions.delete(event.toolCallId);

    ctx.ui.setStatus("backoffice", "⏳ Waiting for remote answer…");

    const reply = await postQuestion(
      config,
      buildEnvelope(
        {
          type: "question:request",
          questions: (event as unknown as { input: { questions: unknown[] } }).input.questions as never,
        },
        identity,
        currentModel,
      ),
      ctx.signal,
    );

    ctx.ui.setStatus("backoffice", "");

    if (!reply) return;

    return {
      content: [{ type: "text" as const, text: JSON.stringify(reply.answers) }],
      isError: false,
    };
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function summarizeArgs(toolName: string, input: Record<string, unknown>): string {
  if (toolName === "bash") return String(input.command ?? "").slice(0, 300);
  if (toolName === "write") return `write → ${input.path}`;
  if (toolName === "edit") return `edit → ${input.path}`;
  if (toolName === "read") return `read → ${input.path}`;
  return JSON.stringify(input).slice(0, 200);
}

/** Strip large/sensitive fields from permission input before sending */
function safePermissionInput(
  toolName: string,
  input: Record<string, unknown>,
): Record<string, unknown> {
  if (toolName === "bash") return { command: input.command };
  if (toolName === "write") return { path: input.path }; // no content
  if (toolName === "edit") {
    const edits = Array.isArray(input.edits) ? input.edits : [];
    return { path: input.path, editCount: edits.length };
  }
  return input;
}
