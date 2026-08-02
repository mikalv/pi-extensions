---
description: Select the single highest-leverage next marketing action from current context, readiness, results, and constraints.
args: <slug>
section: Guided Marketing
topLevelCli: true
---
Choose the next marketing action for: $@

Use the `startup-diagnosis` skill. Read `outputs/campaigns/<slug>-context.md`, the latest diagnosis, active strategy/plan, and recent reports. If the diagnosis is stale or absent, perform a lightweight evidence-based diagnosis first.

Select one primary action using impact, evidence strength, user control, effort, reversibility, and prerequisite readiness. Give at most two alternatives, each with the exact condition that would move it ahead of the primary choice.

The output must state: why this now, input artifacts, owner, estimated scope without fake precision, definition of done, expected learning, decision unlocked, and whether approval is required. Do not produce a backlog disguised as a next step.

Write exactly one artifact to `outputs/campaigns/<slug>-next.md` and verify it exists.
