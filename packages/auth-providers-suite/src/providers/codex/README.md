# Codex provider notes

## Important Pi behavior

For **Pi itself**, the preferred/canonical Codex auth path should match the CortexKit `pi-openai-auth` package:

- authenticate through Pi's normal login flow
- use `/login openai-codex`
- let Pi's built-in `openai-codex` OAuth handling remain primary when available

This means the suite should treat **Pi auth as the first-class source** for Codex credentials.

## What this package currently adds

- importing existing Codex CLI OAuth credentials from `~/.codex/auth.json`
- device-login bootstrap by invoking `codex login --device-auth`
- importing the resulting CLI credential into Pi auth storage
- high-level login/import-and-save helpers
- account snapshot/switching support
- optional usage/quota probe support
- safe separation between auth logic and usage UI

## Notes

- for Pi, native `/login openai-codex` should be preferred over CLI bootstrap whenever possible
- CLI-backed login exists as a bootstrap/recovery path, not the ideal long-term primary Pi path
- the suite imports and reuses stored tokens rather than reimplementing OpenAI's private login protocol directly
- `validate.ts` provides basic setup/credential checks
- `login.ts` provides the high-level login/import-and-save flow
- `status.ts` provides a simple health/source snapshot for Codex auth state
- account records imported from the CLI should be treated as `codex-cli` sourced unless a future native flow replaces this bootstrap path
