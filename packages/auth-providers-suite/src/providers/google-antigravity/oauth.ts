import { createHash, randomBytes } from "node:crypto";
import type { Server } from "node:http";
import {
  GOOGLE_ANTIGRAVITY_PROD_ENDPOINT,
  GOOGLE_ANTIGRAVITY_SANDBOX_ENDPOINT,
} from "./protocol.ts";
import {
  ANTIGRAVITY_CLIENT_ID,
  ANTIGRAVITY_CLIENT_SECRET,
} from "./vendor/credentials.ts";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;
const DEFAULT_LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

export interface GoogleAntigravityOAuthConfig {
  callbackPort: number;
  callbackPath: string;
  callbackOrigin: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
  scopes: string[];
}

export interface GoogleAntigravityOAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  email?: string;
  projectId?: string;
  availableModelIds?: string[];
}

export interface CallbackWaitResult {
  kind: "ok" | "error";
  code?: string;
  state?: string;
  error?: string;
}

export interface CallbackServerInfo {
  server: Server;
  cancelWait: () => void;
  waitForCode: () => Promise<CallbackWaitResult | null>;
}

export interface GoogleAntigravityLoginCallbacksLike {
  onAuth: (info: { url: string; instructions?: string }) => void;
  onProgress?: (message: string) => void;
  onManualCodeInput?: () => Promise<string>;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export const DEFAULT_GOOGLE_ANTIGRAVITY_OAUTH_CONFIG: GoogleAntigravityOAuthConfig = {
  callbackPort: 51121,
  callbackPath: "/oauth-callback",
  callbackOrigin: "http://localhost:51121",
  redirectUri: "http://localhost:51121/oauth-callback",
  clientId: process.env.GOOGLE_ANTIGRAVITY_CLIENT_ID || ANTIGRAVITY_CLIENT_ID,
  clientSecret: process.env.GOOGLE_ANTIGRAVITY_CLIENT_SECRET || ANTIGRAVITY_CLIENT_SECRET,
  scopes: [
    "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/cclog",
    "https://www.googleapis.com/auth/experimentsandconfigs",
  ],
};

export async function getNodeCreateServer(): Promise<typeof import("node:http").createServer> {
  const mod = await import("node:http");
  return mod.createServer;
}

export function generatePkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

function matchesCallbackPath(pathname: string, callbackPath: string): boolean {
  return pathname === callbackPath || pathname === `${callbackPath}/`;
}

export async function startGoogleCallbackServer(
  port: number,
  callbackPath: string,
  callbackOrigin: string,
): Promise<CallbackServerInfo> {
  const createServer = await getNodeCreateServer();
  return new Promise((resolve, reject) => {
    let settleWait: ((value: CallbackWaitResult | null) => void) | undefined;
    const waitForCodePromise = new Promise<CallbackWaitResult | null>((resolveWait) => {
      let settled = false;
      settleWait = (value) => {
        if (settled) return;
        settled = true;
        resolveWait(value);
      };
    });

    const server = createServer((req, res) => {
      const url = new URL(req.url || "", callbackOrigin);
      if (!matchesCallbackPath(url.pathname, callbackPath)) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Callback route not found.");
        return;
      }

      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");
      if (error) {
        res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(`Google authentication failed: ${error}`);
        settleWait?.({ kind: "error", error });
        return;
      }
      if (code && state) {
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Google authentication completed. You can close this window.");
        settleWait?.({ kind: "ok", code, state });
        return;
      }
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Missing code or state parameter.");
    });

    server.on("error", reject);
    server.listen(port, process.env.PI_OAUTH_CALLBACK_HOST, () => {
      resolve({
        server,
        cancelWait: () => settleWait?.(null),
        waitForCode: () => waitForCodePromise,
      });
    });
  });
}

export function validateGoogleAntigravityOAuthConfig(config: GoogleAntigravityOAuthConfig): void {
  if (!config.clientId) {
    throw new Error("Google Antigravity OAuth is missing clientId");
  }
  if (!config.clientSecret) {
    throw new Error("Google Antigravity OAuth is missing clientSecret");
  }
}

