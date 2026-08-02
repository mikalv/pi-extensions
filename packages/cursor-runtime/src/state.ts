export interface CursorRuntimeState {
  currentSessionId?: string | null;
  lastContextSeenAt?: number;
}

export function createCursorRuntimeState(): CursorRuntimeState {
  return { currentSessionId: null };
}
