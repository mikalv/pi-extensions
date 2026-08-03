import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { StatusRegistry } from "../registry.ts";
import type { ApiGroupResponse, ApiRefreshResponse, ApiSnapshotResponse } from "./types.ts";

function toApiGroup(entry: ReturnType<StatusRegistry["getSnapshot"]>["groups"][number]): ApiGroupResponse {
  return {
    id: entry.id,
    name: entry.name,
    icon: entry.icon,
    cached: entry.cached,
    updatedAt: entry.updatedAt,
    summary: entry.data?.summary,
    healthy: entry.data?.healthy,
    source: entry.data?.source,
    metrics: entry.data?.metrics,
    items: entry.data?.items,
    error: entry.data?.error,
  };
}

export async function getStatusSnapshot(
  registry: StatusRegistry,
  ctx?: ExtensionContext,
  options?: { forceRefresh?: boolean },
): Promise<ApiSnapshotResponse> {
  if (options?.forceRefresh) {
    await registry.refreshAll(ctx);
  }
  const snapshot = registry.getSnapshot();
  return {
    generatedAt: snapshot.generatedAt,
    groups: snapshot.groups.map(toApiGroup),
  };
}

export async function getStatusGroup(
  registry: StatusRegistry,
  groupId: string,
  ctx?: ExtensionContext,
  options?: { forceRefresh?: boolean },
): Promise<ApiGroupResponse | null> {
  if (options?.forceRefresh) {
    await registry.getGroupData(groupId, ctx, true);
  }
  const entry = registry.getSnapshot().groups.find((group) => group.id === groupId);
  return entry ? toApiGroup(entry) : null;
}

export async function refreshStatus(
  registry: StatusRegistry,
  ctx?: ExtensionContext,
): Promise<ApiRefreshResponse> {
  await registry.refreshAll(ctx);
  return {
    ok: true,
    refreshedAt: Date.now(),
    groups: registry.getGroups().map((group) => group.id),
  };
}

export async function refreshStatusGroup(
  registry: StatusRegistry,
  groupId: string,
  ctx?: ExtensionContext,
): Promise<ApiRefreshResponse> {
  await registry.getGroupData(groupId, ctx, true);
  return {
    ok: true,
    refreshedAt: Date.now(),
    groups: [groupId],
  };
}
