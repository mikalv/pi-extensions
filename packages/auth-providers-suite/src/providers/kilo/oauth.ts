export interface OAuthCredentialsLike {
  refresh: string;
  access: string;
  expires: number;
  accountId?: string;
  email?: string;
  name?: string;
  [key: string]: unknown;
}

const KILO_API_BASE = "https://api.kilo.ai";
const KILO_DEVICE_AUTH_CODES_URL = `${KILO_API_BASE}/api/device-auth/codes`;
const KILO_PROFILE_URL = `${KILO_API_BASE}/api/profile`;
const KILO_POLL_INTERVAL_MS = 3000;
const KILO_TOKEN_TTL_MS = 365 * 24 * 60 * 60 * 1000;
const KILO_ORGANIZATION_HEADER = "X-KiloCode-OrganizationId";

interface DeviceAuthInitiateResponse {
  code: string;
  verificationUrl: string;
  expiresIn: number;
}

type DeviceAuthPollResponse =
  | { status: "pending" | "denied" | "expired" }
  | { status: "approved"; token: string; userEmail: string };

interface KiloOrganization {
  id: string;
  name: string;
  role: string;
}

interface KiloProfileResponse {
  user?: { email?: string; name?: string };
  email?: string;
  name?: string;
  organizations?: KiloOrganization[];
}

export interface KiloLoginCallbacksLike {
  signal?: AbortSignal;
  onAuth: (info: { url: string; instructions?: string }) => void;
  onProgress?: (message: string) => void;
  onPrompt: (input: { message: string; placeholder?: string; allowEmpty?: boolean }) => Promise<string>;
}

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Login cancelled"));
      return;
    }
    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timeout);
      reject(new Error("Login cancelled"));
    }, { once: true });
  });
}

async function fetchJson<T>(input: string, init?: RequestInit): Promise<{ response: Response; data: T }> {
  const response = await fetch(input, init);
  const data = (await response.json().catch(() => undefined)) as T;
  return { response, data };
}

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function getProfileEmail(profile: KiloProfileResponse, fallback?: string) {
  return profile.user?.email ?? profile.email ?? fallback;
}

function getProfileName(profile: KiloProfileResponse) {
  return profile.user?.name ?? profile.name;
}

function getOrganizationId(credentials: OAuthCredentialsLike): string | undefined {
  const value = credentials.accountId;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function toOAuthCredentials(input: {
  token: string;
  profile?: KiloProfileResponse;
  accountId?: string;
  fallbackEmail?: string;
}): OAuthCredentialsLike {
  return {
    refresh: input.token,
    access: input.token,
    expires: Date.now() + KILO_TOKEN_TTL_MS,
    accountId: input.accountId,
    email: input.profile ? getProfileEmail(input.profile, input.fallbackEmail) : input.fallbackEmail,
    name: input.profile ? getProfileName(input.profile) : undefined,
  };
}

async function initiateDeviceAuth(): Promise<DeviceAuthInitiateResponse> {
  const { response, data } = await fetchJson<DeviceAuthInitiateResponse>(KILO_DEVICE_AUTH_CODES_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) {
    if (response.status === 429) throw new Error("Too many pending authorization requests. Please try again later.");
    throw new Error(`Failed to initiate device authorization: ${response.status}`);
  }
  return data;
}

async function pollDeviceAuth(code: string): Promise<DeviceAuthPollResponse> {
  const { response, data } = await fetchJson<DeviceAuthPollResponse>(`${KILO_DEVICE_AUTH_CODES_URL}/${code}`);
  if (response.status === 202) return { status: "pending" };
  if (response.status === 403) return { status: "denied" };
  if (response.status === 410) return { status: "expired" };
  if (!response.ok) throw new Error(`Failed to poll device authorization: ${response.status}`);
  return data;
}

async function fetchProfile(token: string): Promise<KiloProfileResponse> {
  const { response, data } = await fetchJson<KiloProfileResponse>(KILO_PROFILE_URL, {
    headers: authHeaders(token),
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error("Invalid token");
    throw new Error(`Failed to fetch profile: ${response.status}`);
  }
  return data;
}

function formatOrganizationPrompt(organizations: KiloOrganization[]): string {
  const options = [
    "0. Personal Account",
    ...organizations.map((org, index) => `${index + 1}. ${org.name}`),
  ].join("\n");
  return `${options}\nEnter a number:`;
}

async function selectOrganization(
  organizations: KiloOrganization[] | undefined,
  callbacks: KiloLoginCallbacksLike,
): Promise<string | undefined> {
  if (!organizations?.length) return undefined;
  const response = (await callbacks.onPrompt({
    message: `Select account:\n${formatOrganizationPrompt(organizations)}`,
    placeholder: "0",
    allowEmpty: true,
  })).trim();
  if (response === "" || response === "0") return undefined;
  const index = Number.parseInt(response, 10);
  if (Number.isNaN(index) || index < 1 || index > organizations.length) return undefined;
  return organizations[index - 1]?.id;
}

async function waitForAuthorization(
  code: string,
  expiresIn: number,
  callbacks: KiloLoginCallbacksLike,
): Promise<Extract<DeviceAuthPollResponse, { status: "approved" }>> {
  const deadline = Date.now() + expiresIn * 1000;
  while (Date.now() < deadline) {
    if (callbacks.signal?.aborted) throw new Error("Login cancelled");
    const result = await pollDeviceAuth(code);
    if (result.status === "approved") return result;
    if (result.status === "denied") throw new Error("Authorization denied by user");
    if (result.status === "expired") throw new Error("Authorization code expired");
    callbacks.onProgress?.("Waiting for browser authorization...");
    await abortableSleep(KILO_POLL_INTERVAL_MS, callbacks.signal);
  }
  throw new Error("Authentication timed out. Please try again.");
}

export async function loginKilo(callbacks: KiloLoginCallbacksLike): Promise<OAuthCredentialsLike> {
  const authData = await initiateDeviceAuth();
  callbacks.onAuth({
    url: authData.verificationUrl,
    instructions: `Open ${authData.verificationUrl} and enter code: ${authData.code}`,
  });
  const result = await waitForAuthorization(authData.code, authData.expiresIn, callbacks);
  if (!result.token) throw new Error("Authentication failed: missing token");
  callbacks.onProgress?.(`Authenticated${result.userEmail ? ` as ${result.userEmail}` : ""}. Fetching profile...");
  const profile = await fetchProfile(result.token);
  const accountId = await selectOrganization(profile.organizations, callbacks);
  return toOAuthCredentials({
    token: result.token,
    profile,
    ...(accountId ? { accountId } : {}),
    ...(result.userEmail ? { fallbackEmail: result.userEmail } : {}),
  });
}

export async function refreshKiloToken(credentials: OAuthCredentialsLike): Promise<OAuthCredentialsLike> {
  const token = String(credentials.access);
  await fetchProfile(token);
  return {
    ...credentials,
    refresh: String(credentials.refresh || token),
    access: token,
    expires: Date.now() + KILO_TOKEN_TTL_MS,
  };
}

export function getKiloApiKey(credentials: OAuthCredentialsLike): string {
  return String(credentials.access);
}

export function modifyKiloModels<T extends { provider?: string; headers?: Record<string, string> }>(
  models: T[],
  credentials: OAuthCredentialsLike,
): T[] {
  const organizationId = getOrganizationId(credentials);
  if (!organizationId) return models;
  return models.map((model) => {
    if (model.provider !== "kilocode") return model;
    return {
      ...model,
      headers: {
        ...model.headers,
        [KILO_ORGANIZATION_HEADER]: organizationId,
      },
    };
  });
}
