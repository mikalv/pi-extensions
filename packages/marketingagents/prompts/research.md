---
description: Research a startup's market, competitors, alternatives, customer signals, category movement, distribution patterns, and constraints with cited sources.
args: <topic-or-slug>
section: Research & Strategy
topLevelCli: true
---
Run market research for: $@

Derive a short slug and read `outputs/campaigns/<slug>-context.md` if it exists. State the research question and the decision this brief must support.

## Steps

1. Clarify the offer, segment, geography, and research decision only where ambiguity would change the work.
2. Use `web_search` for discovery and the available fetch tools to inspect current primary sources. Investigate:
   - Direct competitors, substitute approaches, internal/DIY alternatives, and doing nothing.
   - Positioning, offer, pricing, proof, onboarding, and distribution patterns.
   - Customer and demand signals from relevant reviews, communities, job posts, public discussions, search behavior, and first-party materials supplied by the user.
   - Category changes, platform changes, policy, regulation, and constraints relevant to the decision.
   - Channel evidence across owned, earned, partner, community, search, social, product-led, outbound, and paid distribution where applicable.
3. Prefer primary and recent sources. Preserve dates and direct URLs.
4. For large scopes, dispatch `market-researcher` for independent competitor or source batches.
5. De-duplicate findings, separate observation from inference, surface conflicts and source bias, and mark research gaps.

Do not present review or forum samples as representative of the whole market. Do not invent market size, buyer behavior, or channel benchmarks.

## Output

Write exactly one artifact to `outputs/campaigns/<slug>-research.md` with the research question, offer/segment, alternatives landscape, customer and demand signals, category movement, distribution evidence, constraints, implications, open questions, and sources. Verify the file exists.
