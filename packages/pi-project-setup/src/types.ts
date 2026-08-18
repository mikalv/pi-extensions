import { basename, join } from "node:path";

/**
 * Extension Categories
 */
export const EXTENSION_CATEGORIES = [
  "memory",
  "agents",
  "tools",
  "ui",
  "diagnostics",
  "other",
] as const;

export type ExtensionCategoryId = (typeof EXTENSION_CATEGORIES)[number];

export interface ExtensionCategory {
  id: ExtensionCategoryId;
  label: string;
  icon: string;
  description: string;
}

export const CATEGORY_METADATA: Record<ExtensionCategoryId, ExtensionCategory> = {
  memory: {
    id: "memory",
    label: "Memory & Context",
    icon: "🧠",
    description: "Prism LTM, wiki, observations, and context compaction",
  },
  agents: {
    id: "agents",
    label: "Subagents & Workflows",
    icon: "🤖",
    description: "Unified subagents, multi-agent workflows, and orchestration",
  },
  tools: {
    id: "tools",
    label: "Execution & Tools",
    icon: "⚡",
    description: "Execution runners, clipboard, shortcuts, and task managers",
  },
  ui: {
    id: "ui",
    label: "UI & Navigation",
    icon: "🎨",
    description: "Atelier sidebar, status hub, footer, widgets, and themes",
  },
  diagnostics: {
    id: "diagnostics",
    label: "Diagnostics & Security",
    icon: "🛠️",
    description: "Model governance, token rate, session recap, and auth",
  },
  other: {
    id: "other",
    label: "Other Extensions",
    icon: "📦",
    description: "General-purpose extensions and plugins",
  },
};

/**
 * Extension item metadata
 */
export interface ExtensionItem {
  id: string;
  name: string;
  path: string;
  category: ExtensionCategoryId;
  description: string;
  tags?: string[];
  isDefault?: boolean;
  source?: "local" | "npm" | "git";
  dependencies?: string[];
}

/**
 * Preset Profiles
 */
export const BUILTIN_PRESET_IDS = [
  "baseline",
  "minimal",
  "web",
  "backend",
  "offline",
  "all",
] as const;

export type BuiltinPresetId = (typeof BUILTIN_PRESET_IDS)[number];

export interface PresetProfile {
  id: string;
  name: string;
  description: string;
  icon?: string;
  extensions: string[];
}

