import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerStatusCommand } from "./commands/status.js";
import { registerViewCommand } from "./commands/view.js";
import { registerCompactionHook } from "./hooks/compaction-hook.js";
import { registerCompactionTrigger } from "./hooks/compaction-trigger.js";
import { registerConsolidationTrigger } from "./hooks/consolidation-trigger.js";
import { Runtime } from "./runtime.js";
import { registerRecallTool } from "./tools/recall-observation.js";
import { foldLedger, fullProjection, type Entry } from "./session-ledger/index.js";

const OM_STATUS_KEY = "mm-om";

function buildOMStatus(runtime: Runtime, entries: Entry[]): string {
	if (runtime.consolidationInFlight) {
		const phase = runtime.consolidationPhase ?? "running";
		return `⚙️ om: ${phase}…`;
	}
	if (runtime.compactInFlight || runtime.compactHookInFlight) {
		return "⚙️ om: compacting…";
	}
	const folded = foldLedger(entries);
	const full = fullProjection(entries);
	const obs = folded.observations.length;
	const refl = full.reflections.length;
	return `👁 om: ${obs} obs · ${refl} refl`;
}

export default function observationalMemory(pi: ExtensionAPI) {
	const runtime = new Runtime();

	registerConsolidationTrigger(pi, runtime);
	registerCompactionTrigger(pi, runtime);
	registerCompactionHook(pi, runtime);

	registerStatusCommand(pi, runtime);
	registerViewCommand(pi, runtime);
	registerRecallTool(pi);

	// Update Atelier sidebar status after each agent run
	pi.on("agent_settled", (_event, ctx) => {
		if (!ctx.hasUI) return;
		try {
			const entries = ctx.sessionManager.getBranch() as Entry[];
			ctx.ui.setStatus(OM_STATUS_KEY, buildOMStatus(runtime, entries));
		} catch {
			// best-effort
		}
	});

	// Also update while consolidation is running (picked up via turn_end re-renders)
	pi.on("turn_start", (_event, ctx) => {
		if (!ctx.hasUI || !runtime.consolidationInFlight) return;
		try {
			const entries = ctx.sessionManager.getBranch() as Entry[];
			ctx.ui.setStatus(OM_STATUS_KEY, buildOMStatus(runtime, entries));
		} catch {
			// best-effort
		}
	});

	pi.on("session_start", (_event, ctx) => {
		if (!ctx.hasUI) return;
		ctx.ui.setStatus(OM_STATUS_KEY, "👁 om: —");
	});
}
