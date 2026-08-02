export type AuthStrategyKind =
  | "subscription"
  | "session"
  | "oauth"
  | "apiKey"
  | "local"
  | "none";

export interface AuthHeaders {
  [header: string]: string;
}

export interface ResolvedAuth {
  kind: AuthStrategyKind;
  headers?: AuthHeaders;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  apiKey?: string;
  diagnostic?: string;
}
