# Feature Request: stabilize and extend pi extension / control-plane API for harness-scale automation

## Context

We are building `harness` — a two-layer AI-agent system where Lag 1 is an
Elixir/OTP control plane and Lag 2 is a single-binary TS/Python/Rust agent
runtime (see `ARKITEKTUR.md`). The runtime is essentially a stripped-down
`pi` agent loop talking to Elixir over CBOR/RPC.

After a week of extension work we hit a cluster of extension-API problems
that are small individually but collectively block reliable automation:

## Requested changes

### 1) Type-safe extension tool contract

Right now `bun build` does not type-check and `fakePi` mocks mirror wrong
assumptions, so a tool definition can have `inputSchema`, `handler`,
`isError`, etc. and still pass both build and unit tests. Only live pi
testing catches the mismatch.

**Request:** either type-check extensions at build time, or ship an
official `pi validate-extension <path>` command that asserts shape against
the real `ToolDefinition` type.

### 2) Permission / ask primitive over RPC

Harness needs the control plane to be able to send a permission question to
a running runtime and get a yes/no/ask-back answer back — without the
runtime pausing the whole process or resorting to shelling out. The current
RPC mode exposes many primitives but has no explicit permission/approve
command.

**Request:** add an `ask` or `permission` message type to the wire protocol
and an `ExtensionUIRequest` method for it. The runtime should be able to
send `ask` and receive `approve | deny | ask_back`.

### 3) Programmatic tree/session UI controls

`app.session.tree` exists but there is no documented close/toggle action.
pi-atelier has its own sidebar controller but that is not exposed for other
extensions. The result is "notify the user and hope they press Escape".

**Request:** expose a documented `ctx.ui.toggleSidebar()` or
`pi.actions.toggleSessionTree()` so any extension can open/close the tree
without knowing which extension owns the sidebar.

### 4) Config reload hook for extensions

`/reload` re-reads `settings.json` but does not tell extensions to reload
their cached config. `mm-observational-memory` and `pi-superagents` both
cache a singleton config object at init time and never re-read.

**Request:** emit `config_changed` (or reuse `session_start` with a flag)
when `/reload` runs, and document that extensions should subscribe and
re-read their config there.

### 5) Provider / tool allowlist in settings

There is no way in `settings.json` to say "extension X may only use
provider Y". An extension that hardcodes an external API will use it
regardless of user intent.

**Request:** add `extensions.<name>.allowedProviders` /
`extensions.<name>.blockedProviders` (or similar) so users can enforce
offline or local-only routing from settings.

### 6) Compaction should count real tokens

`prepareCompaction` uses `estimateTokens` (chars/4 on message bodies only)
while the TUI context indicator uses real API `totalTokens`. With many
registered extensions the tool-definition overhead alone can be 15–30k
tokens, so the TUI shows 95 % full while compaction refuses to run.

**Request:** include system-prompt tokens and tool-definition tokens in the
compaction estimate, or let extensions override the threshold.

## Why this matters for harness

Without (1) and (2) the Lag 1 ↔ Lag 2 control channel is unreliable. (3)
and (4) are needed for acceptable UX when human-in-the-loop is required.
(5) and (6) are operational necessities for a system that may run for days
and accumulate many tools/extensions.

## Proposed scope

Items 1–2 are blocking for v1 and should be tracked as issues. Items 3–6
are follow-up improvements that unblock better UX and operations.

## Related

- pi fork with harness: `mikalv/pi` (if public) or local branch `harness`
- Session observation: `mm-observational-memory` and `mm-memory` extensions
- Wire protocol spec: `harness/PROTOCOL.md`
