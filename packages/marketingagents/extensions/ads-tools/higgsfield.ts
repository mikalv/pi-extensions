import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

import { formatCliResult, runCli, tryParseJson } from "./shared.js";

const HIGGSFIELD_BIN = process.env.HIGGSFIELD_BIN ?? "higgsfield";
const DEFAULT_TIMEOUT_MS = 600_000;

export function registerHiggsfieldTools(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "higgsfield_balance",
		label: "Higgsfield Balance",
		description: "Check the Higgsfield account balance / available credits before launching generation jobs.",
		parameters: Type.Object({}),
		async execute() {
			const result = await runCli(HIGGSFIELD_BIN, ["balance", "--json"], { timeoutMs: 30_000 });
			const text = formatCliResult(result);
			return { content: [{ type: "text", text }], details: tryParseJson(result.stdout) };
		},
	});

	pi.registerTool({
		name: "higgsfield_list_workspaces",
		label: "Higgsfield List Workspaces",
		description: "List Higgsfield workspaces available to the authenticated user.",
		parameters: Type.Object({}),
		async execute() {
			const result = await runCli(HIGGSFIELD_BIN, ["workspaces", "list", "--json"], { timeoutMs: 30_000 });
			return { content: [{ type: "text", text: formatCliResult(result) }], details: tryParseJson(result.stdout) };
		},
	});

	pi.registerTool({
		name: "higgsfield_select_workspace",
		label: "Higgsfield Select Workspace",
		description: "Select the Higgsfield workspace used for subsequent generation jobs.",
		parameters: Type.Object({
			workspaceId: Type.String({ description: "Workspace ID to select." }),
		}),
		async execute(_id, params) {
			const result = await runCli(HIGGSFIELD_BIN, ["workspaces", "select", params.workspaceId], { timeoutMs: 30_000 });
			return { content: [{ type: "text", text: formatCliResult(result) }], details: { workspaceId: params.workspaceId } };
		},
	});

	pi.registerTool({
		name: "higgsfield_generate_image",
		label: "Higgsfield Generate Image",
		description:
			"Generate a still ad creative via Higgsfield. Returns a job ID. Poll with higgsfield_job_status until done, then download with higgsfield_show_medias.",
		parameters: Type.Object({
			prompt: Type.String({ description: "Generation prompt — describe the visual, style, subject, mood, brand cues." }),
			aspect: Type.Optional(
				Type.String({ description: "Aspect ratio: 1:1 (feed/square), 9:16 (story/reel), 16:9, 4:5 (default Meta feed)." }),
			),
			model: Type.Optional(Type.String({ description: "Higgsfield model id; default uses workspace default." })),
			seed: Type.Optional(Type.Integer({ description: "Optional deterministic seed." })),
			variants: Type.Optional(Type.Integer({ description: "Number of variants to generate in this job." })),
		}),
		async execute(_id, params) {
			const args = ["generate", "image", "--prompt", params.prompt, "--json"];
			if (params.aspect) args.push("--aspect", params.aspect);
			if (params.model) args.push("--model", params.model);
			if (typeof params.seed === "number") args.push("--seed", String(params.seed));
			if (typeof params.variants === "number") args.push("--variants", String(params.variants));
			const result = await runCli(HIGGSFIELD_BIN, args, { timeoutMs: DEFAULT_TIMEOUT_MS });
			return { content: [{ type: "text", text: formatCliResult(result) }], details: tryParseJson(result.stdout) };
		},
	});

	pi.registerTool({
		name: "higgsfield_generate_video",
		label: "Higgsfield Generate Video",
		description:
			"Generate a motion ad creative via Higgsfield. Returns a job ID. Poll with higgsfield_job_status until done, then download with higgsfield_show_medias.",
		parameters: Type.Object({
			prompt: Type.String({ description: "Generation prompt." }),
			aspect: Type.Optional(Type.String({ description: "Aspect ratio: 9:16 (reel/story), 1:1, 16:9." })),
			durationSeconds: Type.Optional(Type.Integer({ description: "Target duration in seconds." })),
			model: Type.Optional(Type.String({ description: "Higgsfield video model id." })),
			seed: Type.Optional(Type.Integer({ description: "Optional deterministic seed." })),
		}),
		async execute(_id, params) {
			const args = ["generate", "video", "--prompt", params.prompt, "--json"];
			if (params.aspect) args.push("--aspect", params.aspect);
			if (typeof params.durationSeconds === "number") args.push("--duration", String(params.durationSeconds));
			if (params.model) args.push("--model", params.model);
			if (typeof params.seed === "number") args.push("--seed", String(params.seed));
			const result = await runCli(HIGGSFIELD_BIN, args, { timeoutMs: DEFAULT_TIMEOUT_MS });
			return { content: [{ type: "text", text: formatCliResult(result) }], details: tryParseJson(result.stdout) };
		},
	});

	pi.registerTool({
		name: "higgsfield_job_status",
		label: "Higgsfield Job Status",
		description: "Check the status of a Higgsfield generation job. Use after higgsfield_generate_image/video.",
		parameters: Type.Object({
			jobId: Type.String({ description: "Higgsfield job ID returned by a generate call." }),
		}),
		async execute(_id, params) {
			const result = await runCli(HIGGSFIELD_BIN, ["jobs", "status", params.jobId, "--json"], { timeoutMs: 30_000 });
			return { content: [{ type: "text", text: formatCliResult(result) }], details: tryParseJson(result.stdout) };
		},
	});

	pi.registerTool({
		name: "higgsfield_show_medias",
		label: "Higgsfield Show Medias",
		description: "Download / show the media outputs of a finished Higgsfield job. Saves files to the given output directory.",
		parameters: Type.Object({
			jobId: Type.String({ description: "Higgsfield job ID." }),
			outputDir: Type.String({ description: "Local directory to save assets." }),
		}),
		async execute(_id, params) {
			const result = await runCli(
				HIGGSFIELD_BIN,
				["medias", "download", "--job", params.jobId, "--out", params.outputDir, "--json"],
				{ timeoutMs: DEFAULT_TIMEOUT_MS },
			);
			return { content: [{ type: "text", text: formatCliResult(result) }], details: tryParseJson(result.stdout) };
		},
	});

	pi.registerTool({
		name: "higgsfield_models_explore",
		label: "Higgsfield Models",
		description: "List Higgsfield models available in the current workspace.",
		parameters: Type.Object({}),
		async execute() {
			const result = await runCli(HIGGSFIELD_BIN, ["models", "list", "--json"], { timeoutMs: 30_000 });
			return { content: [{ type: "text", text: formatCliResult(result) }], details: tryParseJson(result.stdout) };
		},
	});
}
