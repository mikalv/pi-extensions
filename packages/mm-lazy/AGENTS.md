# pi-lazy

## Overview

`pi-lazy` is a TypeScript extension manager for Pi Coding Agent. It defers extension factories until after startup or until a configured trigger requests them.

## Development

```bash
npm install
npm test
npm run build
```

- Run `npm test` before committing.
- Run `npm pack --dry-run` before publishing.
- The production extension entry is `dist/index.js`; regenerate it with `npm run build` after source changes.

## Architecture

- `src/index.ts` — runtime orchestration, commands, trigger stubs, scheduling, profiling
- `src/config.ts` — `lazy.json` defaults, parsing, and persistence
- `src/migrate.ts` — converts managed package settings to `extensions: []`
- `src/resolve.ts` — package and extension-entry resolution
- `src/loader.ts` — late factory import and activation

## Constraints

- Keep lazy loading deterministic; do not parallelize extension-factory execution.
- Preserve `moduleCache: false` for reload safety.
- Keep `lazy.json` backward compatible: new fields must have safe defaults.
- Never let benchmarks modify `~/.pi/agent`; use an isolated `PI_CODING_AGENT_DIR`.
- Do not commit `.pi-subagents/` artifacts.

## Releases

1. Update `package.json` version and `CHANGELOG.md`.
2. Run `npm test` and verify the packed artifact imports from a clean temporary install.
3. Commit, tag `v<version>`, and push `main` plus the tag.
