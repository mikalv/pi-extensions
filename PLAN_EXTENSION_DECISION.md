# Plan extension decision

## Selected active extension
- `packages/pi-plan-mode`

## Not activated
- `packages/pi-plan`

## Why `pi-plan-mode`
- narrower scope focused on a true `/plan` mode
- lower risk of overlapping existing repo features
- easier fit with `pi-adhd-tasks`, `pi-status-hub`, `pi-context`, notify, and usage layers
- simpler command surface and less workflow ownership/conflict

## Why `pi-plan` is not active now
- much broader workflow system, not just plan mode
- overlaps with other repo capabilities (`flow`, `handoff`, `advisor`, `goal`, `specs`, `rewind`)
- higher integration and maintenance complexity

## Future option
Harvest targeted ideas from `packages/pi-plan` later without adopting the whole package, especially:
- advisor patterns
- rewind/checkpoint ideas
- flow status ideas
- specs gating ideas
