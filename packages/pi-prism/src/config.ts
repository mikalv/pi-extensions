import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

export interface PrismProfile {
	baseUrl: string;
	timeoutMs?: number;
	defaultCollection?: string;
	apiKey?: string;
}

export interface PrismStoredConfig {
	activeProfile: string;
	profiles: Record<string, PrismProfile>;
}

export interface PrismRuntimeConfig {
	baseUrl: string;
	timeoutMs: number;
	defaultCollection?: string;
	apiKey?: string;
	activeProfile: string;
	profiles: Record<string, PrismProfile>;
	envOverrides: {
		baseUrl: boolean;
		apiKey: boolean;
		defaultCollection: boolean;
		timeoutMs: boolean;
	};
}

/** @deprecated Use PrismRuntimeConfig; kept as alias for existing imports. */
export type PrismConfig = PrismRuntimeConfig;

export const DEFAULT_BASE_URL = "http://127.0.0.1:3080";
export const DEFAULT_TIMEOUT_MS = 30_000;
export const DEFAULT_LOCAL_PROFILE = "local";
export const DEFAULT_REMOTE_PROFILE = "remote";

function agentDir(): string {
	const envDir = process.env.PI_CODING_AGENT_DIR?.trim();
	if (envDir) {
		if (envDir === "~") return homedir();
		if (envDir.startsWith("~/")) return join(homedir(), envDir.slice(2));
		return envDir;
	}
	return join(homedir(), ".pi", "agent");
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

function defaultProfiles(): Record<string, PrismProfile> {
	return {
		[DEFAULT_LOCAL_PROFILE]: {
			baseUrl: DEFAULT_BASE_URL,
			timeoutMs: DEFAULT_TIMEOUT_MS,
		},
		[DEFAULT_REMOTE_PROFILE]: {
			baseUrl: "https://prism.example.com",
			timeoutMs: DEFAULT_TIMEOUT_MS,
		},
	};
}

function readStoredFile(): PrismStoredConfig {
	const path = prismConfigPath();
	const defaults: PrismStoredConfig = {
		activeProfile: DEFAULT_LOCAL_PROFILE,
		profiles: defaultProfiles(),
	};
	if (!existsSync(path)) return defaults;

	try {
		const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			return defaults;
		}
		const file = parsed as Record<string, unknown>;
		const profiles: Record<string, PrismProfile> = { ...defaultProfiles() };

		if (file.profiles && typeof file.profiles === "object" && !Array.isArray(file.profiles)) {
			for (const [name, raw] of Object.entries(file.profiles as Record<string, unknown>)) {
				if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
				const profile = raw as Record<string, unknown>;
				const baseUrl = asNonEmptyString(profile.baseUrl);
				if (!baseUrl) continue;
				profiles[name] = {
					baseUrl: normalizeBaseUrl(baseUrl),
					timeoutMs: asPositiveInt(profile.timeoutMs, DEFAULT_TIMEOUT_MS),
					defaultCollection: asNonEmptyString(profile.defaultCollection),
					apiKey: asNonEmptyString(profile.apiKey),
				};
			}
		} else {
			// Legacy flat config → migrate into active profile.
			const legacyUrl = asNonEmptyString(file.baseUrl);
			if (legacyUrl) {
				profiles[DEFAULT_LOCAL_PROFILE] = {
					baseUrl: normalizeBaseUrl(legacyUrl),
					timeoutMs: asPositiveInt(file.timeoutMs, DEFAULT_TIMEOUT_MS),
					defaultCollection: asNonEmptyString(file.defaultCollection),
					apiKey: asNonEmptyString(file.apiKey),
				};
			}
		}

		const activeProfile =
			asNonEmptyString(file.activeProfile) && profiles[asNonEmptyString(file.activeProfile)!]
				? asNonEmptyString(file.activeProfile)!
				: DEFAULT_LOCAL_PROFILE;

		return { activeProfile, profiles };
	} catch {
		return defaults;
	}
}

