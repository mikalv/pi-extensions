# Project-Level Configuration & Extension Filtering

This guide explains how to control, filter, restrict, and isolate extensions, long-term memory (LTM), and models on a per-project basis in Pi.

---

## 1. Extension & Package Filtering per Project

When `pi-extensions` (or any other package) is installed globally in `~/.pi/agent/settings.json`, every session inherits all registered extensions by default. You can override and filter what loads for a specific project by creating a `.pi/settings.json` file in that project's root directory.

### Interactive TUI Configuration (`pi config -l`)

The simplest way to toggle extensions and skills per project:
1. Open your terminal in the target project root.
2. Run:
   ```bash
   pi config -l
   ```
   *(Or run `pi config` and press `Tab` to switch to project-local mode).*
3. Use the arrow keys and `Space` to enable or disable specific extensions and skills. Pi automatically generates or updates `.pi/settings.json`.

---

### Manual Filtering in `.pi/settings.json`

You can declare fine-grained include/exclude rules directly in `.pi/settings.json`:

#### A. Allowlist Mode (Load Only Specific Modules)
Load only selected extensions (e.g. `mm-wiki` and `copymsgs`):
```json
{
  "packages": [
    {
      "source": "/Users/mikalv/Repos/MeehProjects/pi-extensions",
      "extensions": [
        "packages/mm-wiki/index.ts",
        "packages/copymsgs.ts"
      ]
    }
  ]
}
```

#### B. Blocklist Mode (Load Everything Except Specific Modules)
Load all extensions from the repo except heavy or conflicting extensions:
```json
{
  "packages": [
    {
      "source": "/Users/mikalv/Repos/MeehProjects/pi-extensions",
      "extensions": [
        "!packages/pi-superagents/**",
        "!packages/context-control/**"
      ]
    }
  ]
}
```

#### C. Clean / Vanilla Mode (Disable All Extensions)
Disable all extensions from the repo for a minimal, zero-extension environment:
```json
{
  "packages": [
    {
      "source": "/Users/mikalv/Repos/MeehProjects/pi-extensions",
      "extensions": []
    }
  ]
}
```

---

## 2. Project-Local Long-Term Memory (LTM) & Data Governance

For sensitive projects (e.g., healthcare data, confidential business logic, proprietary intellectual property), `mm-memory` and `mm-wiki` support strict local-only isolation.

### A. Dedicated Prism Collections & Local-Only Model Enforcement
In the project root, create `.pi/mm-memory.json` (or `.mm-memory.json`):

```json
{
  "memoriesCollection": "health-project-memories",
  "sessionsCollection": "health-project-sessions",
  "localOnly": true
}
```

**Security Guarantees:**
- **Zero-Leak Prompt Injection:** Auto-injection (`before_agent_start`) will silently suppress memory injection if the active session model is not provided by an authorized local provider (e.g. `vllm-local`, `gemma4-local`, `ollama`).
- **Zero-Leak Tool Operations:** `memory_recall`, `memory_remember`, `memory_mine`, and `memory_forget` reject requests with a hard error if invoked from a cloud/external provider session.
- **Collection Isolation:** The project uses distinct Prism collections, preventing global queries from leaking sensitive project memory.

### B. Project-Local Wiki Isolation (`MM_WIKI_DIR`)
By default, `mm-wiki` stores markdown pages in `~/.pi/agent/wiki/`. To isolate wiki storage to the current project:

```bash
export MM_WIKI_DIR="./.pi/wiki"
```
Or define it in your project's local execution environment. All `wiki_*` operations will read and write to the local `.pi/wiki/` directory.

---

## 3. Strict Model Restriction (`pi-model-restriction`)

To prevent any cloud models from ever receiving prompts, code, or context in a restricted project, place `.restricted.json` in the project root:

```json
{
  "enforce": true,
  "allowedProviders": ["vllm-local", "gemma4-local"],
  "allowedModels": ["vllm-local/qwen3.6-27b-awq"],
  "defaultModel": "vllm-local/qwen3.6-27b-awq",
  "reason": "This project contains sensitive data and requires local offline execution."
}
```

**Behavior:**
- Automatically switches the session to the local model if a cloud model was active.
- Blocks turn execution and clears provider payloads if an unauthorized model is selected.
