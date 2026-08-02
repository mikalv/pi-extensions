#!/usr/bin/env node
/**
 * Integration test: load pi-lazy's own loader the same way Pi does (jiti),
 * then load every after-start + on-demand package and assert success.
 */
import { createRequire } from "node:module";
import { dirname, join, resolve as resolvePath } from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

const HOME = process.env.HOME;
const AGENT = join(HOME, ".pi/agent");
const PI_PKG = "/Users/rahularya/.nvm/versions/node/v24.11.1/lib/node_modules/@earendil-works/pi-coding-agent/package.json";
const LAZY_ROOT = process.env.LAZY_ROOT ? resolvePath(process.env.LAZY_ROOT) : process.cwd();

function buildAliases() {
	const requireFromPi = createRequire(PI_PKG);
	const piRoot = dirname(PI_PKG);
	const nm = join(piRoot, "node_modules");
	const resolveSpec = (spec) => {
		try {
			return requireFromPi.resolve(spec);
		} catch {
			return null;
		}
	};
	const firstExisting = (...paths) => {
		for (const p of paths) if (p && existsSync(p)) return p;
		return null;
	};
	const aliases = {};
	const set = (s, p) => {
		if (p) aliases[s] = p;
	};
	const piCoding = firstExisting(resolveSpec("@earendil-works/pi-coding-agent"), join(piRoot, "dist/index.js"));
	set("@earendil-works/pi-coding-agent", piCoding);
	set("@mariozechner/pi-coding-agent", piCoding);
	const agentCore = firstExisting(
		resolveSpec("@earendil-works/pi-agent-core"),
		join(nm, "@earendil-works/pi-agent-core/dist/index.js"),
	);
	set("@earendil-works/pi-agent-core", agentCore);
	set("@mariozechner/pi-agent-core", agentCore);
	const tui = firstExisting(resolveSpec("@earendil-works/pi-tui"), join(nm, "@earendil-works/pi-tui/dist/index.js"));
	set("@earendil-works/pi-tui", tui);
	set("@mariozechner/pi-tui", tui);
	const aiCompat = firstExisting(resolveSpec("@earendil-works/pi-ai/compat"), join(nm, "@earendil-works/pi-ai/dist/compat.js"));
	const aiOauth = firstExisting(resolveSpec("@earendil-works/pi-ai/oauth"), join(nm, "@earendil-works/pi-ai/dist/oauth.js"));
	const aiProviders = firstExisting(
		resolveSpec("@earendil-works/pi-ai/providers/all"),
		join(nm, "@earendil-works/pi-ai/dist/providers/all.js"),
	);
	set("@earendil-works/pi-ai/providers/all", aiProviders);
	set("@mariozechner/pi-ai/providers/all", aiProviders);
	set("@earendil-works/pi-ai/oauth", aiOauth);
	set("@mariozechner/pi-ai/oauth", aiOauth);
	set("@earendil-works/pi-ai/compat", aiCompat);
	set("@mariozechner/pi-ai/compat", aiCompat);
	set("@earendil-works/pi-ai", aiCompat);
	set("@mariozechner/pi-ai", aiCompat);
	const typebox = resolveSpec("typebox");
	set("typebox", typebox);
	set("typebox/compile", resolveSpec("typebox/compile"));
	set("typebox/value", resolveSpec("typebox/value"));
	set("@sinclair/typebox", typebox);
	set("@sinclair/typebox/compile", aliases["typebox/compile"]);
	set("@sinclair/typebox/value", aliases["typebox/value"]);
	return aliases;
}

function mockPi() {
	const tools = [];
	const commands = [];
	const handlers = new Map();
	const activeTools = new Set();
	const flags = new Map();
	return {
		api: {
			on(event, handler) {
				if (!handlers.has(event)) handlers.set(event, []);
				handlers.get(event).push(handler);
			},
			registerTool(tool) {
				tools.push(tool?.name ?? String(tool));
			},
			registerCommand(name) {
				commands.push(name);
			},
			registerShortcut() {},
			registerFlag(name, opts) {
				flags.set(name, opts);
			},
			getFlag(name) {
				return flags.has(name) ? flags.get(name) : undefined;
			},
			registerProvider() {},
			registerMessageRenderer() {},
			registerEntryRenderer() {},
			getActiveTools() {
				return [...activeTools];
			},
			setActiveTools(list) {
				activeTools.clear();
				for (const t of list) activeTools.add(t);
			},
			// tolerate extra API surface used by third-party packages
			registerCli() {},
			registerWidget() {},
			sendMessage() {},
			appendEntry() {},
			setModel() {
				return Promise.resolve();
			},
			events: { on() {}, emit() {} },
		},
		tools,
		commands,
		handlers,
		activeTools,
	};
}

const require = createRequire(PI_PKG);
const { createJiti } = require(require.resolve("jiti"));
const jiti = createJiti(import.meta.url, {
	interopDefault: true,
	moduleCache: false,
	alias: buildAliases(),
});

