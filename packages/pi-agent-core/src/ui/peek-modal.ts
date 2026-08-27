import type { ExtensionCommandContext, Theme } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { RunRecord } from "../types.js";

const RESULT_PREVIEW_MAX_CHARS = 2000;
const RESULT_PREVIEW_MAX_LINES = 40;

/**
 * Render a tool argument or result for inspection, capped so a single large
 * file read cannot bury the rest of the transcript.
 */
function previewValue(value: unknown): string[] {
  const text =
    typeof value === "string" ? value : JSON.stringify(value, null, 2) ?? "";
  const clipped =
    text.length > RESULT_PREVIEW_MAX_CHARS
      ? text.slice(0, RESULT_PREVIEW_MAX_CHARS)
      : text;
  const lines = clipped.split("\n");
  const truncatedLines = lines.length > RESULT_PREVIEW_MAX_LINES;
  const visible = truncatedLines
    ? lines.slice(0, RESULT_PREVIEW_MAX_LINES)
    : lines;
  if (truncatedLines || clipped.length < text.length) {
    const omitted = text.length - clipped.length;
    visible.push(
      `… truncated (${lines.length - visible.length} more lines, ${omitted} more chars)`
    );
  }
  return visible;
}

/**
 * Format a complete inspectable transcript for a subagent run.
 */
export function formatPeekContent(run: RunRecord): string {
  const lines: string[] = [];

  lines.push("================================================================================");
  lines.push(` Subagent Run: ${run.agent} (${run.id})`);
  lines.push("================================================================================");
  lines.push(`Status:     ${run.status.toUpperCase()} (State: ${run.state})`);
  lines.push(`Runtime:    ${run.runtime}`);
  if (run.model) lines.push(`Model:      ${run.model}`);
  lines.push(`Depth:      ${run.depth}/10`);
  lines.push(`Turns:      ${run.turns} / ${run.turnBudget}`);
  lines.push(`Tokens:     ${run.tokens?.total ?? 0} total (in: ${run.tokens?.input ?? 0}, out: ${run.tokens?.output ?? 0})`);
  if (run.toolCalls && run.toolCalls.length > 0) {
    lines.push(`Tool calls: ${run.toolCalls.length}`);
  }
  if (run.lastToolName) {
    lines.push(`Last tool:  ${run.lastToolName}`);
  }
  if (run.lastLine) {
    lines.push(`Activity:   ${run.lastLine}`);
  }
  if (run.thought) {
    lines.push(`Thinking:   ${run.thought}`);
  }
  if (run.status === "running" && run.lastActivityAt) {
    const idleMs = Date.now() - run.lastActivityAt;
    lines.push(`Idle for:   ${(idleMs / 1000).toFixed(1)}s`);
  }
  if (run.startedAt) {
    const started = new Date(run.startedAt).toISOString();
    const duration = run.durationMs ? `${(run.durationMs / 1000).toFixed(1)}s` : "running";
    lines.push(`Started:    ${started} (Duration: ${duration})`);
  }
  if (run.worktreePath) {
    lines.push(`Worktree:   ${run.worktreePath}`);
  }
  if (run.verdict) {
    lines.push(`Verdict:    ${run.verdict}`);
  }
  lines.push("");

  lines.push("--------------------------------------------------------------------------------");
  lines.push(" PROMPT");
  lines.push("--------------------------------------------------------------------------------");
  lines.push(run.prompt || "(no prompt provided)");
  lines.push("");

  if (run.toolCalls && run.toolCalls.length > 0) {
    lines.push("--------------------------------------------------------------------------------");
    lines.push(` TOOL CALLS (${run.toolCalls.length})`);
    lines.push("--------------------------------------------------------------------------------");
    for (let i = 0; i < run.toolCalls.length; i++) {
      const tc = run.toolCalls[i];
      const timeStr = tc.timestamp ? new Date(tc.timestamp).toLocaleTimeString() : "";
      lines.push(`[${i + 1}] [Tool Call: ${tc.tool}] ${timeStr}`);
      if (tc.args !== undefined) {
        lines.push("Args:");
        lines.push(...previewValue(tc.args));
      }
      if (tc.result !== undefined) {
        lines.push("Result:");
        lines.push(...previewValue(tc.result));
      } else if (run.status === "running") {
        lines.push("Result: (running…)");
      }
      lines.push("");
    }
  }

  if (run.error) {
    lines.push("--------------------------------------------------------------------------------");
    lines.push(" ERROR");
    lines.push("--------------------------------------------------------------------------------");
    lines.push(run.error);
    lines.push("");
  }

  lines.push("--------------------------------------------------------------------------------");
  lines.push(run.status === "running" ? " OUTPUT (streaming…)" : " FINAL OUTPUT");
  lines.push("--------------------------------------------------------------------------------");
  lines.push(run.output || "(no output returned)");
  lines.push("================================================================================");

  return lines.join("\n");
}

