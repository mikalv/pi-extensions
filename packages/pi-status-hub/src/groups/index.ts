import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { StatusGroup } from "../types.ts";
import type { KanboardSettings } from "../config.ts";
import { createProvidersGroup } from "./providers.ts";
import { createTasksGroup } from "./tasks.ts";
import { createUsageGroup } from "./usage.ts";

export function createDefaultGroups(getCtx: () => ExtensionContext | undefined, kanboard: KanboardSettings): StatusGroup[] {
  return [
    createTasksGroup(kanboard),
    createUsageGroup(getCtx),
    createProvidersGroup(getCtx),
  ];
}
