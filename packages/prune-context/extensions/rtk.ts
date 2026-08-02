/**
 * Optional RTK bash rewrite (ported from insp2/pi-rtk-rewrite).
 * When `rtk` is on PATH, rewrite bash commands to token-efficient forms
 * before execution. Failures are non-blocking.
 *
 * Disable: PRUNE_RTK=0 (or RTK_DISABLE_REWRITE=1 on the command itself).
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const REWRITE_TIMEOUT_MS = 5_000;
const AVAILABILITY_CHECK_TIMEOUT_MS = 2_000;

function rtkEnabled(): boolean {
	const raw = process.env.PRUNE_RTK?.trim().toLowerCase();
	if (raw === "0" || raw === "false" || raw === "off") return false;
	return true;
}

function shouldSkipRewrite(command: string): boolean {
	if (!command) return true;
	if (command === "rtk" || command.startsWith("rtk ")) return true;
	if (/(?:^|\s)RTK_DISABLE_REWRITE=(?:1|true|yes|on)(?:\s|$)/i.test(command)) return true;
	if (/(?:^|\s)RTK_DISABLED=(?:1|true|yes|on)(?:\s|$)/i.test(command)) return true;
	return false;
}

export function installRtkRewrite(pi: ExtensionAPI): void {
	if (!rtkEnabled()) return;

	let rtkChecked = false;
	let rtkAvailable = false;

	async function ensureRtkAvailable(): Promise<boolean> {
		if (rtkChecked) return rtkAvailable;
		rtkChecked = true;
		try {
			const version = await pi.exec("rtk", ["--version"], {
				timeout: AVAILABILITY_CHECK_TIMEOUT_MS,
			});
			rtkAvailable = version.code === 0;
		} catch {
			rtkAvailable = false;
		}
		return rtkAvailable;
	}

	pi.on("tool_call", async (event, ctx) => {
		const toolName = (event as { toolName?: string }).toolName;
		if (toolName !== "bash") return;

		const input = (event as { input?: Record<string, unknown> }).input;
		if (!input || typeof input.command !== "string") return;
		const original = input.command.trim();
		if (shouldSkipRewrite(original)) return;

		const available = await ensureRtkAvailable();
		if (!available) return;

		try {
			const result = await pi.exec("rtk", ["rewrite", original], {
				signal: ctx.signal,
				timeout: REWRITE_TIMEOUT_MS,
			});
			// 0 = applied, 1 = no rewrite, 2 = deny, 3 = ask + rewritten
			if (result.code === 1 || result.code === 2) return;
			if (result.code !== 0 && result.code !== 3) return;
			const rewritten = result.stdout.trim();
			if (!rewritten || rewritten === original) return;
			input.command = rewritten;
		} catch {
			// keep original command
		}
	});
}