function padLine(text: string, width: number): string {
  return truncateToWidth(text + " ".repeat(Math.max(0, width - visibleWidth(text))), width, "");
}

function panelFill(theme: any, text: string, width: number): string {
  return theme.bg("customMessageBg", padLine(text, width));
}

function panelBorder(theme: any, width: number, left: string, right: string): string {
  return (
    theme.fg("border", left) +
    theme.bg("customMessageBg", "─".repeat(Math.max(0, width))) +
    theme.fg("border", right)
  );
}

function panelRow(theme: any, text: string, width: number): string {
  return theme.fg("border", "│") + panelFill(theme, text, width) + theme.fg("border", "│");
}

/**
 * Interactive TUI Component for browsing and selecting subagent runs.
 * Keys: ↑↓ / j k navigate · Enter inspect · q / Esc close
 */
export class SubagentHistoryComponent {
  private selectedIndex = 0;
  private scrollOffset = 0;
  private cachedWidth?: number;
  private cachedLines?: string[];

  private readonly timer?: NodeJS.Timeout;

  constructor(
    private readonly theme: any,
    private readonly done: () => void,
    private readonly requestRender: () => void,
    private readonly runs: RunRecord[],
    private readonly onSelect: (run: RunRecord) => void
  ) {
    // Status, turn counts and activity lines keep changing while the list is
    // open, so a still-running list must not render a frozen snapshot.
    this.timer = setInterval(() => {
      if (!this.runs.some((r) => r.status === "running")) return;
      this.cachedWidth = undefined;
      this.cachedLines = undefined;
      this.requestRender();
    }, 500);
    this.timer.unref?.();
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private getViewport(): number {
    const rows = Math.max(10, (process.stdout as any).rows || 24);
    return Math.max(4, rows - 8);
  }

  private ensureVisible(): void {
    const vp = this.getViewport();
    if (this.selectedIndex < this.scrollOffset) {
      this.scrollOffset = this.selectedIndex;
    } else if (this.selectedIndex >= this.scrollOffset + vp) {
      this.scrollOffset = this.selectedIndex - vp + 1;
    }
  }

  handleInput(data: string): void {
    if (
      matchesKey(data, "escape") ||
      matchesKey(data, Key.escape) ||
      matchesKey(data, "ctrl+c") ||
      data === "q" ||
      data === "Q" ||
      data === "\x1b" ||
      data === "\x03"
    ) {
      this.dispose();
      if (typeof this.done === "function") this.done();
      return;
    }
    if (matchesKey(data, "up") || matchesKey(data, Key.up) || data === "k" || data === "\x1b[A") {
      this.selectedIndex = Math.max(0, this.selectedIndex - 1);
      this.ensureVisible();
      this.cachedWidth = undefined;
      this.requestRender();
      return;
    }
    if (matchesKey(data, "down") || matchesKey(data, Key.down) || data === "j" || data === "\x1b[B") {
      this.selectedIndex = Math.min(this.runs.length - 1, this.selectedIndex + 1);
      this.ensureVisible();
      this.cachedWidth = undefined;
      this.requestRender();
      return;
    }
    if (matchesKey(data, "enter") || matchesKey(data, Key.enter) || data === "\r" || data === "\n") {
      const run = this.runs[this.selectedIndex];
      if (run) {
        this.dispose();
        this.onSelect(run);
      }
      return;
    }
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) {
      return this.cachedLines;
    }

    const panelWidth = Math.max(20, width - 2);
    const innerWidth = panelWidth - 2;
    const viewport = this.getViewport();
    const total = this.runs.length;

    this.ensureVisible();

    const lines: string[] = [panelBorder(this.theme, panelWidth, "╭", "╮")];
    const title = `${this.theme.fg("accent", this.theme.bold("Subagent Run History"))}  ${this.theme.fg("dim", `(${total} total)`)}`;
    lines.push(panelRow(this.theme, ` ${title}`, panelWidth));
    lines.push(panelBorder(this.theme, panelWidth, "├", "┤"));

    for (let row = 0; row < viewport; row++) {
      const idx = this.scrollOffset + row;
      const run = this.runs[idx];
      if (!run) {
        lines.push(panelRow(this.theme, "", panelWidth));
        continue;
      }

      const isSelected = idx === this.selectedIndex;
      const marker = isSelected ? "▸" : " ";

      let statusColor = "dim";
      if (run.status === "completed") statusColor = "success";
      else if (run.status === "failed") statusColor = "error";
      else if (run.status === "running") statusColor = "warning";

      const timeLabel = run.startedAt
        ? new Date(run.startedAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })
        : "";

      const statusStr = this.theme.fg(statusColor, `[${run.status}]`);
      const agentStr = this.theme.fg("accent", run.agent);
      const promptPreview = (run.prompt || "")
        .replace(/\s*\n+\s*/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim();

      const fixed = `${marker} #${run.id.slice(0, 8)} ${statusStr} ${agentStr}  ${this.theme.fg("dim", timeLabel)}  `;
      const availableWidth = Math.max(0, innerWidth - visibleWidth(fixed));
      const truncatedPrompt = truncateToWidth(promptPreview, availableWidth, "…");
      let lineText = `${fixed}${this.theme.fg("muted", truncatedPrompt)}`;

      if (isSelected) {
        lineText = this.theme.bg("selectedBg", lineText);
      }

      lines.push(panelRow(this.theme, ` ${lineText}`, panelWidth));
    }

    lines.push(panelBorder(this.theme, panelWidth, "├", "┤"));
    lines.push(
      panelRow(
        this.theme,
        ` ${this.theme.fg("dim", "↑↓/jk navigate • Enter inspect • q/Esc close")}`,
        panelWidth
      )
    );
    lines.push(panelBorder(this.theme, panelWidth, "╰", "╯"));

    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }
}

