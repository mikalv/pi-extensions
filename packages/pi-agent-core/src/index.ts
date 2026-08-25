import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { ControlPlane, type ControlPlaneOptions } from "./control/index.js";
import { discoverAgents, listAgents, type DiscoveryOptions } from "./discovery/index.js";
import {
  AuditLogger,
  formatTaskNotificationXml,
  type AuditLoggerOptions,
} from "./observability/index.js";
import { SuperpowersBridge } from "./superpowers-bridge.js";
import {
  createRunRecord,
  MAX_RECURSION_DEPTH,
  type AgentDefinition,
  type ExecutionOptions,
  type RunRecord,
  type WorkflowResult,
} from "./types.js";
import { Key, matchesKey } from "@earendil-works/pi-tui";
import {
  ActiveWidgetController,
  openHistoryModal,
  openPeekModal,
  openWorkflowsView,
  renderSubagentToolCall,
  renderSubagentToolResult,
  type ActiveWidgetOptions,
} from "./ui/index.js";
import { WorkflowRunner } from "./workflow/index.js";

export * from "./types.js";
export * from "./discovery/index.js";
export * from "./runtimes/index.js";
export * from "./control/index.js";
export * from "./workflow/index.js";
export * from "./observability/index.js";
export * from "./ui/index.js";
export * from "./superpowers-bridge.js";

export interface PiAgentCoreExtensionOptions {
  controlPlane?: ControlPlane;
  controlPlaneOptions?: ControlPlaneOptions;
  auditLogger?: AuditLogger;
  historyDir?: string;
  sessionsDir?: string;
  widgetOptions?: ActiveWidgetOptions;
  runnerResolver?: (agent: AgentDefinition) => any;
}

/**
 * Pi Extension Entrypoint for pi-agent-core.
 */