export function buildGoogleOAuthUrl(config: GoogleAntigravityOAuthConfig, verifier: string, challenge: string): string {
  validateGoogleAntigravityOAuthConfig(config);
  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: "code",
    redirect_uri: config.redirectUri,
    scope: config.scopes.join(" "),
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: verifier,
    access_type: "offline",
    prompt: "consent",
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export function parseRedirectUrl(input: string): { code?: string; state?: string } {
  const value = input.trim();
  if (!value) return {};
  try {
    const url = new URL(value, "http://localhost/");
    return {
      code: url.searchParams.get("code") ?? undefined,
      state: url.searchParams.get("state") ?? undefined,
    };
  } catch {
    return {};
  }
}

export async function exchangeGoogleAuthorizationCode(
  config: GoogleAntigravityOAuthConfig,
  code: string,
  verifier: string,
): Promise<GoogleAntigravityOAuthTokens> {
  validateGoogleAntigravityOAuthConfig(config);
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: config.redirectUri,
      code_verifier: verifier,
    }),
  });
  if (!response.ok) {
    throw new Error(`Google token exchange failed: ${await response.text()}`);
  }

  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!data.access_token || !data.refresh_token || !data.expires_in) {
    throw new Error("Google token exchange returned incomplete credentials");
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000 - EXPIRY_BUFFER_MS,
  };
}

export async function refreshGoogleAntigravityAccessToken(
  config: GoogleAntigravityOAuthConfig,
  refreshToken: string,
  projectId?: string,
): Promise<GoogleAntigravityOAuthTokens> {
  validateGoogleAntigravityOAuthConfig(config);
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) {
    throw new Error(`Google Antigravity token refresh failed: ${await response.text()}`);
  }

  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!data.access_token || !data.expires_in) {
    throw new Error("Google Antigravity token refresh returned incomplete credentials");
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000 - EXPIRY_BUFFER_MS,
    ...(projectId ? { projectId } : {}),
  };
}

