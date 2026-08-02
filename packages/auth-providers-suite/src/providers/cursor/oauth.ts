import { createHash, randomBytes, randomUUID } from "node:crypto";
import { CursorAuthApi } from "./api.ts";
import { cursorBackoff } from "./backoff.ts";
import { CURSOR_API_URL, CURSOR_WEBSITE_URL } from "./env.ts";

export interface CursorOAuthCredentials {
  access: string;
  refresh: string;
  expires: number;
}

export interface CursorLoginCallbacksLike {
  onAuth: (info: { url: string; instructions: string }) => void;
  onProgress?: (message: string) => void;
  signal?: AbortSignal;
}

export function base64UrlEncode(buffer: Buffer): string {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export function getCursorTokenExpiry(token: string): number {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return Date.now() + 3600 * 1000;
    const payload = JSON.parse(Buffer.from(parts[1] || "", "base64").toString("utf8")) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp * 1000 - 5 * 60 * 1000 : Date.now() + 3600 * 1000;
  } catch {
    return Date.now() + 3600 * 1000;
  }
}

export function buildCursorLoginParams() {
  const verifier = base64UrlEncode(randomBytes(32));
  const challenge = base64UrlEncode(createHash("sha256").update(verifier).digest());
  const uuid = randomUUID();
  const loginUrl = `${CURSOR_WEBSITE_URL}/loginDeepControl?challenge=${challenge}&uuid=${uuid}&mode=login&redirectTarget=cli`;
  return { verifier, challenge, uuid, loginUrl };
}

export async function loginCursor(callbacks: CursorLoginCallbacksLike): Promise<CursorOAuthCredentials> {
  const api = new CursorAuthApi(CURSOR_API_URL);
  const { uuid, verifier, loginUrl } = buildCursorLoginParams();
  callbacks.onAuth({ url: loginUrl, instructions: "Complete the sign-in in your browser." });
  return cursorBackoff(
    async () => {
      callbacks.onProgress?.("Polling authentication status...");
      const tokens = await api.poll({ uuid, verifier, signal: callbacks.signal });
      return {
        access: tokens.accessToken,
        refresh: tokens.refreshToken,
        expires: getCursorTokenExpiry(tokens.accessToken),
      };
    },
    {
      retries: 150,
      delay: 1000,
      shouldRetry: (error) =>
        error instanceof Error && error.message.includes("/auth/poll") && error.message.includes("404"),
    },
  );
}

export async function refreshCursorCredentials(credentials: {
  access: string;
  refresh: string;
}): Promise<CursorOAuthCredentials> {
  const api = new CursorAuthApi(CURSOR_API_URL);
  if (!credentials.access && !credentials.refresh) throw new Error("No credentials provided");
  try {
    const { accessToken, refreshToken } = await api.exchangeUserApiKey({
      token: credentials.refresh || credentials.access,
    });
    return {
      access: accessToken,
      refresh: refreshToken,
      expires: getCursorTokenExpiry(accessToken),
    };
  } catch {
    if (credentials.access && credentials.refresh) {
      return refreshCursorCredentials({ access: credentials.access, refresh: "" });
    }
    throw new Error("Failed to refresh Cursor credentials");
  }
}
