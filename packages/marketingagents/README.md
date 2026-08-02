<p align="center">
  <strong>MarketingAgents</strong>
</p>
<p align="center">The open-source marketing operating system for technical founders.</p>
<p align="center">
  <a href="https://github.com/youmake-ai/marketingagents/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-0d9668?style=flat-square" /></a>
  <a href="https://www.npmjs.com/package/marketingagents"><img alt="npm" src="https://img.shields.io/npm/v/marketingagents?style=flat-square" /></a>
</p>

---

### What it does

MarketingAgents turns a technical product description into a focused, evidence-backed marketing system:

```
$ marketingagents start "an API observability product for small platform teams"
→ Shared context, readiness check, current bottleneck, one justified next action

$ marketingagents customer-research api-observability
→ Customer language, jobs, pains, triggers, objections, contradictions, source trail

$ marketingagents research api-observability
→ Competitors, alternatives, demand signals, category movement, distribution evidence

$ marketingagents diagnose api-observability
→ Binding full-funnel constraint and the smallest useful test

$ marketingagents strategy api-observability
→ Positioning foundation, up to three focused bets, explicit non-bets, measurement

$ marketingagents plan api-observability
→ Owners, dependencies, assets, approval gates, decision rules, 90-day sequence

$ marketingagents weekly-review api-observability
→ Verified learning, continue/change/stop/investigate decisions, one next action
```

The canonical context is reused across every workflow, so a returning founder resumes from prior evidence and decisions instead of restarting discovery. Paid advertising remains available through `/creative` and `/track`, but it is readiness-gated rather than treated as the default answer.

