---
name: marketing-strategy
description: Build a focused, stage-aware full-funnel marketing strategy for a technical startup. Use when the user asks for a marketing strategy, go-to-market direction, channel choices, a 90-day roadmap, AARRR planning, budget priorities, or needs to decide what not to do before creating an execution plan.
---

# Marketing Strategy

Use `/strategy` to choose direction and `/plan` to translate approved direction into owned work. Read the shared context, latest diagnosis, research, and persona artifacts first.

## Strategy method

1. Restate the business goal, startup stage, binding constraint, team capacity, and budget constraint.
2. Define the strategic foundation: best-fit segment, category, positioning, message, offer, proof, and primary conversion action.
3. Map acquisition, activation, retention, referral, and revenue. Treat brand, customer research, content, and measurement as cross-cutting capabilities.
4. Select at most three near-term bets. Tie each bet to evidence, a funnel stage, an owner, and a learning objective.
5. Name channels and tactics that are deliberately deferred or rejected, with reasons.
6. Define prerequisites, leading signals, decision rules, risks, and explicit approval gates.
7. Ask the `strategist` subagent for an adversarial critique when the plan involves meaningful spend, public launch, or a hard-to-reverse decision. Resolve fatal issues before delivery.

## Stage-aware defaults

- **Idea or validation:** customer conversations, problem evidence, and message tests before scale.
- **Pre-launch:** positioning, offer, conversion surface, analytics, onboarding, and an owned-audience path.
- **Early traction:** repair the largest funnel leak, then build one repeatable acquisition loop.
- **Growth:** expand channels only after measurement, retention, and economics support the added risk.

Technical founders often have an execution advantage in useful tools, integrations, documentation, demos, technical content, and open-source/community participation. Recommend these only when they match the audience and objective; do not treat them as universal defaults.

## Integrity rules

- Never invent benchmarks, budgets, CAC, LTV, conversion rates, or channel performance.
- Separate a hypothesis from an observed pattern.
- Prefer a small measurable bet over a broad activity list.
- Paid acquisition requires message, conversion, measurement, and budget readiness.
- Publishing, outreach, account changes, and spend remain human-gated unless explicitly authorized with bounds.

## Output contract

- `/strategy`: write `outputs/campaigns/<slug>-strategy.md` with strategic foundation, funnel map, selected bets, explicit non-bets, measurement, risks, and next decision.
- `/plan`: write `outputs/campaigns/<slug>-plan.md` with a 90-day roadmap, owners, dependencies, assets, decision gates, and stop criteria.

Produce one canonical artifact per invocation and verify it exists.
