# cursor-runtime

Cursor-specific runtime package.

Intended contents:
- stream/runtime integration
- Cursor↔Pi bridge
- session/state lifecycle
- agent store/runtime helpers

This package should depend on auth/account pieces from `auth-providers-suite`, not re-implement Cursor auth internally.
