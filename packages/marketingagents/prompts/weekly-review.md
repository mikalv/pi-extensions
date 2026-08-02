---
description: Run a full-funnel weekly marketing review that validates inputs, captures learning, and chooses the next decision.
args: <slug> [--period <date-range>]
section: Measure & Improve
topLevelCli: true
---
Run the weekly marketing review for: $@

Read the shared context, active strategy and plan, open next action, experiment artifacts, latest raw metric snapshots, tracking reports, and prior weekly review.

## Review sequence

1. Confirm the reporting window, data freshness, event definitions, attribution caveats, and raw evidence paths.
2. Compare actual evidence with the plan's decision rules; never invent a target or fill a missing period.
3. Summarize what changed across acquisition, activation, retention, referral, and revenue. Mark stages with no usable data as `unknown`.
4. Separate signal, possible noise, and tracking problems.
5. Record what was shipped, what was learned, what failed, and which assumption changed.
6. Decide `continue`, `change`, `stop`, or `investigate` for each active bet.
7. Choose one primary next action and assign an owner and definition of done.

Do not send, publish, spend, or change live systems during the review. Stage those actions for explicit approval.

Write exactly one artifact to `outputs/reports/<slug>-weekly-<YYYY-MM-DD>.md`. Include sources/raw paths, coverage gaps, decisions, and next action. Verify the file exists.
