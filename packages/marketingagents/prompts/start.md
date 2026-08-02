---
description: Start a guided startup-marketing journey: establish context, assess readiness, and choose one justified next action.
args: <product-or-startup>
section: Guided Marketing
topLevelCli: true
---
Start or resume the marketing system for: $@

## Goal

Give a technical founder one clear front door. Establish enough shared context to understand the startup, assess its current readiness, and recommend the next highest-leverage workflow without dumping a generic tactic list.

## Steps

1. Derive a short slug: lowercase, hyphenated, no filler words, at most five words.
2. Check for `outputs/campaigns/<slug>-context.md` and read it if present.
3. If context is absent, inspect available repository materials and user-provided artifacts, then ask only the few questions that could change the first decision.
4. Capture product, stage, customer, problem evidence, positioning hypothesis, offer, proof, funnel, measurement, team capacity, budget constraints, and approval boundaries.
5. Assess the six readiness gates: context, problem, message, conversion, measurement, and scale. Mark each `ready`, `partial`, `blocked`, or `unknown` and cite the basis.
6. Identify one binding constraint and choose one primary next workflow. Include at most two alternatives and say what evidence would make either preferable.
7. Explain the recommendation in plain language: why now, what it produces, definition of done, and what decision it unlocks.

Do not recommend meaningful paid spend before message, conversion, and measurement readiness. Missing evidence should produce a small validation step, not invented certainty.

## Output

Create or update exactly one canonical artifact: `outputs/campaigns/<slug>-context.md`. Include a versioned context, evidence/assumption labels, readiness snapshot, active objective, and next recommended workflow. Verify the file exists before the final response.
