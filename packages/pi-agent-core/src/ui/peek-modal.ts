import type { ExtensionCommandContext, Theme } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { RunRecord } from "../types.js";

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
      lines.push(`Args: ${JSON.stringify(tc.args, null, 2)}`);
      if (tc.result !== undefined) {
        const resStr =
          typeof tc.result === "string"
            ? tc.result
            : JSON.stringify(tc.result, null, 2);
        lines.push(`Result: ${resStr}`);
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
  lines.push(" FINAL OUTPUT");
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

  constructor(
    private readonly theme: any,
    private readonly done: () => void,
    private readonly requestRender: () => void,
    private readonly runs: RunRecord[],
    private readonly onSelect: (run: RunRecord) => void
  ) {}

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
    if (matchesKey(data, Key.up) || data === "k") {
      this.selectedIndex = Math.max(0, this.selectedIndex - 1);
      this.ensureVisible();
      this.cachedWidth = undefined;
      this.requestRender();
      return;
    }
    if (matchesKey(data, Key.down) || data === "j") {
      this.selectedIndex = Math.min(this.runs.length - 1, this.selectedIndex + 1);
      this.ensureVisible();
      this.cachedWidth = undefined;
      this.requestRender();
      return;
    }
    if (matchesKey(data, Key.enter)) {
      const run = this.runs[this.selectedIndex];
      if (run) {
        this.onSelect(run);
      }
      return;
    }
    if (matchesKey(data, Key.escape) || data === "q" || data === "Q") {
      if (typeof this.done === "function") this.done();
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
 * Interactive TUI Component for inspecting a full subagent run transcript with scrolling.
 * Keys: ↑↓ / j k / PgUp / PgDn scroll · q / Esc / Enter close
 */
export class SubagentPeekComponent {
  private scrollOffset = 0;
  private cachedWidth?: number;
  private cachedLines?: string[];
  private rawLines: string[] = [];

  constructor(
    private readonly theme: any,
    private readonly done: () => void,
    private readonly requestRender: () => void,
    private readonly run: RunRecord,
    private readonly content: string
  ) {
    this.rawLines = content.split("\n");
  }

  private getViewportRows(): number {
    const rows = Math.max(18, (process.stdout as any).rows || 24);
    return Math.max(6, rows - 10);
  }

  handleInput(data: string): void {
    if (
      matchesKey(data, Key.enter) ||
      matchesKey(data, Key.escape) ||
      data === "q" ||
      data === "Q"
    ) {
      if (typeof this.done === "function") this.done();
      return;
    }
    const viewport = this.getViewportRows();
    const maxOffset = Math.max(0, this.rawLines.length - viewport);

    if (matchesKey(data, Key.up) || data === "k") {
      this.scrollOffset = Math.max(0, this.scrollOffset - 1);
      this.cachedWidth = undefined;
      this.requestRender();
      return;
    }
    if (matchesKey(data, Key.down) || data === "j") {
      this.scrollOffset = Math.min(maxOffset, this.scrollOffset + 1);
      this.cachedWidth = undefined;
      this.requestRender();
      return;
    }
    if (matchesKey(data, Key.pageUp)) {
      this.scrollOffset = Math.max(0, this.scrollOffset - viewport);
      this.cachedWidth = undefined;
      this.requestRender();
      return;
    }
    if (matchesKey(data, Key.pageDown)) {
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

    const title = `Subagent: ${this.run.agent} [${this.run.id.slice(0, 10)}] (${this.run.status})`;
    const subtitle = `Turns: ${this.run.turns}/${this.run.turnBudget} · Tokens: ${this.run.tokens?.total ?? 0} · Runtime: ${this.run.runtime}`;

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
  ctx: { hasUI?: boolean; ui?: any }
): Promise<void> {
  const content = formatPeekContent(run);

  if (ctx.hasUI && ctx.ui?.custom) {
    await ctx.ui.custom(
      (tui: any, theme: any, done: () => void) => {
        return new SubagentPeekComponent(
          theme || tui?.theme,
          done || (() => {}),
          () => tui?.requestRender?.(),
          run,
          content
        );
      },
      { overlay: true }
    );
  } else if (ctx.hasUI && ctx.ui?.editor) {
    await ctx.ui.editor(`Subagent Peek: ${run.agent} [${run.id}]`, content);
  } else {
    process.stdout.write(`\n${content}\n`);
  }
}

/**
 * Open the interactive history overlay modal listing all runs.
 */
export async function openHistoryModal(
  runs: RunRecord[],
  ctx: { hasUI?: boolean; ui?: any }
): Promise<void> {
  if (runs.length === 0) {
    ctx.ui?.notify?.("No subagent runs recorded yet.", "info");
    return;
  }

  if (ctx.hasUI && ctx.ui?.custom) {
    await ctx.ui.custom(
      (tui: any, theme: any, done: () => void) => {
        return new SubagentHistoryComponent(
          theme || tui?.theme,
          done || (() => {}),
          () => tui?.requestRender?.(),
          runs,
          (selectedRun: RunRecord) => {
            if (typeof done === "function") done();
            setTimeout(() => {
              void openPeekModal(selectedRun, ctx);
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
      if (r) await openPeekModal(r, ctx);
    }
  }
}
