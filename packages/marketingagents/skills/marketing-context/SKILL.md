---
name: marketing-context
description: Create or update the shared startup marketing context used by every MarketingAgents workflow. Use when the user says "start marketing," "set up context," "describe my product," "define the ICP," "positioning context," or when downstream work lacks a reliable product, audience, offer, funnel, proof, constraints, or goal record.
---

# Marketing Context

Use `/context` to create the source of truth for a startup's marketing work. Read this artifact before research, strategy, planning, creative, distribution, tracking, or reporting so the user does not have to repeat foundational information.

## Workflow

1. Derive a short campaign slug: lowercase, hyphenated, no filler words, at most five words.
2. Check for `outputs/campaigns/<slug>-context.md`.
3. If it exists, read its version and changelog, then update only the sections affected by new evidence or a changed decision.
4. If it does not exist, auto-draft from available repository materials and user-provided artifacts. Ask only for gaps that materially change the diagnosis.
5. Keep observations, user assertions, sourced evidence, and hypotheses visibly distinct.
6. Save and verify the canonical context file.

## Required context

- Product, category, business model, pricing, and startup stage
- Target companies or users; user, champion, buyer, and technical evaluator where relevant
- Jobs to be done, pains, triggers, alternatives, and switching friction
- Differentiation, positioning hypothesis, offer, objections, and proof
- Verbatim customer language with source paths or URLs
- Brand voice, prohibited claims, regulatory constraints, and approval rules
- Funnel stages, activation event, conversion events, retention signal, and data sources
- Current channels, team capacity, budget constraints, active work, and known results
- Primary business goal, current marketing objective, open questions, and assumptions

Do not invent missing customer evidence, market facts, or metrics. Record missing fields as `unknown` and propose the smallest useful way to learn them.

## Versioning

- New document: `Context version: v1` and one dated changelog entry.
- Substantive update: increment the version, update the date, and prepend a concise entry explaining what changed and why.
- Typo-only correction: do not bump the version.
- Never erase earlier changelog entries.

## Output contract

Write exactly one canonical artifact to `outputs/campaigns/<slug>-context.md`. Include a short readiness snapshot and one recommended next workflow at the end. Verify the file exists before reporting completion.

## Handoffs

- Missing demand or customer language → `market-research` or `/research`
- Unclear buyer or user roles → `persona-business` or `/persona`
- Unclear bottleneck → `startup-diagnosis` or `/diagnose`
- Ready for channel and sequencing decisions → `marketing-strategy` or `/strategy`
