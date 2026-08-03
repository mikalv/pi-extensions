import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { StatusRegistry } from "../registry.ts";
import { getStatusGroup, getStatusSnapshot, refreshStatus, refreshStatusGroup } from "./handlers.ts";

export interface StatusHubHttpAdapter {
  get(path: string, handler: () => Promise<unknown> | unknown): void;
  post(path: string, handler: () => Promise<unknown> | unknown): void;
}

export function registerStatusHubHttpRoutes(
  adapter: StatusHubHttpAdapter,
  registry: StatusRegistry,
  getCtx: () => ExtensionContext | undefined,
): void {
  adapter.get("/status", () => getStatusSnapshot(registry, getCtx()));
  adapter.get("/status/groups", () => getStatusSnapshot(registry, getCtx()));
  adapter.post("/status/refresh", () => refreshStatus(registry, getCtx()));

  for (const group of registry.getGroups()) {
    adapter.get(`/status/groups/${group.id}`, () => getStatusGroup(registry, group.id, getCtx()));
    adapter.post(`/status/groups/${group.id}/refresh`, () => refreshStatusGroup(registry, group.id, getCtx()));
  }
}
