export const PI_WEB_ACCESS_PATCH_TARGETS = [
	"index.ts",
	"exa.ts",
	"gemini-api.ts",
	"gemini-search.ts",
	"gemini-web.ts",
	"github-extract.ts",
	"perplexity.ts",
	"video-extract.ts",
	"youtube-extract.ts",
];

const LEGACY_CONFIG_EXPR = 'join(homedir(), ".pi", "web-search.json")';
const ADSAGENTS_CONFIG_EXPR =
	'process.env.ADSAGENTS_WEB_SEARCH_CONFIG ?? process.env.PI_WEB_SEARCH_CONFIG ?? join(homedir(), ".pi", "web-search.json")';
const PATCHED_CONFIG_EXPR =
	'process.env.MARKETINGAGENTS_WEB_SEARCH_CONFIG ?? process.env.ADSAGENTS_WEB_SEARCH_CONFIG ?? process.env.PI_WEB_SEARCH_CONFIG ?? join(homedir(), ".pi", "web-search.json")';

export function patchPiWebAccessSource(relativePath, source) {
	let patched = source;
	let changed = false;

	if (!patched.includes(PATCHED_CONFIG_EXPR) && patched.includes(ADSAGENTS_CONFIG_EXPR)) {
		patched = patched.split(ADSAGENTS_CONFIG_EXPR).join(PATCHED_CONFIG_EXPR);
		changed = true;
	}

	if (!patched.includes(PATCHED_CONFIG_EXPR)) {
		patched = patched.split(LEGACY_CONFIG_EXPR).join(PATCHED_CONFIG_EXPR);
		changed = patched !== source || changed;
	}

	if (relativePath === "index.ts") {
		const workflowDefaultOriginal = 'const workflow = resolveWorkflow(params.workflow ?? configWorkflow, ctx?.hasUI !== false);';
		const workflowDefaultPatched = 'const workflow = resolveWorkflow(params.workflow ?? configWorkflow ?? "none", ctx?.hasUI !== false);';
		if (patched.includes(workflowDefaultOriginal)) {
			patched = patched.replace(workflowDefaultOriginal, workflowDefaultPatched);
			changed = true;
		}
		if (patched.includes('summary-review = open curator with auto summary draft (default)')) {
			patched = patched.replace(
				'summary-review = open curator with auto summary draft (default)',
				'summary-review = open curator with auto summary draft (opt-in)',
			);
			changed = true;
		}
	}

	if (relativePath === "index.ts" && changed) {
		patched = patched.replace('import { join } from "node:path";', 'import { dirname, join } from "node:path";');
		patched = patched.replace('const dir = join(homedir(), ".pi");', "const dir = dirname(WEB_SEARCH_CONFIG_PATH);");
	}

	return patched;
}
