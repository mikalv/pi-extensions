---
description: Build evidence-grounded user, buyer, champion, and technical-evaluator profiles from shared context and customer research.
args: <topic-or-slug>
section: Research & Strategy
topLevelCli: true
---
Build persona + business understanding for: $@

Resolve the slug. Read `outputs/campaigns/<slug>-context.md`, `<slug>-customer-research.md`, and `<slug>-research.md` when present. Ask only for business context that materially changes the role model or strategy.

## Goal

A working persona doc that creative and plan workflows can consume. Persona is grounded in evidence, not invented archetypes.

## Steps

1. **Business understanding**: capture offer, value prop, margins/LTV/CAC if known, sales cycle, channels currently working, brand voice, hard claim restrictions.
2. **Role profiles**: distinguish the user, champion, decision maker, financial buyer, and technical evaluator where relevant. Merge roles only when evidence supports it. Build 1–3 actionable profiles with:
   - Demographics (age range, geography, income/role band) — from data, not guesses.
   - Day-in-the-life snapshot.
   - Goals (functional + emotional).
   - Pains and frictions (with source where possible).
   - Where they spend attention (specific platforms, communities, publications).
   - Buying triggers and objections.
   - Proof types they trust (reviews, peers, experts, data, case studies).
3. **Voice-of-customer**: include the strongest available verbatim quotes with source paths or URLs; do not fill a quota with weak or duplicative quotes.
4. Mark anything inferred vs. evidenced.

## Output

Write to `outputs/campaigns/<slug>-persona.md`:

```markdown
# Persona & Business Brief: <topic>

**Date:** YYYY-MM-DD
**Slug:** <slug>

## Business
- Offer: ...
- Value prop: ...
- Unit economics (LTV / CAC ceiling): ...
- Brand voice: ...
- Hard restrictions: ...

## Persona 1 — <name>
- Demographics: ...
- Day-in-the-life: ...
- Goals: ...
- Pains: ...
- Attention: ...
- Triggers: ...
- Objections: ...
- Trusted proof: ...

## Voice of Customer
> "..." — <source URL>
> "..." — <source URL>

## Inference vs Evidence
| Claim | Status | Source |
| --- | --- | --- |

## Sources
1. ...
```

Verify the file exists on disk before the final response.
