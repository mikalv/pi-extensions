import { describe, expect, it } from "bun:test";
import {
  BUILTIN_PRESET_IDS,
  CATEGORY_METADATA,
  DEFAULT_PRESETS,
  EXTENSION_CATEGORIES,
  createDefaultProjectSettingsState,
  createExtensionItem,
  createPresetProfile,
  validateExtensionItem,
  validatePresetProfile,
  validateProjectSettingsState,
  type ExtensionCategory,
  type ExtensionCategoryId,
  type ExtensionItem,
  type PresetProfile,
  type ProjectSettingsState,
} from "../src/types.ts";

describe("pi-project-setup types & validation", () => {
  describe("Constants & Enums", () => {
    it("exports all expected category IDs", () => {
      expect(EXTENSION_CATEGORIES).toEqual([
        "memory",
        "agents",
        "tools",
        "ui",
        "diagnostics",
        "other",
      ]);
    });

    it("provides rich metadata for each category", () => {
      for (const catId of EXTENSION_CATEGORIES) {
        const meta = CATEGORY_METADATA[catId];
        expect(meta).toBeDefined();
        expect(meta.id).toBe(catId);
        expect(typeof meta.label).toBe("string");
        expect(typeof meta.icon).toBe("string");
        expect(typeof meta.description).toBe("string");
      }
    });

    it("exports built-in preset IDs", () => {
      expect(BUILTIN_PRESET_IDS).toEqual([
        "minimal",
        "web",
        "backend",
        "offline",
        "all",
      ]);
    });

    it("exports complete default presets with valid configurations", () => {
      expect(Object.keys(DEFAULT_PRESETS)).toEqual([
        "minimal",
        "web",
        "backend",
        "offline",
        "all",
      ]);

      for (const [id, preset] of Object.entries(DEFAULT_PRESETS)) {
        expect(preset.id).toBe(id);
        expect(preset.name.length).toBeGreaterThan(0);
        expect(preset.description.length).toBeGreaterThan(0);
        expect(Array.isArray(preset.extensions)).toBe(true);
        expect(typeof preset.icon).toBe("string");
      }
    });
  });

  describe("validateExtensionItem", () => {
    it("validates a complete valid extension item", () => {
      const input: ExtensionItem = {
        id: "pi-agent-core",
        name: "Unified Subagents",
        path: "./packages/pi-agent-core/src/index.ts",
        category: "agents",
        description: "Control plane for subagents and workflows",
        tags: ["subagent", "workflow"],
        isDefault: true,
        source: "local",
      };

      const result = validateExtensionItem(input);
      expect(result.valid).toBe(true);
      expect(result.item).toBeDefined();
      expect(result.item?.id).toBe("pi-agent-core");
      expect(result.item?.category).toBe("agents");
      expect(result.errors).toBeUndefined();
    });

    it("auto-generates id and defaults optional fields if missing", () => {
      const minimal = {
        name: "Quick Copy",
        path: "./packages/copymsgs.ts",
        category: "tools" as ExtensionCategoryId,
        description: "Copy messages via OSC52",
      };

      const result = validateExtensionItem(minimal);
      expect(result.valid).toBe(true);
      expect(result.item?.id).toBe("copymsgs");
      expect(result.item?.tags).toEqual([]);
      expect(result.item?.isDefault).toBe(false);
      expect(result.item?.source).toBe("local");
    });

    it("rejects non-object or invalid inputs", () => {
      expect(validateExtensionItem(null).valid).toBe(false);
      expect(validateExtensionItem("string").valid).toBe(false);
      expect(validateExtensionItem(123).valid).toBe(false);
    });

    it("rejects extension item with missing name or path", () => {
      const noName = {
        path: "./packages/test.ts",
        category: "tools",
        description: "Desc",
      };
      expect(validateExtensionItem(noName).valid).toBe(false);

      const noPath = {
        name: "Test",
        category: "tools",
        description: "Desc",
      };
      expect(validateExtensionItem(noPath).valid).toBe(false);
    });

    it("rejects invalid extension category", () => {
      const badCategory = {
        name: "Test",
        path: "./packages/test.ts",
        category: "unknown-category",
        description: "Desc",
      };
      const res = validateExtensionItem(badCategory);
      expect(res.valid).toBe(false);
      expect(res.errors?.[0]).toContain("Invalid category");
    });
  });

  describe("validatePresetProfile", () => {
    it("validates a complete valid preset profile", () => {
      const preset: PresetProfile = {
        id: "web",
        name: "Full Stack / Web",
        description: "Agent core, memory, devtools and UI widgets",
        icon: "🌐",
        extensions: [
          "./packages/pi-agent-core/src/index.ts",
          "./packages/mm-memory/src/index.ts",
          "./packages/clipboard/index.ts",
        ],
      };

      const result = validatePresetProfile(preset);
      expect(result.valid).toBe(true);
      expect(result.preset).toEqual(preset);
      expect(result.errors).toBeUndefined();
    });

    it("rejects preset with missing id, name, or non-array extensions", () => {
      expect(validatePresetProfile(null).valid).toBe(false);
      expect(
        validatePresetProfile({
          name: "Minimal",
          description: "Desc",
          extensions: [],
        }).valid
      ).toBe(false);
      expect(
        validatePresetProfile({
          id: "min",
          description: "Desc",
          extensions: [],
        }).valid
      ).toBe(false);
      expect(
        validatePresetProfile({
          id: "min",
          name: "Min",
          description: "Desc",
          extensions: "not-an-array",
        }).valid
      ).toBe(false);
    });
  });

  describe("validateProjectSettingsState", () => {
    it("validates valid project settings state", () => {
      const state: ProjectSettingsState = {
        cwd: "/Users/test/project",
        settingsPath: "/Users/test/project/.pi/settings.json",
        exists: true,
        rawSettings: {
          defaultModel: "vllm-local/qwen3.6",
        },
        activeExtensions: ["./packages/pi-agent-core/src/index.ts"],
        packages: [
          {
            source: "/Users/mikalv/Repos/pi-extensions",
            extensions: ["./packages/pi-agent-core/src/index.ts"],
          },
        ],
      };

      const result = validateProjectSettingsState(state);
      expect(result.valid).toBe(true);
      expect(result.state).toBeDefined();
      expect(result.state?.exists).toBe(true);
      expect(result.state?.activeExtensions.length).toBe(1);
    });

    it("applies defaults for minimal project settings state", () => {
      const minimal = {
        cwd: "/Users/test/project",
        settingsPath: "/Users/test/project/.pi/settings.json",
      };

      const result = validateProjectSettingsState(minimal);
      expect(result.valid).toBe(true);
      expect(result.state?.exists).toBe(false);
      expect(result.state?.rawSettings).toEqual({});
      expect(result.state?.activeExtensions).toEqual([]);
      expect(result.state?.packages).toEqual([]);
    });

    it("rejects invalid project settings state missing cwd or settingsPath", () => {
      expect(validateProjectSettingsState(null).valid).toBe(false);
      expect(
        validateProjectSettingsState({
          cwd: "/test",
        }).valid
      ).toBe(false);
    });
  });

  describe("Factory Functions", () => {
    it("createExtensionItem constructs a clean ExtensionItem", () => {
      const item = createExtensionItem({
        name: "ADHD Tasks",
        path: "./packages/pi-adhd-tasks/src/index.ts",
        category: "tools",
        description: "Task and reminder monitor",
        tags: ["tasks", "adhd"],
      });

      expect(item.id).toBe("pi-adhd-tasks");
      expect(item.name).toBe("ADHD Tasks");
      expect(item.category).toBe("tools");
      expect(item.tags).toEqual(["tasks", "adhd"]);
      expect(item.isDefault).toBe(false);
      expect(item.source).toBe("local");
    });

    it("createPresetProfile constructs a valid PresetProfile", () => {
      const preset = createPresetProfile({
        id: "custom-dev",
        name: "Custom Dev",
        description: "My custom dev setup",
        icon: "⚡",
        extensions: ["ext1", "ext2"],
      });

      expect(preset.id).toBe("custom-dev");
      expect(preset.name).toBe("Custom Dev");
      expect(preset.icon).toBe("⚡");
      expect(preset.extensions).toEqual(["ext1", "ext2"]);
    });

    it("createDefaultProjectSettingsState initializes a clean state for a given cwd", () => {
      const state = createDefaultProjectSettingsState("/my/work/repo");
      expect(state.cwd).toBe("/my/work/repo");
      expect(state.settingsPath.endsWith(".pi/settings.json")).toBe(true);
      expect(state.exists).toBe(false);
      expect(state.rawSettings).toEqual({});
      expect(state.activeExtensions).toEqual([]);
      expect(state.packages).toEqual([]);
    });
  });
});
