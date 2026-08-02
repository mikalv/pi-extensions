export interface ClaudeRuntimeProfile {
  specialHeadersRequired: boolean;
  billingCompatibilityRequired: boolean;
  conservativeMode: boolean;
  credentialReusePreferred: boolean;
  multiAccountSupported: boolean;
}

export const CLAUDE_RUNTIME_PROFILE: ClaudeRuntimeProfile = {
  specialHeadersRequired: true,
  billingCompatibilityRequired: true,
  conservativeMode: true,
  credentialReusePreferred: true,
  multiAccountSupported: true,
};
