# MERGES

Kartlegging av `inspirations/` og `insp2/` med foreslåtte merge-mål.

## Legende

- **Merge** = bør samles inn i et større prosjekt
- **Kandidat** = kan merges, men ikke like presserende
- **Separat** = bør stå alene foreløpig
- **Dedup** = ser ut som duplikat / ny versjon av samme idé

## Foreslått toppstruktur

1. `pi-auth-provider-suite`
2. `pi-usage-center`
3. `pi-context-system`
4. `pi-agent-orchestrator`
5. `pi-workflow-core`
6. `pi-ui-pack`
7. `pi-research-tools`
8. `pi-automation-runtime`
9. `pi-platform-tooling`
10. standalone integrations

---

## 1. Auth / accounts / providers → `pi-auth-provider-suite`

| Repo | Foreslått merged-into | Begrunnelse | Behold separat? | Prioritet |
|---|---|---|---|---|
| inspirations/pi-claude-auth | pi-auth-provider-suite | Claude auth er del av bredere auth/account-lag | Nei | Høy |
| inspirations/pi-codex-account | pi-auth-provider-suite | Account switching / auth overlay | Nei | Høy |
| inspirations/pi-qwencloud-provider | pi-auth-provider-suite | Provider adapter | Nei | Høy |
| inspirations/pi-zai-glm | pi-auth-provider-suite | Provider adapter | Nei | Høy |
| insp2/pi-accounts | pi-auth-provider-suite | Bør være kjernen for named accounts | Nei | Høy |
| insp2/pi-codex-account | pi-auth-provider-suite | Samme domene som accounts/auth | Nei | Høy |
| insp2/pi-cursor-provider | pi-auth-provider-suite | Provider bridge | Nei | Høy |
| insp2/pi-kimi-coder | pi-auth-provider-suite | Provider implementation | Nei | Høy |
| insp2/pi-meta-ai | pi-auth-provider-suite | Provider implementation | Nei | Høy |
| insp2/pi-minimax-provider | pi-auth-provider-suite | Provider implementation | Nei | Høy |
| insp2/pi-provider-antigravity | pi-auth-provider-suite | Provider restoration/adapter | Nei | Høy |
| insp2/pi-provider-mux | pi-auth-provider-suite | Alias/multiple identities hører hjemme her | Nei | Høy |
| insp2/pi-qwencloud-token-plan-provider | pi-auth-provider-suite | Provider implementation | Nei | Høy |
| insp2/pi-xai-supergrok | pi-auth-provider-suite | Provider implementation | Nei | Høy |
| insp2/pi-zai-api | pi-auth-provider-suite | Provider implementation | Nei | Høy |

## 2. Usage / quota / costs / analytics → `pi-usage-center`

| Repo | Foreslått merged-into | Begrunnelse | Behold separat? | Prioritet |
|---|---|---|---|---|
| inspirations/pi-codex-usage | pi-usage-center | En spesialisert usage-plugin | Nei | Høy |
| inspirations/pi-token-usage | pi-usage-center | Token tracking overlapper usage/cost | Nei | Høy |
| insp2/pi-usage | pi-usage-center | Naturlig hovedpakke | Nei | Høy |
| insp2/pi-usage-bars | pi-usage-center | Samme data, annet UI | Nei | Høy |
| insp2/pi-usage-alerts | pi-usage-center | Samme domene, alerts-modul | Nei | Høy |
| insp2/pi-github-copilot-usage | pi-usage-center | Provider-spesifikk usage | Nei | Medium |
| insp2/pi-local-token-costs | pi-usage-center | Cost tracking | Nei | Høy |
| insp2/pi-metrics | pi-usage-center | Runtime metrics overlapper analytics | Kandidat | Medium |
| insp2/pi-insights | pi-usage-center | Analytics/reporting | Kandidat | Medium |
| insp2/pi-stats-ext | pi-usage-center | Lokal dashboard for usage/stats | Kandidat | Medium |
| insp2/pi-tool-duration | pi-usage-center | Tool timing er usage/telemetry | Kandidat | Medium |
| insp2/pi-tool-stats | pi-usage-center | Tool analytics | Kandidat | Medium |
| insp2/pi-zai-usage | pi-usage-center | Provider-spesifikk usage | Nei | Medium |
| inspirations/pi-context-map | pi-usage-center | Context profiling kan leve her eller i context-system | Kandidat | Lav |

