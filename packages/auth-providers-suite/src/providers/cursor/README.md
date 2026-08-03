# Cursor provider notes

## Auth policy

Cursor should be treated as **custom-suite-first** for auth/account/model-cache behavior.

Split:
- auth/account/model-cache pieces belong in `auth-providers-suite`
- stream/bridge/session runtime belongs in `packages/cursor-runtime`
