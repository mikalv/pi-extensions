import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, normalize, resolve } from "node:path";
import { resolvePresetExtensions } from "./presets.js";
import {
  createDefaultProjectSettingsState,
  type ProjectPackageConfig,
  type ProjectSettingsState,
  validateProjectSettingsState,
} from "./types.js";

/**
 * Options for writing project settings
 */
export interface WriteSettingsOptions {
  /**
   * Explicit path to the pi-extensions repository or package source.
   */
  repoPath?: string;

  /**
   * Whether to preserve other packages already in the settings.json file.
   * Default: true
   */
  keepOtherPackages?: boolean;

  /**
   * JSON indentation spacing.
   * Default: 2
   */
  indent?: number;

  /**
   * Extra settings fields to merge into settings.json (e.g. defaultModel, thinkingLevel).
   */
  extraSettings?: Record<string, unknown>;

  /**
   * Write file atomically via temp file rename.
   * Default: true
   */
  atomic?: boolean;
}

/**
 * Normalize an extension path for reliable set comparisons and deduplication.
 */
function normalizeExtensionPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "./");
}

/**
 * Resolve the path or source identifier for the pi-extensions repository.
 */
export function resolvePiExtensionsRepo(options?: {
  explicitPath?: string;
  state?: ProjectSettingsState;
  cwd?: string;
}): string {
  if (options?.explicitPath && options.explicitPath.trim().length > 0) {
    return options.explicitPath.trim();
  }

  if (
    process.env.PI_EXTENSIONS_PATH &&
    process.env.PI_EXTENSIONS_PATH.trim().length > 0
  ) {
    return process.env.PI_EXTENSIONS_PATH.trim();
  }

  // Check existing state packages for a pi-extensions reference
  if (options?.state?.packages) {
    for (const pkg of options.state.packages) {
      if (typeof pkg === "string") {
        if (pkg.includes("pi-extensions")) return pkg;
      } else if (pkg && typeof pkg === "object" && typeof pkg.source === "string") {
        if (
          pkg.source.includes("pi-extensions") ||
          pkg.source.startsWith("/") ||
          pkg.source.startsWith(".")
        ) {
          return pkg.source;
        }
      }
    }
  }

  // Fallback to resolving relative or default
  return options?.cwd ?? process.cwd();
}

/**
 * Read and parse .pi/settings.json from a project directory.
 * If the file is missing or corrupt, returns a clean default ProjectSettingsState.
 */
export async function readProjectSettings(
  cwd: string = process.cwd(),
): Promise<ProjectSettingsState> {
  const settingsPath = join(cwd, ".pi", "settings.json");

  try {
    const rawText = await readFile(settingsPath, "utf-8");
    const rawSettings = JSON.parse(rawText);

    if (
      !rawSettings ||
      typeof rawSettings !== "object" ||
      Array.isArray(rawSettings)
    ) {
      return createDefaultProjectSettingsState(cwd);
    }

    const packages: Array<string | ProjectPackageConfig> = Array.isArray(
      rawSettings.packages,
    )
      ? rawSettings.packages
      : [];

    const activeExtensions: string[] = [];

    for (const pkg of packages) {
      if (
        pkg &&
        typeof pkg === "object" &&
        Array.isArray((pkg as ProjectPackageConfig).extensions)
      ) {
        for (const ext of (pkg as ProjectPackageConfig).extensions!) {
          if (typeof ext === "string" && !activeExtensions.includes(ext)) {
            activeExtensions.push(ext);
          }
        }
      }
    }

    const validated = validateProjectSettingsState({
      cwd,
      settingsPath,
      exists: true,
      rawSettings,
      activeExtensions,
      packages,
    });

    return (
      validated.state ?? {
        cwd,
        settingsPath,
        exists: true,
        rawSettings,
        activeExtensions,
        packages,
      }
    );
  } catch {
    return createDefaultProjectSettingsState(cwd);
  }
}

/**
 * Write updated extension selection to .pi/settings.json in the target directory.
 */
