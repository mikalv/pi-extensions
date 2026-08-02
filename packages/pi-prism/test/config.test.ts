import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { truncateJson } from "../src/client.js";
import {
	DEFAULT_BASE_URL,
	DEFAULT_LOCAL_PROFILE,
	loadPrismConfig,
	parseConfigArgs,
	savePrismConfig,
	updateActiveProfile,
	upsertProfile,
	useProfile,
} from "../src/config.js";

function withTempAgentDir(run: (dir: string) => void): void {
	const dir = mkdtempSync(join(tmpdir(), "pi-prism-test-"));
	const previous = process.env.PI_CODING_AGENT_DIR;
	const envKeys = [
		"PRISM_URL",
		"PRISM_BASE_URL",
		"PRISM_API_KEY",
		"PRISM_COLLECTION",
		"PRISM_TIMEOUT_MS",
	] as const;
	const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
	for (const key of envKeys) delete process.env[key];
	process.env.PI_CODING_AGENT_DIR = dir;
	try {
		run(dir);
	} finally {
		if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = previous;
		for (const key of envKeys) {
			const value = previousEnv[key];
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
		rmSync(dir, { recursive: true, force: true });
	}
}

test("loadPrismConfig defaults to local profile and default URL", () => {
	withTempAgentDir(() => {
		const config = loadPrismConfig();
		assert.equal(config.activeProfile, DEFAULT_LOCAL_PROFILE);
		assert.equal(config.baseUrl, DEFAULT_BASE_URL);
		assert.ok(config.profiles.local);
		assert.ok(config.profiles.remote);
	});
});

test("loadPrismConfig uses PRISM_URL override over profile", () => {
	withTempAgentDir(() => {
		savePrismConfig({
			activeProfile: "local",
			profiles: {
				local: { baseUrl: "http://profile.local:3080" },
				remote: { baseUrl: "https://prism.example.com" },
			},
		});
		process.env.PRISM_URL = "http://example.test:9999/";
		const config = loadPrismConfig();
		assert.equal(config.baseUrl, "http://example.test:9999");
		assert.equal(config.envOverrides.baseUrl, true);
	});
});

test("active profile values apply when env is unset", () => {
	withTempAgentDir(() => {
		savePrismConfig({
			activeProfile: "remote",
			profiles: {
				local: { baseUrl: DEFAULT_BASE_URL },
				remote: {
					baseUrl: "https://prism.example.com",
					apiKey: "secret",
					defaultCollection: "ltm-memories",
					timeoutMs: 12_000,
				},
			},
		});
		const config = loadPrismConfig();
		assert.equal(config.activeProfile, "remote");
		assert.equal(config.baseUrl, "https://prism.example.com");
		assert.equal(config.apiKey, "secret");
		assert.equal(config.defaultCollection, "ltm-memories");
		assert.equal(config.timeoutMs, 12_000);
	});
});

test("legacy flat config migrates into local profile", () => {
	withTempAgentDir((dir) => {
		writeFileSync(
			join(dir, "pi-prism.json"),
			JSON.stringify({
				baseUrl: "http://legacy:3080",
				apiKey: "legacy-key",
				defaultCollection: "code",
			}),
		);
		const config = loadPrismConfig();
		assert.equal(config.activeProfile, "local");
		assert.equal(config.baseUrl, "http://legacy:3080");
		assert.equal(config.apiKey, "legacy-key");
		assert.equal(config.defaultCollection, "code");
	});
});

test("savePrismConfig writes profiles atomically", () => {
	withTempAgentDir((dir) => {
		savePrismConfig({
			activeProfile: "local",
			profiles: {
				local: { baseUrl: "http://127.0.0.1:3080", apiKey: "k" },
				remote: { baseUrl: "https://prism.example.com" },
			},
		});
		const raw = JSON.parse(readFileSync(join(dir, "pi-prism.json"), "utf8")) as {
			activeProfile: string;
			profiles: Record<string, { apiKey?: string }>;
		};
		assert.equal(raw.activeProfile, "local");
		assert.equal(raw.profiles.local.apiKey, "k");
	});
});

test("useProfile and updateActiveProfile persist changes", () => {
	withTempAgentDir(() => {
		upsertProfile("staging", { baseUrl: "https://staging.prism.test" });
		useProfile("staging");
		updateActiveProfile({ defaultCollection: "ltm-sessions", apiKey: "tok" });
		const config = loadPrismConfig();
		assert.equal(config.activeProfile, "staging");
		assert.equal(config.baseUrl, "https://staging.prism.test");
		assert.equal(config.defaultCollection, "ltm-sessions");
		assert.equal(config.apiKey, "tok");
		updateActiveProfile({ clearApiKey: true });
		assert.equal(loadPrismConfig().apiKey, undefined);
	});
});

test("parseConfigArgs covers set/use/profile/test/clear", () => {
	assert.deepEqual(parseConfigArgs(""), { kind: "show" });
	assert.deepEqual(parseConfigArgs("test"), { kind: "test" });
	assert.deepEqual(parseConfigArgs("use remote"), { kind: "use", profile: "remote" });
	assert.deepEqual(parseConfigArgs("profile upsert staging"), {
		kind: "profile-upsert",
		name: "staging",
	});
	assert.deepEqual(parseConfigArgs("set url https://x.test"), {
		kind: "set",
		field: "url",
		value: "https://x.test",
	});
	assert.deepEqual(parseConfigArgs("set apiKey abc"), {
		kind: "set",
		field: "apiKey",
		value: "abc",
	});
	assert.deepEqual(parseConfigArgs("clear apiKey"), { kind: "clear-api-key" });
	assert.equal(parseConfigArgs("set url").kind, "error");
	assert.equal(parseConfigArgs("nope").kind, "error");
});

test("truncateJson keeps short payloads intact", () => {
	assert.equal(truncateJson({ ok: true }), '{\n  "ok": true\n}');
});

test("truncateJson truncates oversized payloads", () => {
	const text = truncateJson({ blob: "x".repeat(50_000) }, 200);
	assert.ok(text.includes("[truncated"));
	assert.ok(text.length < 50_000);
});