export async function getGoogleUserEmail(accessToken: string): Promise<string | undefined> {
  try {
    const response = await fetch("https://www.googleapis.com/oauth2/v1/userinfo?alt=json", {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return undefined;
    const data = (await response.json()) as { email?: string };
    return typeof data.email === "string" ? data.email : undefined;
  } catch {
    return undefined;
  }
}

function abortError(message: string): Error {
  return new Error(message);
}

function waitForAbort(signal: AbortSignal | undefined, message = "Login cancelled"): Promise<never> {
  return new Promise((_, reject) => {
    if (signal?.aborted) {
      reject(abortError(message));
      return;
    }
    signal?.addEventListener("abort", () => reject(abortError(message)), { once: true });
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function waitForGoogleAuthorization(
  serverInfo: CallbackServerInfo,
  verifier: string,
  callbacks: GoogleAntigravityLoginCallbacksLike,
): Promise<string> {
  let manualInput: string | undefined;
  let manualError: Error | undefined;
  const manualPromise = callbacks.onManualCodeInput
    ? callbacks.onManualCodeInput()
        .then((value) => {
          manualInput = value;
          serverInfo.cancelWait();
        })
        .catch((error) => {
          manualError = error instanceof Error ? error : new Error(String(error));
          serverInfo.cancelWait();
        })
    : undefined;

  const callbackPromise = serverInfo.waitForCode();
  const raced = await withTimeout(
    Promise.race([
      callbackPromise,
      ...(callbacks.signal ? [waitForAbort(callbacks.signal)] : []),
    ]),
    callbacks.timeoutMs ?? DEFAULT_LOGIN_TIMEOUT_MS,
    "Google Antigravity login timed out",
  );

  if (raced !== null) {
    if (raced.kind === "error") {
      throw new Error(`Google authentication failed: ${raced.error}`);
    }
    if (raced.state !== verifier) {
      throw new Error("OAuth state mismatch - possible CSRF attack");
    }
    return raced.code || "";
  }

  if (manualPromise) {
    await manualPromise.catch(() => {});
  }
  if (manualError) throw manualError;
  if (!manualInput) throw new Error("Google authentication cancelled");
  const parsed = parseRedirectUrl(manualInput);
  if (parsed.state && parsed.state !== verifier) {
    throw new Error("OAuth state mismatch - possible CSRF attack");
  }
  if (!parsed.code) {
    throw new Error("No authorization code received");
  }
  return parsed.code;
}

export async function loginGoogleAntigravity(
  callbacks: GoogleAntigravityLoginCallbacksLike,
  config: GoogleAntigravityOAuthConfig = DEFAULT_GOOGLE_ANTIGRAVITY_OAUTH_CONFIG,
): Promise<GoogleAntigravityOAuthTokens> {
  validateGoogleAntigravityOAuthConfig(config);
  const { verifier, challenge } = generatePkcePair();
  const serverInfo = await startGoogleCallbackServer(config.callbackPort, config.callbackPath, config.callbackOrigin);
  try {
    const url = buildGoogleOAuthUrl(config, verifier, challenge);
    callbacks.onAuth({
      url,
      instructions: "Complete Google sign-in in your browser, or paste the redirect URL to finish manually.",
    });
    callbacks.onProgress?.("Waiting for Google authentication...");
    const code = await waitForGoogleAuthorization(serverInfo, verifier, callbacks);
    callbacks.onProgress?.("Exchanging Google authorization code...");
    const tokens = await exchangeGoogleAuthorizationCode(config, code, verifier);
    callbacks.onProgress?.("Fetching Google account email...");
    tokens.email = await getGoogleUserEmail(tokens.accessToken);
    callbacks.onProgress?.("Resolving Antigravity project...");
    tokens.projectId = await discoverGoogleAntigravityProject(tokens.accessToken, callbacks.onProgress);
    return tokens;
  } finally {
    serverInfo.cancelWait();
    await new Promise((resolve) => serverInfo.server.close(() => resolve(undefined)));
  }
}

function readProjectId(value: string | { id?: string } | undefined): string | undefined {
  if (typeof value === "string" && value.length > 0) return value;
  if (value && typeof value === "object" && typeof value.id === "string" && value.id.length > 0) return value.id;
  return undefined;
}

export async function discoverGoogleAntigravityProject(
  accessToken: string,
  onProgress?: (message: string) => void,
): Promise<string> {
  const envProjectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT_ID;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "User-Agent": "google-api-nodejs-client/9.15.1",
    "X-Goog-Api-Client": "google-cloud-sdk vscode_cloudshelleditor/0.1",
    "Client-Metadata": JSON.stringify({
      ideType: "IDE_UNSPECIFIED",
      platform: "PLATFORM_UNSPECIFIED",
      pluginType: "GEMINI",
    }),
  };

  onProgress?.("Checking for existing project...");
  for (const endpoint of [GOOGLE_ANTIGRAVITY_PROD_ENDPOINT, GOOGLE_ANTIGRAVITY_SANDBOX_ENDPOINT]) {
    try {
      const response = await fetch(`${endpoint}/v1internal:loadCodeAssist`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          cloudaicompanionProject: envProjectId,
          metadata: {
            ideType: "IDE_UNSPECIFIED",
            platform: "PLATFORM_UNSPECIFIED",
            pluginType: "GEMINI",
            duetProject: envProjectId,
          },
        }),
      });
      if (!response.ok) continue;
      const data = (await response.json()) as { cloudaicompanionProject?: string | { id?: string } };
      const projectId = readProjectId(data.cloudaicompanionProject);
      if (projectId) return projectId;
    } catch {
      // try next endpoint
    }
  }

  if (envProjectId) {
    onProgress?.("Using GOOGLE_CLOUD_PROJECT...");
    return envProjectId;
  }

  onProgress?.("Using default project...");
  return "rising-fact-p41fc";
}
