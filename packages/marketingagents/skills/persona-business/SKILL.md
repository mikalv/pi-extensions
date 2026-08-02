---
name: persona-business
description: Build evidence-grounded customer, user, buyer, champion, and technical-evaluator profiles plus business understanding. Use when roles, jobs, triggers, objections, proof needs, unit economics, voice, or hard claim restrictions must be clarified for strategy or execution.
---

# Persona & Business Understanding

Use `/persona` to produce a role-aware persona doc grounded in the shared context, customer evidence, and stated business constraints.

## When to use

- After `/context` and, when available, `/customer-research` or `/research`.
- Before `/diagnose`, `/strategy`, `/plan`, `/psychology`, or `/creative` when role distinctions matter.

## Pattern

1. Capture business: offer, value prop, LTV/CAC ceiling, sales cycle, brand voice, hard claim restrictions.
2. Build 1–3 personas, each with: demographics, day-in-the-life, goals, pains, attention channels, triggers, objections, trusted proof.
3. Pull 5–10 verbatim VoC quotes with source URLs.
4. Mark claims as inferred vs evidenced.
5. Save to `outputs/campaigns/<slug>-persona.md`.

## Tools

- `persona-builder` subagent for parallel persona drafts.
- Review-site scraping (`fetch_content`) for VoC quotes.
