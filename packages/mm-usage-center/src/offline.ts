import {
  collectUsageData,
  type ProviderStats,
  type TimeFilteredStats,
} from "./legacy/usage-data";

export interface OfflinePeriodSummary {
  sessions: number;
  messages: number;
  cost: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface OfflineProviderSummary extends OfflinePeriodSummary {
  name: string;
}

export interface OfflineInsightSummary {
  stat: string;
  headline: string;
}

export interface OfflineSnapshot {
  generatedAt: number;
  periods: {
    today: OfflinePeriodSummary;
    thisWeek: OfflinePeriodSummary;
    last30Days: OfflinePeriodSummary;
    allTime: OfflinePeriodSummary;
  };
  topProviders: OfflineProviderSummary[];
  insights: OfflineInsightSummary[];
}

function toPeriodSummary(period: TimeFilteredStats): OfflinePeriodSummary {
  return {
    sessions: period.totals.sessions,
    messages: period.totals.messages,
    cost: period.totals.cost,
    input: period.totals.tokens.input,
    output: period.totals.tokens.output,
    cacheRead: period.totals.tokens.cacheRead,
    cacheWrite: period.totals.tokens.cacheWrite,
  };
}

function toProviderSummary(name: string, provider: ProviderStats): OfflineProviderSummary {
  return {
    name,
    sessions: provider.sessions.size,
    messages: provider.messages,
    cost: provider.cost,
    input: provider.tokens.input,
    output: provider.tokens.output,
    cacheRead: provider.tokens.cacheRead,
    cacheWrite: provider.tokens.cacheWrite,
  };
}

export async function collectOfflineSnapshot(): Promise<OfflineSnapshot> {
  const usage = await collectUsageData();
  if (!usage) {
    return {
      generatedAt: Date.now(),
      periods: {
        today: { sessions: 0, messages: 0, cost: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        thisWeek: { sessions: 0, messages: 0, cost: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        last30Days: { sessions: 0, messages: 0, cost: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        allTime: { sessions: 0, messages: 0, cost: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      },
      topProviders: [],
      insights: [],
    };
  }

  const topProviders = [...usage.last30Days.providers.entries()]
    .map(([name, provider]) => toProviderSummary(name, provider))
    .sort((a, b) => b.cost - a.cost || b.output - a.output || a.name.localeCompare(b.name))
    .slice(0, 5);

  const insights = usage.last30Days.insights.insights
    .slice(0, 3)
    .map((insight) => ({ stat: insight.stat, headline: insight.headline }));

  return {
    generatedAt: Date.now(),
    periods: {
      today: toPeriodSummary(usage.today),
      thisWeek: toPeriodSummary(usage.thisWeek),
      last30Days: toPeriodSummary(usage.last30Days),
      allTime: toPeriodSummary(usage.allTime),
    },
    topProviders,
    insights,
  };
}
