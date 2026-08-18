import {
 BUILTIN_PRESET_IDS,
 type BuiltinPresetId,
 DEFAULT_PRESETS,
 type PresetProfile,
} from "./types.js";

/**
 * List all available preset profiles, combining built-ins with any custom presets.
 */
export function listPresets(
 customPresets: PresetProfile[] = [],
): PresetProfile[] {
 const builtins: PresetProfile[] = BUILTIN_PRESET_IDS.map(
  (id) => DEFAULT_PRESETS[id],
 );
 const customMap = new Map<string, PresetProfile>();

 for (const preset of builtins) {
  customMap.set(preset.id, preset);
 }
 for (const preset of customPresets) {
  customMap.set(preset.id, preset);
 }

 return Array.from(customMap.values());
}

/**
 * Get a specific preset profile by ID.
 */
export function getPreset(
 id: string,
 customPresets: PresetProfile[] = [],
): PresetProfile | undefined {
 const all = listPresets(customPresets);
 return all.find((p) => p.id === id);
}

/**
 * Resolve which extension paths from a catalog match a given preset ID.
 */
export function resolvePresetExtensions(
 presetId: string,
 availablePaths: string[],
 customPresets: PresetProfile[] = [],
): string[] {
 const preset = getPreset(presetId, customPresets);
 if (!preset) return [];

 // Special "all" preset enables every available extension
 if (preset.id === "all") {
  return [...availablePaths];
 }

 // Exact or normalized match against available paths
 const presetSet = new Set(preset.extensions.map(normalizePath));
 return availablePaths.filter((path) => presetSet.has(normalizePath(path)));
}

function normalizePath(p: string): string {
 return p.replace(/\\/g, "/").replace(/^\.\//, "");
}