export const DEFAULT_PRESETS: Record<BuiltinPresetId, PresetProfile> = {
  baseline: {
    id: "baseline",
    name: "Core Baseline (Recommended)",
    description: "Memory stack (Prism LTM + Wiki), agent control plane, paster, ADHD tasks, shortcuts",
    icon: "💎",
    extensions: [
      "./packages/mm-memory/src/index.ts",
      "./packages/mm-wiki/src/index.ts",
      "./packages/pi-context/src/index.ts",
      "./packages/pi-agent-core/src/index.ts",
      "./packages/pi-paster/src/index.ts",
      "./packages/pi-adhd-tasks/src/index.ts",
      "./packages/clipboard/index.ts",
      "./packages/copymsgs.ts",
      "./packages/pi-input-shortcuts/src/index.ts",
      "./packages/pi-project-setup/src/index.ts",
      "./packages/notify/extensions/index.ts",
      "./packages/auto-retry/src/index.ts",
      "./packages/system-prompt.ts",
    ],
  },
  minimal: {
    id: "minimal",
    name: "Ultra Minimal",
    description: "Bare essentials: Agent control plane, clipboard, notify, auto-retry",
    icon: "⚡",
    extensions: [
      "./packages/pi-agent-core/src/index.ts",
      "./packages/clipboard/index.ts",
      "./packages/notify/extensions/index.ts",
      "./packages/auto-retry/src/index.ts",
      "./packages/system-prompt.ts",
    ],
  },
  web: {
    id: "web",
    name: "Full Stack / Web",
    description: "Core baseline + UI widgets, web tools, atelier sidebar, footer",
    icon: "🌐",
    extensions: [
      "./packages/mm-memory/src/index.ts",
      "./packages/mm-wiki/src/index.ts",
      "./packages/pi-agent-core/src/index.ts",
      "./packages/pi-paster/src/index.ts",
      "./packages/clipboard/index.ts",
      "./packages/files-widget/index.ts",
      "./packages/pi-atelier/extensions/index.ts",
      "./packages/powerline-footer/index.ts",
      "./packages/notify/extensions/index.ts",
      "./packages/auto-retry/src/index.ts",
      "./packages/system-prompt.ts",
    ],
  },
  backend: {
    id: "backend",
    name: "Backend & Systems",
    description: "Core baseline + observational memory, Python runner, scheduler, worktrees, governance",
    icon: "⚙️",
    extensions: [
      "./packages/mm-memory/src/index.ts",
      "./packages/mm-wiki/src/index.ts",
      "./packages/mm-observational-memory/src/index.ts",
      "./packages/pi-agent-core/src/index.ts",
      "./packages/execute-python/extensions",
      "./packages/scheduler/index.ts",
      "./packages/pi-worktree/src/index.ts",
      "./packages/pi-adhd-tasks/src/index.ts",
      "./packages/pi-paster/src/index.ts",
      "./packages/clipboard/index.ts",
      "./packages/notify/extensions/index.ts",
      "./packages/pi-model-restriction/src/index.ts",
      "./packages/system-prompt.ts",
    ],
  },
  offline: {
    id: "offline",
    name: "Offline & Private",
    description: "Strict local-only models, local Prism LTM, wiki, model restriction gate, zero network leakage",
    icon: "🔒",
    extensions: [
      "./packages/mm-memory/src/index.ts",
      "./packages/mm-wiki/src/index.ts",
      "./packages/pi-agent-core/src/index.ts",
      "./packages/pi-model-restriction/src/index.ts",
      "./packages/clipboard/index.ts",
      "./packages/pi-input-shortcuts/src/index.ts",
      "./packages/system-prompt.ts",
    ],
  },
  all: {
    id: "all",
    name: "All Extensions",
    description: "Enable all discovered extensions in the repository",
    icon: "📦",
    extensions: [],
  },
};

/**
 * Pi Package schema entry in settings.json
 */
export interface ProjectPackageConfig {
  source: string;
  extensions?: string[];
  skills?: string[];
  themes?: string[];
}

/**
 * Project settings state representation
 */
export interface ProjectSettingsState {
  cwd: string;
  settingsPath: string;
  exists: boolean;
  rawSettings: Record<string, unknown>;
  activeExtensions: string[];
  packages: Array<string | ProjectPackageConfig>;
}

/**
 * Extract an id slug from a file path
 */
