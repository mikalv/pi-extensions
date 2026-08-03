import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { resolveCompactAfterTokens } from "../config.js";
import { rawTokensSinceLastCompaction, type Entry } from "../session-ledger/index.js";
import type { Runtime } from "../runtime.js";

/**
 * Regex matching Pi's internal retryable error detection.
 * When the last assistant message in agent_end has stopReason "error" matching this pattern,
 * Pi will auto-retry — we must not trigger compaction between attempts.
 */
const RETRYABLE_ERROR_RE =
	/overloaded|provider.?returned.?error|rate.?limit|too many requests|429|500|502|503|504|service.?unavailable|server.?error|internal.?error|network.?error|connection.?error|connection.?refused|connection.?lost|websocket.?closed|websocket.?error|other side closed|fetch failed|upstream.?connect|reset before headers|socket hang up|ended without|http2 request did not get a response|timed? out|timeout|terminated|retry delay/i;

const DEFERRED_RETRY_MS = 2_500;

export function registerCompactionTrigger(pi: ExtensionAPI, runtime: Runtime): void {
	const clearDeferredRetry = () => {
		if (runtime.compactDeferredTimer) {
			clearTimeout(runtime.compactDeferredTimer);
			runtime.compactDeferredTimer = null;
		}
	};

	const scheduleDeferredRetry = (ctx: any, threshold: number, hasUI: boolean, ui: any) => {
		if (runtime.compactDeferredTimer) return;
		if (!runtime.compactDeferredNotified && hasUI) {
			runtime.compactDeferredNotified = true;
			ui?.notify(
				"Observational memory: compaction deferred — agent became busy before compaction; will retry when idle",
				"info",
			);
		}
		runtime.compactDeferredTimer = setTimeout(() => {
			runtime.compactDeferredTimer = null;
			attemptCompaction(ctx, threshold, hasUI, ui);
		}, DEFERRED_RETRY_MS);
	};

	const attemptCompaction = (ctx: any, threshold: number, hasUI: boolean, ui: any) => {
		try {
			if (!ctx.isIdle()) {
				runtime.compactInFlight = false;
				scheduleDeferredRetry(ctx, threshold, hasUI, ui);
				return;
			}
			clearDeferredRetry();
			runtime.compactDeferredNotified = false;
			const currentEntries = ctx.sessionManager.getBranch() as Entry[];
			const currentTokens = rawTokensSinceLastCompaction(currentEntries);
			if (currentTokens < threshold) {
				runtime.compactInFlight = false;
				if (hasUI) ui?.notify(
					"Observational memory: compaction skipped — another compaction already ran before deferred compaction",
					"info",
				);
				return;
			}
			ctx.compact({
				onComplete: () => {
					runtime.compactInFlight = false;
					clearDeferredRetry();
					runtime.compactDeferredNotified = false;
					if (hasUI) ui?.notify("Observational memory: compaction complete", "info");
				},
				onError: (error: { message: string }) => {
					runtime.compactInFlight = false;
					clearDeferredRetry();
					runtime.compactDeferredNotified = false;
					if (error.message === "Compaction cancelled") {
						return;
					}
					if (hasUI) ui?.notify(`Observational memory: ${error.message}`, "error");
				},
			});
		} catch (error) {
			runtime.compactInFlight = false;
			clearDeferredRetry();
			runtime.compactDeferredNotified = false;
			const msg = error instanceof Error ? error.message : String(error);
			if (hasUI) ui?.notify(`Observational memory: compact threw: ${msg}`, "error");
		}
	};

	pi.on("agent_end", (event: any, ctx: any) => {
		runtime.ensureConfig(ctx.cwd);
		if (runtime.config.passive === true) return;
		if (runtime.compactInFlight) return;

		// Don't trigger compaction if Pi will auto-retry — the agent hasn't truly finished.
		// Pi emits agent_end before its own retry check, so we must detect this ourselves.
		// The next agent_end (after retry succeeds or exhausts attempts) will re-evaluate.
		const lastAssistant = [...event.messages].reverse().find(
			(m): m is Extract<typeof m, { role: "assistant" }> => m.role === "assistant",
		);
		if (
			lastAssistant
			&& lastAssistant.stopReason === "error"
			&& lastAssistant.errorMessage
			&& RETRYABLE_ERROR_RE.test(lastAssistant.errorMessage)
		) {
			return;
		}

		const entries = ctx.sessionManager.getBranch() as Entry[];
		const tokens = rawTokensSinceLastCompaction(entries);
		const contextWindow = typeof ctx.model?.contextWindow === "number" ? ctx.model.contextWindow : undefined;
		const threshold = resolveCompactAfterTokens(runtime.config, contextWindow);
		if (tokens < threshold) return;

		const hasUI = ctx.hasUI;
		const ui = ctx.ui;

		if (hasUI) ui?.notify(
			`Observational memory: compaction threshold reached (~${tokens.toLocaleString()} tokens); triggering compaction`,
			"info",
		);

		runtime.compactInFlight = true;
		clearDeferredRetry();
		setTimeout(() => {
			attemptCompaction(ctx, threshold, hasUI, ui);
		}, 0);
	});
}
