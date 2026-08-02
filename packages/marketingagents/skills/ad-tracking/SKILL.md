---
name: ad-tracking
description: Pull and verify Meta Ads evidence for a running paid campaign, compare it with plan-defined rules, and stage metric-grounded decisions. Use only for Meta paid tracking; use /weekly-review for the cross-channel full-funnel view.
---

# Ad Tracking and Refinement

Use `/track` when a running Meta campaign has enough plan-defined evidence for an operational decision. Do not assume a minimum number of days, universal fatigue frequency, or generic performance threshold.

## Pattern

1. Read the shared context and paid branch of `outputs/campaigns/<slug>-plan.md`.
2. Pull the requested window with `meta_insights`, `meta_list_ads`, and `meta_list_adsets`.
3. Save the raw Meta API response to `outputs/reports/.notes/<slug>-insights-<YYYY-MM-DD>.json`.
4. Validate IDs, window, timezone, attribution, event definitions, currency, freshness, and period comparability.
5. Compare only with rules documented before the review. If none exist, stage a proposed rule and report the gap.
6. Separate observed changes from possible creative, audience, delivery, tracking, seasonality, and sample-size explanations.
7. Stage continue, change, stop, or investigate decisions with exact metric and raw-path anchors.
8. Apply no live change without explicit bounded authorization and a successful follow-up verification.
9. Save `outputs/reports/<slug>-tracking-<YYYY-MM-DD>.md` and verify it exists.

Use the `tracker` subagent for the independent data-integrity pass. Do not invent, smooth, interpolate, or silently omit metrics.
