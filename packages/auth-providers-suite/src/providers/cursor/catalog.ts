import { CURSOR_API_URL, CURSOR_CLIENT_VERSION } from "./env.ts";
import { writeCursorModelCache, type CursorUsableModelsResponse } from "./models.ts";

export async function fetchCursorUsableModels(accessToken: string): Promise<CursorUsableModelsResponse> {
  const response = await fetch(`${CURSOR_API_URL}/aiserver.v1.AiService/GetUsableModels`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "x-cursor-client-type": "cli",
      "x-cursor-client-version": CURSOR_CLIENT_VERSION,
      "x-ghost-mode": "true",
      "x-request-id": crypto.randomUUID(),
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    throw new Error(`Cursor usable models fetch failed: ${response.status}`);
  }

  const data = (await response.json()) as CursorUsableModelsResponse;
  return data;
}

export async function updateCursorModelCache(accessToken: string): Promise<CursorUsableModelsResponse> {
  const response = await fetchCursorUsableModels(accessToken);
  await writeCursorModelCache(response);
  return response;
}
