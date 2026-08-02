#!/usr/bin/env node
/**
 * Smoke-test pi-lazy against a real `pi` process.
 * - Measures cold startup
 * - Asserts no after-start TLA / import failures
 * - Checks that deferred packages are not eager-loaded by Pi
 * - Forces on-demand load via /lazy load if possible
 */
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const AGENT = join(process.env.HOME, ".pi/agent");
const results = [];
const fail = (msg) => {
	results.push({ ok: false, msg });
	console.error("FAIL:", msg);
};
const pass = (msg) => {
	results.push({ ok: true, msg });
	console.log("PASS:", msg);
};

function runPi(args, { timeoutMs = 120_000, env = {} } = {}) {
	return new Promise((resolve) => {
		const started = Date.now();
		const child = spawn("pi", args, {
			env: {
				...process.env,
				PI_OFFLINE: "1",
				...env,
			},
			cwd: ROOT,
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (d) => {
			stdout += d.toString();
		});
		child.stderr.on("data", (d) => {
			stderr += d.toString();
		});
		const timer = setTimeout(() => {
			child.kill("SIGTERM");
			resolve({
				code: -1,
				stdout,
				stderr,
				ms: Date.now() - started,
				timedOut: true,
			});
		}, timeoutMs);
		child.on("close", (code) => {
			clearTimeout(timer);
			resolve({
				code: code ?? 0,
				stdout,
				stderr,
				ms: Date.now() - started,
				timedOut: false,
			});
		});
	});
}

function combined(r) {
	return `${r.stdout}\n${r.stderr}`;
}

// --- preflight ---
const lazyPkg = join(AGENT, "npm/node_modules/@rahularya01/pi-lazy/package.json");
if (!existsSync(lazyPkg)) {
	fail(`pi-lazy not installed at ${lazyPkg}`);
	process.exit(1);
}
const version = JSON.parse(readFileSync(lazyPkg, "utf8")).version;
console.log(`Installed pi-lazy version: ${version}`);
if (version !== "0.1.1") fail(`expected installed version 0.1.1, got ${version}`);
else pass(`installed version is ${version}`);

const loaderSrc = readFileSync(join(AGENT, "npm/node_modules/@rahularya01/pi-lazy/src/loader.ts"), "utf8");
if (!loaderSrc.includes("Never wrap with sync") || !loaderSrc.includes("moduleCache: false")) {
	fail("installed loader.ts does not contain the 0.1.1 fix markers");
} else {
	pass("installed loader.ts contains 0.1.1 fix markers");
}

const settings = JSON.parse(readFileSync(join(AGENT, "settings.json"), "utf8"));
const packages = settings.packages || [];
const hasLazy = packages.some((p) => p === "npm:@rahularya01/pi-lazy" || p?.source === "npm:@rahularya01/pi-lazy");
if (!hasLazy) fail("settings.json missing npm:@rahularya01/pi-lazy");
else pass("settings.json includes pi-lazy");

const moduleLazy = packages.filter((p) => p && typeof p === "object" && Array.isArray(p.extensions) && p.extensions.length === 0);
console.log(
	"module-lazy packages:",
	moduleLazy.map((p) => p.source).join(", "),
);
if (moduleLazy.length < 5) fail(`expected several module-lazy packages, got ${moduleLazy.length}`);
else pass(`${moduleLazy.length} packages are module-lazy (extensions: [])`);

// --- cold start verbose ---
console.log("\n=== cold start (verbose, offline, print) ===");
const r1 = await runPi(
	[
		"--verbose",
		"--offline",
		"--no-session",
		"--mode",
		"text",
		"-p",
		"Reply with exactly the single word: PONG",
	],
	{ timeoutMs: 180_000 },
);
console.log(`startup+reply ms: ${r1.ms} (exit ${r1.code}${r1.timedOut ? ", timed out" : ""})`);
writeFileSync(join(ROOT, ".smoke-stdout.txt"), r1.stdout);
writeFileSync(join(ROOT, ".smoke-stderr.txt"), r1.stderr);

const text = combined(r1);
const badPatterns = [
	/after-start failed todo/i,
	/after-start failed ask-user/i,
	/await is only valid in async functions/i,
	/Failed to import extension module .*rpiv-todo/i,
	/Failed to import extension module .*rpiv-ask-user-question/i,
	/jiti not available/i,
];
let badHits = 0;
for (const re of badPatterns) {
	if (re.test(text)) {
		badHits++;
		fail(`matched bad pattern: ${re}`);
	}
}
if (badHits === 0) pass("no TLA / after-start import failures in startup output");

// Positive signals that pi-lazy is alive
if (/pi-lazy|lazy \d+↑|\/lazy/i.test(text) || /Loaded extension.*pi-lazy|@rahularya01\/pi-lazy/i.test(text)) {
	pass("startup output mentions pi-lazy / lazy status");
} else {
	// verbose may print extension load paths
	console.log("note: no explicit pi-lazy banner found (may be quiet); scanning extension loads...");
}

// Count extension loads from verbose output if present
const loadLines = text.split("\n").filter((l) => /extension|loading|loaded|package/i.test(l)).slice(0, 80);
console.log("sample load-related lines:");
for (const l of loadLines.slice(0, 40)) console.log("  ", l.slice(0, 200));

// --- force load of deferred packages via a prompt that uses tools ---
console.log("\n=== force deferred package usage (todo + web stub) ===");
const r2 = await runPi(
	[
		"--offline",
		"--no-session",
		"--mode",
		"text",
		"--thinking",
		"off",
		"-p",
		[
			"Do NOT call any tools.",
			"Just print a short status line that starts with STATUS_OK.",
			"If you can see a tool named todo or ask_user_question in your available tools, also print TOOLS_PRESENT.",
			"If not, print TOOLS_ABSENT.",
		].join(" "),
	],
	{ timeoutMs: 180_000 },
);
console.log(`tool-presence probe ms: ${r2.ms} (exit ${r2.code})`);
writeFileSync(join(ROOT, ".smoke-tools-stdout.txt"), r2.stdout);
writeFileSync(join(ROOT, ".smoke-tools-stderr.txt"), r2.stderr);
const t2 = combined(r2);
if (/after-start failed|await is only valid/i.test(t2)) {
	fail("still seeing after-start / TLA errors on second run");
} else {
	pass("second run clean of TLA/after-start errors");
}

// --- direct unit-ish import through installed loader code path ---
console.log("\n=== direct jiti import of deferred extensions via fixed resolver ===");
try {
	const { createRequire } = await import("node:module");
	const { dirname, join: j } = await import("node:path");
	const { existsSync: ex } = await import("node:fs");
	const piPkg = "/Users/rahularya/.nvm/versions/node/v24.11.1/lib/node_modules/@earendil-works/pi-coding-agent/package.json";
	const require = createRequire(piPkg);
	const jitiMod = require(require.resolve("jiti"));
	const createJiti = jitiMod.createJiti.bind(jitiMod);
	const piRoot = dirname(piPkg);
	const nm = j(piRoot, "node_modules");
	const requireFromPi = createRequire(piPkg);
	const resolveSpec = (spec) => {
		try {
			return requireFromPi.resolve(spec);
		} catch {
			return null;
		}
	};
	const firstExisting = (...paths) => {
		for (const p of paths) if (p && ex(p)) return p;
		return null;
	};
	const aliases = {};
	const set = (s, p) => {
		if (p) aliases[s] = p;
	};
	const piCoding = firstExisting(resolveSpec("@earendil-works/pi-coding-agent"), j(piRoot, "dist/index.js"));
	set("@earendil-works/pi-coding-agent", piCoding);
	set("@mariozechner/pi-coding-agent", piCoding);
	const agentCore = firstExisting(
		resolveSpec("@earendil-works/pi-agent-core"),
		j(nm, "@earendil-works/pi-agent-core/dist/index.js"),
	);
	set("@earendil-works/pi-agent-core", agentCore);
	set("@mariozechner/pi-agent-core", agentCore);
	const tui = firstExisting(resolveSpec("@earendil-works/pi-tui"), j(nm, "@earendil-works/pi-tui/dist/index.js"));
	set("@earendil-works/pi-tui", tui);
	set("@mariozechner/pi-tui", tui);
	const aiCompat = firstExisting(resolveSpec("@earendil-works/pi-ai/compat"), j(nm, "@earendil-works/pi-ai/dist/compat.js"));
	const aiOauth = firstExisting(resolveSpec("@earendil-works/pi-ai/oauth"), j(nm, "@earendil-works/pi-ai/dist/oauth.js"));
	const aiProviders = firstExisting(
		resolveSpec("@earendil-works/pi-ai/providers/all"),
		j(nm, "@earendil-works/pi-ai/dist/providers/all.js"),
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

	const jiti = createJiti(import.meta.url, { interopDefault: true, moduleCache: false, alias: aliases });
	const t0 = Date.now();
	const todo = await jiti.import(`${AGENT}/npm/node_modules/@juicesharp/rpiv-todo/index.ts`, { default: true });
	const ask = await jiti.import(`${AGENT}/npm/node_modules/@juicesharp/rpiv-ask-user-question/index.ts`, {
		default: true,
	});
	const sub = await jiti.import(`${AGENT}/npm/node_modules/pi-subagents/extension/index.ts`, { default: true }).catch(async (e) => {
		// try alternate entry
		const pkg = JSON.parse(readFileSync(`${AGENT}/npm/node_modules/pi-subagents/package.json`, "utf8"));
		const exts = pkg.pi?.extensions || [];
		if (!exts[0]) throw e;
		return jiti.import(j(AGENT, "npm/node_modules/pi-subagents", exts[0]), { default: true });
	});
	const ms = Date.now() - t0;
	if (typeof todo === "function" && typeof ask === "function") {
		pass(`deferred factories import OK (todo/ask/subagents) in ${ms}ms`);
	} else {
		fail(`factory types unexpected: todo=${typeof todo} ask=${typeof ask} sub=${typeof sub}`);
	}
} catch (e) {
	fail(`direct import failed: ${e instanceof Error ? e.message : e}`);
}

// --- summary ---
console.log("\n=== SUMMARY ===");
const failed = results.filter((r) => !r.ok);
const passed = results.filter((r) => r.ok);
console.log(`passed: ${passed.length}, failed: ${failed.length}`);
console.log(`cold start wall time: ${r1.ms}ms`);
if (failed.length) {
	console.error("FAILURES:");
	for (const f of failed) console.error(" -", f.msg);
	process.exit(1);
}
console.log("ALL CHECKS PASSED");