export default function piAgentCoreExtension(
  pi: ExtensionAPI,
  options?: PiAgentCoreExtensionOptions
): void {
  const controlPlane =
    options?.controlPlane ??
    new ControlPlane({
      runnerResolver: options?.runnerResolver,
      ...options?.controlPlaneOptions,
    });

  const auditLogger =
    options?.auditLogger ??
    new AuditLogger({ historyDir: options?.historyDir });

  const workflowRunner = new WorkflowRunner({ controlPlane });
  const widget = new ActiveWidgetController(options?.widgetOptions);
  const superpowers = new SuperpowersBridge({ controlPlane });

  const recordedWorkflows: WorkflowResult[] = [];
  let currentSessionContext: any = null;

  function updateWidget() {
    if (currentSessionContext) {
      const activeRuns = controlPlane.getActiveRuns();
      const activeWorkflows = recordedWorkflows.filter((w) => w.status === "running");
      widget.update(currentSessionContext, activeRuns, activeWorkflows);
    }
  }

  // Wire ControlPlane & Workflow events to widget
  controlPlane.on("run:start", () => updateWidget());
  controlPlane.on("run:update", () => updateWidget());
  controlPlane.on("run:done", () => updateWidget());
  workflowRunner.on("workflow:start", (wf) => {
    recordedWorkflows.push(wf);
    updateWidget();
  });
  workflowRunner.on("workflow:complete", () => updateWidget());
  workflowRunner.on("workflow:error", () => updateWidget());

  // Hook session_start
  let unsubTerminalInput: (() => void) | null = null;

  async function getRunsForSelection(ctx: any): Promise<RunRecord[]> {
    const memoryRuns = controlPlane.getAllRuns();
    if (memoryRuns.length > 0) return memoryRuns;

    try {
      const records = await auditLogger.query({ limit: 30 });
      return records.map((r) => ({
        id: r.runId,
        agent: r.agent,
        prompt: r.prompt,
        runtime: (r.runtime as any) || "pi-inprocess",
        depth: r.depth,
        turnBudget: 20,
        status: r.status as any,
        state: "DONE",
        startedAt: r.startedAt || 0,
        completedAt: r.completedAt,
        durationMs: r.durationMs,
        turns: r.turns,
        tokens: r.tokens,
        output: r.output || "",
        error: r.error,
      }));
    } catch {
      return [];
    }
  }

  function setupTerminalInputListener(ctx: any) {
    unsubTerminalInput?.();
    unsubTerminalInput = null;

    if (!ctx?.hasUI || !ctx?.ui?.onTerminalInput) return;

    unsubTerminalInput = ctx.ui.onTerminalInput((data: string) => {
      // Trigger interactive subagent history overlay on Arrow Left or Arrow Down in empty editor prompt
      const isArrowDown = matchesKey(data, Key.down) || data === "\x1b[B" || data === "\x1bOB" || data === "\x1b[b";
      const isArrowLeft = matchesKey(data, Key.left) || data === "\x1b[D" || data === "\x1bOD" || data === "\x1b[d";

      if (isArrowDown || isArrowLeft) {
        const editorText = (ctx.ui.getEditorText?.() ?? "").trim();
        if (editorText.length === 0) {
          getRunsForSelection(ctx).then((runs) => {
            if (runs.length > 0) {
              openHistoryModal(runs, ctx);
            }
          });
          return true; // Consume key
        }
      }
      return undefined;
    });
  }

  pi.on("session_start", (_event: any, ctx: any) => {
    currentSessionContext = ctx;
    setupTerminalInputListener(ctx);
    updateWidget();
  });

  pi.on("session_tree", (_event: any, ctx: any) => {
    currentSessionContext = ctx;
    setupTerminalInputListener(ctx);
    updateWidget();
  });

  // ---------------------------------------------------------------------------
  // 1. Tool Registration: `subagent`
  // ---------------------------------------------------------------------------
  pi.registerTool({
    name: "subagent",
    description:
      "Execute a delegated subagent task using the pi-agent-core unified control plane. Supports pluggable runtimes (pi-inprocess, pi-subprocess, claude, codex), recursion guardrails (Depth: N/10), live steering, and structured audit logs.",
    parameters: Type.Object({
      agent: Type.String({
        description:
          "Agent name to execute (e.g. 'worker', 'explorer', 'planner', 'coder', 'reviewer', 'verifier', 'sp-brainstorm')",
      }),
      prompt: Type.String({
        description: "The concrete task prompt or instructions for the subagent",
      }),
      runtime: Type.Optional(
        Type.String({
          description:
            "Execution runtime override: 'pi-inprocess' (fast direct), 'pi-subprocess' (isolated child process), 'claude', or 'codex'",
        })
      ),
      model: Type.Optional(
        Type.String({ description: "Model override for this subagent execution" })
      ),
      thinking: Type.Optional(
        Type.Union([Type.String(), Type.Boolean()], {
          description:
            "Thinking level override: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max' | boolean",
        })
      ),
      tools: Type.Optional(
        Type.Array(Type.String(), {
          description: "List of allowed tools for this subagent",
        })
      ),
      turnBudget: Type.Optional(
        Type.Number({ description: "Maximum turns before wrapping up (default 20)" })
      ),
      timeout: Type.Optional(
        Type.Number({ description: "Execution timeout in milliseconds" })
      ),
      worktree: Type.Optional(
        Type.Union([Type.Boolean(), Type.String()], {
          description: "Optional isolated git worktree for execution",
        })
      ),
      depth: Type.Optional(
        Type.Number({ description: "Current delegation depth (enforces Depth: N/10 limit)" })
      ),
    }),
    async execute(_toolCallId: string, params: any, signal: AbortSignal | undefined, onUpdate: any, ctx: any) {
      currentSessionContext = ctx;

      const requestedDepth = typeof params.depth === "number" ? params.depth : 0;
      if (requestedDepth > MAX_RECURSION_DEPTH) {
        return {
          content: [
            {
              type: "text",
              text: `Error: Exceeded max recursion depth of ${MAX_RECURSION_DEPTH} (requested depth: ${requestedDepth}). Delegation loop prevented.`,
            },
          ],
          details: {
            success: false,
            error: "Exceeded max recursion depth",
            depth: requestedDepth,
          },
        };
      }

      // Discover agent definition if possible
      let agentDef: AgentDefinition | undefined;
      try {
        const discovered = await discoverAgents({ cwd: ctx?.cwd });
        agentDef = discovered.get(params.agent);
      } catch {
        // use inline fallback
      }

      const execOptions: ExecutionOptions = {
        agent: agentDef ?? params.agent,
        prompt: params.prompt,
        runtime: params.runtime,
        model: params.model,
        thinking: params.thinking,
        tools: params.tools,
        turnBudget: params.turnBudget,
        timeout: params.timeout,
        worktree: params.worktree,
        depth: requestedDepth,
        cwd: ctx?.cwd,
        ctx,
        signal,
        onUpdate: (u) => {
          onUpdate?.({
            content: [
              {
                type: "text",
                text: typeof u === "string" ? u : (u?.lastMessage || `[subagent: ${params.agent} running...]`),
              },
            ],
            details: u,
          });
          updateWidget();
        },
      };

      try {
        updateWidget();
        const record = await controlPlane.dispatch(execOptions, agentDef);

        // Append to audit log
        await auditLogger.append(record, { sessionId: ctx?.sessionManager?.sessionId });

        const xml = formatTaskNotificationXml(record);
        const textOutput = [
          record.output || `Subagent ${record.agent} completed with status: ${record.status}`,
          "",
          xml,
        ].join("\n");

        return {
          content: [{ type: "text", text: textOutput }],
          details: {
            success: record.status === "completed",
            runId: record.id,
            agent: record.agent,
            status: record.status,
            turns: record.turns,
            tokens: record.tokens,
            durationMs: record.durationMs,
            error: record.error,
          },
        };
      } catch (err: any) {
        const errorRecord = createRunRecord({
          agent: params.agent,
          prompt: params.prompt,
          runtime: params.runtime,
          depth: requestedDepth,
        });
        errorRecord.status = "failed";
        errorRecord.error = err?.message || String(err);
        errorRecord.completedAt = Date.now();
        errorRecord.durationMs = errorRecord.completedAt - errorRecord.startedAt;

        await auditLogger.append(errorRecord, { sessionId: ctx?.sessionManager?.sessionId });

        return {
          content: [
            {
              type: "text",
              text: `Subagent ${params.agent} failed: ${err?.message || String(err)}`,
            },
          ],
          details: {
            success: false,
            error: err?.message || String(err),
            agent: params.agent,
          },
        };
      } finally {
        updateWidget();
      }
    },
    renderCall(args: any, theme: any, context?: any) {
      return renderSubagentToolCall(args, theme, context);
    },
    renderResult(result: any, options: any, theme: any) {
      return renderSubagentToolResult(result, options, theme);
    },
  });

  // ---------------------------------------------------------------------------
  // 2. Slash Commands Registration
  // ---------------------------------------------------------------------------

  // /sub:list
  pi.registerCommand("sub:list", {
    description: "List all available discovered subagents (bundled, global, project)",
    handler: async (_args: string, ctx: any) => {
      currentSessionContext = ctx;
      try {
        const agents = await listAgents({ cwd: ctx?.cwd });
        const lines: string[] = [
          "================================================================================",
          ` Available Subagents (${agents.length})`,
          "================================================================================",
        ];

        for (const a of agents) {
          const source = a.source ? ` [${a.source}]` : "";
          const runtime = a.runtime ? ` (${a.runtime})` : "";
          lines.push(`• ${a.name}${source}${runtime}: ${a.description}`);
        }
        lines.push("================================================================================");

        const text = lines.join("\n");
        if (ctx.hasUI && ctx.ui?.editor) {
          await ctx.ui.editor("Available Subagents", text);
        } else if (ctx.hasUI && ctx.ui?.notify) {
          ctx.ui.notify(`Available Subagents (${agents.length}) - see console`, "info");
          process.stdout.write(`\n${text}\n`);
        } else {
          process.stdout.write(`\n${text}\n`);
        }
      } catch (err: any) {
        ctx.ui?.notify?.(`Failed to list agents: ${err.message}`, "error");
      }
    },
  });

  // /sub:peek <id>
  pi.registerCommand("sub:peek", {
    description: "Peek at a live running or completed subagent transcript (interactive overlay)",
    getArgumentCompletions: async () => {
      const all = controlPlane.getAllRuns();
      return all.map((r) => ({ value: r.id, label: `${r.agent} [${r.id}] (${r.status})` }));
    },
    handler: async (args: string, ctx: any) => {
      currentSessionContext = ctx;
      const trimmed = args.trim();
      let run: RunRecord | undefined;

      if (trimmed) {
        run = controlPlane.getRun(trimmed);
      } else {
        const all = controlPlane.getAllRuns();
        if (all.length === 1) {
          run = all[0];
        } else if (all.length > 1) {
          await openHistoryModal(all, ctx);
          return;
        }
      }

      if (!run) {
        ctx.ui?.notify?.("No subagent run found. Use /sub:peek or /sub:history to browse.", "warning");
        return;
      }

      await openPeekModal(run, ctx);
    },
  });

  // /sub:steer <id> <message>
  pi.registerCommand("sub:steer", {
    description: "Send a live steering message to a running subagent",
    handler: async (args: string, ctx: any) => {
      currentSessionContext = ctx;
      const parts = args.trim().split(/\s+/);
      const active = controlPlane.getActiveRuns();

      if (parts.length < 2) {
        ctx.ui?.notify?.("Usage: /sub:steer <runId> <message>", "warning");
        return;
      }

      const runId = parts[0];
      const message = parts.slice(1).join(" ");

      const success = controlPlane.steer(runId, message);
      if (success) {
        ctx.ui?.notify?.(`Steering message sent to ${runId}`, "info");
      } else {
        ctx.ui?.notify?.(`Run ${runId} is not currently running or accepts steering`, "error");
      }
    },
  });

  // /sub:abort <id>
  pi.registerCommand("sub:abort", {
    description: "Abort a running subagent",
    handler: async (args: string, ctx: any) => {
      currentSessionContext = ctx;
      const runId = args.trim();
      if (!runId) {
        const active = controlPlane.getActiveRuns();
        if (active.length === 1) {
          controlPlane.abort(active[0].id);
          ctx.ui?.notify?.(`Aborted run ${active[0].id}`, "info");
          return;
        }
        ctx.ui?.notify?.("Usage: /sub:abort <runId>", "warning");
        return;
      }

      const success = controlPlane.abort(runId);
      if (success) {
        ctx.ui?.notify?.(`Aborted run ${runId}`, "info");
      } else {
        ctx.ui?.notify?.(`Could not find active run ${runId} to abort`, "error");
      }
    },
  });

  // /sub:history
  pi.registerCommand("sub:history", {
    description: "Show interactive subagent history overlay modal",
    handler: async (_args: string, ctx: any) => {
      currentSessionContext = ctx;
      try {
        const runs = controlPlane.getAllRuns();
        if (runs.length > 0) {
          await openHistoryModal(runs, ctx);
        } else {
          const records = await auditLogger.query({ limit: 30 });
          if (records.length === 0) {
            ctx.ui?.notify?.("No subagent runs recorded yet.", "info");
            return;
          }
          const synthRuns: RunRecord[] = records.map((r) => ({
            id: r.runId,
            agent: r.agent,
            prompt: r.prompt,
            runtime: (r.runtime as any) || "pi-inprocess",
            depth: r.depth,
            turnBudget: 20,
            status: r.status as any,
            state: "DONE",
            startedAt: r.startedAt || 0,
            completedAt: r.completedAt,
            durationMs: r.durationMs,
            turns: r.turns,
            tokens: r.tokens,
            output: r.output || "",
            error: r.error,
          }));
          await openHistoryModal(synthRuns, ctx);
        }
      } catch (err: any) {
        ctx.ui?.notify?.(`Failed to load history: ${err.message}`, "error");
      }
    },
  });

  // /workflows
  pi.registerCommand("workflows", {
    description: "View active and recorded workflow execution trees",
    handler: async (_args: string, ctx: any) => {
      currentSessionContext = ctx;
      await openWorkflowsView(recordedWorkflows, ctx);
    },
  });

  // Superpowers Bridges: /sp-brainstorm, /sp-plan, /sp-implement
  pi.registerCommand("sp-brainstorm", {
    description: "Run Superpowers brainstorming discipline on a topic",
    handler: async (args: string, ctx: any) => {
      currentSessionContext = ctx;
      const topic = args.trim() || "System architecture & feature exploration";
      ctx.ui?.notify?.(`Starting Superpowers brainstorming on: ${topic}`, "info");
      await superpowers.dispatchBrainstorm(topic, { cwd: ctx?.cwd });
    },
  });

  pi.registerCommand("sp-plan", {
    description: "Generate a bite-sized TDD implementation plan for a feature",
    handler: async (args: string, ctx: any) => {
      currentSessionContext = ctx;
      const feature = args.trim() || "Feature implementation";
      ctx.ui?.notify?.(`Generating Superpowers implementation plan for: ${feature}`, "info");
      await superpowers.dispatchPlan(feature, { cwd: ctx?.cwd });
    },
  });

  pi.registerCommand("sp-implement", {
    description: "Execute a task following strict TDD implementation discipline",
    handler: async (args: string, ctx: any) => {
      currentSessionContext = ctx;
      const task = args.trim() || "Implement approved task";
      ctx.ui?.notify?.(`Executing Superpowers implementation for: ${task}`, "info");
      await superpowers.dispatchImplement(task, { cwd: ctx?.cwd });
    },
  });
}
