---
name: marketing-plan
description: Convert an approved startup marketing strategy into an executable 90-day full-funnel plan with owners, dependencies, assets, measurement, decision gates, and stop criteria. Use for marketing plans, go-to-market roadmaps, sprint planning, channel sequencing, or campaign execution planning.
---

# Marketing Plan

Use `/plan` after shared context, diagnosis, and strategy exist. If any are missing, either create them first or mark every substituted assumption explicitly.

## Pattern

1. Restate the business goal, current constraint, startup stage, team capacity, and approved strategic bets.
2. Map work to acquisition, activation, retention, referral, and revenue; include only stages that matter in this horizon.
3. Sequence the 90 days as unblock → foundation → execute → learn. Do not create a calendar that assumes unresolved prerequisites are complete.
4. For each work item, name the owner, dependency, deliverable, funnel stage, leading signal, decision rule, and approval gate.
5. Identify instrumentation and baseline work before any experiment that depends on it.
6. Allocate budget only from user-confirmed constraints. Unknown budget or economics remain open decisions.
7. Include explicit non-goals and stop criteria so the plan does not become an unbounded backlog.
8. Ask the `strategist` subagent to critique meaningful spend, public launch, and hard-to-reverse choices.

## Paid campaigns

Paid work is a specialized branch of the plan, not the default plan. Include channel, audience, creative, test budget, KPI definitions, and kill criteria only when message, conversion, measurement, and budget readiness are documented.

## Output contract

Write `outputs/campaigns/<slug>-plan.md`. Include objective, prerequisites, full-funnel work map, 90-day roadmap, owners, assets, budget assumptions, measurement, decision gates, stop criteria, risks, non-goals, and sources/artifact inputs. Verify the file exists.
