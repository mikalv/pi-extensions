import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Observation } from "./session-ledger/types.js";

export type GlobalObservationEntry = {
  id: string;
  content: string;
  timestamp: string;
  relevance: string;
  sourceEntryIds?: string[];
  loggedAt: number; // epoch ms
};

/**
 * Append observations to ~/.pi/agent/memory/global-observations.jsonl
 */
export function appendGlobalObservations(observations: Observation[]): void {
  if (!observations || observations.length === 0) return;

  try {
    const memoryDir = join(homedir(), ".pi", "agent", "memory");
    if (!existsSync(memoryDir)) {
      mkdirSync(memoryDir, { recursive: true });
    }

    const logFile = join(memoryDir, "global-observations.jsonl");
    const now = Date.now();

    const lines = observations.map((obs) => {
      const entry: GlobalObservationEntry = {
        id: obs.id,
        content: obs.content,
        timestamp: obs.timestamp,
        relevance: obs.relevance,
        sourceEntryIds: obs.sourceEntryIds,
        loggedAt: now,
      };
      return JSON.stringify(entry);
    });

    appendFileSync(logFile, lines.join("\n") + "\n", "utf-8");
  } catch (error) {
    console.error("[mm-observational-memory] Failed to append global observations:", error);
  }
}
