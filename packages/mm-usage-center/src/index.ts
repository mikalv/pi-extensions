import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { collectTopTools, type ToolUsageSummary } from "./collector";
import { openUsageDashboard, type DashboardSnapshot } from "./dashboard";
import { buildGraphCsv, buildInsightsJson, buildTableCsv, exportFileName, parseExportDirSetting, resolveExportDir } from "./legacy/usage-export";
import { buildGraphModel, renderChart, type GraphGroupBy, type GraphMetric } from "./legacy/usage-graph";
import { collectUsageData, getAgentDir, type TabName, type UsageData } from "./legacy/usage-data";
import { queryAllLiveUsage, queryCurrentLiveUsage, type LiveUsageState, type LiveUsageWindow } from "./live";
import { collectOfflineSnapshot, type OfflinePeriodSummary, type OfflineProviderSummary, type OfflineSnapshot } from "./offline";

const STATUS_KEY = "mm-usage-center";
const WIDGET_KEY = "mm-usage-center";
const OFFLINE_CACHE_TTL_MS = 60_000;
const LIVE_CACHE_TTL_MS = 120_000;

const TAB_NAMES: TabName[] = ["today", "thisWeek", "lastWeek", "last30Days", "allTime"];
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

function totalTokens(period: OfflinePeriodSummary | OfflineProviderSummary): number {
  return period.input + period.output + period.cacheWrite;
}

function renderPeriod(label: string, counters: OfflinePeriodSummary): string {
  return `${label.padEnd(5)} ${formatCost(counters.cost).padStart(8)}  ${formatTokens(totalTokens(counters)).padStart(7)} tok  ${String(counters.messages).padStart(5)} msg  ${String(counters.sessions).padStart(4)} ses`;
}

