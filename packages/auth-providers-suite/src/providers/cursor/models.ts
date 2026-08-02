import fs from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface CursorModelCache {
  models: Array<{ modelId: string; displayName?: string }>;
  lastUpdatedAt?: string;
}

export interface CursorUsableModelsResponse {
  models: Array<{ modelId: string; displayName?: string }>;
}

export function getCursorAgentDir(): string {
  return process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
}

export function getCursorModelsCacheDir(): string {
  return join(getCursorAgentDir(), "cache", "cursor-agent");
}

export function getCursorModelsCachePath(): string {
  return join(getCursorModelsCacheDir(), "models.json");
}

export function readCursorModelCache(): CursorModelCache | undefined {
  try {
    const path = getCursorModelsCachePath();
    if (!fs.existsSync(path)) return undefined;
    return JSON.parse(fs.readFileSync(path, "utf8")) as CursorModelCache;
  } catch {
    return undefined;
  }
}

export function isCursorModelCacheStale(cache: CursorModelCache | undefined, ttlMs = 24 * 60 * 60 * 1000): boolean {
  if (!cache?.lastUpdatedAt) return true;
  const lastUpdatedAt = Date.parse(cache.lastUpdatedAt);
  return Number.isNaN(lastUpdatedAt) || Date.now() - lastUpdatedAt >= ttlMs;
}

export function getCachedCursorModelIds(): string[] {
  return (readCursorModelCache()?.models ?? []).map((model) => model.modelId).filter(Boolean);
}

export async function writeCursorModelCache(response: CursorUsableModelsResponse): Promise<void> {
  await fs.promises.mkdir(getCursorModelsCacheDir(), { recursive: true });
  await fs.promises.writeFile(
    getCursorModelsCachePath(),
    JSON.stringify({ models: response.models, lastUpdatedAt: new Date().toISOString() }, null, 2),
  );
}
