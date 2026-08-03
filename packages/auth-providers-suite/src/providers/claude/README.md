# Claude provider notes

## Auth policy

Claude is a tier-1 special provider and should be treated as **custom-suite-first**.

Reasons:
- tricky local credential and session discovery
- provider-specific headers and billing shaping
- request compatibility quirks that should stay isolated from generic auth logic

Planned modules:
- auth.ts
- credentials.ts
- keychain.ts
- headers.ts
- transforms.ts
- validate.ts
- runtime.ts