/**
 * Interactive TUI Component for inspecting a full subagent run transcript with scrolling and live updates.
 * Keys: ↑↓ / j k / PgUp / PgDn scroll · q / Esc / Enter close
 */
export class SubagentPeekComponent {
  private scrollOffset = 0;
  private cachedWidth?: number;
  private cachedLines?: string[];
  private rawLines: string[] = [];
  private readonly timer?: NodeJS.Timeout;

  constructor(
    private readonly theme: any,
    private readonly done: () => void,
    private readonly requestRender: () => void,
    private readonly run: RunRecord,
    private readonly getLatestContent?: () => string,
    private readonly getLatestRun?: () => RunRecord
  ) {
    this.refreshContent();
    // Auto-refresh while modal is open to stream live tool output/turns
    this.timer = setInterval(() => {
      const changed = this.refreshContent();
      if (changed) {
        this.cachedWidth = undefined;
        this.cachedLines = undefined;
        this.requestRender();
      }
    }, 500);
    this.timer.unref?.();
  }

  private refreshContent(): boolean {
    const text = this.getLatestContent ? this.getLatestContent() : formatPeekContent(this.run);
    const newLines = text.split("\n");
    if (newLines.length !== this.rawLines.length || text !== this.rawLines.join("\n")) {
      const wasAtBottom = this.scrollOffset >= Math.max(0, this.rawLines.length - this.getViewportRows());
      this.rawLines = newLines;
      if (wasAtBottom) {
        this.scrollOffset = Math.max(0, this.rawLines.length - this.getViewportRows());
      }
      return true;
    }
    return false;
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private getViewportRows(): number {
    const rows = Math.max(18, (process.stdout as any).rows || 24);
    return Math.max(6, rows - 10);
  }

  /** Live record when a resolver is available, otherwise the opened snapshot. */
  private get current(): RunRecord {
    return this.getLatestRun?.() ?? this.run;
  }

  handleInput(data: string): void {
    if (
      matchesKey(data, "enter") ||
      matchesKey(data, Key.enter) ||
      matchesKey(data, "escape") ||
      matchesKey(data, Key.escape) ||
      matchesKey(data, "ctrl+c") ||
      data === "q" ||
      data === "Q" ||
      data === "\r" ||
      data === "\n" ||
      data === "\x1b" ||
      data === "\x03"
    ) {
      this.dispose();
      if (typeof this.done === "function") this.done();
      return;
    }
    const viewport = this.getViewportRows();
    const maxOffset = Math.max(0, this.rawLines.length - viewport);

    if (matchesKey(data, "up") || matchesKey(data, Key.up) || data === "k" || data === "\x1b[A") {
      this.scrollOffset = Math.max(0, this.scrollOffset - 1);
      this.cachedWidth = undefined;
      this.requestRender();
      return;
    }
    if (matchesKey(data, "down") || matchesKey(data, Key.down) || data === "j" || data === "\x1b[B") {
      this.scrollOffset = Math.min(maxOffset, this.scrollOffset + 1);
      this.cachedWidth = undefined;
      this.requestRender();
      return;
    }
    if (matchesKey(data, "pageUp") || matchesKey(data, Key.pageUp) || data === "\x1b[5~") {
      this.scrollOffset = Math.max(0, this.scrollOffset - viewport);
      this.cachedWidth = undefined;
      this.requestRender();
      return;
    }
    if (matchesKey(data, "pageDown") || matchesKey(data, Key.pageDown) || data === "\x1b[6~") {
      this.scrollOffset = Math.min(maxOffset, this.scrollOffset + viewport);
      this.cachedWidth = undefined;
      this.requestRender();
      return;
    }
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) {
      return this.cachedLines;
    }

    const panelWidth = Math.max(20, width - 2);
    const viewport = this.getViewportRows();
    const maxOffset = Math.max(0, this.rawLines.length - viewport);
    if (this.scrollOffset > maxOffset) this.scrollOffset = maxOffset;

    const visibleLines = this.rawLines.slice(
      this.scrollOffset,
      this.scrollOffset + viewport
    );
    const range =
      this.rawLines.length > 0
        ? `${this.scrollOffset + 1}-${Math.min(
            this.rawLines.length,
            this.scrollOffset + viewport
          )}/${this.rawLines.length}`
        : "0/0";

    const current = this.current;
    const toolCount = current.toolCalls?.length ?? 0;
    const title = `Subagent: ${current.agent} [${current.id.slice(0, 10)}] (${current.status})`;
    const subtitle = `Turns: ${current.turns}/${current.turnBudget} · Tokens: ${current.tokens?.total ?? 0} · Tools: ${toolCount} · Runtime: ${current.runtime}`;

    const lines: string[] = [panelBorder(this.theme, panelWidth, "╭", "╮")];
    lines.push(panelRow(this.theme, ` ${this.theme.bold(title)}`, panelWidth));
    lines.push(panelRow(this.theme, ` ${this.theme.fg("muted", subtitle)}`, panelWidth));
    lines.push(panelBorder(this.theme, panelWidth, "├", "┤"));

    for (const l of visibleLines) {
      lines.push(panelRow(this.theme, ` ${this.theme.fg("toolOutput", l)}`, panelWidth));
    }
    if (visibleLines.length === 0) {
      lines.push(panelRow(this.theme, ` ${this.theme.fg("muted", "(no content)")}`, panelWidth));
    }

    lines.push(panelBorder(this.theme, panelWidth, "├", "┤"));
    lines.push(
      panelRow(
        this.theme,
        ` ${this.theme.fg(
          "dim",
          `↑↓/jk/PgUp/PgDn scroll • Enter/Esc/q close  ${range}`
        )}`,
        panelWidth
      )
    );
    lines.push(panelBorder(this.theme, panelWidth, "╰", "╯"));

    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }
}

