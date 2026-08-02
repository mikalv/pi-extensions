---
description: Build a focused full-funnel marketing strategy with stage-aware bets, explicit non-bets, measurement, and approval gates.
args: <slug>
section: Guided Marketing
topLevelCli: true
---
Build the marketing strategy for: $@

Use the `marketing-strategy` skill. Read the shared context, latest diagnosis, research, customer research, and persona artifacts before choosing direction.

Define the strategic foundation, map acquisition/activation/retention/referral/revenue, and choose no more than three near-term bets that fit the startup's stage, audience, team, and constraints. State which channels and tactics will not be pursued now and why. Separate hypotheses from evidence and define how each bet will be measured.

Ask the `strategist` subagent for an adversarial critique when the strategy involves meaningful spend, a public launch, or a difficult-to-reverse decision. Resolve fatal issues or surface them explicitly.

Write exactly one artifact to `outputs/campaigns/<slug>-strategy.md` with the strategic foundation, funnel priorities, chosen bets, non-bets, measurement, risks, approval gates, and next decision. Verify the file exists.