### Samlet scope for `pi-usage-center`

- live quota
- footer bars
- alerts
- cost tracking
- per-provider usage
- session/tool analytics

## 3. Context / compaction / memory → `pi-context-system`

**Minne-lag:** STM = `packages/mm-observational-memory` (portert fra `insp2/pi-observational-memory`); wiki = `packages/mm-wiki` (Mythic/Fable-filstil); LTM = Prism via `packages/mm-memory` (`ltm-memories`, `ltm-sessions`). Transport: `packages/pi-prism`. Metacognition-lite: `memory_assess` / `memory_gap` i `mm-memory`.

**Fra MemPalace (mønstre, ikke port):** `memory_mine` (ingest), scoped recall (`project`/`kind`/`tags`), precompact-checkpoint til `ltm-sessions`. `mempalace-pi` er fjernet.

**Producers:** `mm-observational-memory` promoterer reflections → Prism + wiki etter reflector. `nmem` kan kobles senere. `Pi-Mythic-Memory` er fjernet (erstattet av `mm-wiki`). Soul-spesifikke lag er utenfor Pi-sporet.

| Repo | Foreslått merged-into | Begrunnelse | Behold separat? | Prioritet |
|---|---|---|---|---|
| inspirations/pi-context | pi-context-system | Basiskonsept | Nei | Høy |
| inspirations/pi-context-include | pi-context-system | Context loading | Nei | Høy |
| inspirations/pi-context-prune | pi-context-system | Compaction/pruning | Nei | Høy |
| inspirations/pi-context-tree | pi-context-system | Branch/merge/crop av context | Kandidat | Medium |
| inspirations/pi-context-view | pi-context-system | Context inspection UI | Kandidat | Medium |
| inspirations/pi-subdir-context | pi-context-system | Autoload context | Nei | Høy |
| inspirations/pi-smart-compact | pi-context-system | Compaction engine | Nei | Høy |
| insp2/pi-context | pi-context-system | Dedup / nyere variant | Nei | Høy |
| insp2/pi-subdir-context | pi-context-system | Dedup | Nei | Høy |
| insp2/pi-smart-compact | pi-context-system | Dedup | Nei | Høy |
| insp2/pi-auto-compact | pi-context-system | Auto compaction | Nei | Høy |
| insp2/pi-condense | pi-context-system | Tool-output compression | Nei | Høy |
| insp2/pi-distill | pi-context-system | Output distillation | Nei | Medium |
| insp2/pi-model-agents | pi-context-system | Model-specific AGENTS context | Kandidat | Medium |
| insp2/pi-observational-memory | packages/mm-observational-memory | STM + promote til wiki/Prism | Portet (kilde slettet fra insp2) | Medium |
| insp2/pi-persistent-intelligence | pi-context-system | Long-term memory | Kandidat | Medium |
| insp2/pi-recall | pi-context-system | Recall history/memory | Nei | Medium |
| insp2/pi-session-recall | pi-context-system | Recall history/memory | Nei | Medium |
| insp2/pi-mnemosyne | pi-context-system | Local-first memory | Kandidat | Medium |
| inspirations/pi-mindplace | pi-context-system | Knowledge graph memory | Kandidat | Medium |
| insp2/pi-mindplace | pi-context-system | Dedup / same family | Kandidat | Medium |

## 4. Multi-agent / orchestration / teams → `pi-agent-orchestrator`

