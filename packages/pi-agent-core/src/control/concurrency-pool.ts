import { DEFAULT_MAX_CONCURRENT_RUNS } from "../types.js";

export interface ConcurrencyPoolOptions {
  maxConcurrent?: number;
}

export interface PoolStats {
  active: number;
  pending: number;
  maxConcurrent: number;
}

interface QueuedItem {
  resolve: (release: () => void) => void;
  reject: (reason: unknown) => void;
  signal?: AbortSignal;
}

export class ConcurrencyPool {
  public readonly maxConcurrent: number;
  private active = 0;
  private queue: QueuedItem[] = [];

  constructor(options?: ConcurrencyPoolOptions) {
    this.maxConcurrent =
      typeof options?.maxConcurrent === "number" && options.maxConcurrent > 0
        ? options.maxConcurrent
        : DEFAULT_MAX_CONCURRENT_RUNS;
  }

  get activeCount(): number {
    return this.active;
  }

  get pendingCount(): number {
    return this.queue.length;
  }

  get stats(): PoolStats {
    return {
      active: this.active,
      pending: this.queue.length,
      maxConcurrent: this.maxConcurrent,
    };
  }

  /**
   * Acquire an execution slot. Returns a release callback when slot is granted.
   */
  public async acquire(signal?: AbortSignal): Promise<() => void> {
    if (signal?.aborted) {
      throw signal.reason || new Error("Acquire cancelled by AbortSignal");
    }

    if (this.active < this.maxConcurrent) {
      this.active++;
      return this.createRelease();
    }

    return new Promise<() => void>((resolve, reject) => {
      const item: QueuedItem = { resolve, reject, signal };

      const abortHandler = () => {
        const index = this.queue.indexOf(item);
        if (index !== -1) {
          this.queue.splice(index, 1);
        }
        reject(signal?.reason || new Error("Acquire cancelled by AbortSignal"));
      };

      if (signal) {
        signal.addEventListener("abort", abortHandler, { once: true });
      }

      this.queue.push(item);
    });
  }

  /**
   * Execute task within concurrency limits.
   */
  public async run<T>(
    fn: () => Promise<T>,
    signal?: AbortSignal
  ): Promise<T> {
    const release = await this.acquire(signal);
    try {
      if (signal?.aborted) {
        throw signal.reason || new Error("Task cancelled before execution");
      }
      return await fn();
    } finally {
      release();
    }
  }

  private createRelease(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active--;
      this.pump();
    };
  }

  private pump(): void {
    while (this.active < this.maxConcurrent && this.queue.length > 0) {
      const next = this.queue.shift();
      if (!next) break;

      if (next.signal?.aborted) {
        continue;
      }

      this.active++;
      next.resolve(this.createRelease());
    }
  }
}
