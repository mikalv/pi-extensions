import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { loadExtensionCatalog, type LoadCatalogOptions } from "./catalog.js";
import { getPreset, listPresets } from "./presets.js";
import type { ExtensionItem } from "./types.js";
import { openSetupDialog, type SetupDialogOptions } from "./ui/index.js";
import {
  applyPresetToProject,
  disableProjectExtension,
  enableProjectExtension,
  readProjectSettings,
  resolvePiExtensionsRepo,
  toggleProjectExtension,
  writeProjectSettings,
  type WriteSettingsOptions,
} from "./writer.js";

export * from "./types.js";
export * from "./presets.js";
export * from "./catalog.js";
export * from "./writer.js";
export * from "./ui/index.js";

export interface PiProjectSetupOptions {
  packageJsonPath?: string;
  repoPath?: string;
  cwd?: string;
}

/**
 * Format command usage help text.
 */
export function formatHelpText(): string {
  const presets = listPresets();
  const presetList = presets.map((p) => `  - ${p.id.padEnd(10)} : ${p.name} (${p.description})`).join("\n");

  return `Pi Project Setup (/setup-pi) - Configure .pi/settings.json per project

Usage:
  /setup-pi                     Launch interactive TUI extension selector
  /setup-pi --preset <name>     Apply a predefined extension preset profile
  /setup-pi --enable <name>     Enable a specific extension by name, id, or path
  /setup-pi --disable <name>    Disable a specific extension by name, id, or path
  /setup-pi --toggle <name>     Toggle an extension on or off
  /setup-pi --list              List all available extensions and their status
  /setup-pi --status            Display current .pi/settings.json project status
  /setup-pi --help              Show this help reference

Available Presets:
${presetList}

Interactive TUI Shortcuts:
  [Space]     Toggle extension
  [1-6]       Apply preset (1: Baseline, 2: Minimal, 3: Web, 4: Backend, 5: Offline, 6: All)
  [a]         Select/Deselect all in current category
  [Tab]       Cycle category tabs
  [/]         Search / filter extensions
  [Enter]/[s] Save .pi/settings.json
  [Esc]/[q]   Cancel without saving
`;
}

/**
 * Find the closest matching extension item in the catalog.
 */
