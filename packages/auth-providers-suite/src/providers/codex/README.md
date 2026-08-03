# Codex provider notes

Codex currently supports:
- importing existing Codex CLI OAuth credentials from `~/.codex/auth.json`
- device-login bootstrap by invoking `codex login --device-auth`
- account snapshot/switching support
- optional usage/quota probe support
- safe separation between auth logic and usage UI

Notes:
- this login flow currently depends on the installed Codex CLI owning the actual OAuth/device-auth exchange
- the suite imports and reuses the resulting stored tokens rather than reimplementing OpenAI's private login protocol directly
