---
description: Design and optionally schedule a safe recurring marketing loop with durable state, self-checks, stop conditions, and approval gates.
args: <slug> <loop-purpose-or-name>
section: Measure & Improve
topLevelCli: true
---
Design a marketing loop for: $@

Use the `marketing-loops` skill and its `references/loop-design.md`. Read the shared context, strategy, relevant plan, and measurement inputs first.

Define check cadence, action condition, purpose, inputs/capabilities, bounded run sequence, self-check, durable state/idempotency, stop/escalation behavior, and output. Classify every action as autonomous-safe or human-gated. Include a manual kill switch and a stale-data failure path.

Do not automate an unproven process or schedule against untrusted data. Do not schedule anything unless the user explicitly requested recurrence. If scheduling was requested, write and verify the specification first, then call `schedule_prompt` with the approved cadence and a prompt that preserves all gates.

Write exactly one specification to `outputs/campaigns/<slug>-loop-<loop-name>.md`. Operational state belongs at `outputs/reports/.notes/<slug>-loop-<loop-name>.json`. Verify the specification exists.
