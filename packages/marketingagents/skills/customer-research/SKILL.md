---
name: customer-research
description: Plan, gather, analyze, or synthesize customer evidence for positioning and marketing decisions. Use when the user mentions customer interviews, voice of customer, win/loss analysis, churn reasons, support-ticket themes, review mining, community research, jobs to be done, ICP evidence, or asks what customers actually say and need.
---

# Customer Research

Use `/customer-research` to replace founder assumptions with traceable customer evidence. Read the shared marketing context first and ask only for missing scope: the decision this research must support, the segment, and which evidence already exists.

## Choose a mode

### Analyze existing evidence

Use interview transcripts, sales calls, surveys, support conversations, usage notes, churn feedback, reviews, and win/loss records supplied by the user. Preserve source paths and speaker context.

### Gather new evidence

Use permitted public sources such as competitor reviews, relevant forums, community discussions, product-launch comments, job postings, and customer-authored content. Prefer direct customer language over summaries and retain the source URL and date.

Most work may combine both modes, but label proxy evidence separately from first-party customer evidence.

## Extraction and synthesis

1. Extract functional, emotional, and social jobs; pains; desired outcomes; trigger events; objections; alternatives; and exact vocabulary.
2. Tag each item with segment, source, date, and whether it was spontaneous or prompted when known.
3. Cluster repeated themes without merging meaningful segment differences.
4. Record frequency only from the actual reviewed set; do not generalize it to the whole market.
5. Rate confidence as high, medium, or low and state the basis: number and independence of sources, consistency, recency, segment fit, and source bias.
6. Surface contradictions and research gaps instead of smoothing them away.
7. Translate findings into implications for context, positioning, offer, onboarding, content, or channel tests.

Do not invent personas from demographic stereotypes. When first-party evidence is scarce, create a provisional segment hypothesis grounded in named proxy sources and a plan to replace the proxy evidence.

## Output contract

Write `outputs/campaigns/<slug>-customer-research.md` with:

- Research question and reviewed evidence
- Segment and source limitations
- Ranked themes with exact quotes and provenance
- Jobs, pains, triggers, objections, alternatives, and desired outcomes
- Confidence and contradiction table
- Implications for marketing decisions
- Research gaps and the smallest next research step
- Sources and artifact paths

Verify the file exists. Recommend a marketing-context update, but do not silently rewrite the shared context unless the user requested it.

## Handoffs

- Turn evidence into buyer/user roles → `/persona`
- Update the source of truth → `/context`
- Identify the binding constraint → `/diagnose`
- Make positioning and channel choices → `/strategy`
