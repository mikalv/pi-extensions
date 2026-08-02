---
description: Produce a decision-focused marketing report from context, strategy, plan, execution, experiments, tracking, and raw evidence.
args: <slug> [--period <date-range>]
section: Measure & Improve
topLevelCli: true
---
Build the marketing report for: $@

Use the `marketing-reporting` skill. Read all available context, diagnosis, research, persona, strategy, plan, creative, experiment, tracking, weekly-review, and raw evidence artifacts for the slug.

## Steps

1. Reconstruct the through-line: objective → decisions → work shipped → observed outcome → learning → next decision.
2. Validate reporting windows, metric definitions, source freshness, and raw evidence paths before comparing results.
3. Report acquisition, activation, retention, referral, and revenue only where usable evidence exists. Mark missing stages `No usable data available`.
4. Compare results with the plan's original decision rules; do not invent retrospective targets.
5. Preserve caveats, contradictory evidence, failed work, and attribution limits.
6. Decide `continue`, `change`, `stop`, or `investigate` for each active bet.
7. End with one primary next action plus owner and definition of done.
8. If HTML or PDF is requested, render the saved Markdown with `/preview`; the Markdown remains canonical.

## Output

Write exactly one canonical artifact to `outputs/reports/<slug>-report.md` with executive summary, objective/plan recap, work shipped, full-funnel evidence, decisions, learning, coverage gaps, next action, and sources/raw paths. Verify the file exists.
