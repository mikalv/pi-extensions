# Auth Provider Harvest Plan

## Goal
Harvest only the parts needed to build `packages/auth-providers-suite`, starting with:
- Google Antigravity
- Claude auth

This plan marks each source as:
- **adapt** — good direct source material for the new package
- **reference** — read for patterns/constraints, but do not copy wholesale
- **skip** — not a priority for the suite core

---

# 1. Google Antigravity harvest plan

## Source
- `../pi-extensions-pre-reset-20260802-175235/insp2/pi-provider-antigravity`

## Best modules to harvest

### adapt
- `src/google-oauth-utils.ts`
  - shared Google OAuth + PKCE callback flow
  - very reusable as a provider-specific OAuth helper base

- `src/google-antigravity-oauth.ts`
  - Antigravity-specific login/refresh/project discovery
  - should become the main source for `providers/google-antigravity/*`

- `src/stored-credentials.ts`
  - useful pattern for reading persisted auth and standalone validation scripts

- `src/model-discovery.ts`
  - clean provider-specific discovery layer
  - likely reusable with modest adaptation

- `src/catalog-validation.ts`
  - useful as provider validation/filtering pattern

- `src/models.ts`
  - valuable source for model/routing definitions
  - should be adapted, not copied blindly

- `src/antigravity-protocol.ts`
  - endpoint/header constants and protocol surface

### reference
- `src/cloud-code-assist.ts`
  - important as request/runtime behavior reference
  - probably too large/specific to copy into auth-providers-suite as-is
  - useful for later provider runtime layer

- `src/index.ts`
  - good reference for Pi provider registration shape
  - not the ideal direct home for the shared suite logic

### skip for now
- test and script files unless needed for later validation harnesses
- vendored helper internals unless a specific helper is clearly needed

## What Antigravity should become in the new suite
Suggested new destination:
- `packages/auth-providers-suite/src/providers/google-antigravity/`
  - `auth.ts`
  - `oauth.ts`
  - `discovery.ts`
  - `models.ts`
  - `protocol.ts`
  - `validate.ts`

## Key value from Antigravity
- production-grade provider-specific OAuth flow
- project/account discovery
- model discovery and filtering
- subscription-style provider treatment with richer runtime metadata

---

# 2. Claude auth harvest plan

## Best discovered source
- `../pi-extensions-pre-reset-20260802-175235/inspirations/pi-claude-auth`

## Secondary source
- `../pi-extensions-pre-reset-20260802-175235/inspirations/pi-coding-agent-forge/pi-extension-anthropic-auth-recovery`

## Other useful reference
- `../pi-extensions-pre-reset-20260802-175235/insp2/pi-web-providers/test/claude-provider.test.ts`

---

## Claude modules to harvest

### adapt
- `src/credentials.ts`
  - core credential lifecycle
  - auth.json sync pattern
  - refresh strategy ordering
  - active account selection persistence
  - very important source

- `src/keychain.ts`
  - keychain/file credential discovery
  - multi-account detection
  - write-back behavior
  - critical source

- `src/signing.ts`
  - user-agent + billing-header construction logic
  - extremely important special-case logic

- `src/transforms.ts`
  - request payload transformation/injection logic
  - key Claude-specific compatibility behavior

- `src/index.ts`
  - extension/provider override shape
  - useful for integration design

### reference
- `README.md`
  - strong documentation for constraints and behavior
  - should guide implementation decisions

- anthropic auth recovery extension
  - reference only
  - useful for understanding failure modes and compatibility problems
  - not part of auth-providers-suite core

- `pi-web-providers/test/claude-provider.test.ts`
  - runtime behavior reference
  - more about search/provider execution than auth core

### skip for now
- logger/test helpers unless needed immediately
- recovery extension runtime code as product code

## What Claude should become in the new suite
Suggested new destination:
- `packages/auth-providers-suite/src/providers/claude/`
  - `auth.ts`
  - `credentials.ts`
  - `keychain.ts`
  - `headers.ts`
  - `transforms.ts`
  - `validate.ts`
  - `runtime.ts`

