import { describe, expect, it } from "bun:test";
import { SetupDialogComponent, type SetupDialogOptions } from "../src/ui/setup-dialog.ts";
import { type ExtensionItem, type PresetProfile } from "../src/types.ts";
import { listPresets } from "../src/presets.ts";

function createSampleItems(): ExtensionItem[] {
  return [
    {
      id: "mm-memory",
      name: "Prism Long-Term Memory",
      path: "./packages/mm-memory/src/index.ts",
      category: "memory",
      description: "Prism LTM client and retrieval tools",
      tags: ["memory", "ltm", "prism"],
      isDefault: true,
    },
    {
      id: "mm-wiki",
      name: "Project & Topical Wiki",
      path: "./packages/mm-wiki/src/index.ts",
      category: "memory",
      description: "Personal and project wiki knowledge base",
      tags: ["wiki", "knowledge"],
    },
    {
      id: "pi-agent-core",
      name: "Subagent & Workflow Control Plane",
      path: "./packages/pi-agent-core/src/index.ts",
      category: "agents",
      description: "Unified subagents and JS worker workflows",
      tags: ["subagents", "workflows", "control-plane"],
      isDefault: true,
    },
    {
      id: "clipboard",
      name: "System Clipboard Integration",
      path: "./packages/clipboard/index.ts",
      category: "tools",
      description: "OS-native clipboard copy/paste utilities",
      tags: ["clipboard", "system"],
      isDefault: true,
    },
    {
      id: "execute-python",
      name: "Python Execution Kernel",
      path: "./packages/execute-python/extensions",
      category: "tools",
      description: "Interactive Python execution and sandbox",
      tags: ["python", "kernel"],
    },
    {
      id: "pi-atelier",
      name: "Atelier Sidebar & Workspace UI",
      path: "./packages/pi-atelier/extensions/index.ts",
      category: "ui",
      description: "Interactive sidebar and UI components",
      tags: ["sidebar", "workspace"],
    },
    {
      id: "pi-model-restriction",
      name: "Model Policy & Restriction Gate",
      path: "./packages/pi-model-restriction/src/index.ts",
      category: "diagnostics",
      description: "Enforce local-only or allowed provider gates",
      tags: ["security", "governance"],
    },
    {
      id: "custom-plugin",
      name: "Custom Third-Party Plugin",
      path: "./packages/custom-plugin/index.ts",
      category: "other",
      description: "Miscellaneous extension helper",
    },
  ];
}

function createMockTheme() {
  return {
    accent: (s: string) => `\x1b[36m${s}\x1b[39m`,
    dim: (s: string) => `\x1b[2m${s}\x1b[22m`,
    success: (s: string) => `\x1b[32m${s}\x1b[39m`,
    error: (s: string) => `\x1b[31m${s}\x1b[39m`,
    warning: (s: string) => `\x1b[33m${s}\x1b[39m`,
    bold: (s: string) => `\x1b[1m${s}\x1b[22m`,
  };
}

