import { EventEmitter } from "node:events";

export class SteeringManager extends EventEmitter {
  private queues = new Map<string, string[]>();
  private readonly maxQueueSize: number;

  constructor(options?: { maxQueueSize?: number }) {
    super();
    this.maxQueueSize = options?.maxQueueSize ?? 50;
  }

  /**
   * Inject a steering message for a running subagent.
   */
  public steer(runId: string, message: string): boolean {
    const trimmed = message.trim();
    if (!trimmed) return false;

    let queue = this.queues.get(runId);
    if (!queue) {
      queue = [];
      this.queues.set(runId, queue);
    }

    if (queue.length >= this.maxQueueSize) {
      queue.shift(); // Evict oldest if buffer is full
    }

    queue.push(trimmed);
    this.emit("steer", runId, trimmed);
    return true;
  }

  /**
   * Check if run has pending steering messages.
   */
  public hasPending(runId: string): boolean {
    const queue = this.queues.get(runId);
    return Boolean(queue && queue.length > 0);
  }

  /**
   * Peek at pending steering messages without clearing them.
   */
  public getPending(runId: string): string[] {
    return [...(this.queues.get(runId) ?? [])];
  }

  /**
   * Peek alias for getting pending steering messages.
   */
  public peek(runId: string): string[] {
    return this.getPending(runId);
  }

  /**
   * Consume and clear all pending steering messages for a run.
   */
  public consume(runId: string): string[] {
    const queue = this.queues.get(runId);
    if (!queue || queue.length === 0) {
      return [];
    }
    const messages = [...queue];
    queue.length = 0;
    return messages;
  }

  /**
   * Clear steering queue for a completed/aborted run.
   */
  public clear(runId: string): void {
    this.queues.delete(runId);
  }

  /**
   * List all run IDs with pending steering messages.
   */
  public activeRunsWithSteering(): string[] {
    const active: string[] = [];
    for (const [runId, queue] of this.queues.entries()) {
      if (queue.length > 0) {
        active.push(runId);
      }
    }
    return active;
  }
}

export const SteerChannel = SteeringManager;
