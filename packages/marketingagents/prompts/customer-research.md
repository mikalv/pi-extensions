---
description: Analyze existing customer evidence or gather new voice-of-customer research for a startup decision.
args: <topic-or-slug>
section: Research & Strategy
topLevelCli: true
---
Run customer research for: $@

Use the `customer-research` skill. Resolve the slug and read `outputs/campaigns/<slug>-context.md` if present.

Clarify the decision this research must support and whether to analyze supplied evidence, gather permitted public evidence, or combine both. Use the `customer-researcher` subagent when the evidence set is large or independent synthesis would reduce bias.

Extract exact customer language, jobs, pains, triggers, desired outcomes, objections, alternatives, and segment signals. Preserve source paths or URLs, distinguish first-party from proxy evidence, record source bias, and state the basis for every confidence label. Never invent quotes, personas, or market-wide frequencies.

Write exactly one artifact to `outputs/campaigns/<slug>-customer-research.md`. Include the research question, evidence reviewed, themes, quote bank, contradictions, confidence, implications, gaps, and smallest next research step. Verify the file exists.