Built on [Pi](https://github.com/badlogic/pi-mono). Important claims and metrics must trace to customer evidence, a source URL, a saved artifact, or a raw platform response.

---

### Installation

**macOS / Linux:**

```bash
curl -fsSL https://raw.githubusercontent.com/youmake-ai/marketingagents/main/scripts/install/install.sh | bash
```

**Windows (PowerShell):**

```powershell
irm https://raw.githubusercontent.com/youmake-ai/marketingagents/main/scripts/install/install.ps1 | iex
```

The one-line installer fetches the latest tagged release and downloads a standalone native bundle with its own Node.js runtime.

The installer adds both `marketingagents` and its short alias `ma`. To upgrade, rerun the installer. `marketingagents update` only refreshes installed Pi packages inside MarketingAgents' environment; it does not replace the standalone runtime bundle itself.

Upgrading from AdsAgents? Install `marketingagents` and uninstall the former AdsAgents package. On first launch, MarketingAgents moves `~/.adsagents` to `~/.marketingagents` when the new directory is absent; if both exist, it preserves both and uses the new directory.

To uninstall, remove the launcher and runtime bundle, then optionally remove `~/.marketingagents` if you also want to delete settings, sessions, and installed package state.

Local models are supported through the setup flow. Run `marketingagents setup`, choose your provider — LM Studio, LiteLLM, Ollama, vLLM, or OAuth/API-key for any of OpenAI, Anthropic, Google, OpenRouter, etc.

---

### Workflows

Ask naturally or use slash commands as shortcuts. `/start` is the beginner-friendly front door; specialist commands remain available for direct use.

| Command | What it does |
| --- | --- |
| `/start <product>` | Establish context, assess six readiness gates, choose one next action |
| `/context <product-or-slug>` | Maintain the shared product, customer, offer, funnel, proof, and constraint record |
| `/customer-research <slug>` | Analyze first-party or public voice-of-customer evidence with provenance |
| `/research <topic-or-slug>` | Research competitors, alternatives, demand, category changes, and distribution |
| `/diagnose <slug>` | Find the binding acquisition, activation, retention, referral, or revenue constraint |
| `/next <slug>` | Select one highest-leverage action from current evidence and capacity |
| `/strategy <slug>` | Choose focused full-funnel bets, non-bets, measurement, and approval gates |
| `/persona <slug>` | Build evidence-grounded user, buyer, champion, and evaluator profiles |
| `/psychology <slug>` | Map JTBD, friction, awareness, and ethical persuasion to messaging |
| `/plan <slug>` | Turn strategy into a sequenced 90-day execution plan |
| `/creative <slug>` | Generate readiness-gated ad creative via Higgsfield |
| `/track <slug>` | Pull and verify Meta Ads evidence for the paid specialist branch |
| `/weekly-review <slug>` | Turn full-funnel evidence into operating decisions and the next action |
| `/loop <slug> <purpose>` | Design a bounded recurring process with state, self-checks, and a kill switch |
| `/report <slug>` | Produce a decision-focused marketing report (Markdown + optional PDF) |
| `/summarize <source>` | RLM-style summarization of URLs / files / PDFs |

---

### Agents

Eight bundled subagents are dispatched when decomposition or an independent verification pass materially helps.

- **market-researcher** — market, alternatives, audience, demand, and channel evidence with source URLs
- **customer-researcher** — first-party and proxy voice-of-customer synthesis with quote provenance
- **strategist** — full-funnel strategy/plan building plus adversarial critique
- **psych-analyst** — behavioral-science levers mapped to ethical messaging and creative directions
- **persona-builder** — evidence-grounded user, buyer, champion, and evaluator profiles
- **creative-director** — orchestrates Higgsfield + Meta tools; never launches ads
- **tracker** — verifies Meta insights and paid-campaign refinement proposals against raw evidence
- **reporter** — decision-focused full-funnel reporting; never fabricates missing data

---

### Tools & Integrations

- **Higgsfield CLI** — image and video generation for ad creative (image, video, jobs, workspaces, balance)
- **Meta Ads CLI** — campaigns, ad sets, ads, insights, creative upload, budget updates
- **Web search** — provider-agnostic, configured via `marketingagents search set`
- **Preview** — browser and PDF export of generated reports

Both Higgsfield and Meta integrations are Pi extensions that shell out to their respective CLIs. Override binary paths with `HIGGSFIELD_BIN` and `META_BIN` env vars.

---

### How it works

Built on [Pi](https://github.com/badlogic/pi-mono) for the agent runtime. Capabilities are delivered as [Pi skills](https://github.com/badlogic/pi-skills) — Markdown instruction files synced to `~/.marketingagents/agent/skills/` on startup.

The operating flow is context → customer/market evidence → diagnosis → strategy → plan → approved execution → measurement → weekly decision → next action. Recurring loops add cadence, an action condition, durable state, idempotency, self-checks, escalation rules, and a kill switch. Drafting and analysis can run autonomously; publishing, outreach, uploads, live-account changes, and spend require explicit user approval.

---

### Run locally

```bash
git clone https://github.com/youmake-ai/marketingagents.git
cd marketingagents
nvm use || nvm install
npm install
npm run dev -- --help
npm run dev -- start "<your product>"
```

Run the interactive development build with `npm run dev`. Before publishing a change, run:

```bash
npm test
npm run typecheck
npm run build
ASTRO_TELEMETRY_DISABLED=1 npm --prefix website run build
node ./bin/marketingagents.js --help
```

### Publish

`marketingagents` is a new unscoped npm package; npm does not rename the former package in place. For the first release, add a granular npm publish token as the repository secret `NPM_TOKEN`, then run the `Publish and Release` workflow (or push the new version to `main`). As a local fallback, publish while signed in to the npm account that will own the package:

```bash
npm login
npm whoami
npm pack --dry-run
npm publish
```

The GitHub workflow then handles later releases, native bundles, provenance, and release notes whenever `package.json` contains a version that is not yet fully released. After the first npm publish, configure npm trusted publishing for repository `youmake-ai/marketingagents` and workflow `publish.yml`; then remove the temporary `NPM_TOKEN` secret. The `repository.url` must exactly match the public GitHub repository for provenance.

See [CONTRIBUTING.md](CONTRIBUTING.md) for development conventions and [RELEASES.md](RELEASES.md) for the release entry.

[Release Notes](RELEASES.md) · [MIT License](LICENSE)

---

### Acknowledgements

MarketingAgents was forked from [Feynman](https://github.com/getcompanion-ai/feynman) (MIT). The Pi runtime + skills architecture, install pipeline, and many runtime patches are upstream contributions we depend on.

The context-first skills, explicit workflow handoffs, full-funnel framing, and recurring-loop design were inspired by [Corey Haines' Marketing Skills](https://github.com/coreyhaines31/marketingskills) (MIT), then adapted for a local, artifact-driven multi-agent runtime with stricter provenance and human-approval boundaries.
