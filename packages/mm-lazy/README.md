# @rahularya01/pi-lazy

[![npm version](https://img.shields.io/npm/v/@rahularya01/pi-lazy?logo=npm)](https://www.npmjs.com/package/@rahularya01/pi-lazy)
[![license](https://img.shields.io/npm/l/@rahularya01/pi-lazy)](LICENSE)

**LazyVim-style extension manager** for [Pi Coding Agent](https://github.com/badlogic/pi-mono).

Keep packages installed under `~/.pi/agent/npm/`, but **don’t run their extension factories** until after start — or until you actually need them (slash command, tool stub, keyword, shortcut, event, or `/lazy load`).

Faster Pi startup, less noise in the tool list, and the same packages available the moment you need them.

## Requirements

- [Pi Coding Agent](https://pi.dev) **0.80+** (peer: `@earendil-works/pi-coding-agent`)
- Node.js **20+**
- Packages you want to defer must already be installed via `pi install` / `settings.packages`

## Install

```bash
# from npm
pi install npm:@rahularya01/pi-lazy

# from a local checkout
pi install /absolute/path/to/pi-lazy

# from git
pi install git:github.com/Rahularya01/pi-lazy
```

Or add to `~/.pi/agent/settings.json`:

```json
{
  "packages": ["npm:@rahularya01/pi-lazy"]
}
```

Restart Pi (or `/reload`) after install. **pi-lazy itself is always-on** — it must load at startup so it can manage everything else.

Update later with:

```bash
pi update npm:@rahularya01/pi-lazy
```

## First-time setup (required for true lazy loading)

Installing pi-lazy alone is not enough. Pi still eager-loads every package listed as a plain string in `settings.packages`. You need **migrate once**, then restart.

### 1. Install pi-lazy and restart

```bash
pi install npm:@rahularya01/pi-lazy
```

Restart Pi or run `/reload`.

### 2. Seed / review config

On first run, pi-lazy writes a default catalog to:

```text
~/.pi/agent/lazy.json
```

Edit that file to match **your** installed packages (see [Configuration](#configuration)). Or rewrite the defaults anytime:

```text
/lazy init
```

Only list packages you actually have installed. Specs for missing packages show up as errors when you try to load them.

### 3. Migrate settings

```text
/lazy migrate
```

This:

1. Backs up `~/.pi/agent/settings.json` to `settings.json.bak.lazy-<timestamp>`
2. Rewrites managed (`lazy !== false`) packages from:

   ```json
   "npm:pi-web-access"
   ```

   to:

   ```json
   { "source": "npm:pi-web-access", "extensions": [] }
   ```

The package stays installed (skills/prompts can still load). Pi will **not** execute the extension factory at startup. pi-lazy loads those factories later.

Eager specs (`"lazy": false`) that were previously filtered empty are restored to plain string form when safe.

### 4. Restart Pi again

Module-lazy filters apply on the next process start. After restart:

```text
/lazy
```

You should see managed on-demand packages as `pending`, not `eager`. Statusline shows something like `lazy 0↑ 4· 3⚡`.

If you skip migrate, packages stay eager: Pi loads them normally and `/lazy load` will tell you to migrate + restart.

## Quick start

```text
/lazy                  # status + table
/lazy list             # compact states
/lazy load web         # force-load a pending package
/web                   # stub command: loads "web", then re-runs /web
```

Typical flow after migrate:

1. Providers (`cursor`, `antigravity`, …) stay `"lazy": false` → available immediately.
2. Common helpers (`subagents`, `todo`, …) use `"lazy": "after-start"` → load right after the UI is up (VeryLazy).
3. Heavy packs (`web`, `mcp`, `lens`, …) use `"lazy": true` → load on first `/cmd`, tool stub, keyword match, or `/lazy load`.

## Mental model (LazyVim → Pi)

| LazyVim | pi-lazy |
| -------- | --------- |
| `lazy = false` | `"lazy": false` |
| `event = "VeryLazy"` | `"lazy": "after-start"` |
| `cmd = "Telescope"` | `"cmd": ["plannotator"]` |
| keys | `"keys": ["ctrl+…"]` |
| first tool use | `"tools": ["web_search"]` |
| prompt / autocmd triggers | `"keywords"` / `"event"` |
| `:Lazy load foo` | `/lazy load foo` |
| `:Lazy` | `/lazy` / `/lazy list` |

## Load strategies

| `lazy` value | When it loads | Good for |
| ------------ | ------------- | -------- |
| `false` | With Pi at startup (not managed by pi-lazy) | Providers, auth, anything you need before the first prompt |
| `"after-start"` | Shortly after `session_start` (priority order, lower first) | Common tools you almost always use, but not boot-critical |
| `true` | On demand only | Heavy / situational packs (web, MCP, lens, plan mode) |

### On-demand triggers (`lazy: true`)

Any of these can load a pending package:

| Trigger | How |
| ------- | --- |
| Manual | `/lazy load <name>` or LLM tool `lazy_load` |
| Slash command stub | Spec `"cmd": ["web"]` → `/web` loads then re-dispatches `/web …` |
| Tool stub | Spec `"tools": ["web_search"]` → first call loads the package; call the real tool on the next turn |
| Keywords | Spec `"keywords": ["web search"]` → matched (case-insensitive) in the user prompt on `before_agent_start` |
| Events | Spec `"event": ["before_agent_start"]` → load whenever that Pi event fires (when auto is on) |
| Shortcuts | Spec `"keys": ["…"]` → registered shortcut loads the package |

Keyword and event auto-load can be toggled:

```text
/lazy auto off
/lazy auto on
```

Default is **on** (`"auto": true` in `lazy.json`).

### Dependencies

```json
{
  "name": "my-pack",
  "source": "npm:my-pack",
  "lazy": true,
  "dependencies": ["context-mode"]
}
```

`/lazy load my-pack` loads `context-mode` first. If a dependency fails, the parent load fails with a clear error.

## Configuration

Path: **`~/.pi/agent/lazy.json`**

- Auto-created on first run from built-in defaults
- Reset with `/lazy init` (overwrites the file)
- Show path with `/lazy config`

Full example (also in [`examples/lazy.json`](./examples/lazy.json)):

```json
{
  "version": 1,
  "defaults": { "lazy": true },
  "auto": true,
  "autoLoadLimit": 1,
  "afterStartBatchSize": 1,
  "afterStartDelayMs": 0,
  "specs": [
    {
      "name": "cursor",
      "source": "npm:@rahularya01/pi-cursor",
      "lazy": false,
      "description": "Cursor provider — must be eager"
    },
    {
      "name": "subagents",
      "source": "npm:pi-subagents",
      "lazy": "after-start",
      "priority": 10,
      "description": "Load after UI is ready"
    },
    {
      "name": "web",
      "source": "npm:pi-web-access",
      "lazy": true,
      "cmd": ["web"],
      "tools": ["web_search", "fetch_content", "get_search_content"],
      "keywords": ["web search", "search the web", "fetch url", "youtube"],
      "description": "On-demand web / fetch / video"
    },
    {
      "name": "lens",
      "source": "npm:pi-lens",
      "lazy": true,
      "cmd": ["lens"],
      "tools": ["lens_diagnostics", "symbol_search", "module_report", "lsp_diagnostics"],
      "keywords": ["diagnostics", "symbol search", "ast-grep", "lsp"]
    }
  ]
}
```

### Top-level fields

| Field | Type | Meaning |
| ----- | ---- | ------- |
| `version` | `1` | Config schema version |
| `defaults.lazy` | `false` \| `true` \| `"after-start"` | Default when a spec omits `lazy` (default: `true`) |
| `auto` | boolean | Enable keyword/event auto-load (default: `true`) |
| `autoLoadLimit` | integer | Maximum packages loaded before one agent turn (default: `1`) |
| `afterStartBatchSize` | integer | Packages loaded in one after-start event-loop slice (default: `1`) |
| `afterStartDelayMs` | integer | Delay between after-start slices in milliseconds (default: `0`) |
| `specs` | array | Package load catalog |

### Spec fields

| Field | Required | Meaning |
| ----- | -------- | ------- |
| `name` | yes | Stable id for `/lazy load` and status tables |
| `source` | yes | Same form as `settings.packages`: `npm:…`, local path, `git:…`, etc. |
| `lazy` | no | Load mode (see [Load strategies](#load-strategies)); falls back to `defaults.lazy` |
| `priority` | no | `after-start` order — **lower runs first** (default `100`) |
| `cmd` | no | Slash-command names to stub (load-then-re-run) |
| `tools` | no | Tool names to register as load-on-call stubs |
| `keys` | no | Keyboard shortcuts that load this package |
| `event` | no | Pi event names that trigger load (e.g. `"before_agent_start"`) |
| `keywords` | no | Case-insensitive prompt substrings checked on `before_agent_start` |
| `dependencies` | no | Other **spec names** to load first |
| `description` | no | Human-readable note (shown in your own docs; not required at runtime) |

### Choosing what stays eager

Keep **`lazy: false`** for:

- Model providers / auth bridges (`pi-cursor`, `pi-antigravity`, `pi-grok-cli`, …)
- Anything you need before the first agent turn
- Packages whose absence would break your default workflow

Prefer **`after-start`** for packs you use most sessions but that are not boot-critical.

Prefer **`true` (on-demand)** for large MCP bridges, web fetch, lens/LSP, plan mode, and other situational tools.

### Matching `source` to installed packages

`source` must match how the package appears in Pi:

| Install | Spec `source` |
| ------- | ------------- |
| `pi install npm:pi-web-access` | `"npm:pi-web-access"` |
| `pi install npm:@rahularya01/pi-cursor` | `"npm:@rahularya01/pi-cursor"` |
| Local path | Absolute or cwd-relative path to the package root |

pi-lazy resolves npm packages from:

1. `~/.pi/agent/npm/node_modules/<name>`
2. `<cwd>/.pi/npm/node_modules/<name>`

If the package isn’t installed there, load fails with “package not installed”.

### Stub names must be declared

Command and tool stubs **only** exist for names listed in the spec. If `pi-web-access` registers `web_search` but your spec omits it from `"tools"`, the model won’t see a lazy stub for that tool until the package is loaded another way (keyword, `/lazy load`, etc.).

Declare the commands and tools you care about triggering:

```json
{
  "name": "web",
  "source": "npm:pi-web-access",
  "lazy": true,
  "cmd": ["web"],
  "tools": ["web_search", "fetch_content", "get_search_content"]
}
```

## Commands

| Command | Action |
| ------- | ------ |
| `/lazy` or `/lazy status` | Status summary + full table (state, mode, source, timings) |
| `/lazy list` | Compact one-line-per-spec table |
| `/lazy load <name>` | Force-load a pending package (name, or unique source suffix) |
| `/lazy migrate` | Apply `extensions: []` filters + backup `settings.json` |
| `/lazy auto` | Show whether keyword/event auto-load is on |
| `/lazy auto on\|off` | Toggle auto-load and persist to `lazy.json` |
| `/lazy init` | Overwrite `lazy.json` with the built-in default catalog |
| `/lazy config` | Print the absolute path to `lazy.json` |
| `/lazy profile` | Show in-session catalog, resolution, and load timings |

Tab completion is available for subcommands and `load <name>`.

### Statusline

pi-lazy sets a UI status string like:

```text
lazy 2↑ 3· 4⚡
```

| Glyph | Meaning |
| ----- | ------- |
| `↑` | Loaded this session (via lazy) |
| `·` | Pending (module-lazy ready, not yet loaded) |
| `⚡` | Eager (Pi loaded, or not migrated yet) |
| `✗` | Error on last load attempt |

### List columns

```text
pending  web              on-demand    npm:pi-web-access
loaded   subagents        after-start  npm:pi-subagents 42ms
eager    cursor           eager        npm:@rahularya01/pi-cursor
eager    lens             on-demand    npm:pi-lens (migrate+restart needed)
error    mcp              on-demand    npm:pi-mcp-adapter — package not installed …
```

| State | Meaning |
| ----- | ------- |
| `eager` | Not managed, or still fully eager in settings (migrate + restart if you expected pending) |
| `pending` | Filtered with `extensions: []`; waiting for a trigger |
| `loading` | Load in progress |
| `loaded` | Factory ran successfully this session |
| `error` | Last load failed (message in the row) |

## LLM tool: `lazy_load`

The model can load a deferred package by spec name:

```text
lazy_load({ name: "web" })
```

Use when a capability is still pending (`web`, `mcp`, `lens`, `plannotator`, `context-mode`, …). Prefer names from `/lazy list`.

After a successful load, newly registered tools are merged into the active tool set when the runtime supports `getActiveTools` / `setActiveTools`. Stub tools still tell the model to **call the real tool again on the next turn** after the first activation.

## How load works

1. Resolve the package under Pi’s npm (or local) install tree
2. Read `package.json` → `pi.extensions` (same rules as Pi’s own loader)
3. Import the factory (`import()` for JS; **jiti** for TypeScript — from the Pi install)
4. Call `factory(hostPi)` so tools, commands, and handlers attach to the **live** runtime
5. Replay `session_start` (and best-effort `resources_discover`) handlers registered during that late load
6. Additively `setActiveTools` for any tools registered during the load

Dependencies are loaded depth-first before the requested package.

## Recipes

### Faster startup with a heavy stack

1. Put providers on `"lazy": false`
2. Put always-useful orchestration on `"lazy": "after-start"` with priorities `10`, `20`, …
3. Put web / MCP / lens / plan on `"lazy": true` with `cmd` + `tools` + a few `keywords`
4. `/lazy migrate` → restart → confirm with `/lazy list`

### Force-load before a big task

```text
/lazy load lens
/lazy load context-mode
```

Or ask the agent to call `lazy_load` for those names.

### Temporarily disable keyword auto-load

```text
/lazy auto off
```

Manual `/lazy load` and stub `/cmd` / tools still work. Turn back on with `/lazy auto on`.

### Add a new package later

1. `pi install npm:some-package`
2. Add a spec to `~/.pi/agent/lazy.json`
3. `/lazy migrate` (picks up the new managed source)
4. Restart Pi
5. `/lazy load some-name` or use its stubs

### Undo migrate for one package

Edit `settings.json`: change that entry back to a plain string source (or remove `"extensions": []`), keep `"lazy": false` in `lazy.json`, then restart. Or restore from the `settings.json.bak.lazy-*` backup.

## Troubleshooting

| Symptom | What to do |
| ------- | ---------- |
| Everything still `eager` after install | Run `/lazy migrate`, then **fully restart** Pi (not only `/reload` if filters were just written) |
| `/lazy load X` → “not module-lazy ready” | Migrate + restart; the package is still a plain string in `settings.packages` |
| `/lazy load X` → “package not installed” | `pi install` that source; confirm it exists under `~/.pi/agent/npm/node_modules/…` |
| `/lazy load X` → “unknown spec” | Add it to `lazy.json` (`name` + `source`); `/lazy list` shows known names |
| Stub `/web` does nothing useful | Ensure `"cmd": ["web"]` on the spec, package is `pending`, and migrate was applied |
| Model never sees stub tools | List them under `"tools"`; after first stub call, have it invoke the real tool next turn |
| Keywords never fire | `/lazy auto on`; keywords are case-insensitive **substrings** of the user prompt |
| TS extension fails to import | Pi (or its deps) must provide **jiti**; JS/`dist` packages load via native `import` |
| Broken settings after migrate | Restore `~/.pi/agent/settings.json.bak.lazy-<timestamp>` |
| Want a clean slate mid-session | No unload in v1 — use `/reload` or restart Pi |

Startup tip: if managed packages aren’t module-lazy yet, pi-lazy notifies once:

```text
pi-lazy: run /lazy migrate then restart for true module-lazy
```

## Limits (v1)

- **No mid-session unload** — loaded factories stay until `/reload` / process restart
- **Boot-critical packages** should stay `"lazy": false`
- **Stub `cmd` / `tools` names must be declared** in the spec
- **Skills / prompts** stay eager by default — only **extensions** are deferred via `extensions: []`
- **Git-sourced packages** are not fully resolved in v1 unless you point `source` at a local path
- Without migrate, managed specs remain eager and on-demand load asks you to migrate

## Development

```bash
git clone https://github.com/Rahularya01/pi-lazy
cd pi-lazy
npm install
npm run typecheck
npm run build

# run an isolated startup benchmark; never modifies ~/.pi/agent
BENCH_RUNS=3 node scripts/bench-startup.mjs

# load from local path
pi install "$PWD"
```

Layout:

| Path | Role |
| ---- | ---- |
| `src/index.ts` | Extension entry — commands, stubs, events, `lazy_load`, profiling |
| `src/config.ts` | `lazy.json` load/save + default catalog |
| `src/migrate.ts` | `settings.packages` → `extensions: []` |
| `src/resolve.ts` | Package root + extension entry resolution |
| `src/loader.ts` | Dynamic import / cached jiti setup + factory invoke |
| `dist/index.js` | Compiled production extension entry |
| `src/types.ts` | Spec / config types |
| `examples/lazy.json` | Example catalog |

## Publish

CI runs typecheck on every push/PR to `main`.

Releases publish to npm automatically when a version tag is pushed:

```bash
# 1. Bump version in package.json + CHANGELOG.md, commit to main
# 2. Tag must match package.json (e.g. 0.1.1 → v0.1.1)
git tag v0.1.1
git push origin main --tags
```

GitHub Actions (`.github/workflows/publish.yml`) will:

1. Install deps and run `npm run check`
2. Assert the tag matches `package.json` version
3. `npm publish --access public --provenance`

**Required secret:** repo `NPM_TOKEN` (npm automation/granular access token with publish rights for `@rahularya01`).

Manual publish (fallback):

```bash
npm login
npm publish --access public
```

Then reinstall in Pi:

```bash
pi install npm:@rahularya01/pi-lazy
```

## License

[MIT](LICENSE)
