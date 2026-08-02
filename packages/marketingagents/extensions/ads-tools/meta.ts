import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

import { formatCliResult, runCli, tryParseJson } from "./shared.js";

const META_BIN = process.env.META_BIN ?? "meta";
const DEFAULT_TIMEOUT_MS = 120_000;

export function registerMetaTools(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "meta_list_campaigns",
		label: "Meta List Campaigns",
		description: "List Meta Ads campaigns for the authenticated ad account.",
		parameters: Type.Object({
			accountId: Type.Optional(Type.String({ description: "Meta ad account ID (act_...). Defaults to the configured default." })),
			status: Type.Optional(Type.String({ description: "Filter by status: ACTIVE, PAUSED, ARCHIVED, ALL (default ACTIVE)." })),
		}),
		async execute(_id, params) {
			const args = ["campaigns", "list", "--json"];
			if (params.accountId) args.push("--account", params.accountId);
			if (params.status) args.push("--status", params.status);
			const result = await runCli(META_BIN, args, { timeoutMs: DEFAULT_TIMEOUT_MS });
			return { content: [{ type: "text", text: formatCliResult(result) }], details: tryParseJson(result.stdout) };
		},
	});

	pi.registerTool({
		name: "meta_list_adsets",
		label: "Meta List Adsets",
		description: "List ad sets for a Meta campaign.",
		parameters: Type.Object({
			campaignId: Type.String({ description: "Meta campaign ID." }),
		}),
		async execute(_id, params) {
			const result = await runCli(META_BIN, ["adsets", "list", "--campaign", params.campaignId, "--json"], {
				timeoutMs: DEFAULT_TIMEOUT_MS,
			});
			return { content: [{ type: "text", text: formatCliResult(result) }], details: tryParseJson(result.stdout) };
		},
	});

	pi.registerTool({
		name: "meta_list_ads",
		label: "Meta List Ads",
		description: "List ads under a Meta campaign or ad set.",
		parameters: Type.Object({
			campaignId: Type.Optional(Type.String({ description: "Meta campaign ID." })),
			adsetId: Type.Optional(Type.String({ description: "Meta adset ID." })),
		}),
		async execute(_id, params) {
			const args = ["ads", "list", "--json"];
			if (params.campaignId) args.push("--campaign", params.campaignId);
			if (params.adsetId) args.push("--adset", params.adsetId);
			const result = await runCli(META_BIN, args, { timeoutMs: DEFAULT_TIMEOUT_MS });
			return { content: [{ type: "text", text: formatCliResult(result) }], details: tryParseJson(result.stdout) };
		},
	});

	pi.registerTool({
		name: "meta_insights",
		label: "Meta Insights",
		description:
			"Pull Meta Ads insights (spend, impressions, CTR, CPC, CPM, conversions, ROAS, frequency) for a campaign / adset / ad over a window.",
		parameters: Type.Object({
			objectId: Type.String({ description: "Meta object ID (campaign, adset, or ad)." }),
			level: Type.Optional(Type.String({ description: "Reporting level: campaign, adset, ad. Default: campaign." })),
			windowDays: Type.Optional(Type.Integer({ description: "Lookback window in days. Default 7." })),
			breakdown: Type.Optional(Type.String({ description: "Optional breakdown: age, gender, region, placement." })),
		}),
		async execute(_id, params) {
			const args = ["insights", params.objectId, "--json"];
			if (params.level) args.push("--level", params.level);
			if (typeof params.windowDays === "number") args.push("--window", String(params.windowDays));
			if (params.breakdown) args.push("--breakdown", params.breakdown);
			const result = await runCli(META_BIN, args, { timeoutMs: DEFAULT_TIMEOUT_MS });
			return { content: [{ type: "text", text: formatCliResult(result) }], details: tryParseJson(result.stdout) };
		},
	});

	pi.registerTool({
		name: "meta_upload_creative",
		label: "Meta Upload Creative",
		description: "Upload a local image or video file as a creative asset to Meta. Returns the asset ID. Does NOT launch any ad.",
		parameters: Type.Object({
			assetPath: Type.String({ description: "Local path to the asset file." }),
			accountId: Type.Optional(Type.String({ description: "Meta ad account ID (act_...). Defaults to configured default." })),
			name: Type.Optional(Type.String({ description: "Optional display name for the asset." })),
		}),
		async execute(_id, params) {
			const args = ["creatives", "upload", params.assetPath, "--json"];
			if (params.accountId) args.push("--account", params.accountId);
			if (params.name) args.push("--name", params.name);
			const result = await runCli(META_BIN, args, { timeoutMs: DEFAULT_TIMEOUT_MS });
			return { content: [{ type: "text", text: formatCliResult(result) }], details: tryParseJson(result.stdout) };
		},
	});

	pi.registerTool({
		name: "meta_pause_ad",
		label: "Meta Pause Ad",
		description:
			"Pause a Meta ad or adset. Use only when the user has explicitly authorized changes — the tracker subagent normally returns recommendations, not actions.",
		parameters: Type.Object({
			objectId: Type.String({ description: "Meta object ID (ad or adset)." }),
			level: Type.String({ description: "Object level: ad or adset." }),
		}),
		async execute(_id, params) {
			const result = await runCli(META_BIN, [params.level, "pause", params.objectId, "--json"], { timeoutMs: DEFAULT_TIMEOUT_MS });
			return { content: [{ type: "text", text: formatCliResult(result) }], details: tryParseJson(result.stdout) };
		},
	});

	pi.registerTool({
		name: "meta_update_budget",
		label: "Meta Update Budget",
		description:
			"Update the daily or lifetime budget on a Meta adset. Use only when the user has explicitly authorized changes.",
		parameters: Type.Object({
			adsetId: Type.String({ description: "Meta adset ID." }),
			dailyBudgetCents: Type.Optional(Type.Integer({ description: "New daily budget in account-currency cents." })),
			lifetimeBudgetCents: Type.Optional(Type.Integer({ description: "New lifetime budget in account-currency cents." })),
		}),
		async execute(_id, params) {
			const args = ["adsets", "update-budget", params.adsetId, "--json"];
			if (typeof params.dailyBudgetCents === "number") args.push("--daily", String(params.dailyBudgetCents));
			if (typeof params.lifetimeBudgetCents === "number") args.push("--lifetime", String(params.lifetimeBudgetCents));
			const result = await runCli(META_BIN, args, { timeoutMs: DEFAULT_TIMEOUT_MS });
			return { content: [{ type: "text", text: formatCliResult(result) }], details: tryParseJson(result.stdout) };
		},
	});
}
