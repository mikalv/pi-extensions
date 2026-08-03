import type { ExtensionCommandContext, Theme } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { ToolUsageSummary } from "./collector";
import { buildGraphModel, renderChart, type GraphGroupBy, type GraphMetric } from "./legacy/usage-graph";
import type { TabName, UsageData } from "./legacy/usage-data";
import type { LiveUsageState, LiveUsageWindow } from "./live";
import type { OfflineInsightSummary, OfflineSnapshot } from "./offline";

export type DashboardSnapshot = {
  offline: OfflineSnapshot;
  tools: ToolUsageSummary[];
  live: LiveUsageState[];
  generatedAt: number;
};

type DashboardView = "overview" | "live" | "providers" | "tools" | "graph" | "insights";

const PERIODS: Array<{ key: TabName; label: string }> = [
  { key: "today", label: "Today" },
  { key: "thisWeek", label: "This week" },
  { key: "lastWeek", label: "Last week" },
  { key: "last30Days", label: "30d" },
  { key: "allTime", label: "All time" },
];

const VIEWS: Array<{ key: DashboardView; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "live", label: "Live" },
  { key: "providers", label: "Providers" },
  { key: "tools", label: "Tools" },
  { key: "graph", label: "Graph" },
  { key: "insights", label: "Insights" },
];

const GRAPH_METRICS: GraphMetric[] = ["cost", "tokens", "messages", "reasoning"];
const GRAPH_GROUPS: GraphGroupBy[] = ["provider", "model", "thinking", "total"];

function formatCost(cost: number): string {
  if (cost === 0) return "$0";
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(2)}`;
  if (cost < 100) return `$${cost.toFixed(1)}`;
  return `$${Math.round(cost)}`;
}

function formatTokens(total: number): string {
  if (total === 0) return "0";
  if (total < 1000) return String(Math.round(total));
  if (total < 1_000_000) return `${(total / 1000).toFixed(total < 10_000 ? 1 : 0)}k`;
  return `${(total / 1_000_000).toFixed(1)}M`;
}

function formatAxisCost(v: number): string {
  if (v === 0) return "$0";
  if (v < 1) return `$${v.toFixed(2)}`;
  if (v < 100) return `$${v.toFixed(1)}`;
  if (v < 10_000) return `$${Math.round(v)}`;
  if (v < 1_000_000) return `$${(v / 1000).toFixed(1)}k`;
  return `$${(v / 1_000_000).toFixed(2)}M`;
}

function formatAxisCount(v: number): string {
  if (v === 0) return "0";
  if (v < 1000) return String(Math.round(v));
  if (v < 1_000_000) return `${(v / 1000).toFixed(v < 10_000 ? 1 : 0)}k`;
  if (v < 1_000_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  return `${(v / 1_000_000_000).toFixed(1)}B`;
}

function totalTokens(row: { input: number; output: number; cacheWrite: number }): number {
  return row.input + row.output + row.cacheWrite;
}

function formatReset(resetsAt: number | undefined): string {
  if (!resetsAt) return "";
  const deltaMs = resetsAt - Date.now();
  if (deltaMs <= 0) return " · resets now";
  const minutes = Math.round(deltaMs / 60_000);
  if (minutes < 60) return ` · resets ${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return ` · resets ${hours}h`;
  const days = Math.round(hours / 24);
  return ` · resets ${days}d`;
}

function formatWindow(window: LiveUsageWindow): string {
  if (window.usedPercent !== undefined) {
    const remaining = Math.max(0, Math.round(100 - window.usedPercent));
    return `${window.label} ${remaining}% left${formatReset(window.resetsAt)}`;
  }
  if (window.remaining !== undefined || window.limit !== undefined) {
    const unit = window.unit === "usd" ? "$" : "";
    const remaining = window.remaining !== undefined ? `${unit}${window.remaining}` : "?";
    const limit = window.limit !== undefined ? `${unit}${window.limit}` : "?";
    return `${window.label} ${remaining}/${limit}${formatReset(window.resetsAt)}`;
  }
  return window.label;
}

