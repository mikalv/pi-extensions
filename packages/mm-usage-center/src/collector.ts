import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export interface ToolUsageSummary {
  name: string;
  cost: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

function getAgentDir(): string {
  return process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
}

async function collectSessionFiles(dir: string, acc: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectSessionFiles(fullPath, acc);
    } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      acc.push(fullPath);
    }
  }
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export async function collectTopTools(limit = 5): Promise<ToolUsageSummary[]> {
  const sessionsDir = join(getAgentDir(), "sessions");
  const files: string[] = [];
  await collectSessionFiles(sessionsDir, files);

  const toolMap = new Map<string, ToolUsageSummary>();

  for (const file of files) {
    const text = await readFile(file, "utf8");
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      let entry: any;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }

      if (entry.type === "message" && entry.message?.role === "toolResult" && typeof entry.message.toolName === "string" && entry.message.usage) {
        const name = entry.message.toolName;
        const current = toolMap.get(name) ?? {
          name,
          cost: 0,
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
        };
        current.cost += asNumber(entry.message.usage.cost?.total);
        current.input += asNumber(entry.message.usage.input);
        current.output += asNumber(entry.message.usage.output);
        current.cacheRead += asNumber(entry.message.usage.cacheRead);
        current.cacheWrite += asNumber(entry.message.usage.cacheWrite);
        toolMap.set(name, current);
      }
    }
  }

  return [...toolMap.values()]
    .sort((a, b) => b.cost - a.cost || b.output - a.output || a.name.localeCompare(b.name))
    .slice(0, limit);
}
