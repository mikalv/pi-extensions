import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { GroupData, StatusGroup, StatusHubSnapshot, StatusSnapshotEntry } from "./types.ts";

type Subscriber = (groupId: string, data: GroupData | null) => void;

export class StatusRegistry {
  private groups = new Map<string, StatusGroup>();
  private cache = new Map<string, GroupData>();
  private updatedAt = new Map<string, number>();
  private inflight = new Map<string, Promise<GroupData>>();
  private subscribers = new Set<Subscriber>();
  private defaultTtlMs: number;

  constructor(defaultTtlMs = 30_000) {
    this.defaultTtlMs = defaultTtlMs;
  }

  registerGroup(group: StatusGroup): void {
    this.groups.set(group.id, group);
    this.notify(group.id, this.cache.get(group.id) ?? null);
  }

  getGroups(): StatusGroup[] {
    return [...this.groups.values()].sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999));
  }

  getCachedData(groupId: string): GroupData | null {
    return this.cache.get(groupId) ?? null;
  }

  getUpdatedAt(groupId: string): number {
    return this.updatedAt.get(groupId) ?? 0;
  }

  async getGroupData(groupId: string, ctx?: ExtensionContext, force = false): Promise<GroupData | null> {
    const group = this.groups.get(groupId);
    if (!group) return null;

    const ttlMs = group.ttlMs ?? this.defaultTtlMs;
    const updatedAt = this.updatedAt.get(groupId) ?? 0;
    const cached = this.cache.get(groupId);
    if (!force && cached && Date.now() - updatedAt < ttlMs) return cached;

    const existing = this.inflight.get(groupId);
    if (existing) return existing;

    const fetchPromise = group.dataProvider(ctx)
      .then((data) => {
        const enriched = { ...data, updatedAt: data.updatedAt ?? Date.now() };
        this.cache.set(groupId, enriched);
        this.updatedAt.set(groupId, enriched.updatedAt ?? Date.now());
        this.notify(groupId, enriched);
        return enriched;
      })
      .catch((error) => {
        const fallback: GroupData = {
          summary: "Unavailable",
          healthy: false,
          error: error instanceof Error ? error.message : String(error),
          updatedAt: Date.now(),
        };
        this.cache.set(groupId, fallback);
        this.updatedAt.set(groupId, fallback.updatedAt!);
        this.notify(groupId, fallback);
        return fallback;
      })
      .finally(() => {
        this.inflight.delete(groupId);
      });

    this.inflight.set(groupId, fetchPromise);
    return fetchPromise;
  }

  async refreshAll(ctx?: ExtensionContext): Promise<void> {
    await Promise.all(this.getGroups().map((group) => this.getGroupData(group.id, ctx, true)));
  }

  subscribeAll(callback: Subscriber): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  getSnapshot(): StatusHubSnapshot {
    const groups: StatusSnapshotEntry[] = this.getGroups().map((group) => ({
      id: group.id,
      name: group.name,
      icon: group.icon,
      cached: this.cache.has(group.id),
      data: this.cache.get(group.id) ?? null,
      updatedAt: this.updatedAt.get(group.id) ?? 0,
    }));
    return { generatedAt: Date.now(), groups };
  }

  private notify(groupId: string, data: GroupData | null): void {
    for (const cb of this.subscribers) {
      try { cb(groupId, data); } catch {}
    }
  }
}
