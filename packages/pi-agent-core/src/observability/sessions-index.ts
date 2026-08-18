import { homedir } from "node:os";
import { join, dirname, basename, extname } from "node:path";
import {
  stat,
  readdir,
  readFile,
  writeFile,
  rename,
  mkdir,
  rm,
} from "node:fs/promises";
import type { TokenUsage } from "../types.js";

export const CURRENT_SESSIONS_INDEX_VERSION = 1;
export const SESSIONS_INDEX_FILE = "sessions-index.json";

export interface SessionIndexEntry {
  sessionId: string;
  sessionFile: string;
  title?: string;
  mtime: number;
  size: number;
  messageCount: number;
  firstMessageAt?: number;
  lastMessageAt?: number;
  tokens: TokenUsage;
  cost?: number;
  model?: string;
}

export interface SessionIndexData {
  version: number;
  updatedAt: number;
  entries: Record<string, SessionIndexEntry>;
}

export interface SessionsIndexOptions {
  baseDir?: string;
}

export interface ScanResult {
  entries: SessionIndexEntry[];
  scannedCount: number;
  cacheHits: number;
  cacheMisses: number;
  durationMs: number;
}

/**
 * High-performance, atomic session indexer and metadata cache.
 * Scans session directories with mtime stat-tag validation for sub-100ms cold scans.
 */
export class SessionsIndex {
  private baseDir: string;
  private memoryCache: Map<string, SessionIndexEntry> = new Map();

  constructor(options?: SessionsIndexOptions) {
    this.baseDir =
      options?.baseDir ?? join(homedir(), ".pi", "agent", "sessions");
  }

  /**
   * Scan session files across base directory and all encoded project subdirectories.
   */
  public async scan(options?: { forceRefresh?: boolean }): Promise<ScanResult> {
    const startTime = performance.now();
    let scannedCount = 0;
    let cacheHits = 0;
    let cacheMisses = 0;

    const allEntries: SessionIndexEntry[] = [];
    this.memoryCache.clear();

    try {
      await mkdir(this.baseDir, { recursive: true });
    } catch {
      // directory exists or cannot create
    }

    const subdirs = await this.discoverSessionDirs(this.baseDir);

    for (const dir of subdirs) {
      const dirScan = await this.scanDirectory(dir, options?.forceRefresh);
      scannedCount += dirScan.scannedCount;
      cacheHits += dirScan.cacheHits;
      cacheMisses += dirScan.cacheMisses;

      for (const entry of dirScan.entries) {
        allEntries.push(entry);
        this.memoryCache.set(entry.sessionId, entry);
      }
    }

    const durationMs = performance.now() - startTime;
    return {
      entries: allEntries,
      scannedCount,
      cacheHits,
      cacheMisses,
      durationMs,
    };
  }

  /**
   * Find a session entry by its session ID.
   */
  public async findById(sessionId: string): Promise<SessionIndexEntry | undefined> {
    if (this.memoryCache.size === 0) {
      await this.scan();
    }
    return this.memoryCache.get(sessionId);
  }

  /**
   * Search session entries matching title, model, or sessionId substring.
   */
  public async search(query: string): Promise<SessionIndexEntry[]> {
    if (this.memoryCache.size === 0) {
      await this.scan();
    }
    const q = query.toLowerCase();
    const results: SessionIndexEntry[] = [];

    for (const entry of this.memoryCache.values()) {
      if (
        entry.sessionId.toLowerCase().includes(q) ||
        (entry.title && entry.title.toLowerCase().includes(q)) ||
        (entry.model && entry.model.toLowerCase().includes(q))
      ) {
        results.push(entry);
      }
    }

    return results.sort((a, b) => (b.lastMessageAt ?? b.mtime) - (a.lastMessageAt ?? a.mtime));
  }

  /**
   * Retrieve the most recent sessions sorted by last activity timestamp.
   */
  public async getRecent(limit = 20): Promise<SessionIndexEntry[]> {
    if (this.memoryCache.size === 0) {
      await this.scan();
    }
    const list = Array.from(this.memoryCache.values());
    list.sort((a, b) => (b.lastMessageAt ?? b.mtime) - (a.lastMessageAt ?? a.mtime));
    return list.slice(0, limit);
  }

  /**
   * Scan a single directory and manage its local sessions-index.json cache.
   */
  private async scanDirectory(
    dirPath: string,
    forceRefresh = false
  ): Promise<{
    entries: SessionIndexEntry[];
    scannedCount: number;
    cacheHits: number;
    cacheMisses: number;
  }> {
    const indexPath = join(dirPath, SESSIONS_INDEX_FILE);
    let cachedIndex: SessionIndexData | undefined;

    if (!forceRefresh) {
      cachedIndex = await this.readIndexFile(indexPath);
    }

    const currentEntries: Record<string, SessionIndexEntry> = {};
    let indexDirty = false;
    let scannedCount = 0;
    let cacheHits = 0;
    let cacheMisses = 0;

    let dirFiles: string[] = [];
    try {
      dirFiles = await readdir(dirPath);
    } catch {
      return { entries: [], scannedCount: 0, cacheHits: 0, cacheMisses: 0 };
    }

    const jsonlFiles = dirFiles.filter(
      (f) => f.endsWith(".jsonl") && !f.startsWith(".")
    );

    for (const fileName of jsonlFiles) {
      scannedCount++;
      const filePath = join(dirPath, fileName);

      let fileStat;
      try {
        fileStat = await stat(filePath);
      } catch {
        continue;
      }

      const mtime = Math.floor(fileStat.mtimeMs);
      const size = fileStat.size;

      const cachedEntry = cachedIndex?.entries?.[fileName];
      if (
        cachedEntry &&
        cachedEntry.mtime === mtime &&
        cachedEntry.size === size
      ) {
        currentEntries[fileName] = cachedEntry;
        cacheHits++;
      } else {
        cacheMisses++;
        indexDirty = true;
        const parsed = await this.parseSessionFile(filePath, mtime, size);
        if (parsed) {
          currentEntries[fileName] = parsed;
        }
      }
    }

    // Check if any deleted files were in cachedIndex
    if (cachedIndex?.entries) {
      for (const cachedFile of Object.keys(cachedIndex.entries)) {
        if (!jsonlFiles.includes(cachedFile)) {
          indexDirty = true;
        }
      }
    }

    // Atomically write updated index if dirty or new
    if (indexDirty || !cachedIndex) {
      await this.writeIndexAtomic(indexPath, {
        version: CURRENT_SESSIONS_INDEX_VERSION,
        updatedAt: Date.now(),
        entries: currentEntries,
      });
    }

    return {
      entries: Object.values(currentEntries),
      scannedCount,
      cacheHits,
      cacheMisses,
    };
  }

