---
description: Pull and verify Meta Ads evidence, compare it with plan-defined rules, and stage paid-campaign decisions.
args: <campaign-id-or-slug> [--window <days>]
section: Measure & Improve
topLevelCli: true
---
Track the paid-acquisition branch for: $@

Resolve the slug and campaign ID. Use the requested reporting window, or 7 days when none is provided. Read the context, strategy, and paid branch of `outputs/campaigns/<slug>-plan.md` first.

## Steps

1. Use `meta_insights`, `meta_list_ads`, and `meta_list_adsets` to pull spend, impressions, CTR, CPC, CPM, conversions, ROAS, frequency, and relevant plan-defined metrics at the appropriate entity level.
2. Save the raw Meta API response to `outputs/reports/.notes/<slug>-insights-<YYYY-MM-DD>.json` before interpreting it.
3. Verify account/campaign/ad IDs, reporting window, timezone, attribution setting, conversion-event definition, currency, source freshness, and comparability with any prior period.
4. Compare results only with thresholds and decision rules documented before the review. If the plan has none, record that gap and stage a proposed rule; do not introduce a universal pause, fatigue, or scaling cutoff after the fact.
5. Separate observed changes from causal explanations. Creative, audience, delivery, tracking, seasonality, and low sample size remain competing hypotheses until checked.
6. Stage specific continue, change, stop, or investigate decisions with the exact metric and evidence path behind each one.
7. Apply no live change unless the user has explicitly authorized the specific action, scope, account, cap, and affected entities. Verify any approved change with a follow-up tool call and record its response ID.

Do not invent or smooth metrics. A failed or partial pull makes the affected section `blocked` or `unknown`.

## Output

Write exactly one report to `outputs/reports/<slug>-tracking-<YYYY-MM-DD>.md`. Include data-quality status, performance versus plan rules, entity-level evidence, competing explanations, staged decisions, applied changes if any, coverage gaps, and raw response paths. Verify the file exists before the final response.
