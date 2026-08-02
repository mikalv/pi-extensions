export const GOOGLE_ANTIGRAVITY_DAILY_ENDPOINT = "https://daily-cloudcode-pa.googleapis.com";
export const GOOGLE_ANTIGRAVITY_SANDBOX_ENDPOINT = "https://daily-cloudcode-pa.sandbox.googleapis.com";
export const GOOGLE_ANTIGRAVITY_PROD_ENDPOINT = "https://cloudcode-pa.googleapis.com";

const DEFAULT_ANTIGRAVITY_VERSION = "1.104.0";

export function getGoogleAntigravityHeaders(): Record<string, string> {
  const version = process.env.PI_AI_ANTIGRAVITY_VERSION || DEFAULT_ANTIGRAVITY_VERSION;
  return {
    "User-Agent": `antigravity/${version} darwin/arm64`,
  };
}
