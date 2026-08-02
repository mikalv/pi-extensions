import type { AuthStrategyKind } from "./auth.ts";
import type { ProviderId } from "./provider.ts";

export interface AccountRecord {
  id: string;
  provider: ProviderId;
  label: string;
  authKind: AuthStrategyKind;
  enabled: boolean;
  baseUrl?: string;
  headers?: Record<string, string>;
  metadata?: Record<string, unknown>;
  lastValidatedAt?: number;
  status?: "ready" | "expired" | "invalid" | "unknown";
}
