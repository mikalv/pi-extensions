export interface CursorAuthResult {
  accessToken: string;
  refreshToken: string;
}

export class CursorAuthApi {
  constructor(private readonly baseUrl: string) {}

  async poll(params: { uuid: string; verifier: string; signal?: AbortSignal }): Promise<CursorAuthResult> {
    const search = new URLSearchParams({ uuid: params.uuid, verifier: params.verifier });
    return this.fetchJson<CursorAuthResult>(`/auth/poll?${search.toString()}`, {
      headers: { "content-type": "application/json" },
      signal: params.signal,
      validator: isCursorAuthResult,
    });
  }

  async exchangeUserApiKey(params: { token: string; signal?: AbortSignal }): Promise<CursorAuthResult> {
    return this.fetchJson<CursorAuthResult>("/auth/exchange_user_api_key", {
      method: "POST",
      headers: {
        authorization: `Bearer ${params.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
      signal: params.signal,
      validator: isCursorAuthResult,
    });
  }

  private async fetchJson<T>(
    url: string,
    init: RequestInit & { validator: (data: unknown) => data is T },
  ): Promise<T> {
    const { validator, ...requestInit } = init;
    const response = await fetch(`${this.baseUrl}${url}`, requestInit);
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Fetch failed ${url} for ${response.status}: ${error}`);
    }
    const data = await response.json();
    if (!validator(data)) {
      throw new Error(`Fetch failed ${url} for invalid response: ${JSON.stringify(data)}`);
    }
    return data;
  }
}

function isCursorAuthResult(data: unknown): data is CursorAuthResult {
  return !!data && typeof data === "object" && "accessToken" in data && "refreshToken" in data;
}