| Repo | Foreslått merged-into | Begrunnelse | Behold separat? | Prioritet |
|---|---|---|---|---|
| inspirations/pi-acp-agents | pi-agent-orchestrator | External agent client | Kandidat | Medium |
| inspirations/pi-brainstorm | pi-agent-orchestrator | Multi-agent brainstorming | Nei | Medium |
| inspirations/pi-orchestrate | pi-agent-orchestrator | Core orchestration | Nei | Høy |
| inspirations/pi-squad | pi-agent-orchestrator | Team collaboration | Nei | Høy |
| inspirations/pi-subagent | pi-agent-orchestrator | Subagent runtime | Nei | Høy |
| inspirations/pi-swarm | pi-agent-orchestrator | Swarm orchestration | Nei | Høy |
| inspirations/pi-team | pi-agent-orchestrator | Multi-model team | Nei | Høy |
| insp2/pi-acp-agents | pi-agent-orchestrator | Dedup / same family | Kandidat | Medium |
| insp2/pi-codex-subagents | pi-agent-orchestrator | Provider-shaped subagents | Kandidat | Medium |
| insp2/pi-mixture-of-agents | pi-agent-orchestrator | Same domain | Nei | Medium |
| insp2/pi-moa | pi-agent-orchestrator | Same domain | Nei | Medium |
| insp2/pi-model-roles | pi-agent-orchestrator | Agent/model role system | Kandidat | Medium |
| insp2/pi-orch | pi-agent-orchestrator | Persistent orchestration | Nei | Høy |
| insp2/pi-orchestrate | pi-agent-orchestrator | Dedup | Nei | Høy |
| insp2/pi-scout | pi-agent-orchestrator | Side-agent routing/selection | Kandidat | Medium |
| insp2/pi-squad | pi-agent-orchestrator | Dedup | Nei | Høy |
| insp2/pi-subagent | pi-agent-orchestrator | Dedup | Nei | Høy |
| insp2/pi-swarm | pi-agent-orchestrator | Dedup | Nei | Høy |
| insp2/pi-team | pi-agent-orchestrator | Dedup | Nei | Høy |
| insp2/pi-teams | pi-agent-orchestrator | Same domain | Nei | Medium |
| insp2/pi-zai-agents | pi-agent-orchestrator | External agent tools | Kandidat | Lav |

## 5. Planning / handoff / recovery / workflow → `pi-workflow-core`

| Repo | Foreslått merged-into | Begrunnelse | Behold separat? | Prioritet |
|---|---|---|---|---|
| inspirations/pi-plan | pi-workflow-core | Planning mode | Nei | Høy |
| inspirations/pi-rewind | pi-workflow-core | Checkpoint/recovery | Nei | Medium |
| insp2/pi-goal | pi-workflow-core | Goal completion flow | Kandidat | Medium |
| insp2/pi-handoff | pi-workflow-core | Session handoff | Nei | Høy |
| insp2/pi-handoff-clipboard | pi-workflow-core | Handoff transport/UI | Nei | Medium |
| insp2/pi-plan | pi-workflow-core | Dedup / newer variant | Nei | Høy |
| insp2/pi-plan-mode | pi-workflow-core | Plan mode variation | Nei | Høy |
| insp2/pi-recap | pi-workflow-core | Session state recap | Kandidat | Medium |
| insp2/pi-side-chat | pi-workflow-core | Forked discussion flow | Kandidat | Medium |
| insp2/pi-wtf | pi-workflow-core | Undo last prompt / recovery | Kandidat | Medium |
| insp2/pi-worktree | pi-workflow-core | Session relocation/workflow mobility | Kandidat | Lav |
| insp2/pi-quit-and-delete | pi-workflow-core | Session lifecycle cleanup | Kandidat | Lav |

## 6. UI / TUI / footer / sidebar → `pi-ui-pack`

