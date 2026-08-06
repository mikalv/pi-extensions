# pi-auth-extension

**Purpose:** Registers Kilo and Google Antigravity (and conceptually Cursor) providers in Pi via OAuth flows provided by the `auth-providers-suite`.

## Tools / Commands / Hooks Provided

- **Provider Registration:** Registers `kilo` and `google-antigravity` AI model providers into Pi.
- **Event Subscriptions (Hooks):**
  - `session_start`: Triggers a background update of the cached Kilo model list if a valid Kilo API key exists in the model registry.
  - `session_switch`: Same as `session_start`, ensures Kilo models are updated when switching sessions.

## Key Files

- `src/index.ts`: The sole entry point for the extension. It configures and registers the Kilo and Google Antigravity providers, wiring up their OAuth login and refresh flows.

## How it Works

The extension acts as the Pi-facing integration layer for OAuth-based AI model providers. Instead of implementing OAuth locally, it delegates the heavy lifting to the `auth-providers-suite` package.

1. **Kilo Integration:** It registers Kilo using the `openai-completions` API format and dynamically fetches its available models. It hooks into Pi's lifecycle events (`session_start` and `session_switch`) to update the cached model list seamlessly when the user is logged in.
2. **Google Antigravity Integration:** It sets up a PKCE-based OAuth flow by spawning a temporary local callback server to intercept the Google login redirect. After receiving the authorization code, it exchanges it for access tokens and attempts to discover the user's Google Cloud project. It registers with the `google-generative-ai` API format.

## Configuration

This extension itself does not read configuration keys, environment variables, or `settings.json` entries directly. Instead, it imports hardcoded endpoints and OAuth configuration defaults from the `auth-providers-suite` (such as `KILO_GATEWAY_BASE_URL`, `DEFAULT_GOOGLE_ANTIGRAVITY_OAUTH_CONFIG`, and `GOOGLE_ANTIGRAVITY_PROD_ENDPOINT`).

## Dependencies

- **Peer Dependencies:** `@earendil-works/pi-coding-agent` (Pi Extension API)
- **Internal Dependencies:** Highly coupled with the local `auth-providers-suite` package, which provides the underlying OAuth flows, model fetching, and caching logic.
