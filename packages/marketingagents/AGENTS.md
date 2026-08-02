# Agents

`AGENTS.md` is the repo-level contract for agents working in this repository.

Pi subagent behavior does **not** live here. The source of truth for bundled Pi subagents is `.marketingagents/agents/*.md`, which the runtime syncs into the Pi agent directory. If you need to change how a subagent behaves, edit the corresponding file in `.marketingagents/agents/` instead of duplicating those prompts here.

## Pi subagents

MarketingAgents ships eight bundled marketing subagents:

- `market-researcher` — market + alternatives + audience + demand evidence gathering
- `customer-researcher` — first-party and proxy voice-of-customer synthesis
- `strategist` — full-funnel strategy/plan build and adversarial critique
- `psych-analyst` — behavioral-science levers (Cialdini, JTBD, friction, awareness stage)
- `persona-builder` — evidence-grounded personas + business understanding
- `creative-director` — Higgsfield-driven creative variant production
- `tracker` — Meta Ads metric pull + paid-measurement verification + refinement proposals
- `reporter` — decision-focused full-funnel marketing report

They are defined in `.marketingagents/agents/` and invoked via the Pi `subagent` tool.

## What belongs here

Keep this file focused on cross-agent repo conventions:

- output locations and file naming expectations
- workspace-level continuity expectations for long-running campaigns
- provenance and verification requirements
- handoff rules between the lead agent and subagents

Do **not** restate per-agent prompt text here unless there is a repo-wide constraint that applies to all agents.

## Output conventions

- Campaign briefs (research, plan, persona, psychology) go in `outputs/campaigns/`.
- Creative assets and set docs go in `outputs/creatives/`.
- Tracking and final reports go in `outputs/reports/`.
- Session logs go in `notes/`.
- The workspace-level campaign log lives at `CHANGELOG.md`.
- Plan artifacts for long-running workflows go in `outputs/.plans/`.
- Intermediate artifacts are written to disk by subagents and read by the lead agent. They are not returned inline unless the user explicitly asks for them.
- Long-running workflows should treat the plan artifact as an externalized working memory, not a static outline. Keep task status and verification state there as the run evolves.
- Long-running or resumable workflows should also treat `CHANGELOG.md` as the chronological campaign log: what changed, what failed, what was verified, and what should happen next.
- Do not create or update `CHANGELOG.md` for trivial one-shot tasks.

## File naming

Every workflow that produces artifacts must derive a short **slug** from the topic (lowercase, hyphens, no filler words, ≤5 words — e.g. `espresso-dtc-q2`). All files in a single campaign run use that slug as a prefix:

- Plan artifact: `outputs/.plans/<slug>.md`
- Research brief: `outputs/campaigns/<slug>-research.md`
- Persona doc: `outputs/campaigns/<slug>-persona.md`
- Psychology brief: `outputs/campaigns/<slug>-psychology.md`
- Campaign plan: `outputs/campaigns/<slug>-plan.md`
- Creative spec: `outputs/creatives/<slug>-spec.md`
- Creative set: `outputs/creatives/<slug>-set.md`
- Creative assets: `outputs/creatives/<slug>/<variant-id>.<ext>` + sidecar JSON
- Tracking report: `outputs/reports/<slug>-tracking-<YYYY-MM-DD>.md`
- Final report: `outputs/reports/<slug>-report.md`
- Raw insights: `outputs/reports/.notes/<slug>-insights-<YYYY-MM-DD>.json`

Founder-first marketing artifacts extend the same convention:

- Shared context: `outputs/campaigns/<slug>-context.md`
- Customer research: `outputs/campaigns/<slug>-customer-research.md`
- Readiness diagnosis: `outputs/campaigns/<slug>-diagnosis.md`
- Strategy: `outputs/campaigns/<slug>-strategy.md`
- Next-action decision: `outputs/campaigns/<slug>-next.md`
- Recurring-loop spec: `outputs/campaigns/<slug>-loop-<loop-name>.md`
- Weekly review: `outputs/reports/<slug>-weekly-<YYYY-MM-DD>.md`
- Loop state: `outputs/reports/.notes/<slug>-loop-<loop-name>.json`

Concurrent campaigns must not collide on slug.

## Workspace changelog

- `CHANGELOG.md` is a campaign log, not release notes.
- Read `CHANGELOG.md` before resuming substantial work when it exists.
- Append concise entries after meaningful progress, failed approaches, major verification results, or new blockers.
- Each entry should identify the active slug or objective and end with the next recommended step.
- Mark verification state honestly with labels such as `verified`, `unverified`, `blocked`, or `inferred` only when they match the underlying evidence.

## Provenance and verification

- Every quantitative claim must trace to a source URL, a saved API response (`outputs/reports/.notes/`), a research artifact, or a tool output.
- Source verification and citation hygiene belong in the relevant subagent (e.g. `market-researcher`, `tracker`), not in ad-hoc edits after delivery.
- Verification passes should happen before delivery when the workflow calls for them.
- If a workflow uses the words `verified`, `confirmed`, or `checked`, the underlying artifact should record what was actually checked and how.
- For metrics or quantitative outputs, keep raw artifact paths or saved API responses that support the final claim. Do not rely on polished summaries alone.
- Never smooth over missing data. Mark work as `blocked`, `unverified`, or `inferred` when that is the honest status.

## Delegation rules

- The lead agent plans, delegates, synthesizes, and delivers.
- Use subagents when the work is meaningfully decomposable; do not spawn them for trivial work.
- Prefer file-based handoffs over dumping large intermediate results back into parent context.
- The lead agent is responsible for reconciling task completion. Subagents may not silently skip assigned tasks; skipped or merged tasks must be recorded in the plan artifact.
- For campaign launches and creative uploads, require at least one adversarial verification pass (`strategist` critique on the plan, `tracker` verification on metrics) before delivery. Fix fatal issues before delivery or surface them explicitly.
- The `creative-director` may upload assets to Meta but must NEVER launch ads without explicit user confirmation.
