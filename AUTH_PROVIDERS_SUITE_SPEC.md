# Auth Providers Suite Spec

## Purpose
`packages/auth-providers-suite` should become the shared provider/account/auth foundation for Pi-related runtime work in this repo.

It should cover:
- provider account definitions
- auth strategy resolution
- endpoint/base URL resolution
- model/capability discovery where practical
- health and availability checks
- multi-account handling

It should **not** initially try to be the full usage/quota dashboard.

---

## Providers currently in use

### Subscription / individual accounts
- Codex
- Claude
- Copilot
- ChatGPT
- Google Antigravity
- Z.ai
- Cursor
- Kilo

### Local / self-hosted / free-token style
- LOCAL
  - Ollama
  - local OpenAI-compatible endpoint(s)
- Nvidia
  - multiple accounts

### Metered / API-key style
- Mistral
- other OpenAI-compatible providers with API key auth

### Not currently used, but interesting
- Minimax

---

## Main design goal
Create one shared provider/auth layer that can be reused by:
- Pi runtime integrations
- orchestration/execution systems
- TUI control-plane views
- future quota/usage/status extensions

---

## Auth categories to support

### 1. Subscription auth
Examples:
- Claude
- Codex
- Copilot
- ChatGPT
- Google Antigravity
- Cursor
- Kilo
- Z.ai

Needs:
- local session/token discovery
- cookie/token/session handling where relevant
- auth validity checks
- account/subscription metadata when available
- refresh/re-auth hooks

### 2. API key auth
Examples:
- Mistral
- OpenAI-compatible providers
- many metered providers

Needs:
- key reference/storage integration
- base URL support
- org/project/header overrides
- model listing and capability probing where possible

### 3. Local provider auth
Examples:
- Ollama
- local OpenAI-compatible endpoints
- self-hosted gateways

Needs:
- endpoint config
- no-auth and bearer-token modes
- health checks
- model discovery

### 4. Multi-account auth
Examples:
- Nvidia with multiple accounts
- later multiple accounts for subscription/API providers

Needs:
- account registry
- active account selection
- labels/profiles
- fallback/rotation hooks

---

## Proposed package shape

```text
packages/auth-providers-suite/
  package.json
  index.ts
  src/
    index.ts
    types/
      provider.ts
      auth.ts
      account.ts
      runtime.ts
    accounts/
      registry.ts
      selection.ts
    auth/
      api-key.ts
      local.ts
      session.ts
      oauth.ts
    runtime/
      resolve-provider.ts
      resolve-auth.ts
      health-check.ts
      capability-detect.ts
      model-discovery.ts
    providers/
      claude/
      codex/
      copilot/
      chatgpt/
      cursor/
      kilo/
      zai/
      openai-compatible/
      ollama/
      nvidia/
      mistral/
      minimax/
```

---

## Core types

### ProviderId
- `claude`
- `codex`
- `copilot`
- `chatgpt`
- `cursor`
- `kilo`
- `google-antigravity`
- `zai`
- `openai-compatible`
- `ollama`
- `nvidia`
- `mistral`
- `minimax`

### AuthStrategyKind
- `subscription`
- `session`
- `oauth`
- `apiKey`
- `local`
- `none`

### AccountRecord
Should include:
- `id`
- `provider`
- `label`
- `authKind`
- `baseUrl?`
- `headers?`
- `enabled`
- `metadata?`
- `lastValidatedAt?`
- `status?`

### ResolvedProviderConfig
Should include:
- provider id
- account id
- resolved base URL
- auth headers/tokens
- capability flags
- model discovery result if known

---

## MVP scope

### First providers to implement
1. Claude
2. Google Antigravity
3. Codex
4. Copilot
5. Cursor
6. ChatGPT
7. OpenAI-compatible
8. Ollama
9. Nvidia
10. Mistral

Priority note:
- Copilot and Cursor should be treated as higher-priority subscription/account integrations once the Claude and Antigravity special cases are scaffolded.
- Kilo also has a concrete local source now and should be moved up in practical harvesting priority.

