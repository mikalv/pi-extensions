# Release Notes

This file is the public release history for MarketingAgents. Keep entries user-facing: what changed, why it matters, and anything users should do after upgrading.

GitHub release notes are generated from the matching `## vX.Y.Z` section in this file.

## v0.1.0 - 2026-07-22

Initial release of MarketingAgents — an open-source marketing operating system for technical founders.

### Founder-first workflow

- `/start` — establish shared context, assess six readiness gates, and choose one justified next action.
- `/context` — maintain the source of truth for product, customer, positioning, offer, proof, funnel, constraints, and approvals.
- `/customer-research` — synthesize first-party or public voice-of-customer evidence with quote provenance and source limitations.
- `/research` — map competitors, substitutes, DIY alternatives, demand signals, category movement, distribution evidence, and constraints.
- `/diagnose` — identify the binding full-funnel constraint without turning missing data into a score.
- `/next` — select one highest-leverage action from current evidence, capacity, and prerequisite readiness.
- `/strategy` — choose no more than three near-term bets, explicit non-bets, measurement, and approval gates.
- `/plan` — convert strategy into a sequenced 90-day plan with owners, dependencies, signals, decision rules, and stop criteria.
- `/weekly-review` — validate evidence and assign continue, change, stop, or investigate decisions.
- `/loop` — design safe recurring marketing work with durable state, idempotency, self-checks, escalation, and a kill switch.

Existing specialist workflows remain available: `/persona`, `/psychology`, `/creative`, `/track`, `/report`, and `/summarize`. Paid advertising is a readiness-gated branch, not the default recommendation.

### Agents and integrity

Eight bundled subagents: `market-researcher`, `customer-researcher`, `strategist`, `psych-analyst`, `persona-builder`, `creative-director`, `tracker`, and `reporter`.

- Quantitative claims and important outcomes must trace to a source URL, saved artifact, raw platform response, or tool output.
- Missing evidence remains labeled unknown, unverified, inferred, or blocked.
- Meaningful spend and public launches receive an adversarial strategy review.
- Publishing, outreach, external uploads, live-account changes, and spending require explicit user approval.
- The creative director may prepare assets but never launches ads.

### Identity and migration

- npm package: `marketingagents`.
- Commands: `marketingagents` and the short alias `ma`; no `adsagents` executable is installed.
- Runtime state: `~/.marketingagents`.
- Project-local package state: `.marketingagents/npm`.
- Canonical environment variables: `MARKETINGAGENTS_*`.

On first launch, MarketingAgents atomically moves `~/.adsagents` to `~/.marketingagents` when the new directory is absent. A prior `~/.feynman` directory is also supported as a secondary legacy source. If the new and old directories both exist, both are preserved and the new directory is used. Deprecated `ADSAGENTS_*` variables remain fallback aliases for one transition period.

### Integrations

- Higgsfield CLI — image/video generation and job verification.
- Meta Ads CLI — campaigns, ad sets, ads, insights, creative upload, and explicitly approved account changes.
- Provider-agnostic web search configured through `marketingagents search set`.
- Markdown preview and PDF export for generated reports.

### Lineage

MarketingAgents was forked from [Feynman](https://github.com/getcompanion-ai/feynman) v0.2.40 (MIT). The Pi runtime, skills architecture, install pipeline, and runtime patches remain important upstream foundations.

The context-first capability model, workflow handoffs, full-funnel framing, and recurring-loop structure were inspired by [Corey Haines' Marketing Skills](https://github.com/coreyhaines31/marketingskills) (MIT), then adapted for a local multi-agent runtime with durable artifacts, strict provenance, and human approval gates.

### Validation

The release gate runs the root test suite, TypeScript typecheck and build, website build, installer syntax checks, CLI smoke tests for both commands, and npm package-content verification.
