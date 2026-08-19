---
name: theme-switcher
description: Use when switching, previewing, listing, or restoring Kenzo themes in pi, especially when the current theme needs to stay in sync across session restore, agent end, and context injection.
---

# theme-switcher

Use this skill when the task touches:

- `/theme` picker UX or `/theme status|set|list|preview|cycle`
- live theme preview on selection/hover-like navigation
- theme tool output
- session restore / persistence
- current-theme context injection
- bundled theme skill loading

Rules:

- use shared theme helpers instead of duplicating palette logic
- keep the active theme name as the source of truth
- `/theme` should open the picker directly; do not force users through extra subcommands for the main path
- theme UI should stay discoverable on demand, not pinned into the persistent flow HUD/status bar
- restore from session entries only when the saved theme is available
- keep context injection concise and factual
- prefer built-in/shared palettes over ad hoc palette copies