export async function writeProjectSettings(
  cwd: string,
  selectedExtensions: string[],
  options?: WriteSettingsOptions,
): Promise<string> {
  const settingsPath = join(cwd, ".pi", "settings.json");
  const currentState = await readProjectSettings(cwd);

  const repoPath =
    options?.repoPath ??
    resolvePiExtensionsRepo({ state: currentState, cwd });

  const keepOthers = options?.keepOtherPackages !== false;
  const uniqueExtensions = Array.from(
    new Set(selectedExtensions.map(normalizeExtensionPath)),
  );

  let updatedPackages: Array<string | ProjectPackageConfig> = [];
  let foundMatchingPackage = false;

  if (keepOthers && currentState.packages.length > 0) {
    for (const existingPkg of currentState.packages) {
      if (typeof existingPkg === "string") {
        if (existingPkg === repoPath || existingPkg.includes("pi-extensions")) {
          // Replace string entry with configured object
          updatedPackages.push({
            source: repoPath,
            extensions: uniqueExtensions,
          });
          foundMatchingPackage = true;
        } else {
          updatedPackages.push(existingPkg);
        }
      } else if (
        existingPkg &&
        typeof existingPkg === "object" &&
        typeof existingPkg.source === "string"
      ) {
        if (
          existingPkg.source === repoPath ||
          existingPkg.source.includes("pi-extensions") ||
          (existingPkg.source.startsWith("/") && repoPath.startsWith("/"))
        ) {
          updatedPackages.push({
            ...existingPkg,
            source: repoPath,
            extensions: uniqueExtensions,
          });
          foundMatchingPackage = true;
        } else {
          updatedPackages.push(existingPkg);
        }
      } else {
        updatedPackages.push(existingPkg);
      }
    }
  }

  if (!foundMatchingPackage) {
    updatedPackages.push({
      source: repoPath,
      extensions: uniqueExtensions,
    });
  }

  const updatedSettings: Record<string, unknown> = {
    ...currentState.rawSettings,
    ...(options?.extraSettings ?? {}),
    packages: updatedPackages,
  };

  const piDir = dirname(settingsPath);
  await mkdir(piDir, { recursive: true });

  const jsonContent =
    JSON.stringify(updatedSettings, null, options?.indent ?? 2) + "\n";

  if (options?.atomic !== false) {
    const tempFile = join(piDir, `.settings.json.tmp.${randomUUID()}`);
    try {
      await writeFile(tempFile, jsonContent, "utf-8");
      await rename(tempFile, settingsPath);
    } catch (err) {
      try {
        await rm(tempFile, { force: true });
      } catch {
        // ignore cleanup error
      }
      throw err;
    }
  } else {
    await writeFile(settingsPath, jsonContent, "utf-8");
  }

  return settingsPath;
}

/**
 * Enable a specific extension path in the project settings.
 */
export async function enableProjectExtension(
  cwd: string,
  extensionPath: string,
  options?: WriteSettingsOptions,
): Promise<ProjectSettingsState> {
  const current = await readProjectSettings(cwd);
  const normalized = normalizeExtensionPath(extensionPath);

  const newActive = [...current.activeExtensions];
  if (!newActive.some((e) => normalizeExtensionPath(e) === normalized)) {
    newActive.push(extensionPath);
  }

  await writeProjectSettings(cwd, newActive, options);
  return readProjectSettings(cwd);
}

/**
 * Disable a specific extension path from the project settings.
 */
export async function disableProjectExtension(
  cwd: string,
  extensionPath: string,
  options?: WriteSettingsOptions,
): Promise<ProjectSettingsState> {
  const current = await readProjectSettings(cwd);
  const normalized = normalizeExtensionPath(extensionPath);

  const newActive = current.activeExtensions.filter(
    (e) => normalizeExtensionPath(e) !== normalized,
  );

  await writeProjectSettings(cwd, newActive, options);
  return readProjectSettings(cwd);
}

/**
 * Toggle an extension on or off in the project settings.
 */
export async function toggleProjectExtension(
  cwd: string,
  extensionPath: string,
  options?: WriteSettingsOptions,
): Promise<ProjectSettingsState> {
  const current = await readProjectSettings(cwd);
  const normalized = normalizeExtensionPath(extensionPath);

  const isEnabled = current.activeExtensions.some(
    (e) => normalizeExtensionPath(e) === normalized,
  );

  if (isEnabled) {
    return disableProjectExtension(cwd, extensionPath, options);
  }
  return enableProjectExtension(cwd, extensionPath, options);
}

/**
 * Apply a preset profile (minimal, web, backend, offline, all) to project settings.
 */
export async function applyPresetToProject(
  cwd: string,
  presetId: string,
  availableExtensions: string[],
  options?: WriteSettingsOptions,
): Promise<ProjectSettingsState> {
  const resolved = resolvePresetExtensions(presetId, availableExtensions);
  await writeProjectSettings(cwd, resolved, options);
  return readProjectSettings(cwd);
}
