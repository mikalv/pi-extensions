import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { PrismConnection } from "./prism-client.js";

export const DEFAULT_BASE_URL = "http://127.0.0.1:3080";
export const DEFAULT_TIMEOUT_MS = 30_000;
export const LTM_MEMORIES_COLLECTION = "ltm-memories";
export const LTM_SESSIONS_COLLECTION = "ltm-sessions";

export interface MemoryConfig {
	connection: PrismConnection;
	memoriesCollection: string;
	sessionsCollection: string;
	/** When true, inject top-N Prism recall at session/agent start. Default false (OM cache-friendly). */
	injectOnStart: boolean;
	injectLimit: number;
	injectCollection: "memories" | "sessions" | "both";
	/** When true, index a session checkpoint into ltm-sessions before compaction. */
	checkpointOnCompact: boolean;
}

function agentDir(): string {
	const envDir = process.env.PI_CODING_AGENT_DIR?.trim();
	if (envDir) {
		if (envDir === "~") return homedir();
		if (envDir.startsWith("~/")) return join(homedir(), envDir.slice(2));
		return envDir;
	}
	return join(homedir(), ".pi", "agent");
}

export function mmMemoryConfigPath(): string {
	return join(agentDir(), "mm-memory.json");
}

export function prismConfigPath(): string {
	return join(agentDir(), "pi-prism.json");
}

function asNonEmptyString(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function asPositiveInt(value: unknown, fallback: number): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
		return fallback;
	}
	return Math.floor(value);
}

function normalizeBaseUrl(url: string): string {
	return url.replace(/\/+$/, "");
}

function loadPrismConnection(): PrismConnection {
	const envBaseUrl =
		asNonEmptyString(process.env.PRISM_URL) || asNonEmptyString(process.env.PRISM_BASE_URL);
	const envApiKey = asNonEmptyString(process.env.PRISM_API_KEY);
	const envTimeoutRaw = process.env.PRISM_TIMEOUT_MS
		? Number(process.env.PRISM_TIMEOUT_MS)
		: undefined;

	let fileBaseUrl: string | undefined;
	let fileApiKey: string | undefined;
	let fileTimeout: number | undefined;

	const path = prismConfigPath();
	if (existsSync(path)) {
		try {
			const parsed = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
			if (parsed.profiles && typeof parsed.profiles === "object" && !Array.isArray(parsed.profiles)) {
				const active =
					asNonEmptyString(parsed.activeProfile) ||
					"local";
				const profiles = parsed.profiles as Record<string, Record<string, unknown>>;
				const profile = profiles[active] ?? profiles.local;
				if (profile && typeof profile === "object") {
					fileBaseUrl = asNonEmptyString(profile.baseUrl);
					fileApiKey = asNonEmptyString(profile.apiKey);
					fileTimeout = asPositiveInt(profile.timeoutMs, DEFAULT_TIMEOUT_MS);
				}
			} else {
				fileBaseUrl = asNonEmptyString(parsed.baseUrl);
				fileApiKey = asNonEmptyString(parsed.apiKey);
				fileTimeout = asPositiveInt(parsed.timeoutMs, DEFAULT_TIMEOUT_MS);
			}
		} catch {
			// ignore malformed prism config
		}
	}

	return {
		baseUrl: normalizeBaseUrl(envBaseUrl || fileBaseUrl || DEFAULT_BASE_URL),
		timeoutMs: asPositiveInt(
			envTimeoutRaw !== undefined && Number.isFinite(envTimeoutRaw)
				? envTimeoutRaw
				: fileTimeout,
			DEFAULT_TIMEOUT_MS,
		),
		apiKey: envApiKey || fileApiKey,
	};
}

export function loadMemoryConfig(): MemoryConfig {
	const connection = loadPrismConnection();
	let memoriesCollection = LTM_MEMORIES_COLLECTION;
	let sessionsCollection = LTM_SESSIONS_COLLECTION;
	let injectOnStart = false;
	let injectLimit = 5;
	let injectCollection: MemoryConfig["injectCollection"] = "memories";
	let checkpointOnCompact = true;

	const path = mmMemoryConfigPath();
	if (existsSync(path)) {
		try {
			const parsed = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
			memoriesCollection =
				asNonEmptyString(parsed.memoriesCollection) || memoriesCollection;
			sessionsCollection =
				asNonEmptyString(parsed.sessionsCollection) || sessionsCollection;
			if (typeof parsed.injectOnStart === "boolean") injectOnStart = parsed.injectOnStart;
			injectLimit = asPositiveInt(parsed.injectLimit, injectLimit);
			const ic = asNonEmptyString(parsed.injectCollection);
			if (ic === "memories" || ic === "sessions" || ic === "both") injectCollection = ic;
			if (typeof parsed.checkpointOnCompact === "boolean") {
				checkpointOnCompact = parsed.checkpointOnCompact;
			}
		} catch {
			// ignore
		}
	}

	return {
		connection,
		memoriesCollection,
		sessionsCollection,
		injectOnStart,
		injectLimit,
		injectCollection,
		checkpointOnCompact,
	};
}

export function saveMemoryConfig(patch: Partial<Omit<MemoryConfig, "connection">>): void {
	const current = loadMemoryConfig();
	const next = {
		memoriesCollection: patch.memoriesCollection ?? current.memoriesCollection,
		sessionsCollection: patch.sessionsCollection ?? current.sessionsCollection,
		injectOnStart: patch.injectOnStart ?? current.injectOnStart,
		injectLimit: patch.injectLimit ?? current.injectLimit,
		injectCollection: patch.injectCollection ?? current.injectCollection,
		checkpointOnCompact: patch.checkpointOnCompact ?? current.checkpointOnCompact,
	};
	const path = mmMemoryConfigPath();
	mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
	writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
}

export function formatMemoryStatus(config: MemoryConfig): string {
	return [
		`prism: ${config.connection.baseUrl}`,
		`apiKey: ${config.connection.apiKey ? "(set)" : "(none)"}`,
		`memoriesCollection: ${config.memoriesCollection}`,
		`sessionsCollection: ${config.sessionsCollection}`,
		`injectOnStart: ${config.injectOnStart} (limit=${config.injectLimit}, collection=${config.injectCollection})`,
		`checkpointOnCompact: ${config.checkpointOnCompact}`,
		`configFile: ${mmMemoryConfigPath()}`,
		`prismConfig: ${prismConfigPath()}`,
		"",
		"Layer model: STM (observational) → wiki (mm-wiki) → Prism LTM (this package).",
		"Patterns: memory_mine (ingest), scoped recall (project/kind/tags), precompact checkpoint.",
	].join("\n");
}
