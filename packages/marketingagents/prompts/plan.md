---
description: Convert an approved startup marketing strategy into an executable 90-day full-funnel plan with owners, dependencies, measurement, and stop criteria.
args: <slug>
section: Guided Marketing
topLevelCli: true
---
Build the marketing plan for: $@

Use the `marketing-plan` skill. Read the shared context, latest diagnosis, strategy, research, customer research, and persona artifacts. If context, diagnosis, or strategy is absent, propose creating it first or proceed only with clearly labeled assumptions.

## Plan requirements

1. Restate the business goal, binding constraint, startup stage, approved bets, team capacity, and budget constraint.
2. Map relevant work to acquisition, activation, retention, referral, and revenue. Keep brand, customer evidence, content, and measurement cross-cutting.
3. Sequence the horizon as unblock → foundation → execute → learn. Resolve instrumentation and conversion prerequisites before traffic-dependent experiments.
4. For every work item include owner, dependency, deliverable, funnel stage, leading signal, decision rule, and approval gate.
5. Name required assets and tool/integration dependencies, distinguishing available from not yet configured.
6. Use only user-confirmed budgets and economics. Unknowns become ranked open decisions.
7. Include explicit non-goals, risks, stop criteria, and what would trigger a strategy revision.
8. Ask `strategist` for an adversarial critique before meaningful spend, public launch, or a hard-to-reverse move.

Paid acquisition is an optional specialist branch. Include it only when message, conversion, measurement, and budget readiness are documented; then add channel rationale, test bounds, creative requirements, KPI definitions, and kill criteria.

## Output

Write exactly one artifact to `outputs/campaigns/<slug>-plan.md` containing objective, inputs, prerequisites, full-funnel work map, 90-day roadmap, owners, assets, budget assumptions, measurement, decision gates, non-goals, stop criteria, risks, and source artifacts. Verify the file exists.
