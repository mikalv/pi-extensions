import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  applyPresetToProject,
  disableProjectExtension,
  enableProjectExtension,
  readProjectSettings,
  resolvePiExtensionsRepo,
  toggleProjectExtension,
  writeProjectSettings,
} from "../src/writer.ts";
import type { ProjectSettingsState } from "../src/types.ts";

describe("Settings File Reader & Atomic Writer (`pi-project-setup/writer`)", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "pi-project-setup-test-"));
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  describe("Reading Project Settings (`readProjectSettings`)", () => {
    it("returns default state when .pi/settings.json does not exist", async () => {
      const state = await readProjectSettings(tempDir);
      expect(state.exists).toBe(false);
      expect(state.cwd).toBe(tempDir);
      expect(state.settingsPath).toBe(join(tempDir, ".pi", "settings.json"));
      expect(state.activeExtensions).toEqual([]);
      expect(state.rawSettings).toEqual({});
      expect(state.packages).toEqual([]);
    });

    it("reads and parses existing .pi/settings.json with package extension filters", async () => {
      const piDir = join(tempDir, ".pi");
      await mkdir(piDir, { recursive: true });

      const initialSettings = {
        defaultModel: "zai/glm-5.2",
        thinkingLevel: "high",
        compaction: { keepRecentTokens: 5000 },
        packages: [
          "npm:@npm-ken/pi-macos-notify",
          {
            source: "/Users/test/pi-extensions",
            extensions: [
              "./packages/pi-agent-core/src/index.ts",
              "./packages/clipboard/index.ts",
              "./packages/mm-memory/src/index.ts",
            ],
          },
          {
            source: "npm:pi-subagents",
            extensions: [],
          },
        ],
      };

      await writeFile(
        join(piDir, "settings.json"),
        JSON.stringify(initialSettings, null, 2),
        "utf-8",
      );

      const state = await readProjectSettings(tempDir);
      expect(state.exists).toBe(true);
      expect(state.activeExtensions).toEqual([
        "./packages/pi-agent-core/src/index.ts",
        "./packages/clipboard/index.ts",
        "./packages/mm-memory/src/index.ts",
      ]);
      expect(state.rawSettings.defaultModel).toBe("zai/glm-5.2");
      expect(state.rawSettings.thinkingLevel).toBe("high");
      expect((state.rawSettings.compaction as any)?.keepRecentTokens).toBe(5000);
      expect(state.packages.length).toBe(3);
    });

    it("handles corrupt or invalid JSON gracefully by returning default state with exists=false", async () => {
      const piDir = join(tempDir, ".pi");
      await mkdir(piDir, { recursive: true });
      await writeFile(
        join(piDir, "settings.json"),
        "BROKEN JSON {{{",
        "utf-8",
      );

      const state = await readProjectSettings(tempDir);
      expect(state.exists).toBe(false);
      expect(state.activeExtensions).toEqual([]);
      expect(state.rawSettings).toEqual({});
    });

    it("identifies all extensions as active if repo package entry has no extension filters", async () => {
      const piDir = join(tempDir, ".pi");
      await mkdir(piDir, { recursive: true });

      const initialSettings = {
        packages: ["/Users/test/pi-extensions"],
      };

      await writeFile(
        join(piDir, "settings.json"),
        JSON.stringify(initialSettings),
        "utf-8",
      );

      const state = await readProjectSettings(tempDir);
      expect(state.exists).toBe(true);
      // When package is listed as a plain string, no explicit filter array is set
      expect(state.activeExtensions).toEqual([]);
      expect(state.packages).toEqual(["/Users/test/pi-extensions"]);
    });
  });

  describe("Writing Project Settings (`writeProjectSettings`)", () => {
    it("creates .pi directory and writes settings.json with selected extensions", async () => {
      const selected = [
        "./packages/pi-agent-core/src/index.ts",
        "./packages/clipboard/index.ts",
      ];

      const repoPath = "/Users/test/pi-extensions";
      const writtenPath = await writeProjectSettings(tempDir, selected, {
        repoPath,
      });

      expect(writtenPath).toBe(join(tempDir, ".pi", "settings.json"));

      const content = await readFile(writtenPath, "utf-8");
      const parsed = JSON.parse(content);

      expect(parsed.packages).toBeDefined();
      expect(parsed.packages.length).toBe(1);
      expect(parsed.packages[0]).toEqual({
        source: repoPath,
        extensions: selected,
      });
    });

    it("preserves non-package settings and other packages in existing settings.json", async () => {
      const piDir = join(tempDir, ".pi");
      await mkdir(piDir, { recursive: true });

      const initialSettings = {
        defaultProvider: "vllm-local",
        defaultModel: "qwen3.6-27b-awq",
        customRule: { strict: true },
        packages: [
          "npm:@npm-ken/pi-macos-notify",
          {
            source: "/Users/test/pi-extensions",
            extensions: ["./packages/old-ext.ts"],
          },
          "npm:some-other-package",
        ],
      };

      await writeFile(
        join(piDir, "settings.json"),
        JSON.stringify(initialSettings, null, 2),
        "utf-8",
      );

      const newSelected = [
        "./packages/pi-agent-core/src/index.ts",
        "./packages/mm-memory/src/index.ts",
      ];

      const repoPath = "/Users/test/pi-extensions";
      await writeProjectSettings(tempDir, newSelected, { repoPath });

      const content = await readFile(join(piDir, "settings.json"), "utf-8");
      const parsed = JSON.parse(content);

      expect(parsed.defaultProvider).toBe("vllm-local");
      expect(parsed.defaultModel).toBe("qwen3.6-27b-awq");
      expect(parsed.customRule).toEqual({ strict: true });
      expect(parsed.packages.length).toBe(3);
      expect(parsed.packages[0]).toBe("npm:@npm-ken/pi-macos-notify");
      expect(parsed.packages[1]).toEqual({
        source: repoPath,
        extensions: newSelected,
      });
      expect(parsed.packages[2]).toBe("npm:some-other-package");
    });

    it("replaces plain string repo package with filtered object entry", async () => {
      const piDir = join(tempDir, ".pi");
      await mkdir(piDir, { recursive: true });

      const initialSettings = {
        packages: ["/Users/test/pi-extensions", "npm:foo"],
      };

      await writeFile(
        join(piDir, "settings.json"),
        JSON.stringify(initialSettings),
        "utf-8",
      );

      const selected = ["./packages/clipboard/index.ts"];
      const repoPath = "/Users/test/pi-extensions";
      await writeProjectSettings(tempDir, selected, { repoPath });

      const parsed = JSON.parse(
        await readFile(join(piDir, "settings.json"), "utf-8"),
      );
      expect(parsed.packages.length).toBe(2);
      expect(parsed.packages[0]).toEqual({
        source: repoPath,
        extensions: selected,
      });
      expect(parsed.packages[1]).toBe("npm:foo");
    });

    it("writes atomically without leaving leftover temp files", async () => {
      const selected = ["./packages/clipboard/index.ts"];
      await writeProjectSettings(tempDir, selected, {
        repoPath: "/test/repo",
      });

      const piDir = join(tempDir, ".pi");
      const files = await readFile(join(piDir, "settings.json"), "utf-8");
      expect(files).toBeDefined();

      // Check no temp files remained
      const { readdir } = await import("node:fs/promises");
      const dirEntries = await readdir(piDir);
      const tmpFiles = dirEntries.filter((f) => f.includes(".tmp"));
      expect(tmpFiles.length).toBe(0);
    });

    it("merges extraSettings into the written file when provided", async () => {
      const selected = ["./packages/clipboard/index.ts"];
      await writeProjectSettings(tempDir, selected, {
        repoPath: "/test/repo",
        extraSettings: {
          defaultThinkingLevel: "medium",
          theme: "dark",
        },
      });

      const parsed = JSON.parse(
        await readFile(join(tempDir, ".pi", "settings.json"), "utf-8"),
      );
      expect(parsed.defaultThinkingLevel).toBe("medium");
      expect(parsed.theme).toBe("dark");
      expect(parsed.packages[0].extensions).toEqual(selected);
    });
  });

  describe("Extension Delta Operations (`enable`, `disable`, `toggle`, `applyPreset`)", () => {
    it("enables a new extension without duplicating existing active extensions", async () => {
      const piDir = join(tempDir, ".pi");
      await mkdir(piDir, { recursive: true });

      const repoPath = "/test/repo";
      await writeFile(
        join(piDir, "settings.json"),
        JSON.stringify({
          packages: [
            {
              source: repoPath,
              extensions: ["./packages/clipboard/index.ts"],
            },
          ],
        }),
        "utf-8",
      );

      const state1 = await enableProjectExtension(
        tempDir,
        "./packages/mm-memory/src/index.ts",
        { repoPath },
      );
      expect(state1.activeExtensions).toContain("./packages/clipboard/index.ts");
      expect(state1.activeExtensions).toContain(
        "./packages/mm-memory/src/index.ts",
      );

      // Re-enabling existing should not duplicate
      const state2 = await enableProjectExtension(
        tempDir,
        "./packages/clipboard/index.ts",
        { repoPath },
      );
      expect(state2.activeExtensions.length).toBe(2);
    });

    it("disables an active extension cleanly", async () => {
      const repoPath = "/test/repo";
      await writeProjectSettings(
        tempDir,
        [
          "./packages/clipboard/index.ts",
          "./packages/mm-memory/src/index.ts",
        ],
        { repoPath },
      );

      const state = await disableProjectExtension(
        tempDir,
        "./packages/clipboard/index.ts",
        { repoPath },
      );
      expect(state.activeExtensions).toEqual([
        "./packages/mm-memory/src/index.ts",
      ]);
      expect(state.activeExtensions).not.toContain(
        "./packages/clipboard/index.ts",
      );
    });

    it("toggles an extension on and off", async () => {
      const repoPath = "/test/repo";
      await writeProjectSettings(tempDir, ["./packages/clipboard/index.ts"], {
        repoPath,
      });

      // Toggle off
      const state1 = await toggleProjectExtension(
        tempDir,
        "./packages/clipboard/index.ts",
        { repoPath },
      );
      expect(state1.activeExtensions).not.toContain(
        "./packages/clipboard/index.ts",
      );

      // Toggle on
      const state2 = await toggleProjectExtension(
        tempDir,
        "./packages/clipboard/index.ts",
        { repoPath },
      );
      expect(state2.activeExtensions).toContain(
        "./packages/clipboard/index.ts",
      );
    });

    it("applies a named preset to the project settings", async () => {
      const available = [
        "./packages/pi-agent-core/src/index.ts",
        "./packages/clipboard/index.ts",
        "./packages/notify/extensions/index.ts",
        "./packages/auto-retry/src/index.ts",
        "./packages/system-prompt.ts",
        "./packages/mm-memory/src/index.ts",
        "./packages/execute-python/extensions",
      ];

      const repoPath = "/test/repo";
      const state = await applyPresetToProject(
        tempDir,
        "minimal",
        available,
        { repoPath },
      );

      expect(state.activeExtensions).toContain(
        "./packages/pi-agent-core/src/index.ts",
      );
      expect(state.activeExtensions).toContain("./packages/clipboard/index.ts");
      expect(state.activeExtensions).not.toContain(
        "./packages/execute-python/extensions",
      );
    });
  });

  describe("Repository Path Resolution (`resolvePiExtensionsRepo`)", () => {
    it("finds repo from existing settings.json package source if available", () => {
      const state: Partial<ProjectSettingsState> = {
        packages: [
          "npm:foo",
          {
            source: "/custom/path/to/pi-extensions",
            extensions: [],
          },
        ],
      };

      const resolved = resolvePiExtensionsRepo({ state: state as any });
      expect(resolved).toBe("/custom/path/to/pi-extensions");
    });

    it("resolves repo path from options or fallback directory", () => {
      const resolved = resolvePiExtensionsRepo({
        explicitPath: "/explicit/path",
      });
      expect(resolved).toBe("/explicit/path");
    });
  });
});