export function deriveExtensionId(filePath: string): string {
  // Normalize path like "./packages/pi-agent-core/src/index.ts" -> "pi-agent-core"
  // or "./packages/copymsgs.ts" -> "copymsgs"
  const normalized = filePath.replace(/\\/g, "/").replace(/^\.\//, "");
  const parts = normalized.split("/");
  if (parts[0] === "packages" && parts.length > 1) {
    const pkgName = parts[1];
    return pkgName.replace(/\.(ts|js)$/, "");
  }
  return basename(filePath).replace(/\.(ts|js)$/, "");
}

/**
 * Schema Validation Helpers
 */
export function validateExtensionItem(input: unknown): {
  valid: boolean;
  item?: ExtensionItem;
  errors?: string[];
} {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { valid: false, errors: ["Extension item must be a non-null object"] };
  }

  const obj = input as Record<string, unknown>;
  const errors: string[] = [];

  if (typeof obj.name !== "string" || obj.name.trim().length === 0) {
    errors.push("Missing or invalid 'name'");
  }
  if (typeof obj.path !== "string" || obj.path.trim().length === 0) {
    errors.push("Missing or invalid 'path'");
  }
  if (
    typeof obj.category !== "string" ||
    !EXTENSION_CATEGORIES.includes(obj.category as ExtensionCategoryId)
  ) {
    errors.push(
      `Invalid category '${String(obj.category)}'. Supported: ${EXTENSION_CATEGORIES.join(", ")}`
    );
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const path = (obj.path as string).trim();
  const id =
    typeof obj.id === "string" && obj.id.trim().length > 0
      ? obj.id.trim()
      : deriveExtensionId(path);

  const item: ExtensionItem = {
    id,
    name: (obj.name as string).trim(),
    path,
    category: obj.category as ExtensionCategoryId,
    description: typeof obj.description === "string" ? obj.description.trim() : "",
    tags: Array.isArray(obj.tags) ? obj.tags.filter((t) => typeof t === "string") : [],
    isDefault: typeof obj.isDefault === "boolean" ? obj.isDefault : false,
    source:
      obj.source === "npm" || obj.source === "git" || obj.source === "local"
        ? obj.source
        : "local",
    dependencies: Array.isArray(obj.dependencies)
      ? obj.dependencies.filter((d) => typeof d === "string")
      : undefined,
  };

  return { valid: true, item };
}

export function validatePresetProfile(input: unknown): {
  valid: boolean;
  preset?: PresetProfile;
  errors?: string[];
} {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { valid: false, errors: ["Preset profile must be a non-null object"] };
  }

  const obj = input as Record<string, unknown>;
  const errors: string[] = [];

  if (typeof obj.id !== "string" || obj.id.trim().length === 0) {
    errors.push("Missing or invalid 'id'");
  }
  if (typeof obj.name !== "string" || obj.name.trim().length === 0) {
    errors.push("Missing or invalid 'name'");
  }
  if (typeof obj.description !== "string") {
    errors.push("Missing or invalid 'description'");
  }
  if (!Array.isArray(obj.extensions)) {
    errors.push("'extensions' must be an array of string paths");
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const preset: PresetProfile = {
    id: (obj.id as string).trim(),
    name: (obj.name as string).trim(),
    description: (obj.description as string).trim(),
    icon: typeof obj.icon === "string" ? obj.icon : undefined,
    extensions: (obj.extensions as unknown[]).filter((e) => typeof e === "string") as string[],
  };

  return { valid: true, preset };
}

export function validateProjectSettingsState(input: unknown): {
  valid: boolean;
  state?: ProjectSettingsState;
  errors?: string[];
} {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { valid: false, errors: ["Project settings state must be a non-null object"] };
  }

  const obj = input as Record<string, unknown>;
  const errors: string[] = [];

  if (typeof obj.cwd !== "string" || obj.cwd.trim().length === 0) {
    errors.push("Missing or invalid 'cwd'");
  }
  if (typeof obj.settingsPath !== "string" || obj.settingsPath.trim().length === 0) {
    errors.push("Missing or invalid 'settingsPath'");
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const rawSettings =
    obj.rawSettings && typeof obj.rawSettings === "object" && !Array.isArray(obj.rawSettings)
      ? (obj.rawSettings as Record<string, unknown>)
      : {};

  const activeExtensions = Array.isArray(obj.activeExtensions)
    ? (obj.activeExtensions.filter((e) => typeof e === "string") as string[])
    : [];

  const packages = Array.isArray(obj.packages)
    ? (obj.packages as Array<string | ProjectPackageConfig>)
    : [];

  const state: ProjectSettingsState = {
    cwd: (obj.cwd as string).trim(),
    settingsPath: (obj.settingsPath as string).trim(),
    exists: typeof obj.exists === "boolean" ? obj.exists : false,
    rawSettings,
    activeExtensions,
    packages,
  };

  return { valid: true, state };
}

/**
 * Factory Helpers
 */
export function createExtensionItem(
  params: Partial<ExtensionItem> & {
    path: string;
    name: string;
    category: ExtensionCategoryId;
  }
): ExtensionItem {
  const res = validateExtensionItem(params);
  if (!res.valid || !res.item) {
    throw new Error(`Failed to create ExtensionItem: ${res.errors?.join(", ")}`);
  }
  return res.item;
}

export function createPresetProfile(params: {
  id: string;
  name: string;
  description: string;
  extensions: string[];
  icon?: string;
}): PresetProfile {
  const res = validatePresetProfile(params);
  if (!res.valid || !res.preset) {
    throw new Error(`Failed to create PresetProfile: ${res.errors?.join(", ")}`);
  }
  return res.preset;
}

export function createDefaultProjectSettingsState(cwd: string = process.cwd()): ProjectSettingsState {
  const settingsPath = join(cwd, ".pi", "settings.json");
  return {
    cwd,
    settingsPath,
    exists: false,
    rawSettings: {},
    activeExtensions: [],
    packages: [],
  };
}
