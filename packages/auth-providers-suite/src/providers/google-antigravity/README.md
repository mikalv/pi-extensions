# Google Antigravity provider notes

## Auth policy

Google Antigravity should be treated as **custom-suite-first**.

Reasons:
- dedicated OAuth client configuration
- provider-specific project and model discovery
- custom login/callback behavior and cancellation handling

Planned modules:
- auth.ts
- oauth.ts
- discovery.ts
- models.ts
- protocol.ts
- validate.ts
