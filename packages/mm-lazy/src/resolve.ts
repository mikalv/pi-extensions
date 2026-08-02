import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { LazySpec } from "./types.ts";

interface PiManifest {
	extensions?: string[];
	skills?: string[];
	prompts?: string[];
	themes?: string[];
}

export function npmPackageName(source: string): string | null {
	if (source.startsWith("npm:")) {
		const rest = source.slice(4);
		// strip version pins: npm:@scope/pkg@1.2.3 or npm:pkg@1.2.3
		if (rest.startsWith("@")) {
			const m = rest.match(/^(@[^/]+\/[^@]+)/);
			return m?.[1] ?? rest;
		}
		return rest.split("@")[0] ?? rest;
	}
	// bare npm name
	if (!source.includes(":") && !source.startsWith(".") && !source.startsWith("/")) {
		return source.startsWith("@") ? (source.match(/^(@[^/]+\/[^@]+)/)?.[1] ?? source) : source.split("@")[0]!;
	}
	return null;
}

export function resolvePackageRoot(source: string, agentDir = getAgentDir(), cwd = process.cwd()): string | null {
	const npmName = npmPackageName(source);
	if (npmName) {
		const candidates = [
			join(agentDir, "npm", "node_modules", npmName),
			join(cwd, ".pi", "npm", "node_modules", npmName),
		];
		for (const c of candidates) {
			if (existsSync(c)) return c;
		}
		return null;
	}

	if (source.startsWith("git:") || source.startsWith("https://") || source.startsWith("http://") || source.startsWith("ssh://")) {
		// Best-effort: scan agent git dir for a package.json with matching name is hard; skip for v1 paths
		const gitRoot = join(agentDir, "git");
		if (existsSync(gitRoot)) {
			// leave unresolved unless local path form used
		}
		return null;
	}

	const local = resolve(cwd, source);
	if (existsSync(local)) return local;
	const abs = resolve(source);
	if (existsSync(abs)) return abs;
	return null;
}

function readPiManifest(packageRoot: string): PiManifest | null {
	const pj = join(packageRoot, "package.json");
	if (!existsSync(pj)) return null;
	try {
		const pkg = JSON.parse(readFileSync(pj, "utf-8")) as { pi?: PiManifest };
		return pkg.pi && typeof pkg.pi === "object" ? pkg.pi : null;
	} catch {
		return null;
	}
}

function isExtensionFile(name: string): boolean {
	return name.endsWith(".ts") || name.endsWith(".js") || name.endsWith(".mts") || name.endsWith(".mjs");
}

/**
 * Resolve extension entry files for a package root (mirrors Pi loader rules).
 */
export function resolveExtensionEntries(packageRoot: string): string[] {
	const manifest = readPiManifest(packageRoot);
	if (manifest?.extensions?.length) {
		const entries: string[] = [];
		for (const extPath of manifest.extensions) {
			const resolved = resolve(packageRoot, extPath);
			if (!existsSync(resolved)) continue;
			const st = statSync(resolved);
			if (st.isFile() && isExtensionFile(resolved)) {
				entries.push(resolved);
				continue;
			}
			if (st.isDirectory()) {
				const indexTs = join(resolved, "index.ts");
				const indexJs = join(resolved, "index.js");
				if (existsSync(indexTs)) entries.push(indexTs);
				else if (existsSync(indexJs)) entries.push(indexJs);
				else {
					// directory of extension files (e.g. extensions/*.ts)
					try {
						for (const name of readdirSync(resolved)) {
							if (isExtensionFile(name)) {
								entries.push(join(resolved, name));
							}
						}
					} catch {
						/* ignore */
					}
				}
			}
		}
		if (entries.length > 0) return entries;
	}

	const indexTs = join(packageRoot, "index.ts");
	const indexJs = join(packageRoot, "index.js");
	if (existsSync(indexTs)) return [indexTs];
	if (existsSync(indexJs)) return [indexJs];
	return [];
}

export function resolveSpecPaths(spec: LazySpec, agentDir = getAgentDir(), cwd = process.cwd()) {
	const packageRoot = resolvePackageRoot(spec.source, agentDir, cwd);
	if (!packageRoot) {
		return { packageRoot: null as string | null, extensionPaths: [] as string[] };
	}
	return {
		packageRoot,
		extensionPaths: resolveExtensionEntries(packageRoot),
	};
}

/** Detect whether settings has this package with extensions filtered to none. */
export function isModuleLazyInSettings(source: string, settingsPackages: unknown[]): boolean {
	const target = normalizeSourceKey(source);
	for (const entry of settingsPackages) {
		if (typeof entry === "string") {
			if (normalizeSourceKey(entry) === target) return false; // fully eager
			continue;
		}
		if (entry && typeof entry === "object") {
			const obj = entry as { source?: string; extensions?: unknown };
			if (typeof obj.source === "string" && normalizeSourceKey(obj.source) === target) {
				return Array.isArray(obj.extensions) && obj.extensions.length === 0;
			}
		}
	}
	return false;
}

export function normalizeSourceKey(source: string): string {
	const npm = npmPackageName(source);
	if (npm) return `npm:${npm}`;
	return source;
}

export function findSettingsPackageIndex(settingsPackages: unknown[], source: string): number {
	const target = normalizeSourceKey(source);
	return settingsPackages.findIndex((entry) => {
		if (typeof entry === "string") return normalizeSourceKey(entry) === target;
		if (entry && typeof entry === "object" && typeof (entry as { source?: string }).source === "string") {
			return normalizeSourceKey((entry as { source: string }).source) === target;
		}
		return false;
	});
}