| Repo | Foreslått merged-into | Begrunnelse | Behold separat? | Prioritet |
|---|---|---|---|---|
| inspirations/pi-cometix-footer | pi-ui-pack | Footer/statusline | Nei | Medium |
| inspirations/pi-powerbar | pi-ui-pack | Footer/status UI | Nei | Høy |
| inspirations/pi-skill-palette | pi-ui-pack | Command palette style UI | Kandidat | Medium |
| insp2/pi-beautify | pi-ui-pack | Visual polish | Kandidat | Lav |
| insp2/pi-command-palette | pi-ui-pack | Same palette family | Nei | Medium |
| insp2/pi-mermaid | pi-ui-pack | TUI rendering widget | Kandidat | Lav |
| insp2/pi-pacman | pi-ui-pack | Spinner/indicator UI | Nei | Lav |
| insp2/pi-powerbar | pi-ui-pack | Dedup | Nei | Høy |
| insp2/pi-powerline | pi-ui-pack | Powerline UI kit | Nei | Medium |
| insp2/pi-sidebar | pi-ui-pack | Sidebar UI | Nei | Medium |
| insp2/pi-sidebar-tui | pi-ui-pack | Sidebar variant | Nei | Medium |
| insp2/pi-spinner | pi-ui-pack | Spinner | Nei | Lav |
| insp2/pi-statusline | pi-ui-pack | Footer/statusline | Nei | Medium |
| insp2/pi-thinking-box | pi-ui-pack | Thinking render style | Kandidat | Lav |
| insp2/pi-tldr | pi-ui-pack | Live summary widget | Kandidat | Medium |
| insp2/pi-theme-switcher | pi-ui-pack | Theme UX | Kandidat | Lav |

## 7. Research / web / docs / media → `pi-research-tools`

| Repo | Foreslått merged-into | Begrunnelse | Behold separat? | Prioritet |
|---|---|---|---|---|
| inspirations/pi-clipboard-image | pi-research-tools | Media/input utility | Kandidat | Lav |
| inspirations/pi-image-tools | pi-research-tools | Image tooling | Nei | Medium |
| insp2/pi-exa | pi-research-tools | Search/research provider | Nei | Medium |
| insp2/pi-image-tools | pi-research-tools | Dedup | Nei | Medium |
| insp2/pi-markdown-reader | pi-research-tools | Structured doc reading | Nei | Medium |
| insp2/pi-minimax-image-understanding | pi-research-tools | Image analysis | Kandidat | Lav |
| insp2/pi-ocr | pi-research-tools | Content extraction | Nei | Medium |
| insp2/pi-tools | pi-research-tools | Broad search/doc tooling | Nei | Høy |
| insp2/pi-web-browse | pi-research-tools | Browse/fetch | Nei | Medium |
| insp2/pi-web-providers | pi-research-tools | Routing across browse/search providers | Nei | Medium |

## 8. Automation / background tasks / scheduler / mux → `pi-automation-runtime`

| Repo | Foreslått merged-into | Begrunnelse | Behold separat? | Prioritet |
|---|---|---|---|---|
| inspirations/pi-background-tasks | pi-automation-runtime | Background task runner | Nei | Høy |
| inspirations/pi-scheduler | pi-automation-runtime | Scheduler core | Nei | Høy |
| insp2/pi-cmux | pi-automation-runtime | Terminal mux integration | Kandidat | Medium |
| insp2/pi-process-monitor | pi-automation-runtime | Background watcher | Nei | Medium |
| insp2/pi-scheduler | pi-automation-runtime | Dedup | Nei | Høy |
| insp2/pi-terminal-mux | pi-automation-runtime | Abstraction for mux backends | Nei | Medium |
| insp2/pi-tick | pi-automation-runtime | Scheduled persistent tasks | Kandidat | Medium |
| insp2/pi-tmux | pi-automation-runtime | Specific mux backend | Kandidat | Medium |

## 9. Extension/package/skill tooling → `pi-platform-tooling`