/**
 * Open the interactive peek modal dialog via Pi's UI context.
 */
export async function openPeekModal(
  run: RunRecord,
  ctx: { hasUI?: boolean; ui?: any },
  getLiveRun?: (id: string) => RunRecord | undefined
): Promise<void> {
  if (ctx.hasUI && ctx.ui?.custom) {
    await ctx.ui.custom(
      (tui: any, theme: any, _keybindings: any, done: () => void) => {
        const resolveDone = typeof done === "function" ? done : typeof _keybindings === "function" ? _keybindings : () => {};
        return new SubagentPeekComponent(
          theme || tui?.theme,
          resolveDone,
          () => tui?.requestRender?.(),
          run,
          () => formatPeekContent((getLiveRun && getLiveRun(run.id)) || run),
          () => (getLiveRun && getLiveRun(run.id)) || run
        );
      },
      { overlay: true }
    );
  } else if (ctx.hasUI && ctx.ui?.editor) {
    const content = formatPeekContent(run);
    await ctx.ui.editor(`Subagent Peek: ${run.agent} [${run.id}]`, content);
  } else {
    const content = formatPeekContent(run);
    process.stdout.write(`\n${content}\n`);
  }
}

/**
 * Open the interactive history overlay modal listing all runs.
 */
export async function openHistoryModal(
  runs: RunRecord[],
  ctx: { hasUI?: boolean; ui?: any },
  getLiveRun?: (id: string) => RunRecord | undefined
): Promise<void> {
  if (runs.length === 0) {
    ctx.ui?.notify?.("No subagent runs recorded yet.", "info");
    return;
  }

  if (ctx.hasUI && ctx.ui?.custom) {
    await ctx.ui.custom(
      (tui: any, theme: any, _keybindings: any, done: () => void) => {
        const resolveDone = typeof done === "function" ? done : typeof _keybindings === "function" ? _keybindings : () => {};
        return new SubagentHistoryComponent(
          theme || tui?.theme,
          resolveDone,
          () => tui?.requestRender?.(),
          runs,
          (selectedRun: RunRecord) => {
            if (typeof resolveDone === "function") resolveDone();
            setTimeout(() => {
              void openPeekModal(selectedRun, ctx, getLiveRun);
            }, 50);
          }
        );
      },
      { overlay: true }
    );
  } else if (ctx.hasUI && ctx.ui?.select) {
    const chosen = await ctx.ui.select(
      "Select subagent run to inspect:",
      runs.map((r) => ({
        label: `${r.agent} [${r.id.slice(0, 8)}] (${r.status})`,
        value: r.id,
      }))
    );
    if (chosen) {
      const r = runs.find((item) => item.id === chosen);
      if (r) await openPeekModal(r, ctx, getLiveRun);
    }
  }
}
