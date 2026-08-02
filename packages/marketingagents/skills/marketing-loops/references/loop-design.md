# Marketing loop design

Use this reference while authoring or reviewing a recurring MarketingAgents workflow.

## Durable state

Store machine-readable state at:

```text
outputs/reports/.notes/<slug>-loop-<loop-name>.json
```

A state record may contain:

```json
{
  "loop": "weekly-marketing-review",
  "lastRun": "2026-07-22T09:00:00Z",
  "cursor": "2026-07-21T23:59:59Z",
  "handled": ["stable-non-personal-id"],
  "cooldowns": {},
  "inFlight": [],
  "lastOutcome": "no-action"
}
```

Use only the fields the loop needs. Never write raw personal data to state. Advance a cursor only after a successful run, record dedupe keys after an action succeeds, and keep cooldowns when a loop is reset.

Append significant run outcomes to the workspace campaign `CHANGELOG.md` when the loop is part of a substantial ongoing objective. A no-op run does not need a changelog entry unless it exposes a recurring problem.

## Action tiers

### Autonomous-safe

- Read and compare data
- Validate freshness and provenance
- Detect a condition
- Draft or stage copy, assets, plans, or recommendations
- Write internal artifacts and raw snapshots

### Human-gated

- Publish or send externally
- Spend or reallocate money
- Create, pause, or change a live campaign
- Modify production, pricing, or account settings
- Delete, suppress, or repurpose customer records

Gated automation requires explicit authorization plus a narrow scope, hard caps, an allowlist, and a kill switch. If any bound is missing, stage the action for approval.

## Rollout order

1. **Trust the inputs.** Establish event definitions, attribution, freshness checks, and raw evidence paths.
2. **Review the whole funnel.** Run one weekly decision review that routes issues to the appropriate specialist workflow.
3. **Repair existing leaks.** Prioritize activation, retention, and failed conversion paths before adding more traffic.
4. **Build repeatable acquisition.** Add a channel-specific loop only after conversion and measurement are usable.
5. **Add learning loops.** Maintain an experiment backlog and record postmortems so results change future strategy.

Avoid duplicate ownership. One loop owns an action; other loops may flag the same signal but must not act on it.

## Starter blueprints

### Weekly marketing review

- **Check cadence:** Weekly
- **Action condition:** A verified material change, unresolved blocker, or overdue decision exists.
- **Purpose:** Select the next highest-leverage marketing action.
- **Inputs:** Context, strategy, active plan, raw metric snapshots, recent reports, experiments.
- **Run sequence:** Validate data → compare with baseline and plan → identify movers → capture learning → choose one decision.
- **Self-check:** Confirm time windows, event definitions, attribution, and source freshness before comparing.
- **State:** Last reviewed period and already-open decisions.
- **Stop:** Report `no material change` when nothing crosses the action condition; halt on stale or contradictory inputs.
- **Output:** `outputs/reports/<slug>-weekly-<YYYY-MM-DD>.md`.

### Voice-of-customer refresh

- **Check cadence:** Monthly or after a meaningful batch of new evidence.
- **Action condition:** New interviews, reviews, support themes, win/loss notes, or objections materially change an existing theme.
- **Purpose:** Keep positioning and language grounded in current customer evidence.
- **Inputs:** Research artifacts and explicitly permitted customer evidence.
- **Run sequence:** Collect → deduplicate → tag → compare themes → stage context updates.
- **Self-check:** Check segment and source bias; do not treat one anecdote as a market shift.
- **State:** Source IDs or hashes already processed.
- **Stop:** Do not update the context automatically when evidence conflicts; request review.
- **Output:** A staged research update and recommended context diff.

### Content repurposing

- **Check cadence:** After an approved source asset is published.
- **Action condition:** A new source asset has not yet been adapted for selected channels.
- **Purpose:** Extend the useful life of evidence-rich founder content.
- **Inputs:** Approved source asset, context, strategy, channel constraints.
- **Run sequence:** Extract core ideas → select justified channels → draft channel-native variants → stage for approval.
- **Self-check:** Preserve claims, citations, and voice; reject variants that lose essential nuance.
- **State:** Source-asset hash and generated channel variants.
- **Stop:** Never auto-publish; stop when the selected channel set is complete.
- **Output:** Staged drafts under the campaign creative/output convention.

### Paid creative fatigue review

- **Check cadence:** Match the campaign's data volume and decision window; do not use an arbitrary universal interval.
- **Action condition:** A plan-defined fatigue or efficiency rule is met on verified data.
- **Purpose:** Surface creative replacement decisions without reacting to noise.
- **Inputs:** Campaign plan, raw platform insights, creative metadata, tracking report.
- **Run sequence:** Pull raw data → verify window and IDs → compare with decision rules → stage replacements or budget recommendations.
- **Self-check:** Rule out tracking breaks, delivery changes, seasonality, and inadequate sample before flagging fatigue.
- **State:** Last window, handled creative IDs, in-flight replacements.
- **Stop:** Spend or live campaign changes always escalate unless separately authorized within caps.
- **Output:** Tracking report plus staged recommendation.

## Ship checklist

- All nine contract fields are concrete.
- The cadence matches how quickly the underlying signal can change.
- Most runs are allowed to do nothing.
- Input freshness and provenance are checked before action.
- Durable state prevents duplicate or conflicting action.
- Errors lead to `blocked` or `stale`, never invented continuity.
- External sends, publishing, spending, and account changes have approval gates.
- A manual kill switch is documented.
