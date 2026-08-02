/*
 * Atomic publication and cross-process locking patterns adapted from
 * pi-hermes-memory (MIT), Copyright (c) 2025 Chandra Teja.
 * See THIRD_PARTY_NOTICES.md.
 */

import { createHash, randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const LOCK_WAIT_MS = 50;
const LOCK_TIMEOUT_MS = 5_000;
const STALE_LOCK_MS = 30_000;

const queues = new Map<string, Promise<void>>();

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new Error("Memory operation aborted"));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new Error("Memory operation aborted"));
    }, { once: true });
  });
}

async function acquireFilesystemLock(lockPath: string, signal?: AbortSignal): Promise<() => Promise<void>> {
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  const started = Date.now();

  while (true) {
    if (signal?.aborted) throw new Error("Memory operation aborted");
    try {
      await fs.mkdir(lockPath);
      try {
        await fs.writeFile(path.join(lockPath, "owner.json"), JSON.stringify({
          pid: process.pid,
          acquiredAt: new Date().toISOString(),
        }), "utf8");
      } catch (error) {
        await fs.rm(lockPath, { recursive: true, force: true }).catch(() => undefined);
        throw error;
      }
      return async () => {
        await fs.rm(lockPath, { recursive: true, force: true });
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        const stat = await fs.stat(lockPath);
        if (Date.now() - stat.mtimeMs > STALE_LOCK_MS) {
          await fs.rm(lockPath, { recursive: true, force: true });
          continue;
        }
      } catch (statError) {
        if ((statError as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw statError;
      }
      if (Date.now() - started >= LOCK_TIMEOUT_MS) {
        throw new Error(`Timed out waiting for memory lock: ${path.basename(lockPath)}`);
      }
      await delay(LOCK_WAIT_MS, signal);
    }
  }
}

export async function withDocumentLock<T>(
  root: string,
  canonicalPath: string,
  operation: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  const key = `${root}\0${canonicalPath}`;
  const prior = queues.get(key) ?? Promise.resolve();
  let releaseQueue!: () => void;
  const current = new Promise<void>((resolve) => { releaseQueue = resolve; });
  const queued = prior.then(() => current);
  queues.set(key, queued);

  let releaseFilesystem: (() => Promise<void>) | undefined;
  try {
    await prior;
    const lockName = createHash("sha256").update(canonicalPath).digest("hex");
    releaseFilesystem = await acquireFilesystemLock(path.join(root, ".locks", `${lockName}.lock`), signal);
    return await operation();
  } finally {
    try {
      if (releaseFilesystem) await releaseFilesystem();
    } finally {
      releaseQueue();
      if (queues.get(key) === queued) queues.delete(key);
    }
  }
}

async function writeSynced(filePath: string, content: string): Promise<void> {
  const handle = await fs.open(filePath, "wx", 0o600);
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export function contentVersion(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 12);
}

export async function atomicPublish(
  targetPath: string,
  content: string,
  expectedVersion: string | null,
): Promise<"ok" | "conflict"> {
  const directory = path.dirname(targetPath);
  await fs.mkdir(directory, { recursive: true });
  const token = randomUUID();
  const tempPath = path.join(directory, `.${path.basename(targetPath)}.tmp-${token}`);
  const backupPath = path.join(directory, `.${path.basename(targetPath)}.backup-${token}`);
  await writeSynced(tempPath, content);

  let displaced = false;
  try {
    let targetExists = true;
    try {
      const stat = await fs.lstat(targetPath);
      if (stat.isSymbolicLink()) throw new Error("Refusing to replace a symbolic-link memory file");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") targetExists = false;
      else throw error;
    }

    if (expectedVersion === null) {
      if (targetExists) return "conflict";
      await fs.rename(tempPath, targetPath);
      return "ok";
    }

    if (!targetExists) return "conflict";
    await fs.rename(targetPath, backupPath);
    displaced = true;
    const displacedContent = await fs.readFile(backupPath);
    if (contentVersion(displacedContent) !== expectedVersion) {
      await fs.rename(backupPath, targetPath);
      displaced = false;
      return "conflict";
    }

    await fs.rename(tempPath, targetPath);
    await fs.unlink(backupPath);
    displaced = false;
    return "ok";
  } catch (error) {
    if (displaced) {
      try {
        await fs.rm(targetPath, { force: true });
        await fs.rename(backupPath, targetPath);
        displaced = false;
      } catch {
        // Preserve the backup for manual recovery if rollback itself fails.
      }
    }
    throw error;
  } finally {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
    if (!displaced) await fs.rm(backupPath, { force: true }).catch(() => undefined);
  }
}

export async function atomicDelete(targetPath: string, expectedVersion: string): Promise<"ok" | "conflict"> {
  const directory = path.dirname(targetPath);
  const displacedPath = path.join(directory, `.${path.basename(targetPath)}.delete-${randomUUID()}`);

  try {
    const stat = await fs.lstat(targetPath);
    if (stat.isSymbolicLink()) throw new Error("Refusing to delete a symbolic-link memory file");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "conflict";
    throw error;
  }

  await fs.rename(targetPath, displacedPath);
  const displacedContent = await fs.readFile(displacedPath);
  if (contentVersion(displacedContent) !== expectedVersion) {
    await fs.rename(displacedPath, targetPath);
    return "conflict";
  }

  await fs.unlink(displacedPath);
  return "ok";
}
