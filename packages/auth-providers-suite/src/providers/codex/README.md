# Codex provider notes

Codex currently supports:
- importing existing Codex CLI OAuth credentials from `~/.codex/auth.json`
- device-login bootstrap by invoking `codex login --device-auth`
- importing the resulting credential into Pi auth storage
- high-level login/import-and-save helpers
- account snapshot/switching support
- optional usage/quota probe support
- safe separation between auth logic and usage UI

Notes:
- this login flow currently depends on the installed Codex CLI owning the actual OAuth/device-auth exchange
- the suite imports and reuses the resulting stored tokens rather than reimplementing OpenAI's private login protocol directly
- `validate.ts` provides basic setup/credential checks
- `login.ts` provides the high-level login/import-and-save flow
- `status.ts` provides a simple health/source snapshot for Codex auth state
- account records should be treated as `codex-cli` sourced unless a future native flow replaces this bootstrap path
