import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { getSettingsPath, isManagedLazy, loadConfig } from "./config.ts";
import { findSettingsPackageIndex } from "./resolve.ts";
import type { LazySpec } from "./types.ts";

export interface MigrateResult {
	ok: boolean;
	backupPath?: string;
	settingsPath: string;
	changed: string[];
	skipped: string[];
	added: string[];
	error?: string;
}

function packageSource(spec: LazySpec): string {
	if (
		spec.source.startsWith("npm:") ||
		spec.source.startsWith("git:") ||
		spec.source.startsWith("http://") ||
		spec.source.startsWith("https://") ||
		spec.source.startsWith("ssh://") ||
		spec.source.startsWith("/") ||
		spec.source.startsWith(".")
	) {
		return spec.source;
	}
	return `npm:${spec.source}`;
}

/**
 * Rewrite settings.packages so managed lazy specs keep the package installed
 * but do not eager-load extension factories (`extensions: []`).
 */
export function migrateSettings(agentDir = getAgentDir()): MigrateResult {
	const settingsPath = getSettingsPath(agentDir);
	const config = loadConfig(agentDir);
	const managed = config.specs.filter(isManagedLazy);

	if (!existsSync(settingsPath)) {
		return { ok: false, settingsPath, changed: [], skipped: [], added: [], error: "settings.json not found" };
	}

	let settings: Record<string, unknown>;
	try {
		settings = JSON.parse(readFileSync(settingsPath, "utf-8")) as Record<string, unknown>;
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, settingsPath, changed: [], skipped: [], added: [], error: message };
	}

	const packages = Array.isArray(settings.packages) ? [...settings.packages] : [];
	const changed: string[] = [];
	const skipped: string[] = [];
	const added: string[] = [];

	for (const spec of managed) {
		const source = packageSource(spec);
		const idx = findSettingsPackageIndex(packages, spec.source);

		if (idx === -1) {
			packages.push({ source, extensions: [] });
			added.push(spec.name);
			changed.push(`${spec.name} (added)`);
			continue;
		}

		const current = packages[idx];
		if (typeof current === "string") {
			packages[idx] = { source: current, extensions: [] };
			changed.push(spec.name);
			continue;
		}

		if (current && typeof current === "object") {
			const obj = { ...(current as Record<string, unknown>) };
			if (Array.isArray(obj.extensions) && obj.extensions.length === 0) {
				skipped.push(spec.name);
				continue;
			}
			obj.extensions = [];
			if (typeof obj.source !== "string") obj.source = source;
			packages[idx] = obj;
			changed.push(spec.name);
			continue;
		}

		skipped.push(spec.name);
	}

	// Eager specs previously filtered empty → restore string form when safe
	for (const spec of config.specs.filter((s) => s.lazy === false)) {
		const idx = findSettingsPackageIndex(packages, spec.source);
		if (idx === -1) continue;
		const current = packages[idx];
		if (!current || typeof current !== "object") continue;

		const obj = current as Record<string, unknown>;
		if (!(Array.isArray(obj.extensions) && obj.extensions.length === 0 && typeof obj.source === "string")) {
			continue;
		}

		const otherFilters = Object.entries(obj).some(([k, v]) => {
			if (k === "source" || k === "extensions") return false;
			return Array.isArray(v) && v.length > 0;
		});
		if (otherFilters) continue;

		packages[idx] = obj.source;
		changed.push(`${spec.name} (restored eager)`);
	}

	if (changed.length === 0) {
		return { ok: true, settingsPath, changed, skipped, added };
	}

	const stamp = new Date().toISOString().replace(/[:.]/g, "-");
	const backupPath = `${settingsPath}.bak.lazy-${stamp}`;
	copyFileSync(settingsPath, backupPath);

	settings.packages = packages;
	writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf-8");

	return { ok: true, backupPath, settingsPath, changed, skipped, added };
}
