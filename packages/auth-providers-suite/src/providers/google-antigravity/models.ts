export const GOOGLE_ANTIGRAVITY_LOGICAL_MODELS = [
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.1-pro",
  "claude-sonnet-4-6",
  "claude-opus-4-6",
  "gpt-oss-120b",
] as const;

export type GoogleAntigravityLogicalModel = (typeof GOOGLE_ANTIGRAVITY_LOGICAL_MODELS)[number];
