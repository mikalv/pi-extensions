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

export default function observationalMemory(pi: ExtensionAPI) {
	const runtime = new Runtime();

	registerConsolidationTrigger(pi, runtime);
	registerCompactionTrigger(pi, runtime);
	registerCompactionHook(pi, runtime);

	registerStatusCommand(pi, runtime);
	registerViewCommand(pi, runtime);
	registerRecallTool(pi);

	pi.on("turn_end", (_event, ctx) => {
		if (!ctx.hasUI) return;
		let phase: string;
		if (runtime.consolidationInFlight) {
			phase = `⚙️ om: ${runtime.consolidationPhase ?? "running"}…`;
		} else {
			try {
				const entries = ctx.sessionManager.getBranch() as Entry[];
				const folded = foldLedger(entries);
				const proj = fullProjection(entries);
				phase = `👁 om: ${folded.observations.length} obs · ${proj.reflections.length} refl`;
			} catch {
				phase = "👁 om: ready";
			}
		}
		ctx.ui.setStatus(OM_STATUS_KEY, phase);
		pi.events.emit("atelier:memory-status", { key: "mm-om", line: phase });
	});

	pi.on("before_agent_start", (_event, ctx) => {
		if (!ctx.hasUI) return;
		const status = "⏳ om: thinking…";
		ctx.ui.setStatus(OM_STATUS_KEY, status);
		pi.events.emit("atelier:memory-status", { key: "mm-om", line: status });
		return {};
	});

	pi.on("session_start", (_event, ctx) => {
		runtime.reloadConfig(ctx.cwd);
		ctx.ui.setStatus(OM_STATUS_KEY, "👁 om: —");
	});
}
