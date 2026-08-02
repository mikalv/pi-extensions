export interface CursorRunRequest {
  modelId: string;
  prompt: string;
}

export function buildCursorRunRequest(input: CursorRunRequest): CursorRunRequest {
  return input;
}