  /**
   * Discover base directory and all subdirectories containing sessions.
   */
  private async discoverSessionDirs(root: string): Promise<string[]> {
    const dirs = [root];
    try {
      const items = await readdir(root, { withFileTypes: true });
      for (const item of items) {
        if (item.isDirectory() && !item.name.startsWith(".")) {
          dirs.push(join(root, item.name));
        }
      }
    } catch {
      // return at least root
    }
    return dirs;
  }

  /**
   * Parse a single JSONL session file to extract summary metadata.
   */
  private async parseSessionFile(
    filePath: string,
    mtime: number,
    size: number
  ): Promise<SessionIndexEntry | undefined> {
    try {
      const content = await readFile(filePath, "utf-8");
      const lines = content.split("\n");

      let sessionId = basename(filePath, extname(filePath));
      let title: string | undefined;
      let model: string | undefined;
      let firstMessageAt: number | undefined;
      let lastMessageAt: number | undefined;
      let messageCount = 0;
      let cost: number | undefined;

      const tokens: TokenUsage = {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0,
      };

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const item = JSON.parse(trimmed);

          if (item.type === "session" || item.type === "session_meta") {
            if (item.id) sessionId = String(item.id);
            if (item.title) title = String(item.title);
            if (item.name && !title) title = String(item.name);
            continue;
          }

          if (
            item.type === "user" ||
            item.type === "assistant" ||
            item.type === "system" ||
            item.type === "custom" ||
            item.role === "user" ||
            item.role === "assistant"
          ) {
            messageCount++;
            const ts =
              typeof item.timestamp === "number"
                ? item.timestamp
                : typeof item.ts === "number"
                  ? item.ts
                  : undefined;

            if (ts) {
              if (firstMessageAt === undefined || ts < firstMessageAt) {
                firstMessageAt = ts;
              }
              if (lastMessageAt === undefined || ts > lastMessageAt) {
                lastMessageAt = ts;
              }
            }

            const msg = item.message ?? item;
            if (msg.model && typeof msg.model === "string") {
              model = msg.model;
            }

            const usage = msg.usage ?? item.usage;
            if (usage && typeof usage === "object") {
              const inp = Number(usage.input ?? usage.inputTokens ?? usage.promptTokens ?? 0);
              const out = Number(usage.output ?? usage.outputTokens ?? usage.completionTokens ?? 0);
              const cr = Number(usage.cacheRead ?? usage.cacheReadTokens ?? 0);
              const cw = Number(usage.cacheWrite ?? usage.cacheWriteTokens ?? 0);
              const tot = Number(usage.total ?? usage.totalTokens ?? inp + out);

              tokens.input += inp;
              tokens.output += out;
              tokens.cacheRead = (tokens.cacheRead ?? 0) + cr;
              tokens.cacheWrite = (tokens.cacheWrite ?? 0) + cw;
              tokens.total += tot;
            }

            if (typeof msg.cost === "number" || typeof item.cost === "number") {
              const c = Number(msg.cost ?? item.cost);
              cost = (cost ?? 0) + c;
            }
          }
        } catch {
          // ignore malformed lines
        }
      }

      return {
        sessionId,
        sessionFile: filePath,
        title,
        mtime,
        size,
        messageCount,
        firstMessageAt,
        lastMessageAt,
        tokens,
        cost,
        model,
      };
    } catch {
      return undefined;
    }
  }

  /**
   * Safely read and validate an index file from disk.
   */
  private async readIndexFile(
    indexPath: string
  ): Promise<SessionIndexData | undefined> {
    try {
      const raw = await readFile(indexPath, "utf-8");
      const data = JSON.parse(raw);
      if (
        data &&
        typeof data === "object" &&
        data.version === CURRENT_SESSIONS_INDEX_VERSION &&
        data.entries &&
        typeof data.entries === "object"
      ) {
        return data as SessionIndexData;
      }
    } catch {
      // index missing or corrupt
    }
    return undefined;
  }

  /**
   * Atomically write the session index file using temporary file and rename.
   */
  private async writeIndexAtomic(
    indexPath: string,
    data: SessionIndexData
  ): Promise<void> {
    const tempPath = `${indexPath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
    const json = JSON.stringify(data, null, 2);

    try {
      await writeFile(tempPath, json, "utf-8");
      await rename(tempPath, indexPath);
    } catch {
      try {
        await rm(tempPath, { force: true });
      } catch {
        // ignore cleanup error
      }
    }
  }
}
