# auth-providers-suite

Shared provider, account, and authentication foundation suite for Pi runtimes.

## Tools / commands / hooks provided
This package acts as a foundational library and schema provider for orchestration and TUI work. It exports core registry structures and resolution functions but does not directly expose Pi slash commands, tools, or UI components.

## Key files
- `index.ts` / `src/index.ts`: The main entry points, re-exporting types, registries, and provider-specific configurations.
- `src/types/provider.ts`: Defines `ProviderId`, `ProviderFamily`, and `ProviderDescriptor` schemas.
- `src/types/auth.ts`: Defines `AuthStrategyKind` and `ResolvedAuth` structures.
- `src/accounts/registry.ts`: Contains `AccountRegistry`, an in-memory repository for account records.
- `src/runtime/resolve-provider.ts` / `src/runtime/resolve-auth.ts`: Core functions to map a provider ID or an account record to an actionable, resolved authentication configuration.
- `src/providers/catalog.ts`: Provides a canonical `PROVIDER_CATALOG` array detailing supported providers (e.g., Claude, Google Antigravity, Codex) and their capabilities.
- `src/providers/*/`: Domain directories (e.g., `google-antigravity`, `claude`, `codex`, `cursor`) providing dedicated authentication models, oauth logic, validations, and credentials resolution.

## How it works
`auth-providers-suite` acts as an extraction of domain knowledge regarding how different LLM providers handle authentication, accounts, and quotas. It defines a taxonomy of providers (`ProviderId` and `ProviderFamily` like subscription, api-key, local, oauth) and a unified interface for resolving them (`resolveProvider`, `resolveAuthFromAccount`).

At runtime, orchestration extensions use `AccountRegistry` to store or list multiple user identities. By matching an account to the `PROVIDER_CATALOG`, consumer extensions can dynamically learn whether a provider supports multiple accounts, model discovery, or quota probes, and which auth preference to employ ("native-pi" vs "custom-suite").

The suite also incorporates dedicated logic for high-priority, complex providers. For example, `src/providers/claude/runtime.ts` defines operational profiles (e.g., `specialHeadersRequired`, `credentialReusePreferred`) essential for interacting smoothly with highly guarded or customized provider backends.

## Configuration
No runtime configuration or environment variable dependency is established directly in this foundational layer. Configuration mapping (such as Pi's `settings.json` integrations) is expected to be handled by consumer packages.

## Dependencies
This package relies entirely on Pi's core runtime.
- `@earendil-works/pi-coding-agent` (peer dependency)