describe("Interactive TUI Multi-Select Component (`pi-project-setup/ui`)", () => {
  describe("Initial State & Configuration", () => {
    it("initializes with provided items and default active extensions", () => {
      const items = createSampleItems();
      const active = [
        "./packages/mm-memory/src/index.ts",
        "./packages/pi-agent-core/src/index.ts",
      ];

      const dialog = new SetupDialogComponent({
        items,
        activeExtensions: active,
        cwd: "/Users/test/my-project",
      });

      expect(dialog.getItems().length).toBe(items.length);
      expect(dialog.getSelectedExtensions().length).toBe(2);
      expect(dialog.getSelectedExtensions()).toContain(
        "./packages/mm-memory/src/index.ts",
      );
      expect(dialog.getSelectedExtensions()).toContain(
        "./packages/pi-agent-core/src/index.ts",
      );
      expect(dialog.getSelectedCategory()).toBe("all");
      expect(dialog.getSearchQuery()).toBe("");
      expect(dialog.getFocusedIndex()).toBe(0);
    });

    it("defaults to isDefault items when activeExtensions is not provided", () => {
      const items = createSampleItems();
      const dialog = new SetupDialogComponent({ items });

      const selected = dialog.getSelectedExtensions();
      expect(selected.length).toBe(3);
      expect(selected).toContain("./packages/mm-memory/src/index.ts");
      expect(selected).toContain("./packages/pi-agent-core/src/index.ts");
      expect(selected).toContain("./packages/clipboard/index.ts");
    });

    it("computes accurate category counts", () => {
      const items = createSampleItems();
      const dialog = new SetupDialogComponent({ items });

      const counts = dialog.getCategoryCounts();
      expect(counts.all).toBe(8);
      expect(counts.memory).toBe(2);
      expect(counts.agents).toBe(1);
      expect(counts.tools).toBe(2);
      expect(counts.ui).toBe(1);
      expect(counts.diagnostics).toBe(1);
      expect(counts.other).toBe(1);
    });
  });

  describe("Filtering & Search Logic", () => {
    it("filters items by category tab", () => {
      const items = createSampleItems();
      const dialog = new SetupDialogComponent({ items });

      dialog.setCategory("memory");
      expect(dialog.getSelectedCategory()).toBe("memory");

      const filtered = dialog.getFilteredItems();
      expect(filtered.length).toBe(2);
      expect(filtered.every((i) => i.category === "memory")).toBe(true);

      dialog.setCategory("agents");
      expect(dialog.getFilteredItems().length).toBe(1);
      expect(dialog.getFilteredItems()[0].id).toBe("pi-agent-core");
    });

    it("filters items by search query matching name, path, description, or tags", () => {
      const items = createSampleItems();
      const dialog = new SetupDialogComponent({ items });

      dialog.setSearchQuery("python");
      const pythonFiltered = dialog.getFilteredItems();
      expect(pythonFiltered.length).toBe(1);
      expect(pythonFiltered[0].id).toBe("execute-python");

      dialog.setSearchQuery("prism");
      const prismFiltered = dialog.getFilteredItems();
      expect(prismFiltered.length).toBe(1);
      expect(prismFiltered[0].id).toBe("mm-memory");

      dialog.setSearchQuery("security");
      const securityFiltered = dialog.getFilteredItems();
      expect(securityFiltered.length).toBe(1);
      expect(securityFiltered[0].id).toBe("pi-model-restriction");
    });

    it("combines category filter and search query", () => {
      const items = createSampleItems();
      const dialog = new SetupDialogComponent({ items });

      dialog.setCategory("tools");
      dialog.setSearchQuery("clipboard");

      const filtered = dialog.getFilteredItems();
      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe("clipboard");

      // Search matching something in memory category while viewing tools category returns empty
      dialog.setSearchQuery("prism");
      expect(dialog.getFilteredItems().length).toBe(0);
    });

    it("clamps focusedIndex when filtered items list shrinks", () => {
      const items = createSampleItems();
      const dialog = new SetupDialogComponent({ items });

      dialog.setFocusedIndex(6);
      expect(dialog.getFocusedIndex()).toBe(6);

      dialog.setCategory("agents"); // only 1 item
      expect(dialog.getFocusedIndex()).toBe(0);
    });
  });

  describe("Item Navigation (`Up`, `Down`, `j`, `k`, `Home`, `End`)", () => {
    it("navigates down and up through items", () => {
      const items = createSampleItems();
      const dialog = new SetupDialogComponent({ items });

      dialog.handleInput("\x1b[B"); // Down arrow
      expect(dialog.getFocusedIndex()).toBe(1);

      dialog.handleInput("j"); // vim j
      expect(dialog.getFocusedIndex()).toBe(2);

      dialog.handleInput("\x1b[A"); // Up arrow
      expect(dialog.getFocusedIndex()).toBe(1);

      dialog.handleInput("k"); // vim k
      expect(dialog.getFocusedIndex()).toBe(0);

      // Clamps at 0
      dialog.handleInput("k");
      expect(dialog.getFocusedIndex()).toBe(0);
    });

    it("handles Home and End keys", () => {
      const items = createSampleItems();
      const dialog = new SetupDialogComponent({ items });

      dialog.handleInput("\x1b[F"); // End or G
      expect(dialog.getFocusedIndex()).toBe(items.length - 1);

      dialog.handleInput("\x1b[H"); // Home
      expect(dialog.getFocusedIndex()).toBe(0);
    });
  });

  describe("Selection & Toggling (`Space`, `a`)", () => {
    it("toggles focused extension selection on Space", () => {
      const items = createSampleItems();
      const dialog = new SetupDialogComponent({
        items,
        activeExtensions: [],
      });

      expect(dialog.isExtensionSelected(items[0].path)).toBe(false);

      dialog.handleInput(" "); // Space on item 0
      expect(dialog.isExtensionSelected(items[0].path)).toBe(true);
      expect(dialog.getSelectedExtensions()).toContain(items[0].path);

      dialog.handleInput(" "); // Toggle off
      expect(dialog.isExtensionSelected(items[0].path)).toBe(false);
    });

    it("toggles all filtered extensions on 'a'", () => {
      const items = createSampleItems();
      const dialog = new SetupDialogComponent({
        items,
        activeExtensions: [],
      });

      dialog.setCategory("memory"); // 2 items
      expect(dialog.getSelectedExtensions().length).toBe(0);

      dialog.handleInput("a"); // Select all in memory
      expect(dialog.getSelectedExtensions().length).toBe(2);
      expect(dialog.isExtensionSelected(items[0].path)).toBe(true);
      expect(dialog.isExtensionSelected(items[1].path)).toBe(true);

      dialog.handleInput("a"); // Deselect all in memory
      expect(dialog.getSelectedExtensions().length).toBe(0);
    });
  });

  describe("Preset Shortcuts (`1-5`)", () => {
    it("applies preset profiles via number keys", () => {
      const items = createSampleItems();
      const dialog = new SetupDialogComponent({
        items,
        activeExtensions: [],
      });

      // 1: Minimal preset
      dialog.handleInput("1");
      const selectedMinimal = dialog.getSelectedExtensions();
      expect(selectedMinimal).toContain("./packages/pi-agent-core/src/index.ts");
      expect(selectedMinimal).toContain("./packages/clipboard/index.ts");
      expect(dialog.getStatusMessage()).toContain("Minimal");

      // 5: All extensions preset
      dialog.handleInput("5");
      expect(dialog.getSelectedExtensions().length).toBe(items.length);
      expect(dialog.getStatusMessage()).toContain("All");
    });
  });

  describe("Category Tab Cycling (`Tab`, `Shift+Tab`)", () => {
    it("cycles category tabs forward on Tab and backward on Shift+Tab", () => {
      const items = createSampleItems();
      const dialog = new SetupDialogComponent({ items });

      expect(dialog.getSelectedCategory()).toBe("all");

      dialog.handleInput("\t"); // Tab
      expect(dialog.getSelectedCategory()).toBe("memory");

      dialog.handleInput("\t"); // Tab
      expect(dialog.getSelectedCategory()).toBe("agents");

      dialog.handleInput("\x1b[Z"); // Shift+Tab
      expect(dialog.getSelectedCategory()).toBe("memory");

      dialog.handleInput("\x1b[Z"); // Shift+Tab
      expect(dialog.getSelectedCategory()).toBe("all");
    });
  });

  describe("Search Input Mode (`/`, typing, Backspace, Escape)", () => {
    it("enters search mode on '/' and filters on keystrokes", () => {
      const items = createSampleItems();
      let renderRequested = false;
      const dialog = new SetupDialogComponent({
        items,
        onRenderRequest: () => {
          renderRequested = true;
        },
      });

      expect(dialog.isSearchMode()).toBe(false);

      dialog.handleInput("/");
      expect(dialog.isSearchMode()).toBe(true);

      dialog.handleInput("w");
      dialog.handleInput("i");
      dialog.handleInput("k");
      dialog.handleInput("i");

      expect(dialog.getSearchQuery()).toBe("wiki");
      expect(dialog.getFilteredItems().length).toBe(1);
      expect(dialog.getFilteredItems()[0].id).toBe("mm-wiki");

      dialog.handleInput("\x7f"); // Backspace -> "wik"
      expect(dialog.getSearchQuery()).toBe("wik");

      dialog.handleInput("\x1b"); // Escape exits search mode but keeps query
      expect(dialog.isSearchMode()).toBe(false);
      expect(dialog.getSearchQuery()).toBe("wik");
    });
  });

  describe("Save and Cancel Actions (`s`, `Enter`, `Escape`, `q`)", () => {
    it("invokes onSave callback with selected extensions on 's' or 'Enter'", async () => {
      const items = createSampleItems();
      let savedResult: string[] | null = null;

      const dialog = new SetupDialogComponent({
        items,
        activeExtensions: [items[0].path],
        onSave: (selected) => {
          savedResult = selected;
        },
      });

      dialog.handleInput("s");
      expect(savedResult).not.toBeNull();
      expect(savedResult!).toEqual([items[0].path]);

      savedResult = null;
      dialog.handleInput("\r"); // Enter
      expect(savedResult).not.toBeNull();
      expect(savedResult!).toEqual([items[0].path]);
    });

    it("invokes onCancel callback on 'Escape' or 'q'", () => {
      const items = createSampleItems();
      let cancelCount = 0;

      const dialog = new SetupDialogComponent({
        items,
        onCancel: () => {
          cancelCount++;
        },
      });

      dialog.handleInput("q");
      expect(cancelCount).toBe(1);

      dialog.handleInput("\x1b"); // Escape
      expect(cancelCount).toBe(2);
    });
  });

  describe("TUI Rendering Layout (`render(width)`)", () => {
    it("renders complete dialog layout with header, tabs, checkboxes, and presets", () => {
      const items = createSampleItems();
      const theme = createMockTheme();

      const dialog = new SetupDialogComponent({
        items,
        activeExtensions: [items[0].path, items[2].path],
        theme,
        cwd: "/Users/mikalv/Repos/my-project",
      });

      const lines = dialog.render(100);
      expect(lines.length).toBeGreaterThan(10);

      const fullOutput = lines.join("\n");

      // Verify Header
      expect(fullOutput).toContain("Pi Project Setup");
      expect(fullOutput).toContain("my-project");
      expect(fullOutput).toContain("2 of 8");

      // Verify Category Tabs
      expect(fullOutput).toContain("All");
      expect(fullOutput).toContain("Memory");
      expect(fullOutput).toContain("Agents");

      // Verify Extension rows & Checkboxes
      expect(fullOutput).toContain("[x]");
      expect(fullOutput).toContain("[ ]");
      expect(fullOutput).toContain("Prism Long-Term Memory");
      expect(fullOutput).toContain("Subagent & Workflow Control Plane");

      // Verify Focused cursor
      expect(fullOutput).toContain("›");

      // Verify Presets Bar
      expect(fullOutput).toContain("[1] Minimal");
      expect(fullOutput).toContain("[5] All");

      // Verify Help Footer
      expect(fullOutput).toContain("Toggle");
      expect(fullOutput).toContain("Save");
      expect(fullOutput).toContain("Cancel");
    });

    it("renders empty state when search matches no items", () => {
      const items = createSampleItems();
      const dialog = new SetupDialogComponent({ items });

      dialog.setSearchQuery("non-existent-search-term");
      const lines = dialog.render(80);
      const fullOutput = lines.join("\n");

      expect(fullOutput).toContain("No extensions match");
    });
  });
});
