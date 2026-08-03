import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  loginCursor,
  refreshCursorCredentials,
} from "../../auth-providers-suite/src/providers/cursor/oauth.ts";
import {
  getCachedCursorModelIds,
} from "../../auth-providers-suite/src/providers/cursor/models.ts";
import {
  updateCursorModelCache,
} from "../../auth-providers-suite/src/providers/cursor/catalog.ts";
import {
  loginKilo,
  refreshKiloToken,
  getKiloApiKey,
} from "../../auth-providers-suite/src/providers/kilo/oauth.ts";
import {
  getCachedKiloModels,
  updateCachedKiloModelsIfStale,
} from "../../auth-providers-suite/src/providers/kilo/models.ts";
import { KILO_GATEWAY_BASE_URL } from "../../auth-providers-suite/src/providers/kilo/env.ts";
import {
  DEFAULT_GOOGLE_ANTIGRAVITY_OAUTH_CONFIG,
  startGoogleCallbackServer,
  buildGoogleOAuthUrl,
  generatePkcePair,
  exchangeGoogleAuthorizationCode,
  refreshGoogleAntigravityAccessToken,
  discoverGoogleAntigravityProject,
} from "../../auth-providers-suite/src/providers/google-antigravity/oauth.ts";
import {
  GOOGLE_ANTIGRAVITY_PROD_ENDPOINT,
  getGoogleAntigravityHeaders,
} from "../../auth-providers-suite/src/providers/google-antigravity/protocol.ts";
export default function piAuthExtension(pi: ExtensionAPI): void {
  // ── Cursor ──────────────────────────────────────────────────────────────────
  pi.registerProvider("cursor", {
    name: "Cursor",
    baseUrl: "https://api2.cursor.sh",
    api: "openai-completions",
    models: getCachedCursorModelIds().map((id) => ({
      id,
      name: id,
      reasoning: false,
      input: ["text" as const],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128_000,
      maxTokens: 16_384,
    })),
    oauth: {
      name: "Cursor",
      async login(callbacks) {
        let resolvedUrl = "";
        const creds = await loginCursor({
          onAuth: ({ url, instructions }) => {
            resolvedUrl = url;
            callbacks.onAuth({ url });
            if (instructions) callbacks.onProgress?.(instructions);
          },
          onProgress: (msg) => callbacks.onProgress?.(msg),
          signal: callbacks.signal,
        });
        // Refresh model cache after login
        try { await updateCursorModelCache(creds.access); } catch {}
        return {
          access: creds.access,
          refresh: creds.refresh,
          expires: creds.expires,
        };
      },
      async refreshToken(credentials) {
        const creds = await refreshCursorCredentials({
          access: credentials.access,
          refresh: credentials.refresh,
        });
        return {
          access: creds.access,
          refresh: creds.refresh,
          expires: creds.expires,
        };
      },
      getApiKey(credentials) {
        return credentials.access;
      },
    },
  });

  // ── Kilo ─────────────────────────────────────────────────────────────────────
  const kiloModels = getCachedKiloModels();
  pi.registerProvider("kilo", {
    name: "Kilo",
    baseUrl: KILO_GATEWAY_BASE_URL,
    api: "openai-completions",
    models: kiloModels.map((m) => ({
      id: m.id,
      name: m.name,
      reasoning: m.reasoning,
      input: m.input,
      cost: m.cost,
      contextWindow: m.contextWindow,
      maxTokens: m.maxTokens,
    })),
    oauth: {
      name: "Kilo",
      async login(callbacks) {
        const creds = await loginKilo({
          onAuth: ({ url, instructions }) => {
            callbacks.onAuth({ url });
            if (instructions) callbacks.onProgress?.(instructions);
          },
          onProgress: (msg) => callbacks.onProgress?.(msg),
          onPrompt: async ({ message }) => {
            return (await callbacks.onPrompt?.({ message })) ?? "";
          },
          signal: callbacks.signal,
        });
        // Refresh model cache after login
        try { await updateCachedKiloModelsIfStale(); } catch {}
        return {
          access: creds.access,
          refresh: creds.refresh,
          expires: creds.expires,
        };
      },
      async refreshToken(credentials) {
        const creds = await refreshKiloToken(credentials);
        return {
          access: creds.access,
          refresh: creds.refresh,
          expires: creds.expires,
        };
      },
      getApiKey(credentials) {
        return getKiloApiKey(credentials);
      },
    },
  });

  // ── Google Antigravity ───────────────────────────────────────────────────────
  pi.registerProvider("google-antigravity", {
    name: "Google Antigravity",
    baseUrl: GOOGLE_ANTIGRAVITY_PROD_ENDPOINT,
    api: "google-generative-ai",
    headers: getGoogleAntigravityHeaders(),
    models: [],
    oauth: {
      name: "Google Antigravity",
      async login(callbacks) {
        const config = DEFAULT_GOOGLE_ANTIGRAVITY_OAUTH_CONFIG;
        const { verifier, challenge } = generatePkcePair();
        const state = crypto.randomUUID();
        const url = buildGoogleOAuthUrl(config, verifier, challenge);

        // Start local callback server
        const serverInfo = await startGoogleCallbackServer(
          config.callbackPort,
          config.callbackPath,
          config.callbackOrigin,
        );
        callbacks.onAuth({ url });

        try {
          const result = await serverInfo.waitForCode();
          if (!result || result.kind !== "ok" || !result.code) {
            throw new Error("Google auth failed or was cancelled");
          }
          const tokens = await exchangeGoogleAuthorizationCode(config, result.code, verifier);

          // Try to discover project
          try {
            const discovered = await discoverGoogleAntigravityProject({ accessToken: tokens.accessToken });
            if (discovered.projectId) {
              callbacks.onProgress?.(`Discovered project: ${discovered.projectId}`);
            }
          } catch {}

          return {
            access: tokens.accessToken,
            refresh: tokens.refreshToken,
            expires: tokens.expiresAt,
          };
        } finally {
          serverInfo.cancelWait();
          serverInfo.server.close();
        }
      },
      async refreshToken(credentials) {
        const tokens = await refreshGoogleAntigravityAccessToken(
          DEFAULT_GOOGLE_ANTIGRAVITY_OAUTH_CONFIG,
          credentials.refresh,
        );
        return {
          access: tokens.accessToken,
          refresh: tokens.refreshToken,
          expires: tokens.expiresAt,
        };
      },
      getApiKey(credentials) {
        return credentials.access;
      },
    },
  });
}
