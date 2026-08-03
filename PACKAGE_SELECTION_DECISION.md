# Package selection decision

## Activated extensions
- `packages/pi-plan-mode`
- `packages/pi-input-shortcuts`
- `packages/pi-status-hub`
- `packages/pi-review`
- `packages/pi-worktree`
- `packages/pi-rtk`
- `packages/pi-image-drop`
- `packages/pi-grill-me`
- `packages/pi-chrome-devtools`
- `packages/pi-github-pr`

## Registered skills
- `./skills` (code-review, grill, handoff, humanizer, python-script, scout, spec-dev, cherry-pr-review)

## Moved out of repository
- `packages/pi-obsidian`
- `packages/pi-plan`
- `packages/pi-goal`

## Rationale
- `pi-chrome-devtools`: CDP browser inspection and screenshot capability for Pi agents.
- `pi-github-pr`: ambient statusline PR review/checks summary.
- `pi-grill-me`: deterministic design-interview extension for probing fuzzy plans.
- `skills/`: top-level agent skills for code review, grilling, handoffs, humanizing prose, Python scripts, scouting, and spec development.
- `pi-obsidian`, `pi-plan`, `pi-goal`: removed to prevent scope creep, chinois-only docs friction, or workflow collisions with `pi-plan-mode`.
