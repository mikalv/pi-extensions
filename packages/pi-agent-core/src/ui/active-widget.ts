import type { RunRecord, WorkflowResult } from "../types.js";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

const ACTIVITY_LABEL_MAX_CHARS = 96;
const IDLE_WARNING_MS = 60_000;

/**
 * Collapse a runner activity line to a single readable label.
 */
function activityLabel(run: RunRecord): string | undefined {
  const line = run.lastLine
    ?.replace(/\s*\n+\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  const text = line || (run.lastToolName ? `tool: ${run.lastToolName}` : undefined);
  if (!text) return undefined;
  return text.length > ACTIVITY_LABEL_MAX_CHARS
    ? `${text.slice(0, ACTIVITY_LABEL_MAX_CHARS - 1)}…`
    : text;
}

export interface ActiveWidgetOptions {
  widgetKey?: string;
  updateIntervalMs?: number;
  placement?: "aboveEditor" | "belowEditor";
}

export class ActiveWidgetController {
  public readonly widgetKey: string;
  public readonly placement: "aboveEditor" | "belowEditor";
  private spinnerIndex = 0;
  private timer?: NodeJS.Timeout;

  constructor(options?: ActiveWidgetOptions) {
    this.widgetKey = options?.widgetKey ?? "pi-agent-core";
    this.placement = options?.placement ?? "aboveEditor";
  }

  /**
   * Format elapsed milliseconds into a human-readable duration (e.g. "12s", "1m 24s").
   */
  public formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const remainingSecs = seconds % 60;
    return `${mins}m ${remainingSecs}s`;
  }

  /**
   * Format token counts with 'k' or 'M' suffix.
   */
  public formatTokens(total: number): string {
    if (total >= 1_000_000) return `${(total / 1_000_000).toFixed(1)}M tokens`;
    if (total >= 1_000) return `${(total / 1_000).toFixed(1)}k tokens`;
    return `${total} tokens`;
  }

  /**
   * Render lines for the active widget based on running subagents and workflows.
   */
  public renderLines(
    activeRuns: RunRecord[],
    activeWorkflows: WorkflowResult[] = [],
    theme?: any
  ): string[] {
    const totalActive = activeRuns.length + activeWorkflows.length;
    if (totalActive === 0) {
      return [];
    }

    const spinner = SPINNER_FRAMES[this.spinnerIndex % SPINNER_FRAMES.length];
    this.spinnerIndex++;

    const lines: string[] = [];

    // Render active workflows first
    for (const wf of activeWorkflows) {
      const now = Date.now();
      const elapsed = this.formatDuration(now - wf.startedAt);
      const activePhase = wf.phases.find((p) => p.status === "running")?.name ?? "executing";
      const phaseIndex = wf.phases.findIndex((p) => p.status === "running");
      const phaseInfo =
        phaseIndex >= 0 ? ` · Phase ${phaseIndex + 1}/${wf.phases.length} (${activePhase})` : "";

      const title = theme?.accent ? theme.accent(`[workflow] ${wf.name}`) : `[workflow] ${wf.name}`;
      lines.push(`${spinner} ${title}${phaseInfo} · ${elapsed}`);
    }

    // Render active subagent runs
    for (const run of activeRuns) {
      const now = Date.now();
      const elapsed = this.formatDuration(now - run.startedAt);
      const tokenStr = this.formatTokens(run.tokens?.total ?? 0);
      const turnsStr = `${run.turns}/${run.turnBudget} turns`;
      const depthStr = `Depth: ${run.depth}/10`;
      const toolStr = run.toolCalls?.length
        ? ` · ${run.toolCalls.length} tools`
        : "";

      const agentName = theme?.accent ? theme.accent(run.agent) : run.agent;
      const head = `${spinner} [subagent] ${agentName} · ${depthStr} · ${turnsStr} · ${tokenStr}${toolStr} · ${elapsed}`;

      const idleMs = run.lastActivityAt ? now - run.lastActivityAt : 0;
      const idleStr =
        idleMs >= IDLE_WARNING_MS
          ? ` · idle ${this.formatDuration(idleMs)}`
          : "";
      lines.push(`${head}${idleStr}`);

      const activity = activityLabel(run);
      if (activity) {
        const rendered = theme?.dim ? theme.dim(activity) : activity;
        lines.push(`   ↳ ${rendered}`);
      }
    }

    return lines;
  }

  /**
   * Update the widget on the UI context.
   */
  public update(
    ctx: { hasUI?: boolean; ui?: any },
    activeRuns: RunRecord[],
    activeWorkflows: WorkflowResult[] = []
  ): void {
    if (!ctx || !ctx.hasUI || !ctx.ui?.setWidget) return;

    const totalActive = activeRuns.length + activeWorkflows.length;
    if (totalActive === 0) {
      ctx.ui.setWidget(this.widgetKey, undefined);
      return;
    }

    const lines = this.renderLines(activeRuns, activeWorkflows, ctx.ui.theme);
    ctx.ui.setWidget(this.widgetKey, lines, { placement: this.placement });
  }

  /**
   * Clear the active widget from TUI.
   */
  public clear(ctx: { hasUI?: boolean; ui?: any }): void {
    if (!ctx || !ctx.hasUI || !ctx.ui?.setWidget) return;
    ctx.ui.setWidget(this.widgetKey, undefined);
  }

  /**
   * Dispose any background interval timers.
   */
  public dispose(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