function card(theme: Theme, label: string, value: string, extra = ""): string {
  const text = `${theme.fg("dim", label)} ${theme.fg("accent", theme.bold(value))}${extra ? ` ${theme.fg("muted", extra)}` : ""}`;
  return text;
}

function padLine(text: string, width: number): string {
  return truncateToWidth(text + " ".repeat(Math.max(0, width - visibleWidth(text))), width, "");
}

function makeBorder(theme: Theme, width: number): string {
  return theme.fg("border", "─".repeat(Math.max(0, width)));
}

function panelFill(theme: Theme, text: string, width: number): string {
  return theme.bg("customMessageBg", padLine(text, width));
}

function panelBorder(theme: Theme, width: number, left: string, right: string): string {
  return theme.fg("border", left) + theme.bg("customMessageBg", "─".repeat(Math.max(0, width))) + theme.fg("border", right);
}

function panelRow(theme: Theme, text: string, width: number): string {
  return theme.fg("border", "│") + panelFill(theme, text, width) + theme.fg("border", "│");
}

function cycle<T>(items: T[], current: T, delta: 1 | -1): T {
  const index = items.indexOf(current);
  if (index === -1) return items[0]!;
  return items[(index + delta + items.length) % items.length]!;
}

function selectedPeriodLabel(tab: TabName): string {
  return PERIODS.find((period) => period.key === tab)?.label ?? tab;
}

function periodStats(data: UsageData, tab: TabName) {
  return data[tab];
}

class UsageDashboardComponent {
  private readonly theme: Theme;
  private readonly done: (value: void) => void;
  private readonly requestRender: () => void;
  private readonly loadDashboard: (force: boolean) => Promise<DashboardSnapshot>;
  private readonly loadUsageData: (force: boolean) => Promise<UsageData | undefined>;
  private readonly exportView: (view: "table" | "graph" | "insights", period: TabName) => Promise<string>;

  private snapshot: DashboardSnapshot;
  private usageData: UsageData | undefined;
  private period: TabName = "last30Days";
  private view: DashboardView = "overview";
  private graphMetric: GraphMetric = "cost";
  private graphGroup: GraphGroupBy = "provider";
  private graphCumulative = true;
  private loading = false;
  private message = "r refresh • [ ] period • tab view • m metric • g group • c cumulative • e export • q close";
  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(opts: {
    theme: Theme;
    done: (value: void) => void;
    requestRender: () => void;
    snapshot: DashboardSnapshot;
    usageData: UsageData | undefined;
    loadDashboard: (force: boolean) => Promise<DashboardSnapshot>;
    loadUsageData: (force: boolean) => Promise<UsageData | undefined>;
    exportView: (view: "table" | "graph" | "insights", period: TabName) => Promise<string>;
  }) {
    this.theme = opts.theme;
    this.done = opts.done;
    this.requestRender = opts.requestRender;
    this.snapshot = opts.snapshot;
    this.usageData = opts.usageData;
    this.loadDashboard = opts.loadDashboard;
    this.loadUsageData = opts.loadUsageData;
    this.exportView = opts.exportView;
  }

  private setMessage(message: string): void {
    this.message = message;
    this.invalidate();
    this.requestRender();
  }

