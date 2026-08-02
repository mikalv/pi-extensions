---
name: market-research
description: Run source-grounded market, category, competitor, audience, demand, and distribution research for a startup or campaign. Use when the user asks about market alternatives, category trends, audience signals, demand evidence, channel fit, or current constraints. Produces a brief consumed by /context, /persona, /diagnose, and /strategy.
---

# Market Research

Use `/research` to produce a source-grounded market brief. Read the shared marketing context first when it exists.

## When to use

- User asks "who are competitors for X", "what are people saying about Y", "is this a real market".
- Before `/persona`, `/diagnose`, `/strategy`, or a new-market plan.

## Pattern

1. Clarify offer + segment if ambiguous (max 2 questions).
2. Research direct competitors, substitute approaches, customer and demand signals, category changes, distribution patterns, pricing/positioning, and constraints.
3. Dispatch `market-researcher` subagent for parallel competitor batches when scope is wide.
4. Save brief to `outputs/campaigns/<slug>-research.md` with cited sources.

## Tools

- `web_search`, `fetch_content`, `get_search_content` for sourcing.
- `market-researcher` subagent for parallelism.
- Use ad libraries only when paid-distribution evidence is relevant to the decision.
