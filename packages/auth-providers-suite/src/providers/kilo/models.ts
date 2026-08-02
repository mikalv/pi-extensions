import fs from "node:fs";
import { KILO_MODELS_URL, PI_KILO_CACHE_DIR, PI_KILO_MODELS_CACHE_FILE, PI_KILO_MODELS_CACHE_TTL_MS } from "./env.ts";

export interface KiloModel {
  id: string;
  name: string;
  context_length: number;
  architecture: {
    input_modalities: string[];
    output_modalities: string[];
  };
  pricing: {
    prompt?: string;
    completion?: string;
    input_cache_write?: string;
    input_cache_read?: string;
  };
  top_provider: {
    max_completion_tokens: number | null;
  };
  supported_parameters: string[];
}

export interface KiloModelsResponse {
  data: KiloModel[];
}

interface CachedModelsFile {
  data: KiloModelsResponse;
  lastUpdatedAt?: string;
}

function parsePrice(v: string | null | undefined): number {
  if (!v) return 0;
  const n = Number.parseFloat(v);
  return Number.isNaN(n) ? 0 : n;
}

function toMillionDollarRate(perToken: number): number {
  return perToken * 1_000_000;
}

function readCache(): CachedModelsFile | null {
  try {
    if (!fs.existsSync(PI_KILO_MODELS_CACHE_FILE)) return null;
    return JSON.parse(fs.readFileSync(PI_KILO_MODELS_CACHE_FILE, "utf8")) as CachedModelsFile;
  } catch {
    return null;
  }
}

function isCacheStale(cache: CachedModelsFile | null): boolean {
  if (!cache?.lastUpdatedAt) return true;
  const lastUpdatedAt = Date.parse(cache.lastUpdatedAt);
  return Number.isNaN(lastUpdatedAt) || Date.now() - lastUpdatedAt >= PI_KILO_MODELS_CACHE_TTL_MS;
}

export async function fetchKiloModels(): Promise<KiloModelsResponse> {
  const res = await fetch(KILO_MODELS_URL, {
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Kilo models fetch failed: ${res.status}`);
  return (await res.json()) as KiloModelsResponse;
}

export interface NormalizedKiloModel {
  id: string;
  name: string;
  reasoning: boolean;
  input: Array<"text" | "image">;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  contextWindow: number;
  maxTokens: number;
}

function toNormalizedKiloModel(m: KiloModel): NormalizedKiloModel {
  const supportsReasoning = m.supported_parameters?.includes("reasoning") ?? false;
  const supportsImage = m.architecture?.input_modalities?.includes("image") ?? false;
  const maxOut = m.top_provider?.max_completion_tokens ?? Math.ceil(m.context_length * 0.2);
  return {
    id: m.id,
    name: m.name,
    reasoning: supportsReasoning,
    input: supportsImage ? ["text", "image"] : ["text"],
    cost: {
      input: toMillionDollarRate(parsePrice(m.pricing?.prompt)),
      output: toMillionDollarRate(parsePrice(m.pricing?.completion)),
      cacheRead: toMillionDollarRate(parsePrice(m.pricing?.input_cache_read)),
      cacheWrite: toMillionDollarRate(parsePrice(m.pricing?.input_cache_write)),
    },
    contextWindow: m.context_length,
    maxTokens: maxOut ?? 8192,
  };
}

export function getCachedKiloModels(): NormalizedKiloModel[] {
  return (readCache()?.data.data ?? [])
    .filter((m) => {
      const out = m.architecture.output_modalities;
      return !(out.includes("image") && !out.includes("text"));
    })
    .map(toNormalizedKiloModel);
}

let updateInFlight: Promise<void> | null = null;

async function updateCachedKiloModels(): Promise<void> {
  const [data] = await Promise.all([
    fetchKiloModels(),
    fs.promises.mkdir(PI_KILO_CACHE_DIR, { recursive: true }),
  ]);
  const cache: CachedModelsFile = { data, lastUpdatedAt: new Date().toISOString() };
  await fs.promises.writeFile(PI_KILO_MODELS_CACHE_FILE, JSON.stringify(cache, null, 2));
}

export async function updateCachedKiloModelsIfStale(): Promise<NormalizedKiloModel[]> {
  if (updateInFlight) {
    await updateInFlight;
    return getCachedKiloModels();
  }
  if (!isCacheStale(readCache())) return getCachedKiloModels();
  updateInFlight = updateCachedKiloModels().finally(() => {
    updateInFlight = null;
  });
  try {
    await updateInFlight;
  } catch {}
  return getCachedKiloModels();
}
