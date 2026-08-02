/**
 * Temporary Pi extension used only for smoke tests.
 * Prints after-start tool presence once session_start fires.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function probe(pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		// after-start queue is serial (~300-800ms on this machine)
		await new Promise((r) => setTimeout(r, 2000));
		const tools =
			typeof pi.getActiveTools === "function" ? pi.getActiveTools() : [];
		const need = [
			"todo",
			"ask_user_question",
			"subagent",
			"subagent_wait",
			"hypa_shell",
			"hypa_read",
			"web_search",
			"mcp",
			"lens_diagnostics",
		];
		const present = need.filter((t) => tools.includes(t));
		const missing = need.filter((t) => !tools.includes(t));
		// on-demand should still be missing unless auto-loaded
		const onDemandStillPending = ["web_search", "mcp", "lens_diagnostics"].every(
			(t) => !tools.includes(t),
		);
		console.error(
			`PI_LAZY_PROBE tools=${tools.length} present=${present.join("|") || "-"} missing=${missing.join("|") || "-"} onDemandPending=${onDemandStillPending}`,
		);
		console.error(`PI_LAZY_PROBE_ALL ${tools.join(",")}`);
		try {
			ctx.ui?.notify?.("pi-lazy probe complete", "info");
		} catch {
			/* headless */
		}
	});
}
