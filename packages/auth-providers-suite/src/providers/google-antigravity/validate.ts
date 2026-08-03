import {
  DEFAULT_GOOGLE_ANTIGRAVITY_OAUTH_CONFIG,
  type GoogleAntigravityOAuthConfig,
} from "./oauth.ts";

export function filterAvailableGoogleAntigravityModels<T extends { id: string }>(
  models: readonly T[],
  availableIds: ReadonlySet<string>,
): T[] {
  return models.filter((model) => availableIds.has(model.id));
}

export function getGoogleAntigravityOAuthProblems(
  config: GoogleAntigravityOAuthConfig = DEFAULT_GOOGLE_ANTIGRAVITY_OAUTH_CONFIG,
): string[] {
  const problems: string[] = [];
  if (!config.clientId) problems.push("missing clientId");
  if (!config.clientSecret) problems.push("missing clientSecret");
  if (!config.redirectUri) problems.push("missing redirectUri");
  return problems;
}

export function validateGoogleAntigravitySetup(
  config: GoogleAntigravityOAuthConfig = DEFAULT_GOOGLE_ANTIGRAVITY_OAUTH_CONFIG,
): void {
  const problems = getGoogleAntigravityOAuthProblems(config);
  if (problems.length > 0) {
    throw new Error(`Google Antigravity OAuth is not configured correctly: ${problems.join(", ")}`);
  }
}
