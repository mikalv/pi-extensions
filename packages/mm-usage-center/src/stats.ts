import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "./legacy/usage-data";

export type DailyActivity = {
  date: string; // YYYY-MM-DD
  messageCount: number;
  sessionCount: number;
  tokens: number;
  cost: number;
};

export type StreakInfo = {
  currentStreak: number;
  longestStreak: number;
  activeDays: number;
  totalDays: number;
};

export type ActivityStats = {
  totalSessions: number;
  totalMessages: number;
  totalTokens: number;
  totalCost: number;
  firstSessionDate: string | null;
  lastSessionDate: string | null;
  activeDays: number;
  totalDays: number;
  mostActiveDay: { date: string; messageCount: number; tokens: number } | null;
  longestSessionDurationMs: number;
  streaks: StreakInfo;
  favoriteModel: string | null;
  dailyActivity: DailyActivity[];
};

export function toDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Scan all JSONL session files in ~/.pi/agent/sessions/ and build full activity stats.
 */
export async function collectActivityStats(): Promise<ActivityStats> {
  const sessionsDir = join(getAgentDir(), "sessions");
  const dailyMap = new Map<string, { messageCount: number; sessionCount: number; tokens: number; cost: number }>();
  const modelMap = new Map<string, number>();

  let totalSessions = 0;
  let totalMessages = 0;
  let totalTokens = 0;
  let totalCost = 0;
  let longestSessionDurationMs = 0;
  let firstSessionDate: string | null = null;
  let lastSessionDate: string | null = null;

  function findJsonlFiles(dir: string): string[] {
    const files: string[] = [];
    try {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        const full = join(dir, entry);
        try {
          const st = statSync(full);
          if (st.isDirectory()) {
            files.push(...findJsonlFiles(full));
          } else if (entry.endsWith(".jsonl")) {
            files.push(full);
          }
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }
    return files;
  }

  const jsonlFiles = findJsonlFiles(sessionsDir);

  for (const filePath of jsonlFiles) {
    try {
      const content = readFileSync(filePath, "utf-8");
      const lines = content.split("\n").filter((l) => l.trim());
      if (lines.length === 0) continue;

      totalSessions++;

      let sessionStartTime: number | null = null;
      let sessionEndTime: number | null = null;

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          const timestamp = entry.timestamp ? new Date(entry.timestamp).getTime() : null;

          if (timestamp && !isNaN(timestamp)) {
            if (!sessionStartTime || timestamp < sessionStartTime) sessionStartTime = timestamp;
            if (!sessionEndTime || timestamp > sessionEndTime) sessionEndTime = timestamp;

            const dateStr = toDateString(new Date(timestamp));
            if (!firstSessionDate || dateStr < firstSessionDate) firstSessionDate = dateStr;
            if (!lastSessionDate || dateStr > lastSessionDate) lastSessionDate = dateStr;

            let dayStat = dailyMap.get(dateStr);
            if (!dayStat) {
              dayStat = { messageCount: 0, sessionCount: 0, tokens: 0, cost: 0 };
              dailyMap.set(dateStr, dayStat);
            }

            if (entry.type === "message" || entry.type === "user" || entry.type === "assistant" || entry.type === "message_entry") {
              totalMessages++;
              dayStat.messageCount++;
            }

            if (entry.message?.usage || entry.usage) {
              const u = entry.message?.usage || entry.usage;
              const tok = (u.input || 0) + (u.output || 0) + (u.cacheRead || 0) + (u.cacheWrite || 0);
              const cost = u.cost || 0;
              totalTokens += tok;
              totalCost += cost;
              dayStat.tokens += tok;
              dayStat.cost += cost;
            }

            const modelName = entry.message?.model || entry.model;
            if (modelName && typeof modelName === "string") {
              modelMap.set(modelName, (modelMap.get(modelName) || 0) + 1);
            }
          }
        } catch {
          // ignore parse error for individual line
        }
      }

      if (sessionStartTime && sessionEndTime && sessionEndTime >= sessionStartTime) {
        const duration = sessionEndTime - sessionStartTime;
        if (duration > longestSessionDurationMs) {
          longestSessionDurationMs = duration;
        }
      }
    } catch {
      // ignore
    }
  }

  // Build dailyActivity list
  const dailyActivity: DailyActivity[] = [];
  for (const [date, stat] of dailyMap.entries()) {
    dailyActivity.push({
      date,
      messageCount: stat.messageCount,
      sessionCount: stat.sessionCount,
      tokens: stat.tokens,
      cost: stat.cost,
    });
  }
  dailyActivity.sort((a, b) => a.date.localeCompare(b.date));

  // Find most active day
  let mostActiveDay: { date: string; messageCount: number; tokens: number } | null = null;
  for (const day of dailyActivity) {
    if (!mostActiveDay || day.messageCount > mostActiveDay.messageCount) {
      mostActiveDay = { date: day.date, messageCount: day.messageCount, tokens: day.tokens };
    }
  }

  // Find favorite model
  let favoriteModel: string | null = null;
  let maxModelCount = 0;
  for (const [m, count] of modelMap.entries()) {
    if (count > maxModelCount) {
      maxModelCount = count;
      favoriteModel = m;
    }
  }

  // Calculate streaks & days
  const activeDays = dailyActivity.length;
  let totalDays = 0;
  let currentStreak = 0;
  let longestStreak = 0;

  if (firstSessionDate && lastSessionDate) {
    const start = new Date(firstSessionDate).getTime();
    const end = new Date(lastSessionDate).getTime();
    totalDays = Math.max(1, Math.round((end - start) / (24 * 3600 * 1000)) + 1);

    // Calculate streaks by walking backwards from today
    const activeDateSet = new Set(dailyActivity.map((d) => d.date));
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let checkDate = new Date(today);
    // If today is active, count it; if not, check if yesterday was active
    let checkStr = toDateString(checkDate);
    if (!activeDateSet.has(checkStr)) {
      checkDate.setDate(checkDate.getDate() - 1);
      checkStr = toDateString(checkDate);
    }

    while (activeDateSet.has(checkStr)) {
      currentStreak++;
      checkDate.setDate(checkDate.getDate() - 1);
      checkStr = toDateString(checkDate);
    }

    // Longest streak
    let tempStreak = 0;
    const sortedDates = Array.from(activeDateSet).sort();
    let prevDateMs: number | null = null;

    for (const dStr of sortedDates) {
      const curMs = new Date(dStr).getTime();
      if (prevDateMs !== null && curMs - prevDateMs <= 25 * 3600 * 1000) {
        tempStreak++;
      } else {
        tempStreak = 1;
      }
      if (tempStreak > longestStreak) longestStreak = tempStreak;
      prevDateMs = curMs;
    }
  }

  return {
    totalSessions,
    totalMessages,
    totalTokens,
    totalCost,
    firstSessionDate,
    lastSessionDate,
    activeDays,
    totalDays,
    mostActiveDay,
    longestSessionDurationMs,
    streaks: {
      currentStreak,
      longestStreak,
      activeDays,
      totalDays,
    },
    favoriteModel,
    dailyActivity,
  };
}