console.log("Loading pi-lazy modules via jiti...");
const tLoad = performance.now();
const loader = await jiti.import(join(LAZY_ROOT, "src/loader.ts"));
const resolve = await jiti.import(join(LAZY_ROOT, "src/resolve.ts"));
const configMod = await jiti.import(join(LAZY_ROOT, "src/config.ts"));
console.log(`pi-lazy modules ready in ${(performance.now() - tLoad).toFixed(0)}ms`);

const config = configMod.loadConfig(AGENT);
const settings = JSON.parse(readFileSync(join(AGENT, "settings.json"), "utf8"));
const packages = settings.packages || [];

const entries = [];
for (const spec of config.specs) {
	if (!configMod.isManagedLazy(spec)) {
		console.log(`SKIP eager: ${spec.name}`);
		continue;
	}
	const { packageRoot, extensionPaths } = resolve.resolveSpecPaths(spec, AGENT, process.cwd());
	const moduleLazyReady = resolve.isModuleLazyInSettings(spec.source, packages);
	entries.push({
		spec,
		packageRoot: packageRoot ?? "",
		extensionPaths,
		moduleLazyReady,
		state: moduleLazyReady ? "pending" : "eager",
	});
}

console.log("\nCatalog (managed lazy specs):");
for (const e of entries) {
	console.log(
		`  ${e.spec.name.padEnd(14)} lazy=${String(e.spec.lazy).padEnd(12)} ready=${e.moduleLazyReady} paths=${e.extensionPaths.length} root=${e.packageRoot ? "yes" : "NO"}`,
	);
}

const mock = mockPi();
const results = [];
const byName = new Map(entries.map((e) => [e.spec.name, e]));

async function loadOne(name) {
	const entry = byName.get(name);
	if (!entry) return { ok: false, name, error: "missing" };
	const t0 = performance.now();
	const res = await loader.loadResolvedEntry(entry, mock.api, undefined, {
		loadDependency: async (dep) => loadOne(dep),
	});
	res.loadMsMeasured = Math.round(performance.now() - t0);
	results.push(res);
	return res;
}

// Load after-start first (priority order), then on-demand
const afterStart = entries
	.filter((e) => e.spec.lazy === "after-start")
	.sort((a, b) => (a.spec.priority ?? 100) - (b.spec.priority ?? 100));
const onDemand = entries.filter((e) => e.spec.lazy === true);

console.log("\n=== after-start loads ===");
const tAfter = performance.now();
for (const e of afterStart) {
	const res = await loadOne(e.spec.name);
	const mark = res.ok ? "OK " : "ERR";
	console.log(
		`  [${mark}] ${e.spec.name.padEnd(14)} ${String(res.loadMsMeasured ?? res.loadMs ?? "?").padStart(5)}ms  tools=${(res.tools || []).join(",") || "-"}  cmds=${(res.commands || []).join(",") || "-"}  ${res.error || ""}`,
	);
}
console.log(`after-start total: ${(performance.now() - tAfter).toFixed(0)}ms`);

console.log("\n=== on-demand loads ===");
const tDemand = performance.now();
for (const e of onDemand) {
	const res = await loadOne(e.spec.name);
	const mark = res.ok ? "OK " : "ERR";
	console.log(
		`  [${mark}] ${e.spec.name.padEnd(14)} ${String(res.loadMsMeasured ?? res.loadMs ?? "?").padStart(5)}ms  tools=${(res.tools || []).join(",") || "-"}  cmds=${(res.commands || []).join(",") || "-"}  ${res.error || ""}`,
	);
}
console.log(`on-demand total: ${(performance.now() - tDemand).toFixed(0)}ms`);

const failed = results.filter((r) => !r.ok);
const passed = results.filter((r) => r.ok);

// Critical packages that previously failed
const critical = ["todo", "ask-user"];
for (const name of critical) {
	const r = results.find((x) => x.name === name);
	if (!r?.ok) {
		console.error(`CRITICAL FAIL: ${name} did not load:`, r?.error);
	} else {
		console.log(`CRITICAL OK: ${name}`);
	}
}

const report = {
	passed: passed.length,
	failed: failed.length,
	results: results.map((r) => ({
		name: r.name,
		ok: r.ok,
		ms: r.loadMsMeasured ?? r.loadMs,
		tools: r.tools,
		commands: r.commands,
		error: r.error,
	})),
	registeredTools: mock.tools,
	registeredCommands: mock.commands,
};
writeFileSync(join(process.cwd(), ".integration-report.json"), JSON.stringify(report, null, 2));

console.log("\n=== SUMMARY ===");
console.log(`loaded OK: ${passed.length}, failed: ${failed.length}`);
console.log(`tools registered: ${mock.tools.join(", ") || "(none)"}`);
console.log(`commands registered: ${mock.commands.join(", ") || "(none)"}`);
if (failed.length) {
	console.error("Failures:");
	for (const f of failed) console.error(` - ${f.name}: ${f.error}`);
	process.exit(1);
}
if (!critical.every((n) => results.find((r) => r.name === n)?.ok)) process.exit(1);
console.log("ALL INTEGRATION LOADS PASSED");
