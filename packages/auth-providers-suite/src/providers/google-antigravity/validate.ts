export function filterAvailableGoogleAntigravityModels<T extends { id: string }>(
  models: readonly T[],
  availableIds: ReadonlySet<string>,
): T[] {
  return models.filter((model) => availableIds.has(model.id));
}
