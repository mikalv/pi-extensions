export const TOKEN_RE = /^[a-z0-9][a-z0-9._-]*$/;

const DURATION_RE = /^(\d+)(ms|s|m|h)$/;
const UNIT_MS: Record<string, number> = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 };

const CONTINUE_MAX_LEN = 200;
const CONTINUE_RE = /^continue:\s*(.*)$/i;

export function parseDuration(value: unknown): number | null {
	if (typeof value === "number") {
		return Number.isFinite(value) && value > 0 ? value : null;
	}
	if (typeof value !== "string") return null;
	const match = DURATION_RE.exec(value.trim());
	if (!match) return null;
	const amount = Number(match[1]);
	if (amount <= 0) return null;
	return amount * UNIT_MS[match[2]];
}

export interface ContinueLine {
	raw: string;
	tokens: string[];
}

export function parseContinueLine(output: string): ContinueLine | null {
	const lines = output.split("\n");
	let raw: string | undefined;
	for (let i = lines.length - 1; i >= 0; i--) {
		const candidate = lines[i].trim();
		if (candidate) {
			raw = candidate;
			break;
		}
	}
	if (!raw || raw.length >= CONTINUE_MAX_LEN) return null;

	const match = CONTINUE_RE.exec(raw);
	if (!match) return null;

	const rest = match[1].trim();
	const bracketed = /^\[(.*)\]$/.exec(rest);
	const inner = bracketed ? bracketed[1] : rest;

	const tokens = inner
		.split(",")
		.map((part) => part.trim().toLowerCase())
		.filter((part) => part.length > 0);

	if (!bracketed && tokens.length !== 1) return null;
	if (tokens.some((token) => !TOKEN_RE.test(token))) return null;

	return { raw, tokens };
}
