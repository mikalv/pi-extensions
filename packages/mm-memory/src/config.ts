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
	/** When true, inject top-N Prism recall at session/agent start. Default true (pre-flight memory recall). */
	injectOnStart: boolean;
	injectLimit: number;
	injectCollection: "memories" | "sessions" | "both";
	/** When true, index a session checkpoint into ltm-sessions before compaction. */
	checkpointOnCompact: boolean;
	/**
	 * When true, sync a rolling session summary into ltm-sessions on agent_end
	 * (debounced) and hard-flush on compact/switch/shutdown. Pattern from nmem.
	 */
	ambientSync: boolean;
	/**
	 * Data Governance / Privacy isolation:
	 * When set, only sessions running with these providers can read/write/inject from this config's collections.
	 * If localOnly=true is set, defaults to ["vllm-local", "gemma4-local", "ollama", "local", "vllm", "llama.cpp", "lmstudio"].
	 */
	allowedProviders?: string[];
	/** Shorthand for restricting to local-only providers */
	localOnly?: boolean;
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

export function mmMemoryConfigPath(cwd?: string): string {
	if (cwd) {
		const projectConfig = join(cwd, ".pi", "mm-memory.json");
		if (existsSync(projectConfig)) return projectConfig;
		const projectRootConfig = join(cwd, ".mm-memory.json");
		if (existsSync(projectRootConfig)) return projectRootConfig;
	}
	return join(agentDir(), "mm-memory.json");
}

