# @meeh/mm-observational-memory

Short-term observational memory (STM) for Pi: observe → reflect → drop, with best-effort promote into wiki + Prism LTM.

```
STM   mm-observational-memory  ← this package
wiki  mm-wiki (curated topical markdown)
LTM   mm-memory / Prism (ltm-memories, ltm-sessions)
```

Ported from [elpapi42/pi-observational-memory](https://github.com/elpapi42/pi-observational-memory) (via `insp2/pi-observational-memory`) with meeh stack integration.

## What it does

1. **Observer** — records timestamped observations (decisions, constraints, progress, blockers).
2. **Reflector** — distills durable reflections (preferences, goals, invariants).
3. **Dropper** — trims redundant active observations when reflection coverage exists.
4. **Compaction** — feeds bounded observations/reflections into Pi on compact.
5. **Promote** — after each successful reflector batch, indexes reflections into Prism `ltm-memories` and appends bullets to `wiki/areas/<project>.md` (best-effort; never blocks OM).

## Commands / tools

| Surface | Description |
| --- | --- |
| `/om:status` | Runtime thresholds + pool state |
| `/om:view` | Inspect ledger memory |
| `recall` | Recover exact source evidence by memory ID |

## Configuration

Settings key: `mm-observational-memory` (also accepts legacy `observational-memory`).

Global: `~/.pi/agent/settings.json` · Project: `<project>/.pi/settings.json`

```json
{
  "mm-observational-memory": {
    "observeAfterTokens": 10000,
    "reflectAfterTokens": 20000,
    "reflectionContextMaxTokens": 10000,
    "passive": false,
    "debugLog": false
  }
}
```

See [docs/configuration.md](./docs/configuration.md) for the full settings table.

### Promote controls

| Env | Effect |
| --- | --- |
| unset / `on` | Promote to Prism + wiki (default) |
| `MM_OM_PROMOTE=off` | Disable promote |
| `MM_OM_PROMOTE=prism` | Prism only |
| `MM_OM_PROMOTE=wiki` | Wiki only |

Prism connection uses `PRISM_URL` / `PRISM_API_KEY` or `~/.pi/agent/pi-prism.json` (same as `pi-prism` / `mm-memory`). Wiki root: `MM_WIKI_DIR` or `~/.pi/agent/wiki`.

## Development

```bash
npm install
npm run typecheck
npm test
```

## Credits

Architecture based on [elpapi42/pi-observational-memory](https://github.com/elpapi42/pi-observational-memory). MIT — see [LICENSE](./LICENSE).
