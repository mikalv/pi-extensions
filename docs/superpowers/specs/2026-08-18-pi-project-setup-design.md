# Project Environment Setup & Extension Selector (`pi-project-setup`) Design

## 1. Overview & Problem Statement
When working across multiple projects (frontend, backend, Elixir, Python, sensitive health data, etc.), developers often need different extension profiles. Currently, all 52+ extensions in `pi-extensions` load by default or require manually crafting `.pi/settings.json` with exact relative paths.

`pi-project-setup` provides an interactive TUI wizard (`/setup-pi` / `/project-setup`) that lets users:
1. Initialize `.pi/` directory and `.pi/settings.json` in the current working directory.
2. Selectively check/uncheck extensions and packages with checkboxes, categories, and presets.
3. Temporarily or permanently configure model restrictions, permissions, and theme settings per project.

## 2. Core Architecture

### Components
1. **Extension Scanner & Manifest Catalog (`src/catalog.ts`)**:
   - Discovers all available extensions in the local `pi-extensions` repo and global packages.
   - Categorizes extensions:
     - 🧠 **Memory & Context** (`mm-memory`, `mm-observational-memory`, `mm-wiki`, `context-control`, `pi-context`)
     - 🤖 **Subagents & Workflows** (`pi-agent-core`, `pi-agent-memory`, `pi-task-notifications`)
     - ⚡ **Execution & Tools** (`execute-python`, `clipboard`, `auto-retry`, `scheduler`)
     - 🎨 **UI & Navigation** (`pi-atelier`, `powerline-footer`, `tab-status`, `files-widget`, `amphetamine`)
     - 🛠️ **Diagnostics & DevTools** (`cursor-runtime`, `token-rate`, `session-recap`, `pi-model-restriction`)
   - Reads existing `.pi/settings.json` to reflect current active state.

2. **Interactive TUI Multi-Select Overlay (`src/ui/setup-dialog.ts`)**:
   - Built using Pi's `ctx.ui.custom()` with `@earendil-works/pi-tui`.
   - Keyboard Controls:
     - `Up` / `Down` / `j` / `k`: Navigate through extensions.
     - `Space`: Toggle extension on/off (`[x]` / `[ ]`).
     - `Tab`: Switch between Category View, Presets, and Details pane.
     - `1-5`: Quick-load preset:
       - `1: Minimal` (Core agent + clipboard + notify)
       - `2: Full Stack / Web` (Agent core + memory + chrome/devtools + UI)
       - `3: Backend / Heavy` (Agent core + memory + python + elixir + scheduler)
       - `4: Offline / Private` (Local models + memory + restricted networking)
       - `5: All Extensions` (Enable everything)
     - `s` or `Enter`: Save `.pi/settings.json` and optionally trigger `/reload`.
     - `Esc` or `q`: Cancel.

3. **Settings Writer & Migrator (`src/writer.ts`)**:
   - Atomically writes `.pi/settings.json` in `process.cwd()`.
   - Formats configuration using Pi's package extension-filtering schema:
     ```json
     {
       "packages": [
         {
           "source": "<path-to-pi-extensions>",
           "extensions": [
             "./packages/amphetamine/src/index.ts",
             "./packages/pi-agent-core/src/index.ts",
             "./packages/mm-memory/src/index.ts"
           ]
         }
       ]
     }
     ```
   - Preserves existing custom fields in `.pi/settings.json` (such as project-specific models, temperature, or context files).

4. **Slash Command Dispatcher (`src/index.ts`)**:
   - Registers `/setup-pi` and `/project-setup`.
   - Supports CLI flags for non-interactive scripting:
     - `/setup-pi --preset minimal`
     - `/setup-pi --preset web`
     - `/setup-pi --enable chrome-devtools`
     - `/setup-pi --disable execute-python`

---

## 3. Implementation Plan & Bite-Sized Tasks

### Task 1: Package Scaffolding & Types
- Create `packages/pi-project-setup/package.json`, `tsconfig.json`, and `src/types.ts`.
- Define `ExtensionMetadata`, `ExtensionCategory`, `ProjectSetupConfig`, `PresetDefinition`.
- Test: `test/types.test.ts`.

### Task 2: Catalog & Extension Discovery
- Implement `src/catalog.ts` scanning `package.json` for all available extensions and auto-categorizing them.
- Implement preset definitions (`minimal`, `full-stack`, `backend`, `offline`, `all`).
- Test: `test/catalog.test.ts`.

### Task 3: Settings Reader & Writer
- Implement `src/writer.ts` reading existing `.pi/settings.json`, applying delta changes, and writing atomically with formatting.
- Test: `test/writer.test.ts`.

### Task 4: Interactive TUI Component
- Implement `src/ui/setup-dialog.ts` rendering categories, checkbox list, presets sidebar, and help footer.
- Handle keyboard navigation, multi-selection, and preset switching.
- Test: `test/ui.test.ts`.

### Task 5: Extension Entrypoint & Slash Commands
- Implement `src/index.ts` registering `/setup-pi` and `/project-setup`.
- Integrate non-interactive CLI flags (`--preset`, `--enable`, `--disable`).
- Register in root `package.json`.
- Test: `test/extension.test.ts` and E2E verification.
