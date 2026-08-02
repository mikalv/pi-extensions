---
name: marketing-loops
description: Design safe recurring marketing workflows with a real signal, useful cadence, durable state, self-check, stop condition, and human approval gates. Use when the user asks for a weekly marketing review, ongoing monitoring, a recurring content or customer-research process, ad-fatigue checks, marketing automation, or says "run this every week."
---

# Marketing Loops

Use `/loop` to turn a proven marketing task into a bounded repeatable system. A loop should observe on a cadence, act only when a condition is met, preserve state so it cannot double-act, and stop or escalate safely.

Read `outputs/campaigns/<slug>-context.md`, the active strategy, and the relevant measurement artifacts before designing a loop. If the process has never worked manually or its input data is untrusted, fix that first.

## Required loop contract

Define all nine fields:

1. **Check cadence** — how often the signal is inspected.
2. **Action condition** — the threshold or event that makes this run worth acting on.
3. **Purpose** — one business or funnel outcome.
4. **Inputs and capabilities** — artifacts, data sources, skills, agents, and tools used.
5. **Run sequence** — ordered, bounded steps.
6. **Self-check** — validation against stale data, tracking errors, noise, duplication, or too little evidence.
7. **State and idempotency** — cursor, dedupe key, cooldown, and in-flight work.
8. **Stop and escalation** — skip, halt, retry, disable, and human-review conditions.
9. **Output** — canonical report, staged draft, or notification plus raw-state location.

Read [references/loop-design.md](references/loop-design.md) for state paths, action tiers, rollout order, and starter loop blueprints.

## Safety

- Analysis, diffs, scoring, drafts, and staged recommendations may run unattended.
- Sending, publishing, spending, deleting, changing live settings, or using personal data for a new purpose is gated by default.
- Explicit authorization for a gated action must include scope, caps, and an allowlist. Revenue or spend anomalies always escalate instead of self-correcting.
- Every scheduled loop needs a documented kill switch.
- Do not schedule a loop unless the user explicitly asked for recurrence.

## Output contract

Write the loop specification to `outputs/campaigns/<slug>-loop-<loop-name>.md`. If scheduling was explicitly requested, call `schedule_prompt` only after the spec passes its self-check and guardrail checklist. Persist operational state at `outputs/reports/.notes/<slug>-loop-<loop-name>.json`. Verify the specification exists before reporting completion.

Start with measurement integrity and one weekly review loop. Add another loop only after someone consistently acts on the first loop's output.