| Repo | Foreslått merged-into | Begrunnelse | Behold separat? | Prioritet |
|---|---|---|---|---|
| inspirations/pi-agent-extensions | pi-platform-tooling | Aggregator/meta repo | Nei | Medium |
| inspirations/pi-coding-agent-forge | pi-platform-tooling | Forge/distribution/tooling | Nei | Høy |
| inspirations/pi-extension | pi-platform-tooling | Generic extension mono | Nei | Medium |
| inspirations/pi-extension-3 | pi-platform-tooling | Samme type mono | Nei | Medium |
| inspirations/pi-extensions | pi-platform-tooling | Samme type meta repo | Nei | Medium |
| inspirations/pi-extensions-2 | pi-platform-tooling | Samme type mono | Nei | Medium |
| inspirations/pi-extensions-4 | pi-platform-tooling | Samme type mono | Nei | Medium |
| inspirations/pi-extensions-5 | pi-platform-tooling | Samme type mono | Nei | Medium |
| inspirations/pi-mono | pi-platform-tooling | Pi mono infra | Nei | Medium |
| inspirations/pix-mono | pi-platform-tooling | Pi mono infra | Nei | Medium |
| insp2/pi-extension-manager | pi-platform-tooling | Install/update/manage extensions | Nei | Høy |
| insp2/pi-package-mono | pi-platform-tooling | Package mono infra | Nei | Medium |
| insp2/pi-packages | pi-platform-tooling | Package mono infra | Nei | Medium |
| insp2/pi-skill-importer | pi-platform-tooling | Skill ingestion | Nei | Medium |
| insp2/pi-skills | pi-platform-tooling | Skill management | Nei | Høy |
| insp2/pi-mono | pi-platform-tooling | Dedup | Nei | Medium |
| inspirations/blabla | pi-platform-tooling | Ser ut som mono/meta | Kandidat | Lav |
| inspirations/noice-pi | pi-platform-tooling | Workflow packages/meta | Kandidat | Lav |
| inspirations/my-pi | pi-platform-tooling | Composable pi shell/meta distribution | Kandidat | Lav |
| inspirations/UniPi | pi-platform-tooling | All-in-one suite | Kandidat | Medium |

## 10. Standalone / behold separat foreløpig