### Native-vs-custom auth policy
Some providers should prefer Pi-native auth when Pi already has the correct built-in login path.

#### Native-first in Pi
- Codex
  - prefer `/login openai-codex`
  - treat Pi auth as canonical
  - Codex CLI import is bootstrap/recovery only
- Copilot
  - prefer Pi/provider-owned native GitHub Copilot OAuth when available

#### Custom-suite-first
- Claude
- Google Antigravity
- Cursor
- Kilo
- most API-key and local providers

### Special note: Claude auth is tricky
Claude should be treated as a dedicated auth/provider case, not just another generic subscription adapter.

Likely needs:
- dedicated local credential/session discovery
- careful token/cookie/session handling
- validation logic separate from generic API-key providers
- possible multiple auth paths depending on what local Claude tooling stores
- special request headers and request shaping needed to avoid subscription incompatibility or account trouble
- conservative handling so the integration does not drift into behavior likely to get flagged or banned

Recommendation:
- give Claude its own provider module early
- do not force it through the first generic subscription abstraction if that makes the design worse
- keep Claude-specific auth, header shaping, billing/subscription compatibility logic, and validation isolated in dedicated files

### Claude caution section
Claude should be treated as a **tier-1 special provider**.

The suite should likely isolate Claude into dedicated modules such as:
- `providers/claude/auth.ts`
- `providers/claude/session.ts`
- `providers/claude/headers.ts`
- `providers/claude/validate.ts`
- `providers/claude/runtime.ts`

The important rule is: do not let Anthropic/Claude quirks leak into the generic provider abstractions too early.

### Second wave
- Z.ai
- Kilo
- Minimax

---

## Best known source material from backup
Use selectively from:

- `../pi-extensions-pre-reset-20260802-175235/insp2/pi-accounts`
  - auth/account foundations
- `../pi-extensions-pre-reset-20260802-175235/insp2/pi-cursor-provider`
  - Cursor-specific auth/provider logic
- `../pi-extensions-pre-reset-20260802-175235/insp2/pi-provider-antigravity`
  - Google Antigravity provider/auth/discovery patterns
- `../pi-extensions-pre-reset-20260802-175235/insp2/pi-web-providers`
  - provider runtime/resolution/config patterns
- `../pi-extensions-pre-reset-20260802-175235/inspirations/pi-codex-account`
  - Codex account snapshot/switching and usage-probe patterns

Harvest patterns and modules selectively; do not blindly restore whole projects.

---

## Important open question: usage/quota/token depletion
There is a related but separate concern:
- checking token usage
- checking whether a subscription/free allocation is close to exhaustion
- surfacing quota/remaining-usage signals

### Current decision
**Not decided yet** whether this belongs:
1. inside `auth-providers-suite`, or
2. in a separate usage/quota extension built on top of it

### Recommended direction
Treat `auth-providers-suite` as the source of:
- account identity
- auth/session resolution
- provider metadata
- optional quota endpoints/adapters

Treat a separate usage/quota layer or extension as the place for:
- dashboards
- historical usage
- alerts
- depletion warnings
- token/subscription reporting UI

This suggests:
- `auth-providers-suite` may expose provider-specific `quota probe` hooks
- but UI/reporting should probably live elsewhere unless the scope stays tiny

---

## Codex note
A useful Codex source was found for account snapshot/switching and usage probing:
- `../pi-extensions-pre-reset-20260802-175235/inspirations/pi-codex-account`

Current understanding:
- good source for saved-account handling and switching existing `openai-codex` OAuth credentials
- no clearly harvested full standalone Codex OAuth login flow yet

## Suggested next implementation steps
1. Create `packages/auth-providers-suite`
2. Add core types
3. Add account registry + provider resolution
4. Implement `openai-compatible`, `ollama`, and `mistral` first
5. Add special-case adapters for `google-antigravity`, `claude`, and `codex`
6. Add optional quota-probe interface, but keep reporting separate for now
