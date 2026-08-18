# Project Setup & Extension Selector (`pi-project-setup`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a clean, interactive TUI wizard (`/setup-pi` / `/project-setup`) to inspect, check/uncheck extensions, apply presets, and generate/update `.pi/settings.json` for the current project.

**Architecture:** A standalone TypeScript extension divided into: (1) Discovery & Catalog (`src/catalog.ts`), (2) Settings Reader/Writer (`src/writer.ts`), (3) Interactive TUI Multi-Select Component (`src/ui/setup-dialog.ts`), and (4) Slash Command & Extension Entrypoint (`src/index.ts`).

**Tech Stack:** TypeScript, `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, Node.js / Bun.

**Spec:** `docs/superpowers/specs/2026-08-18-pi-project-setup-design.md`

## Global Constraints

- Must work in any directory (creates `.pi/` if missing).
- Atomically read and write `.pi/settings.json` without destroying existing custom settings.
- Support both interactive TUI (`ctx.ui.custom`) and CLI flags (`/setup-pi --preset minimal`).
- Strict TDD: Unit tests for each component before implementation.

---

### Task 1: Package Scaffolding & Core Types

**Files:**
- Create: `packages/pi-project-setup/package.json`
- Create: `packages/pi-project-setup/tsconfig.json`
- Create: `packages/pi-project-setup/src/types.ts`
- Test: `packages/pi-project-setup/test/types.test.ts`

**Interfaces:**
- Produces: `ExtensionItem`, `ExtensionCategory`, `PresetProfile`, `ProjectSettingsState`.

- [ ] **Step 1: Write test for type validation and default presets in `test/types.test.ts`**
- [ ] **Step 2: Create package.json and tsconfig.json**
- [ ] **Step 3: Implement core types in `src/types.ts`**
- [ ] **Step 4: Run test (`bun test packages/pi-project-setup/test/types.test.ts`)**
- [ ] **Step 5: Commit `feat(project-setup): scaffold package and define types`**

---

### Task 2: Extension Catalog & Preset Engine

**Files:**
- Create: `packages/pi-project-setup/src/catalog.ts`
- Create: `packages/pi-project-setup/src/presets.ts`
- Test: `packages/pi-project-setup/test/catalog.test.ts`

**Interfaces:**
- Produces: `loadExtensionCatalog(rootPackageJsonPath?: string): Promise<ExtensionItem[]>`, `getPreset(name: string): PresetProfile | undefined`.

- [ ] **Step 1: Write tests for catalog scanning, auto-categorization, and presets**
- [ ] **Step 2: Implement preset definitions (`minimal`, `web`, `backend`, `offline`, `full`) in `src/presets.ts`**
- [ ] **Step 3: Implement catalog loader in `src/catalog.ts` categorizing all 50+ extensions**
- [ ] **Step 4: Run test to verify all pass**
- [ ] **Step 5: Commit `feat(project-setup): implement extension catalog discovery and preset profiles`**

---

### Task 3: Settings File Reader & Atomic Writer

**Files:**
- Create: `packages/pi-project-setup/src/writer.ts`
- Test: `packages/pi-project-setup/test/writer.test.ts`

**Interfaces:**
- Produces: `readProjectSettings(cwd: string): Promise<ProjectSettingsState>`, `writeProjectSettings(cwd: string, selectedExtensions: string[], options?: object): Promise<string>`.

- [ ] **Step 1: Write tests for reading existing settings, applying delta extension lists, and atomic writing**
- [ ] **Step 2: Implement `readProjectSettings` and `writeProjectSettings` in `src/writer.ts`**
- [ ] **Step 3: Run tests to verify safe preservation of existing properties**
- [ ] **Step 4: Commit `feat(project-setup): implement settings reader and atomic writer`**

---

### Task 4: Interactive TUI Multi-Select Component

**Files:**
- Create: `packages/pi-project-setup/src/ui/setup-dialog.ts`
- Create: `packages/pi-project-setup/src/ui/index.ts`
- Test: `packages/pi-project-setup/test/ui.test.ts`

**Interfaces:**
- Produces: `SetupDialogComponent` implementing `@earendil-works/pi-tui` `Component`.

- [ ] **Step 1: Write tests for dialog key handling (`Space`, `1-5` presets, `Enter` save, `q` cancel) and rendering**
- [ ] **Step 2: Implement `SetupDialogComponent` with category folding, search filter, and preset triggers**
- [ ] **Step 3: Run tests to verify navigation and event handlers**
- [ ] **Step 4: Commit `feat(project-setup): implement interactive TUI multi-select dialog component`**

---

### Task 5: Extension Entrypoint, Slash Commands & Registration

**Files:**
- Create: `packages/pi-project-setup/src/index.ts`
- Modify: `package.json`
- Create: `docs/pi-project-setup.md`
- Test: `packages/pi-project-setup/test/extension.test.ts`

- [ ] **Step 1: Write tests for `/setup-pi` and `/project-setup` slash command executions**
- [ ] **Step 2: Implement `src/index.ts` registering commands and CLI flag handler**
- [ ] **Step 3: Register `./packages/pi-project-setup/src/index.ts` in root `package.json`**
- [ ] **Step 4: Create documentation in `docs/pi-project-setup.md`**
- [ ] **Step 5: Run full test suite (`bun test packages/pi-project-setup/test/`)**
- [ ] **Step 6: Commit `feat(project-setup): register extension and finalize documentation`**