  private async refresh(force = true): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    this.setMessage(force ? "Refreshing usage dashboard…" : "Loading usage dashboard…");
    try {
      const [snapshot, usageData] = await Promise.all([this.loadDashboard(force), this.loadUsageData(force)]);
      this.snapshot = snapshot;
      this.usageData = usageData;
      this.setMessage(`Updated ${new Date(snapshot.generatedAt).toLocaleTimeString()} · q close`);
    } catch (error) {
      this.setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      this.loading = false;
      this.invalidate();
      this.requestRender();
    }
  }

  private async exportCurrent(): Promise<void> {
    const view = this.view === "graph" ? "graph" : this.view === "insights" ? "insights" : "table";
    this.setMessage(`Exporting ${view}…`);
    try {
      const path = await this.exportView(view, this.period);
      this.setMessage(`Exported ${view} for ${selectedPeriodLabel(this.period)} to ${path}`);
    } catch (error) {
      this.setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape) || matchesKey(data, "q")) {
      this.done();
      return;
    }
    if (matchesKey(data, "r")) {
      void this.refresh(true);
      return;
    }
    if (matchesKey(data, "e")) {
      void this.exportCurrent();
      return;
    }
    if (matchesKey(data, Key.tab) || matchesKey(data, Key.down) || matchesKey(data, "]")) {
      this.view = cycle(VIEWS.map((item) => item.key), this.view, 1);
      this.invalidate();
      this.requestRender();
      return;
    }
    if (matchesKey(data, Key.shift("tab")) || matchesKey(data, Key.up) || matchesKey(data, "[")) {
      this.view = cycle(VIEWS.map((item) => item.key), this.view, -1);
      this.invalidate();
      this.requestRender();
      return;
    }
    if (matchesKey(data, Key.right)) {
      this.period = cycle(PERIODS.map((item) => item.key), this.period, 1);
      this.invalidate();
      this.requestRender();
      return;
    }
    if (matchesKey(data, Key.left)) {
      this.period = cycle(PERIODS.map((item) => item.key), this.period, -1);
      this.invalidate();
      this.requestRender();
      return;
    }
    if (matchesKey(data, "m")) {
      this.graphMetric = cycle(GRAPH_METRICS, this.graphMetric, 1);
      this.view = "graph";
      this.invalidate();
      this.requestRender();
      return;
    }
    if (matchesKey(data, "g")) {
      this.graphGroup = cycle(GRAPH_GROUPS, this.graphGroup, 1);
      this.view = "graph";
      this.invalidate();
      this.requestRender();
      return;
    }
    if (matchesKey(data, "c")) {
      this.graphCumulative = !this.graphCumulative;
      this.view = "graph";
      this.invalidate();
      this.requestRender();
      return;
    }
    if (/^[1-6]$/.test(data)) {
      this.view = VIEWS[Number(data) - 1]?.key ?? this.view;
      this.invalidate();
      this.requestRender();
    }
  }

  private renderHeader(width: number): string[] {
    const title = this.theme.fg("accent", this.theme.bold("Usage Center Dashboard"));
    const loading = this.loading ? this.theme.fg("warning", " loading…") : "";
    const periodTabs = PERIODS.map((period) => {
      const label = period.key === this.period ? this.theme.bg("selectedBg", ` ${period.label} `) : this.theme.fg("dim", ` ${period.label} `);
      return label;
    }).join(" ");
    const viewTabs = VIEWS.map((view, index) => {
      const label = `${index + 1}.${view.label}`;
      return view.key === this.view ? this.theme.fg("accent", this.theme.bold(label)) : this.theme.fg("muted", label);
    }).join(this.theme.fg("dim", " • "));
    return [
      truncateToWidth(`${title}${loading}`, width),
      truncateToWidth(periodTabs, width),
      truncateToWidth(viewTabs, width),
      makeBorder(this.theme, width),
    ];
  }

  private renderOverview(width: number): string[] {
    const stats = this.usageData ? periodStats(this.usageData, this.period) : undefined;
    const totals = stats?.totals;
    const lines: string[] = [];
    if (totals) {
      lines.push(card(this.theme, "Cost", formatCost(totals.cost), `· ${selectedPeriodLabel(this.period)}`));
      lines.push(card(this.theme, "Tokens", formatTokens(totals.tokens.total || totals.tokens.input + totals.tokens.output + totals.tokens.cacheWrite)));
      lines.push(card(this.theme, "Messages", String(totals.messages), `· ${totals.sessions} sessions`));
      lines.push(card(this.theme, "Reasoning", formatTokens(totals.tokens.output), "output") );
    } else {
      lines.push(this.theme.fg("warning", "No offline usage data available yet."));
    }
    lines.push("");
    lines.push(this.theme.fg("accent", this.theme.bold("Live quotas")));
    for (const row of this.snapshot.live) {
      if (row.status === "ready" && row.snapshot) {
        const summary = row.snapshot.windows.slice(0, 2).map(formatWindow).join(" · ");
        const metricSummary = row.snapshot.metrics.slice(0, 2).map((metric) => `${metric.label} ${metric.value}`).join(" · ");
        lines.push(`• ${row.providerName}: ${summary || metricSummary || row.snapshot.source}`);
      } else if (row.status === "unavailable") {
        lines.push(`• ${row.providerName}: auth unavailable`);
      } else {
        lines.push(`• ${row.providerName}: ${row.message || "error"}`);
      }
    }
    lines.push("");
    lines.push(this.theme.fg("accent", this.theme.bold("Top providers")));
    for (const row of this.snapshot.offline.topProviders) {
      lines.push(`• ${row.name} · ${formatCost(row.cost)} · ${formatTokens(totalTokens(row))} tok`);
    }
    lines.push("");
    lines.push(this.theme.fg("accent", this.theme.bold("Top tools")));
    for (const row of this.snapshot.tools.slice(0, 5)) {
      lines.push(`• ${row.name} · ${formatCost(row.cost)} · ${formatTokens(row.input + row.output + row.cacheWrite)} tok`);
    }
    lines.push("");
    lines.push(this.theme.fg("accent", this.theme.bold("Highlights")));
    const insights = this.snapshot.offline.insights.length > 0 ? this.snapshot.offline.insights : [{ stat: "—", headline: "No insights yet" } as OfflineInsightSummary];
    for (const insight of insights) {
      lines.push(`• ${insight.stat} ${insight.headline}`);
    }
    return lines.map((line) => truncateToWidth(line, width));
  }

  private renderLive(width: number): string[] {
    const lines: string[] = [this.theme.fg("accent", this.theme.bold("Provider-native quota adapters")), ""];
    for (const row of this.snapshot.live) {
      lines.push(this.theme.fg("accent", row.providerName));
      if (row.status === "ready" && row.snapshot) {
        for (const window of row.snapshot.windows) lines.push(`  • ${formatWindow(window)}`);
        for (const metric of row.snapshot.metrics) lines.push(`  • ${metric.label}: ${metric.value}`);
        lines.push(`  • Source: ${row.snapshot.source}`);
      } else if (row.status === "unavailable") {
        lines.push(`  • ${row.message || "Not configured in this session"}`);
      } else {
        lines.push(`  • ${row.message || "Failed to query provider"}`);
      }
      lines.push("");
    }
    return lines.map((line) => truncateToWidth(line, width));
  }

  private renderProviders(width: number): string[] {
    const stats = this.usageData ? periodStats(this.usageData, this.period) : undefined;
    if (!stats) return [this.theme.fg("warning", "No offline usage data available.")];
    const providers = [...stats.providers.entries()]
      .map(([name, provider]) => ({
        name,
        cost: provider.cost,
        messages: provider.messages,
        sessions: provider.sessions.size,
        tokens: provider.tokens.total || provider.tokens.input + provider.tokens.output + provider.tokens.cacheWrite,
      }))
      .sort((a, b) => b.cost - a.cost || b.tokens - a.tokens || a.name.localeCompare(b.name));

    const lines = [this.theme.fg("accent", this.theme.bold(`Providers · ${selectedPeriodLabel(this.period)}`)), ""];
    providers.slice(0, 12).forEach((provider, index) => {
      lines.push(`${String(index + 1).padStart(2, " ")}. ${provider.name}`);
      lines.push(`    ${formatCost(provider.cost)} · ${formatTokens(provider.tokens)} tok · ${provider.messages} msg · ${provider.sessions} ses`);
    });
    if (providers.length === 0) lines.push("No provider rows yet.");
    return lines.map((line) => truncateToWidth(line, width));
  }

  private renderTools(width: number): string[] {
    const lines = [this.theme.fg("accent", this.theme.bold("Top tools across sessions")), ""];
    this.snapshot.tools.forEach((tool, index) => {
      const tokens = tool.input + tool.output + tool.cacheWrite;
      lines.push(`${String(index + 1).padStart(2, " ")}. ${tool.name}`);
      lines.push(`    ${formatCost(tool.cost)} · ${formatTokens(tokens)} tok`);
    });
    if (this.snapshot.tools.length === 0) lines.push("No tool usage rows yet.");
    return lines.map((line) => truncateToWidth(line, width));
  }

  private renderGraph(width: number): string[] {
    if (!this.usageData) return [this.theme.fg("warning", "No offline usage data available.")];
    const model = buildGraphModel(this.usageData.hourly, {
      period: this.period,
      metric: this.graphMetric,
      groupBy: this.graphGroup,
      cumulative: this.graphCumulative,
      bounds: this.usageData.bounds,
    });
    const chart = renderChart(model, {
      width: Math.max(40, width - 2),
      height: 12,
      formatValue: this.graphMetric === "cost" ? formatAxisCost : formatAxisCount,
      formatTime: (ms) => {
        const d = new Date(ms);
        return this.period === "today" || this.period === "thisWeek" || this.period === "lastWeek"
          ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
          : d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
      },
    });
    const lines = [
      this.theme.fg("accent", this.theme.bold("Graph explorer")),
      `${this.graphCumulative ? "cumulative" : "per-bucket"} · ${this.graphMetric} · ${this.graphGroup}`,
      "",
      ...chart,
      "",
      this.theme.fg("accent", "Legend"),
      ...model.series.slice(0, 8).map((series) => `• ${series.label} · ${this.graphMetric === "cost" ? formatAxisCost(series.total) : formatAxisCount(series.total)}`),
    ];
    return lines.map((line) => truncateToWidth(line, width));
  }

  private renderInsights(width: number): string[] {
    const stats = this.usageData ? periodStats(this.usageData, this.period) : undefined;
    if (!stats) return [this.theme.fg("warning", "No offline usage data available.")];
    const insights = stats.insights.insights;
    const lines = [this.theme.fg("accent", this.theme.bold(`Insights · ${selectedPeriodLabel(this.period)}`)), ""];
    if (insights.length === 0) {
      lines.push("No insights for this period yet.");
    } else {
      for (const insight of insights) {
        lines.push(`• ${insight.stat} ${insight.headline}`);
        if (insight.advice) lines.push(`  ${this.theme.fg("muted", insight.advice)}`);
        lines.push("");
      }
    }
    return lines.map((line) => truncateToWidth(line, width));
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;

    const panelWidth = Math.max(20, width - 2);
    const lines = [panelBorder(this.theme, panelWidth, "╭", "╮")];
    const header = this.renderHeader(panelWidth);
    const body = this.view === "overview"
      ? this.renderOverview(panelWidth)
      : this.view === "live"
        ? this.renderLive(panelWidth)
        : this.view === "providers"
          ? this.renderProviders(panelWidth)
          : this.view === "tools"
            ? this.renderTools(panelWidth)
            : this.view === "graph"
              ? this.renderGraph(panelWidth)
              : this.renderInsights(panelWidth);

    lines.push(...header.map((line) => panelRow(this.theme, line, panelWidth)));
    lines.push(...body.map((line) => panelRow(this.theme, line, panelWidth)));
    lines.push(panelBorder(this.theme, panelWidth, "├", "┤"));
    lines.push(panelRow(this.theme, this.theme.fg(this.loading ? "warning" : "dim", this.message), panelWidth));
    lines.push(panelBorder(this.theme, panelWidth, "╰", "╯"));

    this.cachedWidth = width;
    this.cachedLines = lines.map((line) => truncateToWidth(line, width));
    return this.cachedLines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }
}

export async function openUsageDashboard(
  ctx: ExtensionCommandContext,
  deps: {
    snapshot: DashboardSnapshot;
    usageData: UsageData | undefined;
    loadDashboard: (force: boolean) => Promise<DashboardSnapshot>;
    loadUsageData: (force: boolean) => Promise<UsageData | undefined>;
    exportView: (view: "table" | "graph" | "insights", period: TabName) => Promise<string>;
  },
): Promise<void> {
  await ctx.ui.custom<void>((tui, theme, _keybindings, done) =>
    new UsageDashboardComponent({
      theme,
      done,
      requestRender: () => tui.requestRender(),
      snapshot: deps.snapshot,
      usageData: deps.usageData,
      loadDashboard: deps.loadDashboard,
      loadUsageData: deps.loadUsageData,
      exportView: deps.exportView,
    }),
  );
}
