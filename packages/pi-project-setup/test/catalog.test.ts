import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import {
  categorizeExtension,
  deriveExtensionDescription,
  deriveExtensionName,
  getPreset,
  listPresets,
  loadExtensionCatalog,
  matchExtensionToCategory,
  resolvePresetExtensions,
} from "../src/index.ts";
import {
  BUILTIN_PRESET_IDS,
  CATEGORY_METADATA,
  DEFAULT_PRESETS,
  EXTENSION_CATEGORIES,
  type ExtensionItem,
  type PresetProfile,
} from "../src/types.ts";

describe("Extension Catalog & Preset Engine (`pi-project-setup`)", () => {
  describe("Preset Engine (`src/presets.ts`)", () => {
    it("lists all available default presets", () => {
      const presets = listPresets();
      expect(presets.length).toBe(BUILTIN_PRESET_IDS.length);

      const ids = presets.map((p: PresetProfile) => p.id);
      expect(ids).toContain("minimal");
      expect(ids).toContain("web");
      expect(ids).toContain("backend");
      expect(ids).toContain("offline");
      expect(ids).toContain("all");
    });

    it("gets a specific preset by ID", () => {
      const minimal = getPreset("minimal");
      expect(minimal).toBeDefined();
      expect(minimal?.name).toContain("Minimal");
      expect(minimal?.extensions.length).toBeGreaterThan(0);
      expect(minimal?.extensions).toContain(
        "./packages/pi-agent-core/src/index.ts",
      );

      const unknown = getPreset("non-existent");
      expect(unknown).toBeUndefined();
    });

    it("resolves preset extensions against a catalog of items", () => {
      const samplePaths = [
        "./packages/pi-agent-core/src/index.ts",
        "./packages/clipboard/index.ts",
        "./packages/notify/extensions/index.ts",
        "./packages/mm-memory/src/index.ts",
        "./packages/execute-python/extensions",
      ];

      const minimalResolved = resolvePresetExtensions("minimal", samplePaths);
      expect(minimalResolved).toContain(
        "./packages/pi-agent-core/src/index.ts",
      );
      expect(minimalResolved).toContain("./packages/clipboard/index.ts");
      expect(minimalResolved).not.toContain(
        "./packages/execute-python/extensions",
      );

      const allResolved = resolvePresetExtensions("all", samplePaths);
      expect(allResolved.length).toBe(samplePaths.length);
      expect(allResolved).toEqual(samplePaths);
    });

    it("supports custom preset registration and fallback", () => {
      const customPreset: PresetProfile = {
        id: "custom-data",
        name: "Custom Data Science",
        description: "Python and analysis tools",
        extensions: ["./packages/execute-python/extensions"],
      };

      const minimal = getPreset("minimal", [customPreset]);
      expect(minimal).toBeDefined();

      const custom = getPreset("custom-data", [customPreset]);
      expect(custom).toBeDefined();
      expect(custom?.name).toBe("Custom Data Science");
    });
  });

  describe("Extension Categorization & Metadata Extraction (`src/catalog.ts`)", () => {
    it("categorizes memory extensions into 'memory'", () => {
      expect(categorizeExtension("./packages/mm-memory/src/index.ts")).toBe(
        "memory",
      );
      expect(
        categorizeExtension("./packages/mm-observational-memory/src/index.ts"),
      ).toBe("memory");
      expect(categorizeExtension("./packages/mm-wiki/src/index.ts")).toBe(
        "memory",
      );
      expect(
        categorizeExtension("./packages/context-control/extensions/index.ts"),
      ).toBe("memory");
      expect(categorizeExtension("./packages/prune-context/extensions")).toBe(
        "memory",
      );
      expect(categorizeExtension("./packages/pi-prism/src/index.ts")).toBe(
        "memory",
      );
    });

    it("categorizes agent & workflow extensions into 'agents'", () => {
      expect(categorizeExtension("./packages/pi-agent-core/src/index.ts")).toBe(
        "agents",
      );
      expect(categorizeExtension("./packages/pi-agent-memory/index.ts")).toBe(
        "agents",
      );
      expect(
        categorizeExtension("./packages/pi-task-notifications/index.ts"),
      ).toBe("agents");
      expect(
        categorizeExtension("./packages/agent-guidance/agent-guidance.ts"),
      ).toBe("agents");
      expect(
        categorizeExtension("./packages/agent-loop-reflection/extensions"),
      ).toBe("agents");
      expect(
        categorizeExtension("./packages/pi-superagents/src/extension/index.ts"),
      ).toBe("agents");
    });

    it("categorizes execution & tool extensions into 'tools'", () => {
      expect(categorizeExtension("./packages/execute-python/extensions")).toBe(
        "tools",
      );
      expect(categorizeExtension("./packages/clipboard/index.ts")).toBe(
        "tools",
      );
      expect(categorizeExtension("./packages/scheduler/index.ts")).toBe(
        "tools",
      );
      expect(categorizeExtension("./packages/pi-adhd-tasks/src/index.ts")).toBe(
        "tools",
      );
      expect(categorizeExtension("./packages/pi-worktree/src/index.ts")).toBe(
        "tools",
      );
      expect(categorizeExtension("./packages/auto-retry/src/index.ts")).toBe(
        "tools",
      );
      expect(categorizeExtension("./packages/shortcuts-help.ts")).toBe("tools");
      expect(categorizeExtension("./packages/copymsgs.ts")).toBe("tools");
      expect(
        categorizeExtension("./packages/pi-background-tasks/src/extension.ts"),
      ).toBe("tools");
    });

    it("categorizes UI & navigation extensions into 'ui'", () => {
      expect(
        categorizeExtension("./packages/pi-atelier/extensions/index.ts"),
      ).toBe("ui");
      expect(categorizeExtension("./packages/powerline-footer/index.ts")).toBe(
        "ui",
      );
      expect(categorizeExtension("./packages/tab-status/tab-status.ts")).toBe(
        "ui",
      );
      expect(categorizeExtension("./packages/files-widget/index.ts")).toBe(
        "ui",
      );
      expect(categorizeExtension("./packages/claude-spinner/index.ts")).toBe(
        "ui",
      );
      expect(categorizeExtension("./packages/amphetamine/src/index.ts")).toBe(
        "ui",
      );
      expect(categorizeExtension("./packages/pi-status-hub/src/index.ts")).toBe(
        "ui",
      );
      expect(categorizeExtension("./packages/pi-image-drop/src/index.ts")).toBe(
        "ui",
      );
    });

    it("categorizes diagnostics, telemetry, & security into 'diagnostics'", () => {
      expect(
        categorizeExtension("./packages/pi-model-restriction/src/index.ts"),
      ).toBe("diagnostics");
      expect(categorizeExtension("./packages/token-rate/index.ts")).toBe(
        "diagnostics",
      );
      expect(categorizeExtension("./packages/session-recap/index.ts")).toBe(
        "diagnostics",
      );
      expect(
        categorizeExtension("./packages/pi-auth-extension/src/index.ts"),
      ).toBe("diagnostics");
      expect(
        categorizeExtension("./packages/provider-retry-proxy/dist/index.js"),
      ).toBe("diagnostics");
      expect(
        categorizeExtension("./packages/cursor-runtime/src/index.ts"),
      ).toBe("diagnostics");
    });

    it("falls back to 'other' for unrecognized extensions", () => {
      expect(categorizeExtension("./packages/random-plugin/index.ts")).toBe(
        "other",
      );
    });

    it("derives friendly human-readable names from extension paths", () => {
      expect(deriveExtensionName("./packages/pi-agent-core/src/index.ts")).toBe(
        "Agent Core",
      );
      expect(deriveExtensionName("./packages/mm-memory/src/index.ts")).toBe(
        "Prism Memory (LTM)",
      );
      expect(deriveExtensionName("./packages/execute-python/extensions")).toBe(
        "Execute Python",
      );
      expect(deriveExtensionName("./packages/clipboard/index.ts")).toBe(
        "Clipboard (OSC 52)",
      );
      expect(
        deriveExtensionName("./packages/pi-model-restriction/src/index.ts"),
      ).toBe("Model Restriction Gate");
      expect(deriveExtensionName("./packages/powerline-footer/index.ts")).toBe(
        "Powerline Footer",
      );
    });

    it("derives descriptive summaries for known extension paths", () => {
      const desc1 = deriveExtensionDescription(
        "./packages/pi-agent-core/src/index.ts",
      );
      expect(desc1).toContain("control-plane");

      const desc2 = deriveExtensionDescription(
        "./packages/mm-memory/src/index.ts",
      );
      expect(desc2).toContain("Prism");

      const descUnknown = deriveExtensionDescription(
        "./packages/unknown-one/index.ts",
      );
      expect(typeof descUnknown).toBe("string");
    });

    it("exposes category metadata matching all standard categories", () => {
      for (const cat of EXTENSION_CATEGORIES) {
        expect(CATEGORY_METADATA[cat]).toBeDefined();
        expect(CATEGORY_METADATA[cat].label.length).toBeGreaterThan(0);
      }
      expect(matchExtensionToCategory("./packages/mm-wiki/src/index.ts")).toBe(
        "memory",
      );
    });
  });

  describe("Extension Catalog Loading (`loadExtensionCatalog`)", () => {
    it("loads catalog from a package.json path and categorizes all items", async () => {
      const rootPackageJsonPath = join(process.cwd(), "package.json");
      const catalog = await loadExtensionCatalog({
        packageJsonPath: rootPackageJsonPath,
      });

      expect(catalog.length).toBeGreaterThan(30);

      // Verify every item has complete valid fields
      for (const item of catalog) {
        expect(item.id).toBeDefined();
        expect(item.name.length).toBeGreaterThan(0);
        expect(
          item.path.startsWith("./packages/") ||
            item.path.startsWith("packages/"),
        ).toBe(true);
        expect(EXTENSION_CATEGORIES).toContain(item.category);
        expect(item.description.length).toBeGreaterThan(0);
      }

      // Check representation across categories
      const memoryItems = catalog.filter(
        (i: ExtensionItem) => i.category === "memory",
      );
      const agentItems = catalog.filter(
        (i: ExtensionItem) => i.category === "agents",
      );
      const toolItems = catalog.filter(
        (i: ExtensionItem) => i.category === "tools",
      );
      const uiItems = catalog.filter((i: ExtensionItem) => i.category === "ui");
      const diagItems = catalog.filter(
        (i: ExtensionItem) => i.category === "diagnostics",
      );

      expect(memoryItems.length).toBeGreaterThan(0);
      expect(agentItems.length).toBeGreaterThan(0);
      expect(toolItems.length).toBeGreaterThan(0);
      expect(uiItems.length).toBeGreaterThan(0);
      expect(diagItems.length).toBeGreaterThan(0);
    });

    it("marks items as enabled based on an active extension paths list", async () => {
      const rootPackageJsonPath = join(process.cwd(), "package.json");
      const active = [
        "./packages/pi-agent-core/src/index.ts",
        "./packages/clipboard/index.ts",
      ];

      const catalog = await loadExtensionCatalog({
        packageJsonPath: rootPackageJsonPath,
        activeExtensions: active,
      });

      const agentCore = catalog.find(
        (i: ExtensionItem) => i.id === "pi-agent-core",
      );
      expect(agentCore).toBeDefined();
      expect(agentCore?.isDefault).toBe(true);

      const clipboard = catalog.find(
        (i: ExtensionItem) => i.id === "clipboard",
      );
      expect(clipboard).toBeDefined();
      expect(clipboard?.isDefault).toBe(true);

      const python = catalog.find(
        (i: ExtensionItem) => i.id === "execute-python",
      );
      expect(python).toBeDefined();
      expect(python?.isDefault).toBe(false);
    });

    it("supports fallback to provided raw extensions list", async () => {
      const rawList = [
        "./packages/alpha/index.ts",
        "./packages/mm-memory/src/index.ts",
      ];

      const catalog = await loadExtensionCatalog({ extensionsList: rawList });
      expect(catalog.length).toBe(2);
      expect(catalog[0].id).toBe("alpha");
      expect(catalog[1].category).toBe("memory");
    });
  });
});
