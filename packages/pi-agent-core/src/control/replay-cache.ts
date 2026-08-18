import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { RunRecord } from "../types.js";

export interface ReplayCacheOptions {
  persistPath?: string;
  maxEntries?: number;
  ttlMs?: number;
}

interface CacheEntry {
  record: RunRecord;
  createdAt: number;
}

export class ReplayCache {
  private cache = new Map<string, CacheEntry>();
  private persistPath?: string;
  private maxEntries: number;
  private ttlMs?: number;

  constructor(options?: ReplayCacheOptions) {
    this.persistPath = options?.persistPath;
    this.maxEntries = options?.maxEntries ?? 1000;
    this.ttlMs = options?.ttlMs;
  }

  get size(): number {
    return this.cache.size;
  }

  /**
   * Compute deterministic replay key from agent name, prompt and options
   */
  public computeKey(
    agentName: string,
    prompt: string,
    options?: Record<string, unknown>
  ): string {
    const normAgent = agentName.trim();
    const normPrompt = prompt.trim();
    
    // Sort keys of options for stability
    let normOptions = "";
    if (options && Object.keys(options).length > 0) {
      const sortedKeys = Object.keys(options).sort();
      const cleanObj: Record<string, unknown> = {};
      for (const k of sortedKeys) {
        if (options[k] !== undefined && typeof options[k] !== "function") {
          cleanObj[k] = options[k];
        }
      }
      normOptions = JSON.stringify(cleanObj);
    }

    const payload = `${normAgent}::${normPrompt}::${normOptions}`;
    return `replay_${createHash("sha256").update(payload).digest("hex").slice(0, 24)}`;
  }

  /**
   * Get cached RunRecord if present and not expired
   */
  public get(key: string): RunRecord | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (this.ttlMs && Date.now() - entry.createdAt > this.ttlMs) {
      this.cache.delete(key);
      return undefined;
    }

    // Return a clone to prevent mutation
    return JSON.parse(JSON.stringify(entry.record));
  }

  /**
   * Store completed RunRecord in cache
   */
  public set(key: string, record: RunRecord): void {
    // Evict oldest if max capacity reached
    if (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      record: JSON.parse(JSON.stringify(record)),
      createdAt: Date.now(),
    });
  }

  public has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  public delete(key: string): boolean {
    return this.cache.delete(key);
  }

  public clear(): void {
    this.cache.clear();
  }

  /**
   * Persist cache to disk JSON
   */
  public async saveToDisk(customPath?: string): Promise<void> {
    const target = customPath ?? this.persistPath;
    if (!target) return;

    await mkdir(dirname(target), { recursive: true });
    const serialized: Record<string, CacheEntry> = {};
    for (const [k, v] of this.cache.entries()) {
      serialized[k] = v;
    }
    await writeFile(target, JSON.stringify(serialized, null, 2), "utf-8");
  }

  /**
   * Load cache from disk JSON
   */
  public async loadFromDisk(customPath?: string): Promise<void> {
    const target = customPath ?? this.persistPath;
    if (!target) return;

    try {
      const data = await readFile(target, "utf-8");
      const parsed = JSON.parse(data) as Record<string, CacheEntry>;
      for (const [k, v] of Object.entries(parsed)) {
        if (v && v.record) {
          this.cache.set(k, v);
        }
      }
    } catch {
      // File does not exist or invalid JSON; start empty
    }
  }
}