export function loadPrismConfig(): PrismRuntimeConfig {
	const stored = readStoredFile();
	const active =
		stored.profiles[stored.activeProfile] ??
		stored.profiles[DEFAULT_LOCAL_PROFILE] ??
		defaultProfiles()[DEFAULT_LOCAL_PROFILE];

	const envBaseUrl =
		asNonEmptyString(process.env.PRISM_URL) || asNonEmptyString(process.env.PRISM_BASE_URL);
	const envCollection = asNonEmptyString(process.env.PRISM_COLLECTION);
	const envApiKey = asNonEmptyString(process.env.PRISM_API_KEY);
	const envTimeoutRaw = process.env.PRISM_TIMEOUT_MS
		? Number(process.env.PRISM_TIMEOUT_MS)
		: undefined;

	return {
		baseUrl: normalizeBaseUrl(envBaseUrl || active.baseUrl || DEFAULT_BASE_URL),
		timeoutMs: asPositiveInt(
			envTimeoutRaw !== undefined && Number.isFinite(envTimeoutRaw)
				? envTimeoutRaw
				: active.timeoutMs,
			DEFAULT_TIMEOUT_MS,
		),
		defaultCollection: envCollection || active.defaultCollection,
		apiKey: envApiKey || active.apiKey,
		activeProfile: stored.activeProfile,
		profiles: stored.profiles,
		envOverrides: {
			baseUrl: Boolean(envBaseUrl),
			apiKey: Boolean(envApiKey),
			defaultCollection: Boolean(envCollection),
			timeoutMs: envTimeoutRaw !== undefined && Number.isFinite(envTimeoutRaw),
		},
	};
}

export function savePrismConfig(stored: PrismStoredConfig): void {
	const path = prismConfigPath();
	const dir = dirname(path);
	mkdirSync(dir, { recursive: true, mode: 0o700 });

	const payload: PrismStoredConfig = {
		activeProfile: stored.activeProfile,
		profiles: Object.fromEntries(
			Object.entries(stored.profiles).map(([name, profile]) => [
				name,
				{
					baseUrl: normalizeBaseUrl(profile.baseUrl),
					timeoutMs: asPositiveInt(profile.timeoutMs, DEFAULT_TIMEOUT_MS),
					...(profile.defaultCollection
						? { defaultCollection: profile.defaultCollection }
						: {}),
					...(profile.apiKey ? { apiKey: profile.apiKey } : {}),
				},
			]),
		),
	};

	const tmp = join(tmpdir(), `pi-prism-${randomBytes(8).toString("hex")}.json`);
	writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
	try {
		chmodSync(tmp, 0o600);
	} catch {
		// Best effort on platforms that ignore mode.
	}
	renameSync(tmp, path);
	try {
		chmodSync(path, 0o600);
	} catch {
		// Best effort.
	}
}

export function updateActiveProfile(
	patch: Partial<PrismProfile> & { clearApiKey?: boolean },
): PrismStoredConfig {
	const current = readStoredFile();
	const name = current.activeProfile;
	const existing = current.profiles[name] ?? {
		baseUrl: DEFAULT_BASE_URL,
		timeoutMs: DEFAULT_TIMEOUT_MS,
	};
	const nextProfile: PrismProfile = {
		...existing,
		...(patch.baseUrl !== undefined ? { baseUrl: normalizeBaseUrl(patch.baseUrl) } : {}),
		...(patch.timeoutMs !== undefined
			? { timeoutMs: asPositiveInt(patch.timeoutMs, DEFAULT_TIMEOUT_MS) }
			: {}),
		...(patch.defaultCollection !== undefined
			? { defaultCollection: asNonEmptyString(patch.defaultCollection) }
			: {}),
		...(patch.apiKey !== undefined ? { apiKey: asNonEmptyString(patch.apiKey) } : {}),
	};
	if (patch.clearApiKey) {
		delete nextProfile.apiKey;
	}
	const next: PrismStoredConfig = {
		activeProfile: name,
		profiles: { ...current.profiles, [name]: nextProfile },
	};
	savePrismConfig(next);
	return next;
}

export function useProfile(name: string): PrismStoredConfig {
	const current = readStoredFile();
	if (!current.profiles[name]) {
		throw new Error(`Unknown profile "${name}". Known: ${Object.keys(current.profiles).join(", ")}`);
	}
	const next = { ...current, activeProfile: name };
	savePrismConfig(next);
	return next;
}