| Repo | Foreslått merged-into | Begrunnelse | Behold separat? | Prioritet |
|---|---|---|---|---|
| inspirations/pi-add-dir | Eget / evt context-system | Smal, tydelig feature | Ja | Lav |
| insp2/pi-add-dir | Eget / evt context-system | Samme | Ja | Lav |
| inspirations/pi-antigravity | pi-auth-provider-suite eller separat | Kan merges, men også sterk standalone provider | Kandidat | Medium |
| insp2/pi-antigravity | pi-auth-provider-suite eller separat | Samme | Kandidat | Medium |
| inspirations/pi-elixir | Eget | Domene-spesifikt | Ja | Lav |
| inspirations/pi-hashline-edit | Eget | Tool override, smal | Ja | Lav |
| inspirations/pi-model-router | Eget eller agent-orchestrator | Sterkt produkt alene | Kandidat | Medium |
| insp2/pi-model-router | Eget eller agent-orchestrator | Samme | Kandidat | Medium |
| inspirations/project-manager | Eget | Bredere enn vanlig extension | Ja | Medium |
| insp2/CodeCompass | Eget | Egentlig annet produkt/konsept | Ja | Lav |
| insp2/pi-access-denied | Eget | Security/sandboxing | Ja | Medium |
| insp2/pi-ask-antigravity | Eget eller auth-suite | Spesifikk delegation tool | Ja | Lav |
| insp2/pi-ask-user | Eget | UI/input utility | Ja | Medium |
| insp2/pi-auto-permissions | Eget | Security/policy | Ja | Medium |
| insp2/pi-autoname | Eget | Smal session feature | Ja | Lav |
| insp2/pi-bin-hints | Eget | Very small utility | Ja | Lav |
| insp2/pi-chat | Eget eller session-platform | Bridge product | Kandidat | Lav |
| insp2/pi-custom-system-prompt | Eget | Smal config extension | Ja | Lav |
| insp2/pi-eval | Eget | Tool execution package | Ja | Medium |
| insp2/pi-frontier | Eget | Uklart, trenger manuell vurdering | Ja | Lav |
| insp2/pi-hooks | Eget | Claude-compatible hooks er eget produkt | Ja | Medium |
| insp2/pi-inspect | Eget eller ui-pack | Introspection dashboard | Kandidat | Medium |
| insp2/pi-intercom | Eget eller session-platform | Cross-session messaging | Kandidat | Medium |
| insp2/pi-kanban | Eget | Workspace/app-lag | Ja | Medium |
| insp2/pi-mcp | Eget | MCP integration er bred egen pakke | Ja | Høy |
| insp2/pi-messenger-bridge | Eget eller session-platform | Ekstern bridge | Kandidat | Medium |
| insp2/pi-mlx-models | Eget | Local model launcher | Ja | Medium |
| insp2/pi-model-thinking | Eget eller auth-suite | Tynt men nyttig config-lag | Ja | Lav |
| insp2/pi-models-discovery | Eget eller auth-suite | Support package for providers | Kandidat | Medium |
| insp2/pi-ollama | Eget | Stor standalone provider/integration | Ja | Medium |
| insp2/pi-pasteboard | Eget eller session-platform | Input utility | Ja | Lav |
| insp2/pi-peek | Eget | Distinkt “ask current session” konsept | Ja | Medium |
| insp2/pi-peek-agent | Eget | Samme familie, men egen rolle | Ja | Lav |
| insp2/pi-peek-user | Eget | Samme familie, men egen rolle | Ja | Lav |
| insp2/pi-reminders | Eget | OS integration | Ja | Lav |
| insp2/pi-review | Eget eller orchestrator | Fan-out review kan merges, men fint alene | Kandidat | Medium |
| insp2/pi-rich-questions | Eget | Special UI/input | Ja | Lav |
| insp2/pi-rtk-rewrite | Eget | Tool-output rewrite util | Ja | Lav |
| insp2/pi-rules | Eget | Rules/package system | Ja | Medium |
| insp2/pi-session-files | Eget eller session-platform | Mixed utility bundle | Kandidat | Medium |
| insp2/pi-sheets | Eget | General spreadsheet skill/tool | Ja | Medium |
| insp2/pi-ssh-tools | Eget | Explicit SSH toolkit | Ja | Medium |
| insp2/pi-stash | Eget | Prompt fragment stash | Ja | Lav |
| insp2/pi-telegram | Eget eller session-platform | Notification bridge | Kandidat | Lav |
| insp2/pi-tool-supervisor | Eget | Governance/review layer | Ja | Medium |
| insp2/pi-trust-defer | Eget | Tiny workflow tweak | Ja | Lav |
| insp2/pi-xcode-mcp | Eget | Xcode integration | Ja | Medium |

## 11. Klare dedup-kandidater

| Par | Anbefaling |
|---|---|
| inspirations/pi-acp-agents + insp2/pi-acp-agents | Velg insp2 som canonical hvis nyere |
| inspirations/pi-add-dir + insp2/pi-add-dir | Merge |
| inspirations/pi-antigravity + insp2/pi-antigravity | Merge |
| inspirations/pi-codex-account + insp2/pi-codex-account | Merge |
| inspirations/pi-context + insp2/pi-context | Merge |
| inspirations/pi-image-tools + insp2/pi-image-tools | Merge |
| inspirations/pi-mindplace + insp2/pi-mindplace | Merge |
| inspirations/pi-model-router + insp2/pi-model-router | Merge |
| inspirations/pi-mono + insp2/pi-mono | Merge |
| inspirations/pi-orchestrate + insp2/pi-orchestrate | Merge |
| inspirations/pi-plan + insp2/pi-plan | Merge |
| inspirations/pi-powerbar + insp2/pi-powerbar | Merge |
| inspirations/pi-scheduler + insp2/pi-scheduler | Merge |
| inspirations/pi-smart-compact + insp2/pi-smart-compact | Merge |
| inspirations/pi-squad + insp2/pi-squad | Merge |
| inspirations/pi-subagent + insp2/pi-subagent | Merge |
| inspirations/pi-subdir-context + insp2/pi-subdir-context | Merge |
| inspirations/pi-swarm + insp2/pi-swarm | Merge |
| inspirations/pi-sync + insp2/pi-sync | Merge |
| inspirations/pi-team + insp2/pi-team | Merge |
