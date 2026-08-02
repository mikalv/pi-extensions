# mm-wiki — compiled topical wiki for Pi

Local markdown wiki layer for the Pi coding agent. Ported from [Pi-Mythic-Memory](https://github.com/rcwells1879/Pi-Mythic-Memory) (Fable-style filesystem memory), rebranded and wired as the **wiki** layer in our memory stack:

```text
mm-observational-memory (STM)  →  mm-wiki (compiled topics)  →  Prism / mm-memory (LTM)
```

This package does **not** replace Prism. Wiki pages are curated, path-addressed documents (`/profile.md`, `/topics/`, `/areas/`, …). Semantic long-term search stays in `mm-memory` + Prism.

## Tools

| Tool | Purpose |
| --- | --- |
| `wiki_index` | List document metadata |
| `wiki_recall` | Read one document + concurrency version |
| `wiki_inscribe` | Create or fully replace |
| `wiki_revise` | Exact unique-match edit |
| `wiki_extend` | Append a new fact |
| `wiki_forget` | Delete an entire subject (explicit only) |

Command: `/wiki-status`

Skill: `mythic-memory` (full filing + privacy policy from Mythic, tools updated to `wiki_*`)

## Storage

Default: `~/.pi/agent/wiki`

Override with `MM_WIKI_DIR`.

If you previously used Mythic Memory, migrate with:

```bash
mv ~/.pi/agent/mythic-memory ~/.pi/agent/wiki
```

## Install

Loaded via the parent `pi-extensions` package. Temporary session:

```bash
pi -e ./packages/mm-wiki
```

## Attribution

- Original package: Pi-Mythic-Memory (MIT), rcwells
- Atomic locking / content scanner patterns: pi-hermes-memory (MIT) — see `THIRD_PARTY_NOTICES.md`
- Taxonomy inspired by Fable 5's Claude Code memory structure (behavior only; no Fable code redistributed)

## License

MIT
