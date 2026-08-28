import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { getProjectConfigPath } from "./config-paths";
import type { UnifiedPermissionConfig } from "./config-schema";

/**
 * Record a single or multiple pattern grants to the project's config file
 * (<cwd>/.pi/extensions/pi-permission-system/config.json).
 */
export function recordProjectApproval(
  cwd: string,
  surface: string,
  patterns: readonly string[],
): { success: boolean; configPath: string; error?: string } {
  const configPath = getProjectConfigPath(cwd);
  try {
    let existingConfig: UnifiedPermissionConfig = {};
    if (existsSync(configPath)) {
      try {
        const content = readFileSync(configPath, "utf-8");
        existingConfig = JSON.parse(content);
      } catch {
        existingConfig = {};
      }
    }

    if (typeof existingConfig.permission !== "object" || existingConfig.permission === null) {
      existingConfig.permission = {};
    }

    const permission = existingConfig.permission as Record<string, unknown>;

    for (const pattern of patterns) {
      if (pattern === "*") {
        permission[surface] = "allow";
      } else {
        const currentSurface = permission[surface];
        if (typeof currentSurface === "object" && currentSurface !== null && !Array.isArray(currentSurface)) {
          (currentSurface as Record<string, string>)[pattern] = "allow";
        } else if (typeof currentSurface === "string") {
          permission[surface] = {
            "*": currentSurface,
            [pattern]: "allow",
          };
        } else {
          permission[surface] = {
            [pattern]: "allow",
          };
        }
      }
    }

    mkdirSync(dirname(configPath), { recursive: true });
    const tmpPath = `${configPath}.tmp`;
    writeFileSync(tmpPath, `${JSON.stringify(existingConfig, null, 2)}\n`, "utf-8");
    renameSync(tmpPath, configPath);

    return { success: true, configPath };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, configPath, error: message };
  }
}