## Key value from Claude source
- reuse existing Claude Code credentials
- multi-account handling
- refresh and write-back
- special user-agent and billing/subscription shaping
- request transformation needed for compatibility

---

# 3. Important overlap and design rule

## Overlap between Antigravity and Claude
Both are subscription-ish providers, but they should **not** be forced into the exact same implementation path early.

### Shared concepts
- account registry
- active account selection
- auth/session refresh
- provider validation
- model discovery hooks

### Separate provider-specific logic
- Google OAuth / PKCE / callback server for Antigravity
- keychain/file credential reuse for Claude
- Claude header/billing/request shaping
- Antigravity project discovery and model catalog discovery

## Design rule
Build shared abstractions only where they are truly shared:
- account record types
- provider resolution
- validation interfaces
- discovery interfaces

Do **not** over-generalize:
- OAuth callback flow details
- Claude subscription compatibility logic
- provider-specific headers
- request payload transforms

---

# 3b. Codex OAuth/account notes

## Best discovered source
- `../pi-extensions-pre-reset-20260802-175235/inspirations/pi-codex-account`

## Useful secondary sources
- `../pi-extensions-pre-reset-20260802-175235/insp2/pi-codex-account/index.ts`
- `../pi-extensions-pre-reset-20260802-175235/insp2/pi-usage/src/providers/openai-codex.ts`
- `../pi-extensions-pre-reset-20260802-175235/insp2/pi-web-providers/src/providers/codex.ts`

## What was found
The strongest Codex-related auth/account source found here is not a full login/OAuth flow implementation, but an **account snapshot and switching layer** for existing `openai-codex` OAuth credentials already present in Pi `auth.json`.

That is still very valuable.

### adapt
- `inspirations/pi-codex-account/src/index.ts`
  - saved-account store
  - account switching
  - auth.json swap pattern
  - active-account detection
  - usage endpoint probe pattern

### reference
- `insp2/pi-usage/src/providers/openai-codex.ts`
  - usage/quota probe ideas
- `insp2/pi-web-providers/src/providers/codex.ts`
  - runtime/provider execution reference

## Current conclusion for Codex
- good source found for **account switching and usage probing**
- no clearly discovered full standalone Codex OAuth login flow in the harvested sources yet
- likely worth treating Codex as:
  - provider account layer now
  - deeper OAuth/login discovery later if needed

# 4. Recommended next implementation sequence

## Phase A
Scaffold `packages/auth-providers-suite` with:
- package.json
- index.ts
- core types
- account registry
- provider registry

## Phase B
Add Google Antigravity first:
- auth
- OAuth
- discovery
- models
- validation

## Phase C
Add Claude as first special-case provider:
- keychain/file credential discovery
- multi-account switching
- refresh/write-back
- user-agent + billing header logic
- request transforms

## Phase D
Then add more generic providers:
- openai-compatible
- ollama
- mistral
- nvidia
- chatgpt as its own adapter where needed

## Priority adjustment
After Claude and Google Antigravity, raise priority for:
- Copilot
- Cursor
- Kilo

Codex also remains high priority, but current harvested evidence is strongest for account switching and usage probing rather than a standalone OAuth login implementation.

## New local frontier sources found
Under `not_to_be_commited/pi-frontier` there are now strong direct sources for:
- `pi-kilocode`
- `pi-cursor-agent`

These should be treated as high-value harvest candidates for provider-specific login/runtime patterns.

### Kilo
Best source:
- `not_to_be_commited/pi-frontier/pi-kilocode`

Value:
- device-auth login flow
- profile/org selection
- token validation
- model catalog fetch + cache
- OpenAI-compatible gateway setup

### Cursor
Best source:
- `not_to_be_commited/pi-frontier/pi-cursor-agent`

Value:
- real Cursor login/refresh integration
- model refresh/update flow
- provider runtime wiring
- subscription-backed provider behavior

---

# 5. Providers currently in use to remember

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