export function prismConfigPath(cwd?: string): string {
	if (cwd) {
		const projectPrism = join(cwd, ".pi", "pi-prism.json");
		if (existsSync(projectPrism)) return projectPrism;
		const projectRootPrism = join(cwd, ".pi-prism.json");
		if (existsSync(projectRootPrism)) return projectRootPrism;
	}
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

function loadPrismConnection(cwd?: string): PrismConnection {
	const envBaseUrl =
		asNonEmptyString(process.env.PRISM_URL) || asNonEmptyString(process.env.PRISM_BASE_URL);
	const envApiKey = asNonEmptyString(process.env.PRISM_API_KEY);
	const envTimeoutRaw = process.env.PRISM_TIMEOUT_MS
		? Number(process.env.PRISM_TIMEOUT_MS)
		: undefined;

	let fileBaseUrl: string | undefined;
	let fileApiKey: string | undefined;
	let fileTimeout: number | undefined;

	const path = prismConfigPath(cwd);
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

export const DEFAULT_LOCAL_PROVIDERS = [
	"vllm-local",
	"gemma4-local",
	"ollama",
	"local",
	"vllm",
	"llama.cpp",
	"lmstudio",
];

export function isProviderAllowed(
	currentProvider: string | undefined,
	config: MemoryConfig,
): { allowed: boolean; reason?: string } {
	let effectiveAllowed = config.allowedProviders;
	if (config.localOnly) {
		effectiveAllowed = effectiveAllowed
			? [...effectiveAllowed, ...DEFAULT_LOCAL_PROVIDERS]
			: DEFAULT_LOCAL_PROVIDERS;
	}

	if (!effectiveAllowed || effectiveAllowed.length === 0) {
		return { allowed: true };
	}

	const provider = (currentProvider ?? "").trim().toLowerCase();
	if (!provider) {
		return {
			allowed: false,
			reason: `Provider not identified. Allowed local providers: [${effectiveAllowed.join(", ")}]`,
		};
	}

	const isMatch = effectiveAllowed.some((p) => p.trim().toLowerCase() === provider);
	if (!isMatch) {
		return {
			allowed: false,
			reason: `Provider '${provider}' is NOT permitted to access collection '${config.memoriesCollection}'. Allowed providers: [${effectiveAllowed.join(", ")}]`,
		};
	}

	return { allowed: true };
}

export function loadMemoryConfig(cwd?: string): MemoryConfig {
	const connection = loadPrismConnection(cwd);
	let memoriesCollection = LTM_MEMORIES_COLLECTION;
	let sessionsCollection = LTM_SESSIONS_COLLECTION;
	let injectOnStart = true;
	let injectLimit = 5;
	let injectCollection: MemoryConfig["injectCollection"] = "memories";
	let checkpointOnCompact = true;
	let ambientSync = true;
	let allowedProviders: string[] | undefined;
	let localOnly: boolean | undefined;

	// 1. Global config (~/.pi/agent/mm-memory.json)
	const globalPath = join(agentDir(), "mm-memory.json");
	if (existsSync(globalPath)) {
		try {
			const parsed = JSON.parse(readFileSync(globalPath, "utf8")) as Record<string, unknown>;
			memoriesCollection = asNonEmptyString(parsed.memoriesCollection) || memoriesCollection;
			sessionsCollection = asNonEmptyString(parsed.sessionsCollection) || sessionsCollection;
			if (typeof parsed.injectOnStart === "boolean") injectOnStart = parsed.injectOnStart;
			injectLimit = asPositiveInt(parsed.injectLimit, injectLimit);
			const ic = asNonEmptyString(parsed.injectCollection);
			if (ic === "memories" || ic === "sessions" || ic === "both") injectCollection = ic;
			if (typeof parsed.checkpointOnCompact === "boolean") checkpointOnCompact = parsed.checkpointOnCompact;
			if (typeof parsed.ambientSync === "boolean") ambientSync = parsed.ambientSync;
			if (Array.isArray(parsed.allowedProviders)) {
				allowedProviders = parsed.allowedProviders.filter((p): p is string => typeof p === "string");
			}
			if (typeof parsed.localOnly === "boolean") localOnly = parsed.localOnly;
		} catch {
			// ignore
		}
	}

	// 2. Project config override (.pi/mm-memory.json or .mm-memory.json)
	if (cwd) {
		const projectConfigPath = mmMemoryConfigPath(cwd);
		if (projectConfigPath !== globalPath && existsSync(projectConfigPath)) {
			try {
				const parsed = JSON.parse(readFileSync(projectConfigPath, "utf8")) as Record<string, unknown>;
				memoriesCollection = asNonEmptyString(parsed.memoriesCollection) || memoriesCollection;
				sessionsCollection = asNonEmptyString(parsed.sessionsCollection) || sessionsCollection;
				if (typeof parsed.injectOnStart === "boolean") injectOnStart = parsed.injectOnStart;
				injectLimit = asPositiveInt(parsed.injectLimit, injectLimit);
				const ic = asNonEmptyString(parsed.injectCollection);
				if (ic === "memories" || ic === "sessions" || ic === "both") injectCollection = ic;
				if (typeof parsed.checkpointOnCompact === "boolean") checkpointOnCompact = parsed.checkpointOnCompact;
				if (typeof parsed.ambientSync === "boolean") ambientSync = parsed.ambientSync;
				if (Array.isArray(parsed.allowedProviders)) {
					allowedProviders = parsed.allowedProviders.filter((p): p is string => typeof p === "string");
				}
				if (typeof parsed.localOnly === "boolean") localOnly = parsed.localOnly;
			} catch {
				// ignore
			}
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
		ambientSync,
		allowedProviders,
		localOnly,
	};
}

export function saveMemoryConfig(patch: Partial<Omit<MemoryConfig, "connection">>, cwd?: string): void {
	const current = loadMemoryConfig(cwd);
	const next: Record<string, unknown> = {
		memoriesCollection: patch.memoriesCollection ?? current.memoriesCollection,
		sessionsCollection: patch.sessionsCollection ?? current.sessionsCollection,
		injectOnStart: patch.injectOnStart ?? current.injectOnStart,
		injectLimit: patch.injectLimit ?? current.injectLimit,
		injectCollection: patch.injectCollection ?? current.injectCollection,
		checkpointOnCompact: patch.checkpointOnCompact ?? current.checkpointOnCompact,
		ambientSync: patch.ambientSync ?? current.ambientSync,
	};
	if (patch.allowedProviders !== undefined) next.allowedProviders = patch.allowedProviders;
	if (patch.localOnly !== undefined) next.localOnly = patch.localOnly;

	const path = mmMemoryConfigPath(cwd);
	mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
	writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
}

export function formatMemoryStatus(config: MemoryConfig, cwd?: string): string {
	const restriction = config.localOnly
		? "localOnly: true (only local providers allowed)"
		: config.allowedProviders && config.allowedProviders.length > 0
			? `allowedProviders: [${config.allowedProviders.join(", ")}]`
			: "allowedProviders: (all / unrestricted)";

	return [
		`prism: ${config.connection.baseUrl}`,
		`apiKey: ${config.connection.apiKey ? "(set)" : "(none)"}`,
		`memoriesCollection: ${config.memoriesCollection}`,
		`sessionsCollection: ${config.sessionsCollection}`,
		`injectOnStart: ${config.injectOnStart} (limit=${config.injectLimit}, collection=${config.injectCollection})`,
		`checkpointOnCompact: ${config.checkpointOnCompact}`,
		`ambientSync: ${config.ambientSync}`,
		`securityPolicy: ${restriction}`,
		`configFile: ${mmMemoryConfigPath(cwd)}`,
		`prismConfig: ${prismConfigPath(cwd)}`,
		"",
		"Layer model: STM (observational) → wiki (mm-wiki) → Prism LTM (this package).",
		"Patterns: mine, scoped recall, precompact checkpoint, ambient session sync (from nmem).",
	].join("\n");
}
