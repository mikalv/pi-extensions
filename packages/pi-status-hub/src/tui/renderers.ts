import type { GroupData, ProviderRecord, TaskRecord } from "../types.ts";

function statusMark(status: string): string {
  if (status === "done") return "*";
  if (status === "in_progress") return "~";
  if (status === "available") return "+";
  if (status === "ready") return "+";
  if (status === "error") return "!";
  return " ";
}

function renderTasks(data: GroupData): string[] {
  const items = (data.items ?? []) as TaskRecord[];
  const session = items.filter((item) => item.source === "session");
  const project = items.filter((item) => item.source === "project");
  const kanboard = items.filter((item) => item.source === "kanboard");
  const lines: string[] = [];
  if (session.length > 0) {
    lines.push("Session");
    for (const item of session.slice(0, 6)) lines.push(`  [${statusMark(item.status)}] ${item.title}`);
  }
  if (project.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push("Project");
    for (const item of project.slice(0, 4)) lines.push(`  [${statusMark(item.status)}] ${item.title}`);
  }
  if (kanboard.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push("Kanboard");
    for (const item of kanboard.slice(0, 4)) lines.push(`  [${statusMark(item.status)}] ${item.title}`);
  }
  return lines;
}

function renderProviders(data: GroupData): string[] {
  const items = (data.items ?? []) as ProviderRecord[];
  return items.slice(0, 10).map((item) => {
    const bits = [`[${statusMark(item.status)}] ${item.label}`];
    if (item.modelCount) bits.push(`${item.modelCount} models`);
    if (item.authPreference) bits.push(item.authPreference);
    return bits.join(" · ");
  });
}

function renderUsage(data: GroupData): string[] {
  const items = (data.items ?? []) as Array<{ providerName?: string; status?: string; summary?: string; metrics?: Array<{ label: string; value: string }> }>;
  return items.slice(0, 10).map((item) => {
    const metricText = item.metrics?.slice(0, 2).map((metric) => `${metric.label} ${metric.value}`).join(" · ");
    return `[${statusMark(item.status || "")}] ${item.providerName || "Unknown"} · ${item.summary || metricText || "No details"}`;
  });
}

export function renderGroupData(groupId: string, data: GroupData | null): string[] {
  if (!data) return ["No data loaded yet."];
  const lines: string[] = [];
  if (data.summary) lines.push(data.summary);
  if (data.metrics?.length) {
    lines.push("");
    lines.push(data.metrics.map((metric) => `${metric.label} ${metric.value}`).join(" · "));
  }
  if (Array.isArray(data.items) && data.items.length > 0) {
    lines.push("");
    if (groupId === "tasks") lines.push(...renderTasks(data));
    else if (groupId === "providers") lines.push(...renderProviders(data));
    else if (groupId === "usage") lines.push(...renderUsage(data));
    else for (const item of data.items.slice(0, 12)) lines.push(`- ${JSON.stringify(item)}`);
  }
  if (data.error) {
    lines.push("");
    lines.push(`Error: ${data.error}`);
  }
  return lines;
}
