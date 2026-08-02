import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { registerDiscoveryCommands } from "./core-tools/discovery.js";
import { registerMarketingAgentsModelCommand } from "./core-tools/marketingagents-model.js";
import { installMarketingAgentsHeader } from "./core-tools/header.js";
import { registerHelpCommand } from "./core-tools/help.js";
import { registerInitCommand, registerOutputsCommand } from "./core-tools/project.js";
import { registerServiceTierControls } from "./core-tools/service-tier.js";

export default function coreTools(pi: ExtensionAPI): void {
	const cache: { agentSummaryPromise?: Promise<{ agents: string[]; chains: string[] }> } = {};

	pi.on("session_start", async (_event, ctx) => {
		await installMarketingAgentsHeader(pi, ctx, cache);
	});

	registerDiscoveryCommands(pi);
	registerMarketingAgentsModelCommand(pi);
	registerHelpCommand(pi);
	registerInitCommand(pi);
	registerOutputsCommand(pi);
	registerServiceTierControls(pi);
}
