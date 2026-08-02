# Changelog

## 0.2.5

- Fix stub command re-dispatch: after lazy-loading the real package, invoke its
  captured `registerCommand` handler directly instead of re-injecting `/cmd`
  via `sendUserMessage({ deliverAs: "followUp" })`. The follow-up path bypasses
  slash-command dispatch entirely and lands the literal `/cmd` text in the
  conversation as a plain chat message, so the real command (e.g. `/mcp`)
  never actually ran on first invocation.
- `loader.ts` now captures each `registerCommand` call's handler during the
  tracked load and exposes it via `ResolvedEntry.loadedCommandHandlers` /
  `LoadResult.commandHandlers`, keyed by command name.

## 0.2.4

- Resilient stale-ctx handling: guard all async-gap `ctx.ui` accesses so a replaced/reloaded session never crashes the pi process.
- Track `rt.sessionCtx` synchronously on `session_start` and prefer it over captured ctx across `loadByName` iterations, `setTimeout` gaps, and after-start batches.
- Extract `notifySafe()` and `refreshStatus()` stale-ctx guards for reuse.

## 0.2.3

- Resolve lazy-loaded extension peer dependencies from the active Pi runtime,
  including hoisted Bun/npm installations.

## 0.2.2

- Retry npm publishing without provenance only when npm reports an existing transparency-log entry.

## 0.2.1

- Include required Pi runtime dependencies in the published package so the compiled extension entry resolves after installation.

## 0.2.0

- Defer package resolution until first load and cache jiti/Pi loader setup.
- Publish a compiled `dist/index.js` extension entry.
- Add cooperative after-start batching, bounded automatic loads, and `/lazy profile` timings.
- Add an isolated startup benchmark that never mutates the live Pi agent configuration.

## 0.1.1

- Fix jiti resolution: prefer `createJiti` over the CJS default function wrapper
- Sync `j(path)` broke top-level await in lazy-loaded TS extensions (`rpiv-todo`, `rpiv-ask-user-question`)
- Pass `moduleCache: false` like pi-core when importing extension modules

## 0.1.0

- Initial release: LazyVim-style extension manager for Pi Coding Agent
- Load strategies: eager, `after-start` (VeryLazy), on-demand
- Triggers: `/lazy load`, stub commands/tools, keywords, events, shortcuts
- `/lazy migrate` rewrites `settings.packages` to `extensions: []` for true module-lazy
- Config: `~/.pi/agent/lazy.json`