export function upsertProfile(name: string, profile?: Partial<PrismProfile>): PrismStoredConfig {
	const trimmed = name.trim();
	if (!trimmed) throw new Error("profile name is required");
	const current = readStoredFile();
	const existing = current.profiles[trimmed];
	const nextProfile: PrismProfile = {
		baseUrl: normalizeBaseUrl(
			asNonEmptyString(profile?.baseUrl) || existing?.baseUrl || DEFAULT_BASE_URL,
		),
		timeoutMs: asPositiveInt(profile?.timeoutMs ?? existing?.timeoutMs, DEFAULT_TIMEOUT_MS),
		defaultCollection:
			asNonEmptyString(profile?.defaultCollection) ?? existing?.defaultCollection,
		apiKey: asNonEmptyString(profile?.apiKey) ?? existing?.apiKey,
	};
	const next: PrismStoredConfig = {
		activeProfile: current.activeProfile,
		profiles: { ...current.profiles, [trimmed]: nextProfile },
	};
	savePrismConfig(next);
	return next;
}

export function formatStatusSummary(config: PrismRuntimeConfig): string {
	const lines = [
		`activeProfile: ${config.activeProfile}`,
		`baseUrl: ${config.baseUrl}${config.envOverrides.baseUrl ? " (env)" : ""}`,
		`defaultCollection: ${config.defaultCollection ?? "(none)"}${config.envOverrides.defaultCollection ? " (env)" : ""}`,
		`timeoutMs: ${config.timeoutMs}${config.envOverrides.timeoutMs ? " (env)" : ""}`,
		`apiKey: ${config.apiKey ? "(set)" : "(none)"}${config.envOverrides.apiKey ? " (env)" : ""}`,
		`profiles: ${Object.keys(config.profiles).join(", ")}`,
		`configFile: ${prismConfigPath()}`,
	];
	return lines.join("\n");
}

export type ConfigCommand =
	| { kind: "show" }
	| { kind: "test" }
	| { kind: "use"; profile: string }
	| { kind: "profile-upsert"; name: string }
	| { kind: "set"; field: "url" | "apiKey" | "collection" | "timeout"; value: string }
	| { kind: "clear-api-key" }
	| { kind: "error"; message: string };

export function parseConfigArgs(args: string): ConfigCommand {
	const trimmed = args.trim();
	if (!trimmed) return { kind: "show" };
	const parts = trimmed.split(/\s+/);
	const head = parts[0]?.toLowerCase();

	if (head === "test") return { kind: "test" };
	if (head === "show") return { kind: "show" };
	if (head === "use") {
		const profile = parts[1];
		if (!profile) return { kind: "error", message: "Usage: /prism config use <profile>" };
		return { kind: "use", profile };
	}
	if (head === "profile" && parts[1]?.toLowerCase() === "upsert") {
		const name = parts[2];
		if (!name) return { kind: "error", message: "Usage: /prism config profile upsert <name>" };
		return { kind: "profile-upsert", name };
	}
	if (head === "set") {
		const field = parts[1]?.toLowerCase();
		const value = parts.slice(2).join(" ").trim();
		if (!field || !value) {
			return {
				kind: "error",
				message: "Usage: /prism config set url|apiKey|collection|timeout <value>",
			};
		}
		if (field === "url") return { kind: "set", field: "url", value };
		if (field === "apikey") return { kind: "set", field: "apiKey", value };
		if (field === "collection") return { kind: "set", field: "collection", value };
		if (field === "timeout") return { kind: "set", field: "timeout", value };
		return {
			kind: "error",
			message: "Unknown field. Use url|apiKey|collection|timeout",
		};
	}
	if (head === "clear" && parts[1]?.toLowerCase() === "apikey") {
		return { kind: "clear-api-key" };
	}
	return {
		kind: "error",
		message:
			"Usage: /prism config [show|test|use <profile>|profile upsert <name>|set url|apiKey|collection|timeout <value>|clear apiKey]",
	};
}