function renderProviderRows(rows: OfflineProviderSummary[]): string[] {
  if (rows.length === 0) return ["  - none"];
  return rows.map((row, index) => `  ${index + 1}. ${row.name} · ${formatCost(row.cost)} · ${formatTokens(totalTokens(row))} tok`);
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

function renderLiveRows(rows: LiveUsageState[]): string[] {
  if (rows.length === 0) return ["  - none"];
  return rows.map((row) => {
    if (row.status === "ready" && row.snapshot) {
      const summary = row.snapshot.windows.slice(0, 2).map(formatWindow).join(" · ");
      return `  ${row.providerName}: ${summary || "live data available"}`;
    }
    if (row.status === "unavailable") return `  ${row.providerName}: auth unavailable`;
    return `  ${row.providerName}: ${row.message || "error"}`;
  });
}

function renderToolRows(rows: ToolUsageSummary[]): string[] {
  if (rows.length === 0) return ["  - none"];
  return rows.map((row, index) => `  ${index + 1}. ${row.name} · ${formatCost(row.cost)} · ${formatTokens(row.input + row.output + row.cacheWrite)} tok`);
}

function normalizeTabName(value: string | undefined): TabName {
  if (!value) return "last30Days";
  if (value === "30d") return "last30Days";
  if (value === "week") return "thisWeek";
  if (value === "all") return "allTime";
  return TAB_NAMES.includes(value as TabName) ? (value as TabName) : "last30Days";
}

function normalizeGraphMetric(value: string | undefined): GraphMetric {
  return GRAPH_METRICS.includes(value as GraphMetric) ? (value as GraphMetric) : "cost";
}

function normalizeGraphGroup(value: string | undefined): GraphGroupBy {
  return GRAPH_GROUPS.includes(value as GraphGroupBy) ? (value as GraphGroupBy) : "provider";
}

function buildGraphWidgetLines(data: UsageData, tab: TabName, metric: GraphMetric, groupBy: GraphGroupBy, cumulative: boolean): string[] {
  const model = buildGraphModel(data.hourly, {
    period: tab,
    metric,
    groupBy,
    cumulative,
    bounds: data.bounds,
  });

  const chart = renderChart(model, {
    width: 84,
    height: 10,
    formatValue: metric === "cost" ? formatAxisCost : formatAxisCount,
    formatTime: (ms) => {
      const d = new Date(ms);
      return tab === "today" || tab === "thisWeek" || tab === "lastWeek"
        ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
        : d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
    },
  });

  const legend = model.series
    .slice(0, 6)
    .map((series) => `  ${series.label} · ${metric === "cost" ? formatAxisCost(series.total) : formatAxisCount(series.total)}`);

  return [
    `Usage Center · Graph (${tab})`,
    `${cumulative ? "cumulative" : "per-bucket"} · ${metric} · ${groupBy}`,
    "",
    ...chart,
    "",
    "Legend",
    ...legend,
  ];
}

function buildWidget(snapshot: DashboardSnapshot, data?: UsageData): string[] {
  const liveReady = snapshot.live.filter((row) => row.status === "ready");
  const graphLines = data ? ["", ...buildGraphWidgetLines(data, "last30Days", "cost", "provider", true).slice(0, 15)] : [];
  return [
    "Usage Center",
    renderPeriod("Today", snapshot.offline.periods.today),
    renderPeriod("Week", snapshot.offline.periods.thisWeek),
    renderPeriod("30d", snapshot.offline.periods.last30Days),
    renderPeriod("All", snapshot.offline.periods.allTime),
    "",
    "Live quotas",
    ...renderLiveRows(liveReady.length > 0 ? liveReady : snapshot.live),
    "",
    "Top providers (30d)",
    ...renderProviderRows(snapshot.offline.topProviders),
    "",
    "Top tools",
    ...renderToolRows(snapshot.tools),
    ...(snapshot.offline.insights.length > 0
      ? ["", "Insights", ...snapshot.offline.insights.map((insight) => `  - ${insight.stat} ${insight.headline}`)]
      : []),
    ...graphLines,
    "",
    `Updated ${new Date(snapshot.generatedAt).toLocaleTimeString()}`,
  ];
}

function buildStatusFromLive(live: LiveUsageState | undefined, offline: OfflineSnapshot): string {
  if (live?.status === "ready" && live.snapshot && live.snapshot.windows.length > 0) {
    const first = live.snapshot.windows[0]!;
    if (first.usedPercent !== undefined) {
      const remaining = Math.max(0, Math.round(100 - first.usedPercent));
      return `${live.providerName.toLowerCase()} ${remaining}% left`;
    }
    if (first.remaining !== undefined || first.limit !== undefined) {
      const unit = first.unit === "usd" ? "$" : "";
      return `${live.providerName.toLowerCase()} ${unit}${first.remaining ?? "?"}/${unit}${first.limit ?? "?"}`;
    }
  }
  return `usage ${formatCost(offline.periods.today.cost)} · ${formatTokens(totalTokens(offline.periods.today))}`;
}

function writeExport(view: "table" | "graph" | "insights", period: TabName, content: string): string {
  let configured: string | null = null;
  try {
    configured = parseExportDirSetting(readFileSync(join(getAgentDir(), "settings.json"), "utf8"));
  } catch {
    // ignore
  }
  const home = homedir();
  const dir = resolveExportDir(configured, home, existsSync("/tmp"), tmpdir());
  mkdirSync(dir, { recursive: true });
  const extension = view === "insights" ? "json" : "csv";
  const slice = view === "graph" ? "cumulative-cost-by-provider" : null;
  const path = join(dir, exportFileName(view, period, slice, extension, new Date()));
  writeFileSync(path, content);
  return path.startsWith(home + "/") ? "~" + path.slice(home.length) : path;
}

export default function usageCenter(pi: ExtensionAPI): void {
  let cachedOffline: OfflineSnapshot | undefined;
  let cachedOfflineAt = 0;
  let offlineInflight: Promise<OfflineSnapshot> | undefined;

  let cachedUsageData: UsageData | undefined;
  let cachedUsageDataAt = 0;
  let usageDataInflight: Promise<UsageData | undefined> | undefined;

  let cachedTools: ToolUsageSummary[] | undefined;
  let cachedToolsAt = 0;
  let toolsInflight: Promise<ToolUsageSummary[]> | undefined;

  let cachedLive: LiveUsageState[] | undefined;
  let cachedLiveAt = 0;
  let liveInflight: Promise<LiveUsageState[]> | undefined;

  const getOffline = async (force = false): Promise<OfflineSnapshot> => {
    if (!force && cachedOffline && Date.now() - cachedOfflineAt < OFFLINE_CACHE_TTL_MS) return cachedOffline;
    if (offlineInflight) return offlineInflight;
    offlineInflight = collectOfflineSnapshot()
      .then((snapshot) => {
        cachedOffline = snapshot;
        cachedOfflineAt = Date.now();
        return snapshot;
      })
      .finally(() => {
        offlineInflight = undefined;
      });
    return offlineInflight;
  };

  const getUsageData = async (force = false): Promise<UsageData | undefined> => {
    if (!force && cachedUsageData && Date.now() - cachedUsageDataAt < OFFLINE_CACHE_TTL_MS) return cachedUsageData;
    if (usageDataInflight) return usageDataInflight;
    usageDataInflight = collectUsageData()
      .then((data) => {
        cachedUsageData = data ?? undefined;
        cachedUsageDataAt = Date.now();
        return cachedUsageData;
      })
      .finally(() => {
        usageDataInflight = undefined;
      });
    return usageDataInflight;
  };

  const getTools = async (force = false): Promise<ToolUsageSummary[]> => {
    if (!force && cachedTools && Date.now() - cachedToolsAt < OFFLINE_CACHE_TTL_MS) return cachedTools;
    if (toolsInflight) return toolsInflight;
    toolsInflight = collectTopTools()
      .then((rows) => {
        cachedTools = rows;
        cachedToolsAt = Date.now();
        return rows;
      })
      .finally(() => {
        toolsInflight = undefined;
      });
    return toolsInflight;
  };

  const getLive = async (ctx: ExtensionContext, force = false): Promise<LiveUsageState[]> => {
    if (!force && cachedLive && Date.now() - cachedLiveAt < LIVE_CACHE_TTL_MS) return cachedLive;
    if (liveInflight) return liveInflight;
    liveInflight = queryAllLiveUsage(ctx)
      .then((rows) => {
        cachedLive = rows;
        cachedLiveAt = Date.now();
        return rows;
      })
      .finally(() => {
        liveInflight = undefined;
      });
    return liveInflight;
  };

  const getDashboard = async (ctx: ExtensionContext, force = false): Promise<DashboardSnapshot> => {
    const [offline, tools, live] = await Promise.all([getOffline(force), getTools(force), getLive(ctx, force)]);
    return { offline, tools, live, generatedAt: Date.now() };
  };

  const refreshStatus = async (ctx: ExtensionContext, force = false): Promise<void> => {
    try {
      const [offline, live] = await Promise.all([getOffline(force), queryCurrentLiveUsage(ctx)]);
      if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, buildStatusFromLive(live, offline));
    } catch (error) {
      if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, "usage unavailable");
      ctx.ui.notify(`mm-usage-center: ${error instanceof Error ? error.message : String(error)}`, "error");
    }
  };

  const showDashboard = async (ctx: ExtensionCommandContext): Promise<void> => {
    const [snapshot, data] = await Promise.all([getDashboard(ctx, true), getUsageData(true)]);
    await refreshStatus(ctx, false);
    if (ctx.mode === "tui") {
      await openUsageDashboard(ctx, {
        snapshot,
        usageData: data,
        loadDashboard: (force) => getDashboard(ctx, force),
        loadUsageData: (force) => getUsageData(force),
        exportView: async (view, period) => {
          const usageData = await getUsageData(true);
          if (!usageData) throw new Error("No usage data available");
          const stats = usageData[period];
          let content = "";
          if (view === "graph") {
            const model = buildGraphModel(usageData.hourly, {
              period,
              metric: "cost",
              groupBy: "provider",
              cumulative: true,
              bounds: usageData.bounds,
            });
            content = buildGraphCsv(model);
          } else if (view === "insights") {
            content = buildInsightsJson(period, stats.totals, stats.insights.insights);
          } else {
            content = buildTableCsv(stats.providers, stats.totals);
          }
          return writeExport(view, period, content);
        },
      });
    } else if (ctx.hasUI) {
      ctx.ui.setWidget(WIDGET_KEY, buildWidget(snapshot, data));
    }
    ctx.ui.notify(ctx.mode === "tui" ? "Usage Center dashboard opened" : "Usage Center refreshed", "info");
  };

  pi.on("session_start", async (_event: unknown, ctx: ExtensionContext) => {
    await refreshStatus(ctx, true);
  });

  pi.on("agent_end", async (_event: unknown, ctx: ExtensionContext) => {
    await refreshStatus(ctx, false);
  });

  pi.on("model_select", async (_event: unknown, ctx: ExtensionContext) => {
    await refreshStatus(ctx, true);
  });

  pi.on("session_shutdown", async (_event: unknown, ctx: ExtensionContext) => {
    if (!ctx.hasUI) return;
    ctx.ui.setStatus(STATUS_KEY, undefined);
    ctx.ui.setWidget(WIDGET_KEY, undefined);
  });

  pi.registerCommand("usage-center", {
    description: "Show merged live quota + offline usage analytics",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const action = (parts[0] || "").toLowerCase();

      if (action === "dashboard") {
        await showDashboard(ctx);
        return;
      }

      if (action === "hide") {
        if (ctx.hasUI) ctx.ui.setWidget(WIDGET_KEY, undefined);
        ctx.ui.notify("Usage Center widget hidden", "info");
        return;
      }

      if (action === "status") {
        await refreshStatus(ctx, true);
        ctx.ui.notify("Usage Center status refreshed", "info");
        return;
      }

      if (action === "live") {
        const live = await getLive(ctx, true);
        if (ctx.hasUI) ctx.ui.setWidget(WIDGET_KEY, ["Usage Center · Live quotas", ...renderLiveRows(live), "", `Updated ${new Date().toLocaleTimeString()}`]);
        await refreshStatus(ctx, false);
        ctx.ui.notify("Usage Center live quotas refreshed", "info");
        return;
      }

      if (action === "graph") {
        const tab = normalizeTabName(parts[1]);
        const metric = normalizeGraphMetric(parts[2]);
        const groupBy = normalizeGraphGroup(parts[3]);
        const cumulative = parts[4] !== "bucket" && parts[4] !== "per-bucket";
        const data = await getUsageData(true);
        if (!data) {
          ctx.ui.notify("No usage data available", "error");
          return;
        }
        if (ctx.hasUI) ctx.ui.setWidget(WIDGET_KEY, buildGraphWidgetLines(data, tab, metric, groupBy, cumulative));
        ctx.ui.notify(`Usage Center graph: ${tab} ${metric} ${groupBy}`, "info");
        return;
      }

      if (action === "export") {
        const view = (parts[1] || "table").toLowerCase() as "table" | "graph" | "insights";
        const tab = normalizeTabName(parts[2]);
        const data = await getUsageData(true);
        if (!data) {
          ctx.ui.notify("No usage data available", "error");
          return;
        }
        const stats = data[tab];
        let content = "";
        if (view === "graph") {
          const model = buildGraphModel(data.hourly, {
            period: tab,
            metric: "cost",
            groupBy: "provider",
            cumulative: true,
            bounds: data.bounds,
          });
          content = buildGraphCsv(model);
        } else if (view === "insights") {
          content = buildInsightsJson(tab, stats.totals, stats.insights.insights);
        } else {
          content = buildTableCsv(stats.providers, stats.totals);
        }
        const exported = writeExport(view, tab, content);
        ctx.ui.notify(`Usage Center exported to ${exported}`, "info");
        return;
      }

      await showDashboard(ctx);
    },
  });
}
