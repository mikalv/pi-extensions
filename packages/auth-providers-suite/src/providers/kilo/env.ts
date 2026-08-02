import os from "node:os";
import path from "node:path";

export const KILO_API_BASE = "https://api.kilo.ai";
export const KILO_GATEWAY_BASE_URL = `${KILO_API_BASE}/api/openrouter`;
export const KILO_MODELS_URL = `${KILO_API_BASE}/api/gateway/models`;

const PI_CODING_AGENT_DIR = process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), ".pi", "agent");

export const PI_KILO_CACHE_DIR = path.join(PI_CODING_AGENT_DIR, "cache", "auth-providers-suite", "kilo");
export const PI_KILO_MODELS_CACHE_FILE = path.join(PI_KILO_CACHE_DIR, "models.json");
export const PI_KILO_MODELS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
