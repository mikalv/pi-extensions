import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
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

function getKiloProviderModels() {
  return getCachedKiloModels().map((m) => ({
    id: m.id,
    name: m.name,
    reasoning: m.reasoning,
    input: m.input,
    cost: m.cost,
    contextWindow: m.contextWindow,
    maxTokens: m.maxTokens,
  }));
}

export default function piAuthExtension(pi: ExtensionAPI): void {
  const registerKiloProvider = () => {
    pi.registerProvider("kilo", {
      name: "Kilo",
      baseUrl: KILO_GATEWAY_BASE_URL,
      api: "openai-completions",
      models: getKiloProviderModels(),
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
          try {
            await updateCachedKiloModelsIfStale();
            registerKiloProvider();
          } catch {}
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
  };

  registerKiloProvider();

  pi.on("session_start", async (_event, ctx: any) => {
    try {
      const kiloToken = await ctx.modelRegistry?.getApiKeyForProvider?.("kilo");
      if (kiloToken) {
        await updateCachedKiloModelsIfStale();
        registerKiloProvider();
      }
    } catch {}
  });

  pi.on("session_switch", async (_event, ctx: any) => {
    try {
      const kiloToken = await ctx.modelRegistry?.getApiKeyForProvider?.("kilo");
      if (kiloToken) {
        await updateCachedKiloModelsIfStale();
        registerKiloProvider();
      }
    } catch {}
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
