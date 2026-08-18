import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import piProjectSetupExtension, {
  findMatchingExtension,
  formatHelpText,
  handleSetupCommand,
} from "../src/index.js";
import { readProjectSettings } from "../src/writer.js";

describe("Extension Entrypoint, Commands & CLI Integration (`pi-project-setup`)", () => {
  let tempDir: string;
  let fakePackageJson: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "pi-setup-ext-test-"));
    fakePackageJson = join(tempDir, "package.json");

    await writeFile(
      fakePackageJson,
      JSON.stringify(
        {
          name: "test-pi-extensions",
          pi: {
            extensions: [
              "./packages/amphetamine/src/index.ts",
              "./packages/clipboard/index.ts",
              "./packages/notify/extensions/index.ts",
              "./packages/mm-memory/src/index.ts",
              "./packages/pi-agent-core/src/index.ts",
              "./packages/execute-python/extensions",
              "./packages/files-widget/index.ts",
            ],
          },
        },
        null,
        2,
      ),
      "utf-8",
    );
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("Extension Registration Contract", () => {
    it("registers /setup-pi, /project-setup, and /pi-setup commands on startup", () => {
      const commands = new Map<string, any>();
      const fakePi: any = {
        registerCommand: (name: string, options: any) => {
          commands.set(name, options);
        },
      };

      piProjectSetupExtension(fakePi);

      expect(commands.has("setup-pi")).toBe(true);
      expect(commands.has("project-setup")).toBe(true);
      expect(commands.has("pi-setup")).toBe(true);

      const setupPi = commands.get("setup-pi");
      expect(setupPi.description).toContain("Interactive TUI project setup");
      expect(typeof setupPi.handler).toBe("function");
      expect(typeof setupPi.getArgumentCompletions).toBe("function");

      const completions = setupPi.getArgumentCompletions("--preset");
      expect(completions.some((c: string) => c.includes("minimal"))).toBe(true);
    });
  });

  describe("Helper Utilities (`formatHelpText` & `findMatchingExtension`)", () => {
    it("formats rich help text listing presets and keyboard shortcuts", () => {
      const help = formatHelpText();
      expect(help).toContain("/setup-pi");
      expect(help).toContain("minimal");
      expect(help).toContain("web");
      expect(help).toContain("backend");
      expect(help).toContain("[Space]");
      expect(help).toContain("[Enter]");
    });

    it("finds matching extension by path, id, or partial name substring", () => {
      const catalog = [
        {
          id: "mm-memory",
          name: "Prism Long-Term Memory",
          path: "./packages/mm-memory/src/index.ts",
          category: "memory" as const,
          description: "Persistent memory",
          isDefault: true,
        },
        {
          id: "execute-python",
          name: "Execute Python",
          path: "./packages/execute-python/extensions",
          category: "tools" as const,
          description: "Python runtime execution",
          isDefault: false,
        },
      ];

      // Exact ID
      const byId = findMatchingExtension("mm-memory", catalog);
      expect(byId?.path).toBe("./packages/mm-memory/src/index.ts");
      expect(byId?.id).toBe("mm-memory");

      // Exact Path
      const byPath = findMatchingExtension("./packages/execute-python/extensions", catalog);
      expect(byPath?.name).toBe("Execute Python");
      expect(byPath?.id).toBe("execute-python");

      // Partial substring
      const bySubstring = findMatchingExtension("python", catalog);
      expect(bySubstring?.id).toBe("execute-python");

      // Fallback
      const fallback = findMatchingExtension("unknown-custom-tool", catalog);
      expect(fallback?.path).toBe("unknown-custom-tool");
    });
  });

  describe("CLI Flags & Slash Command Execution (`handleSetupCommand`)", () => {
    it("handles --help flag and notifies user", async () => {
      const notifications: string[] = [];
      const fakeCtx: any = {
        hasUI: true,
        cwd: tempDir,
        ui: {
          notify: (msg: string) => notifications.push(msg),
        },
      };

      const result = await handleSetupCommand("--help", fakeCtx, {
        packageJsonPath: fakePackageJson,
        cwd: tempDir,
      });

      expect(result).toContain("Pi Project Setup (/setup-pi)");
      expect(notifications.length).toBe(1);
    });

    it("handles --status flag showing unconfigured state and configured state", async () => {
      const notifications: string[] = [];
      const fakeCtx: any = {
        hasUI: true,
        cwd: tempDir,
        ui: {
          notify: (msg: string) => notifications.push(msg),
        },
      };

      const res1 = await handleSetupCommand("--status", fakeCtx, {
        packageJsonPath: fakePackageJson,
        cwd: tempDir,
      });
      expect(res1).toContain("Not created");

      // Now create settings directory and file and recheck
      const piDir = join(tempDir, ".pi");
      await mkdir(piDir, { recursive: true });
      const settingsPath = join(piDir, "settings.json");
      await writeFile(
        settingsPath,
        JSON.stringify({
          packages: [
            {
              source: "/test/pi-extensions",
              extensions: ["./packages/clipboard/index.ts"],
            },
          ],
        }),
      );

      const res2 = await handleSetupCommand("status", fakeCtx, {
        packageJsonPath: fakePackageJson,
        cwd: tempDir,
      });
      expect(res2).toContain("Configured");
      expect(res2).toContain("1 extension(s) enabled");
    });

    it("handles --list flag displaying categorized extension status", async () => {
      const fakeCtx: any = {
        hasUI: true,
        cwd: tempDir,
        ui: {
          notify: () => {},
        },
      };

      const output = await handleSetupCommand("--list", fakeCtx, {
        packageJsonPath: fakePackageJson,
        cwd: tempDir,
      });

      expect(output).toContain("Available Extensions Catalog");
      expect(output).toContain("amphetamine");
      expect(output).toContain("clipboard");
      expect(output).toContain("mm-memory");
    });

    it("handles --preset minimal and writes configured .pi/settings.json", async () => {
      const notifications: string[] = [];
      const fakeCtx: any = {
        hasUI: true,
        cwd: tempDir,
        ui: {
          notify: (msg: string) => notifications.push(msg),
        },
      };

      const output = await handleSetupCommand("--preset minimal", fakeCtx, {
        packageJsonPath: fakePackageJson,
        cwd: tempDir,
      });

      expect(output).toContain("Applied \"Ultra Minimal\"");
      expect(notifications.some((n) => n.includes("Ultra Minimal"))).toBe(true);

      const state = await readProjectSettings(tempDir);
      expect(state.exists).toBe(true);
      expect(state.activeExtensions.length).toBeGreaterThanOrEqual(2);
      expect(
        state.activeExtensions.some((e) => e.includes("clipboard") || e.includes("agent-core")),
      ).toBe(true);
    });

    it("handles positional preset name like 'web' or 'backend'", async () => {
      const fakeCtx: any = {
        hasUI: true,
        cwd: tempDir,
        ui: { notify: () => {} },
      };

      const output = await handleSetupCommand("backend", fakeCtx, {
        packageJsonPath: fakePackageJson,
        cwd: tempDir,
      });

      expect(output).toContain("Applied \"Backend & Systems\"");
      const state = await readProjectSettings(tempDir);
      expect(state.activeExtensions.length).toBeGreaterThan(0);
    });

    it("handles unknown preset gracefully with error message", async () => {
      const notifications: string[] = [];
      const fakeCtx: any = {
        hasUI: true,
        cwd: tempDir,
        ui: { notify: (msg: string) => notifications.push(msg) },
      };

      const output = await handleSetupCommand("--preset nonexistent-preset", fakeCtx, {
        packageJsonPath: fakePackageJson,
        cwd: tempDir,
      });

      expect(output).toContain("Unknown preset");
      expect(notifications.some((n) => n.includes("Unknown preset"))).toBe(true);
    });

    it("handles --enable flag to activate a specific extension", async () => {
      const notifications: string[] = [];
      const fakeCtx: any = {
        hasUI: true,
        cwd: tempDir,
        ui: { notify: (msg: string) => notifications.push(msg) },
      };

      const output = await handleSetupCommand("--enable python", fakeCtx, {
        packageJsonPath: fakePackageJson,
        cwd: tempDir,
      });

      expect(output).toContain("Enabled extension");
      expect(output).toContain("execute-python");

      const state = await readProjectSettings(tempDir);
      expect(state.activeExtensions).toContain("./packages/execute-python/extensions");
    });

    it("handles --disable flag to deactivate an active extension", async () => {
      // First enable python and clipboard
      const fakeCtx: any = {
        hasUI: true,
        cwd: tempDir,
        ui: { notify: () => {} },
      };

      await handleSetupCommand("--enable python", fakeCtx, {
        packageJsonPath: fakePackageJson,
        cwd: tempDir,
      });
      await handleSetupCommand("--enable clipboard", fakeCtx, {
        packageJsonPath: fakePackageJson,
        cwd: tempDir,
      });

      let state = await readProjectSettings(tempDir);
      expect(state.activeExtensions.length).toBe(2);

      // Now disable python
      const output = await handleSetupCommand("--disable python", fakeCtx, {
        packageJsonPath: fakePackageJson,
        cwd: tempDir,
      });

      expect(output).toContain("Disabled extension");
      state = await readProjectSettings(tempDir);
      expect(state.activeExtensions.length).toBe(1);
      expect(state.activeExtensions[0]).toContain("clipboard");
    });

    it("handles --toggle flag to invert extension state", async () => {
      const fakeCtx: any = {
        hasUI: true,
        cwd: tempDir,
        ui: { notify: () => {} },
      };

      // Toggle ON
      const res1 = await handleSetupCommand("--toggle files-widget", fakeCtx, {
        packageJsonPath: fakePackageJson,
        cwd: tempDir,
      });
      expect(res1).toContain("Enabled");

      let state = await readProjectSettings(tempDir);
      expect(state.activeExtensions.some((e) => e.includes("files-widget"))).toBe(true);

      // Toggle OFF
      const res2 = await handleSetupCommand("--toggle files-widget", fakeCtx, {
        packageJsonPath: fakePackageJson,
        cwd: tempDir,
      });
      expect(res2).toContain("Disabled");

      state = await readProjectSettings(tempDir);
      expect(state.activeExtensions.some((e) => e.includes("files-widget"))).toBe(false);
    });

    it("launches interactive TUI dialog via ctx.ui.custom() when no args provided", async () => {
      let customCalled = false;
      const notifications: string[] = [];

      const fakeCtx: any = {
        hasUI: true,
        cwd: tempDir,
        ui: {
          notify: (msg: string) => notifications.push(msg),
          custom: async (factory: any) => {
            customCalled = true;
            let savedResult: string[] | null = null;
            const fakeTui: any = { requestRender: () => {} };
            const fakeTheme: any = { bold: (t: string) => t, dim: (t: string) => t };
            const done = (res: string[] | null) => {
              savedResult = res;
            };

            const comp = factory(fakeTui, fakeTheme, null, done);
            expect(comp).toBeDefined();

            // Simulate user pressing 's' to save
            comp.handleInput("s");
            // Await next event tick so async onSave completes
            await new Promise((r) => setTimeout(r, 20));
            return savedResult ?? comp.getSelectedExtensions();
          },
        },
      };

      const result = await handleSetupCommand("", fakeCtx, {
        packageJsonPath: fakePackageJson,
        cwd: tempDir,
      });

      expect(customCalled).toBe(true);
      expect(result).toContain("Saved .pi/settings.json");
      expect(notifications.some((n) => n.includes("Saved .pi/settings.json"))).toBe(true);

      const state = await readProjectSettings(tempDir);
      expect(state.exists).toBe(true);
    });

    it("handles non-UI fallback by returning project status", async () => {
      const fakeCtx: any = {
        hasUI: false,
        cwd: tempDir,
      };

      const result = await handleSetupCommand("", fakeCtx, {
        packageJsonPath: fakePackageJson,
        cwd: tempDir,
      });

      expect(result).toContain("Pi Project Status");
    });
  });
});