export type HeatmapOptions = {
  terminalWidth?: number;
  showMonthLabels?: boolean;
};

type Percentiles = {
  p25: number;
  p50: number;
  p75: number;
};

function calculatePercentiles(dailyActivity: DailyActivity[]): Percentiles | null {
  const counts = dailyActivity.map((a) => a.messageCount).filter((c) => c > 0).sort((a, b) => a - b);
  if (counts.length === 0) return null;

  return {
    p25: counts[Math.floor(counts.length * 0.25)]!,
    p50: counts[Math.floor(counts.length * 0.5)]!,
    p75: counts[Math.floor(counts.length * 0.75)]!,
  };
}

function getIntensity(messageCount: number, percentiles: Percentiles | null): number {
  if (messageCount === 0 || !percentiles) return 0;
  if (messageCount >= percentiles.p75) return 4;
  if (messageCount >= percentiles.p50) return 3;
  if (messageCount >= percentiles.p25) return 2;
  return 1;
}

function getHeatmapChar(intensity: number): string {
  switch (intensity) {
    case 0:
      return "·";
    case 1:
      return "░";
    case 2:
      return "▒";
    case 3:
      return "▓";
    case 4:
      return "█";
    default:
      return "·";
  }
}

/**
 * Generate GitHub-style activity heatmap string array for terminal.
 */
export function generateHeatmapLines(dailyActivity: DailyActivity[], options: HeatmapOptions = {}): string[] {
  const { terminalWidth = 80, showMonthLabels = true } = options;

  const dayLabelWidth = 4;
  const availableWidth = terminalWidth - dayLabelWidth;
  const width = Math.min(52, Math.max(10, availableWidth));

  const activityMap = new Map<string, DailyActivity>();
  for (const activity of dailyActivity) {
    activityMap.set(activity.date, activity);
  }

  const percentiles = calculatePercentiles(dailyActivity);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const currentWeekStart = new Date(today);
  currentWeekStart.setDate(today.getDate() - today.getDay());

  const startDate = new Date(currentWeekStart);
  startDate.setDate(startDate.getDate() - (width - 1) * 7);

  const grid: string[][] = Array.from({ length: 7 }, () => Array(width).fill(""));
  const monthStarts: { month: number; week: number }[] = [];
  let lastMonth = -1;

  const currentDate = new Date(startDate);
  for (let week = 0; week < width; week++) {
    for (let day = 0; day < 7; day++) {
      if (currentDate > today) {
        grid[day]![week] = " ";
        currentDate.setDate(currentDate.getDate() + 1);
        continue;
      }

      const dateStr = toDateString(currentDate);
      const activity = activityMap.get(dateStr);

      if (day === 0) {
        const month = currentDate.getMonth();
        if (month !== lastMonth) {
          monthStarts.push({ month, week });
          lastMonth = month;
        }
      }

      const intensity = getIntensity(activity?.messageCount || 0, percentiles);
      grid[day]![week] = getHeatmapChar(intensity);

      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  const lines: string[] = [];

  if (showMonthLabels) {
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const uniqueMonths = monthStarts.map((m) => m.month);
    const labelWidth = Math.max(1, Math.floor(width / Math.max(uniqueMonths.length, 1)));
    const monthLabels = uniqueMonths.map((month) => monthNames[month]!.padEnd(labelWidth)).join("");
    lines.push("    " + monthLabels);
  }

  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  for (let day = 0; day < 7; day++) {
    const label = [1, 3, 5].includes(day) ? dayLabels[day]!.padEnd(3) : "   ";
    const row = label + " " + grid[day]!.join("");
    lines.push(row);
  }

  lines.push("");
  lines.push("    Less ░ ▒ ▓ █ More");

  return lines;
}
