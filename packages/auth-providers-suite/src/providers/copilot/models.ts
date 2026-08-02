export interface CopilotModelLike {
  id: string;
  provider?: string;
}

export function filterCopilotAvailableModels<T extends CopilotModelLike>(
  models: readonly T[],
  availableModelIds: readonly string[] | undefined,
): T[] {
  if (!availableModelIds || availableModelIds.length === 0) return [...models];
  const allowed = new Set(availableModelIds);
  return models.filter((model) => model.provider !== "github-copilot" || allowed.has(model.id));
}
