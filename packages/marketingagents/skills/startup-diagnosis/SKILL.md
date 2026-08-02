---
name: startup-diagnosis
description: Diagnose a startup's current marketing bottleneck and recommend the next highest-leverage action. Use when the user asks "what should I do next," "why is growth stuck," "where is the funnel broken," "audit my marketing," "marketing status," or needs stage-aware guidance instead of a generic list of tactics.
---

# Startup Diagnosis

Use `/diagnose` for a point-in-time diagnosis and `/next` for a compact action decision. Always read `outputs/campaigns/<slug>-context.md` first; if it is absent or materially incomplete, use `marketing-context` before diagnosing.

## Readiness gates

Evaluate each gate as `ready`, `partial`, `blocked`, or `unknown`. Cite the artifact or evidence behind the status.

1. **Context** — product, stage, customer, constraints, and goal are known.
2. **Problem** — customer evidence supports the problem or a validation test is defined.
3. **Message** — ICP, category, differentiated value, objections, and proof are coherent.
4. **Conversion** — offer, CTA, landing path, onboarding path, and owner are defined.
5. **Measurement** — events, attribution, baseline, and raw data sources are usable.
6. **Scale** — a channel shows repeatable signal and the economics are known well enough to bound risk.

These are quality checks, not reasons to stall. When a gate is weak, recommend the smallest experiment or artifact that could move it forward.

## Diagnostic method

1. Read context plus available research, persona, strategy, plan, tracking, and weekly-review artifacts for the slug.
2. Map the current funnel across acquisition, activation, retention, referral, and revenue. Use `unknown`, not a fabricated score, when data is absent.
3. List the strongest evidence, conflicts, and data-quality risks.
4. Identify the binding constraint using impact, evidence strength, user control, effort, and reversibility.
5. Select one primary next action. Include at most two alternatives and explain what would make either one preferable.
6. State prerequisites, owner, definition of done, expected learning, and whether human approval is required.

Do not recommend more traffic when conversion or measurement is not ready. Do not recommend automation when the underlying process has not worked manually.

## Output contract

- `/diagnose`: write `outputs/campaigns/<slug>-diagnosis.md`.
- `/next`: write `outputs/campaigns/<slug>-next.md`.

Produce one canonical artifact per invocation and verify it exists. Every strong claim must reference an existing artifact, source URL, raw metric snapshot, or clearly labeled user assertion.

## Handoffs

- Customer-evidence gap → `/research` or `/persona`
- Positioning or channel-choice gap → `/strategy`
- Execution sequencing gap → `/plan`
- Data-quality gap → `/weekly-review` after measurement is repaired