export function findMatchingExtension(
  query: string,
  catalog: ExtensionItem[],
  activePaths: string[] = [],
): { item?: ExtensionItem; id?: string; path: string; name: string } | null {
  const clean = query.trim().toLowerCase();
  if (!clean) return null;

  // 1. Exact path match
  const exactPath = catalog.find(
    (item) =>
      item.path.toLowerCase() === clean ||
      item.path.replace(/^\.\//, "").toLowerCase() === clean.replace(/^\.\//, ""),
  );
  if (exactPath) {
    return {
      item: exactPath,
      id: exactPath.id,
      path: exactPath.path,
      name: exactPath.name,
    };
  }

  // 2. Exact ID match
  const exactId = catalog.find((item) => item.id.toLowerCase() === clean);
  if (exactId) {
    return {
      item: exactId,
      id: exactId.id,
      path: exactId.path,
      name: exactId.name,
    };
  }

  // 3. Substring match on ID or path or name
  const subMatch = catalog.find(
    (item) =>
      item.id.toLowerCase().includes(clean) ||
      item.path.toLowerCase().includes(clean) ||
      item.name.toLowerCase().includes(clean),
  );
  if (subMatch) {
    return {
      item: subMatch,
      id: subMatch.id,
      path: subMatch.path,
      name: subMatch.name,
    };
  }

  // 4. Check active paths if not in catalog
  const activeMatch = activePaths.find((p) => p.toLowerCase().includes(clean));
  if (activeMatch) {
    return { path: activeMatch, name: activeMatch };
  }

  // Fallback to query as path
  return { path: query.trim(), name: query.trim() };
}

/**
 * Handle slash command invocation for /setup-pi, /project-setup, /pi-setup.
 */
export async function handleSetupCommand(
  args: string,
  ctx: {
    hasUI?: boolean;
    ui?: any;
    cwd?: string;
  },
  options?: PiProjectSetupOptions,
): Promise<string> {
  const cwd = options?.cwd ?? ctx.cwd ?? process.cwd();
  const trimmed = args.trim();
  const repoPath = options?.repoPath;

  const catalog = await loadExtensionCatalog({
    packageJsonPath: options?.packageJsonPath,
  });
  const allPaths = catalog.map((c) => c.path);
  const currentSettings = await readProjectSettings(cwd, allPaths);

  // 1. Help flag
  if (trimmed === "--help" || trimmed === "-h" || trimmed === "help") {
    const help = formatHelpText();
    if (ctx.hasUI && ctx.ui?.notify) {
      ctx.ui.notify("Printed /setup-pi help reference.", "info");
    }
    return help;
  }

  // 2. Status flag
  if (trimmed === "--status" || trimmed === "-s" || trimmed === "status") {
    const activeCount = currentSettings.activeExtensions.length;
    const existsText = currentSettings.exists ? "Configured" : "Not created (using defaults)";
    const statusMsg = `Pi Project Status (${cwd}):
  File:     ${currentSettings.settingsPath} [${existsText}]
  Active:   ${activeCount} extension(s) enabled
  Packages: ${currentSettings.packages.length} package source(s) configured`;

    if (ctx.hasUI && ctx.ui?.notify) {
      ctx.ui.notify(
        `Project status: ${activeCount} extension(s) active in ${currentSettings.exists ? ".pi/settings.json" : "default"}`,
        "info",
      );
    }
    return statusMsg;
  }

  // 3. List flag
  if (trimmed === "--list" || trimmed === "-l" || trimmed === "list" || trimmed === "ls") {
    const activeSet = new Set(
      currentSettings.activeExtensions.map((p) => p.replace(/^\.\//, "")),
    );

    const lines: string[] = [
      `Available Extensions Catalog (${catalog.length} total, ${currentSettings.activeExtensions.length} enabled in ${cwd}):`,
      "",
    ];

    for (const item of catalog) {
      const isEnabled =
        activeSet.has(item.path.replace(/^\.\//, "")) ||
        activeSet.has(item.path);
      const mark = isEnabled ? "[x]" : "[ ]";
      lines.push(`  ${mark} ${item.id.padEnd(25)} : ${item.name} (${item.category})`);
    }

    const output = lines.join("\n");
    if (ctx.hasUI && ctx.ui?.notify) {
      ctx.ui.notify(`Listed ${catalog.length} available extensions.`, "info");
    }
    return output;
  }

  // 4. Preset application: `--preset <name>` or positional `<name>`
  let presetArg: string | undefined;
  if (trimmed.startsWith("--preset ") || trimmed.startsWith("-p ")) {
    presetArg = trimmed.replace(/^(--preset|-p)\s+/, "").trim();
  } else if (trimmed.startsWith("preset ")) {
    presetArg = trimmed.replace(/^preset\s+/, "").trim();
  } else if (
    ["baseline", "base", "core", "minimal", "web", "backend", "offline", "all", "full", "defaults", "empty"].includes(
      trimmed.toLowerCase(),
    )
  ) {
    presetArg = trimmed.toLowerCase();
  }

  if (presetArg) {
    const preset = getPreset(presetArg);
    if (!preset) {
      const err = `Unknown preset "${presetArg}". Available presets: baseline, minimal, web, backend, offline, all`;
      if (ctx.hasUI && ctx.ui?.notify) {
        ctx.ui.notify(err, "error");
      }
      return err;
    }

    const updated = await applyPresetToProject(cwd, preset.id, allPaths, {
      repoPath,
    });
    const msg = `Applied "${preset.name}" preset (${updated.activeExtensions.length} extensions active) to .pi/settings.json`;
    if (ctx.hasUI && ctx.ui?.notify) {
      ctx.ui.notify(msg, "info");
    }
    return msg;
  }

  // 5. Enable flag: `--enable <target>` or `enable <target>` or `add <target>`
  if (
    trimmed.startsWith("--enable ") ||
    trimmed.startsWith("-e ") ||
    trimmed.startsWith("enable ") ||
    trimmed.startsWith("add ")
  ) {
    const target = trimmed
      .replace(/^(--enable|-e|enable|add)\s+/, "")
      .trim();
    const match = findMatchingExtension(
      target,
      catalog,
      currentSettings.activeExtensions,
    );

    if (!match) {
      const err = `No extension found matching "${target}".`;
      if (ctx.hasUI && ctx.ui?.notify) ctx.ui.notify(err, "error");
      return err;
    }

    const updated = await enableProjectExtension(cwd, match.path, {
      repoPath,
    });
    const msg = `Enabled extension "${match.name}" (${match.path}) in .pi/settings.json (${updated.activeExtensions.length} total active).`;
    if (ctx.hasUI && ctx.ui?.notify) {
      ctx.ui.notify(msg, "info");
    }
    return msg;
  }

  // 6. Disable flag: `--disable <target>` or `disable <target>` or `remove <target>`
  if (
    trimmed.startsWith("--disable ") ||
    trimmed.startsWith("-d ") ||
    trimmed.startsWith("disable ") ||
    trimmed.startsWith("remove ") ||
    trimmed.startsWith("rm ")
  ) {
    const target = trimmed
      .replace(/^(--disable|-d|disable|remove|rm)\s+/, "")
      .trim();
    const match = findMatchingExtension(
      target,
      catalog,
      currentSettings.activeExtensions,
    );

    if (!match) {
      const err = `No extension found matching "${target}".`;
      if (ctx.hasUI && ctx.ui?.notify) ctx.ui.notify(err, "error");
      return err;
    }

    const updated = await disableProjectExtension(cwd, match.path, {
      repoPath,
    });
    const msg = `Disabled extension "${match.name}" (${match.path}) from .pi/settings.json (${updated.activeExtensions.length} total active).`;
    if (ctx.hasUI && ctx.ui?.notify) {
      ctx.ui.notify(msg, "info");
    }
    return msg;
  }

  // 7. Toggle flag: `--toggle <target>` or `toggle <target>`
  if (trimmed.startsWith("--toggle ") || trimmed.startsWith("-t ") || trimmed.startsWith("toggle ")) {
    const target = trimmed.replace(/^(--toggle|-t|toggle)\s+/, "").trim();
    const match = findMatchingExtension(
      target,
      catalog,
      currentSettings.activeExtensions,
    );

    if (!match) {
      const err = `No extension found matching "${target}".`;
      if (ctx.hasUI && ctx.ui?.notify) ctx.ui.notify(err, "error");
      return err;
    }

    const updated = await toggleProjectExtension(cwd, match.path, {
      repoPath,
    });
    const isNowActive = updated.activeExtensions.some(
      (p) => p === match.path || p.replace(/^\.\//, "") === match.path.replace(/^\.\//, ""),
    );
    const msg = `${isNowActive ? "Enabled" : "Disabled"} extension "${match.name}" in .pi/settings.json (${updated.activeExtensions.length} total active).`;
    if (ctx.hasUI && ctx.ui?.notify) {
      ctx.ui.notify(msg, "info");
    }
    return msg;
  }

  // 8. Default Interactive TUI Launch
  if (ctx.hasUI && ctx.ui?.custom) {
    let savedList: string[] | null = null;
    const selected = await openSetupDialog(ctx, {
      items: catalog,
      activeExtensions: currentSettings.activeExtensions,
      cwd,
      onSave: async (savedExtensions) => {
        savedList = savedExtensions;
        await writeProjectSettings(cwd, savedExtensions, { repoPath });
        if (ctx.hasUI && ctx.ui?.notify) {
          ctx.ui.notify(
            `Saved .pi/settings.json with ${savedExtensions.length} extension(s).`,
            "info",
          );
        }
      },
    });

    const finalList = selected ?? savedList;
    if (finalList) {
      return `Saved .pi/settings.json with ${finalList.length} extension(s).`;
    }
    return "Project setup dialog closed.";
  }

  // Fallback for non-UI environments
  return await handleSetupCommand("--status", ctx, options);
}

/**
 * Pi Extension Entrypoint for pi-project-setup.
 */
export default function piProjectSetupExtension(
  pi: ExtensionAPI,
  options?: PiProjectSetupOptions,
): void {
  const handler = async (args: string, ctx: ExtensionCommandContext) => {
    const output = await handleSetupCommand(args, ctx, options);
    if (!ctx.hasUI) {
      process.stdout.write(`\n${output}\n`);
    }
  };

  const getCompletions = (query: string) => {
    const suggestions: string[] = [
      "--preset baseline",
      "--preset minimal",
      "--preset web",
      "--preset backend",
      "--preset offline",
      "--preset all",
      "--list",
      "--status",
      "--help",
      "--enable ",
      "--disable ",
      "--toggle ",
    ];
    return suggestions.filter((s) => s.toLowerCase().startsWith(query.toLowerCase()));
  };

  // 1. Primary Command: /setup-pi
  pi.registerCommand("setup-pi", {
    description:
      "Interactive TUI project setup wizard to select and configure active extensions in .pi/settings.json",
    handler,
    getArgumentCompletions: getCompletions,
  });

  // 2. Alias: /project-setup
  pi.registerCommand("project-setup", {
    description: "Alias for /setup-pi - configure project extensions and settings",
    handler,
    getArgumentCompletions: getCompletions,
  });

  // 3. Alias: /pi-setup
  pi.registerCommand("pi-setup", {
    description: "Alias for /setup-pi - configure project extensions and settings",
    handler,
    getArgumentCompletions: getCompletions,
  });
}
