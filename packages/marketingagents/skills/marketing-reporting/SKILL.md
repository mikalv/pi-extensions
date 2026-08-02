---
name: marketing-reporting
description: Synthesize a decision-focused startup marketing report from context, strategy, plan, creative, experiments, tracking, and raw evidence. Use for weekly, campaign, launch, stakeholder, or period-end reporting without fabricated metrics.
---

# Marketing Reporting

Use `/report` for a shareable period or initiative report and `/weekly-review` for the recurring operating review.

## Pattern

1. Read all relevant artifacts for the slug, including raw evidence paths referenced by tracking reports.
2. Reconstruct the through-line: objective → decisions → work shipped → observed outcome → learning → next decision.
3. Cover acquisition, activation, retention, referral, and revenue only where usable evidence exists.
4. Compare results with plan-defined decision rules; do not add an unsourced target after the fact.
5. Keep data-quality issues, uncertainty, and conflicting signals visible.
6. State `No usable data available` for missing stages instead of filling a polished table with guesses.
7. End with a small set of explicit continue/change/stop/investigate decisions and one primary next action.

## Output contract

Write `outputs/reports/<slug>-report.md`. Include executive summary, objective and plan recap, work shipped, verified outcomes, funnel view, learning, decisions, coverage gaps, and every source artifact/raw path. Verify the file exists.
