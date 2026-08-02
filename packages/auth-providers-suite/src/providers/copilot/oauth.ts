export interface CopilotOAuthCredentialLike {
  access: string;
  refresh?: string;
  expires?: number;
  enterpriseUrl?: string;
  availableModelIds?: string[];
  [key: string]: unknown;
}

export interface CopilotRuntimeAuth {
  apiKey: string;
  baseUrl?: string;
}

export function parseCopilotAccessMetadata(accessToken: string): Record<string, string> {
  return accessToken
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, part) => {
      const [key, ...rest] = part.split("=");
      if (!key || rest.length === 0) return acc;
      acc[key.trim()] = rest.join("=").trim();
      return acc;
    }, {});
}

export function deriveCopilotBaseUrl(credential: CopilotOAuthCredentialLike): string | undefined {
  const meta = parseCopilotAccessMetadata(credential.access);
  const proxyEndpoint = meta["proxy-ep"];
  if (proxyEndpoint) return `https://api.${proxyEndpoint}`;
  if (typeof credential.enterpriseUrl === "string" && credential.enterpriseUrl.length > 0) {
    return `https://api.${credential.enterpriseUrl.replace(/^https?:\/\//, "")}`;
  }
  return undefined;
}

export function copilotCredentialToRuntimeAuth(
  credential: CopilotOAuthCredentialLike,
): CopilotRuntimeAuth {
  return {
    apiKey: credential.access,
    ...(deriveCopilotBaseUrl(credential) ? { baseUrl: deriveCopilotBaseUrl(credential) } : {}),
  };
}
