# Wiki design notes

Ported from Pi-Mythic-Memory into `@meeh/mm-wiki` as the compiled topical layer
between observational memory (STM) and Prism (`mm-memory` LTM). Keeps the useful
Fable-style filesystem behavior, drops overzealous auto-filing. No Fable product
code, prompt, or schema is redistributed; tool names are `wiki_*`.

## Behavior kept from Fable 5's design

- Global cross-session filesystem
- `/profile.md`, `/preferences.md`, `/topics/`, `/areas/`, `/people/`
- Frontmatter `name`, `description`, `sources`, and area/person `aliases`
- Unique names, `[[links]]`, and `[stated]` provenance
- Metadata listing plus directly injected profile/preferences
- Proactive same-turn filing policy
- Read-before-write discipline
- 12-character versions and `if_version: new`
- Exact unique-match edits
- Append and whole-file deletion semantics
- Conflicts return current content/version for immediate retry
- Privacy omissions, behavioral preference guardrails, silent application, and relevance gating
- External-change notices between turns

## Wiki decisions and improvements

- Tools use Wiki's own names: `wiki_index`, `wiki_recall`,
  `wiki_inscribe`, `wiki_revise`, `wiki_extend`, and `wiki_forget`.
- `wiki_revise` performs an exact, unique-match edit; an empty replacement deletes the match.
- Privacy-conscious focus: guardrails omit sensitive personal categories and coding-irrelevant trivia, so memory stays useful for a coding agent instead of accumulating a personal dossier.
- `sources: [pi]` records the writing surface for Pi.
- Detailed policy lives in the progressively loaded `mythic-memory` skill instead of permanently bloating the system prompt.
- Storage is local under `~/.pi/agent/wiki/`; no cloud service is involved.
- Writes add filesystem locks, atomic publication, race detection, path/symlink protections, and high-confidence secret/injection scanning adapted from Pi Hermes Memory.
- The scanner is defense in depth, not a semantic privacy classifier. The skill remains authoritative for protected and sensitive categories.
- No automatic transcript ingestion, background model calls, inferred-memory extraction, SQLite, vector database, or procedural-skill generation is included.
- Sub-agents should receive selected context but not own durable mutations; the parent validates and writes memory.
