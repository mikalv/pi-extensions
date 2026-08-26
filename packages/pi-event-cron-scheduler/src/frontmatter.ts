import { Cron } from "croner";
import { parse as parseYaml } from "yaml";

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

export type Concurrency = "skip" | "queue" | "parallel";
export type When = "success" | "failure" | "always";
export type SinkKind = "event" | "webhook" | "notify" | "registry";

export interface EmitSpec {
	kind: SinkKind;
	target: string;
	when: When;
	ifTokens?: string[];
	args?: Record<string, unknown>;
}

export interface JobDefinition {
	id: string;
	path: string;
	workspace: string;
	description?: string;
	agent?: string;
	runtime?: string;
	model?: string;
	thinking?: string | boolean;
	tools?: string[];
	skills?: string[];
	turnBudget?: number;
	expectedRuntimeMs?: number;
	timeoutMs?: number;
	cron?: string;
	timezone?: string;
	on: string[];
	concurrency: Concurrency;
	memory: boolean;
	emits: EmitSpec[];
	body: string;
}

export interface InvalidJob {
	path: string;
	id?: string;
	errors: string[];
}

export type ParseJobResult = { ok: true; job: JobDefinition } | { ok: false; invalid: InvalidJob };

export const RESERVED_EVENT_PREFIXES = ["cron.", "job.", "chain.", "sink."] as const;

const KNOWN_FIELDS = new Set([
	"id",
	"description",
	"agent",
	"runtime",
	"model",
	"thinking",
	"tools",
	"skills",
	"turnBudget",
	"expectedRuntime",
	"timeout",
	"schedule",
	"on",
	"concurrency",
	"memory",
	"emits",
]);

const EMIT_META_KEYS = new Set(["when", "if", "payload", "body"]);
const CONCURRENCIES: Concurrency[] = ["skip", "queue", "parallel"];
const WHENS: When[] = ["success", "failure", "always"];

export function validateCron(expr: string, timezone?: string): string | null {
	try {
		const cron = new Cron(expr, { timezone, paused: true });
		if (!cron.nextRun()) return `cron expression "${expr}" never runs`;
		cron.stop();
		return null;
	} catch (error: any) {
		return `invalid cron: ${error?.message ?? String(error)}`;
	}
}

function splitFrontmatter(content: string): { raw: string; body: string } | null {
	const normalized = content.replace(/\r\n/g, "\n");
	if (!normalized.startsWith("---\n")) return null;
	const end = normalized.indexOf("\n---", 3);
	if (end === -1) return null;
	return { raw: normalized.slice(4, end + 1), body: normalized.slice(end + 5).trim() };
}

function asStringArray(value: unknown): string[] | null {
	if (!Array.isArray(value)) return null;
	if (value.some((item) => typeof item !== "string")) return null;
	return value as string[];
}

function parseEmit(entry: unknown, errors: string[], index: number): EmitSpec | null {
	if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
		errors.push(`emits[${index}] must be a mapping`);
		return null;
	}
	const raw = entry as Record<string, unknown>;

	const when = raw.when === undefined ? "success" : raw.when;
	if (typeof when !== "string" || !WHENS.includes(when as When)) {
		errors.push(`emits[${index}].when must be one of ${WHENS.join(", ")}`);
		return null;
	}

	let ifTokens: string[] | undefined;
	if (raw.if !== undefined) {
		const list = asStringArray(raw.if);
		if (!list || list.length === 0) {
			errors.push(`emits[${index}].if must be a non-empty list of strings`);
			return null;
		}
		ifTokens = list.map((token) => token.trim().toLowerCase());
		const bad = ifTokens.find((token) => !TOKEN_RE.test(token));
		if (bad) {
			errors.push(`emits[${index}].if token "${bad}" must match ${TOKEN_RE}`);
			return null;
		}
	}

	const handlerKeys = Object.keys(raw).filter((key) => !EMIT_META_KEYS.has(key));
	if (handlerKeys.length !== 1) {
		errors.push(`emits[${index}] must have exactly one handler key, found ${handlerKeys.length}`);
		return null;
	}
	const key = handlerKeys[0];
	const value = raw[key];

	if (key === "event") {
		if (typeof value !== "string" || !value) {
			errors.push(`emits[${index}].event must be a non-empty string`);
			return null;
		}
		const reserved = RESERVED_EVENT_PREFIXES.find((prefix) => value.startsWith(prefix));
		if (reserved) {
			errors.push(`emits[${index}].event "${value}" uses reserved prefix "${reserved}"`);
			return null;
		}
		return {
			kind: "event",
			target: value,
			when: when as When,
			ifTokens,
			args: raw.payload as Record<string, unknown> | undefined,
		};
	}

	if (key === "webhook") {
		if (typeof value !== "string" || !/^https?:\/\//.test(value)) {
			errors.push(`emits[${index}].webhook must be an http(s) URL`);
			return null;
		}
		return {
			kind: "webhook",
			target: value,
			when: when as When,
			ifTokens,
			args: raw.body as Record<string, unknown> | undefined,
		};
	}

	if (key === "notify") {
		if (typeof value !== "string" || !value) {
			errors.push(`emits[${index}].notify must be a non-empty string`);
			return null;
		}
		return { kind: "notify", target: value, when: when as When, ifTokens };
	}

	if (value !== undefined && (typeof value !== "object" || value === null || Array.isArray(value))) {
		errors.push(`emits[${index}].${key} must be a mapping of arguments`);
		return null;
	}
	return {
		kind: "registry",
		target: key,
		when: when as When,
		ifTokens,
		args: (value as Record<string, unknown>) ?? {},
	};
}

export function parseJobFile(input: { path: string; workspace: string; content: string }): ParseJobResult {
	const errors: string[] = [];
	const split = splitFrontmatter(input.content);
	if (!split) {
		return { ok: false, invalid: { path: input.path, errors: ["missing YAML frontmatter"] } };
	}

	let fm: Record<string, unknown>;
	try {
		const parsed = parseYaml(split.raw);
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
			return { ok: false, invalid: { path: input.path, errors: ["frontmatter must be a mapping"] } };
		}
		fm = parsed as Record<string, unknown>;
	} catch (error: any) {
		return {
			ok: false,
			invalid: { path: input.path, errors: [`invalid YAML: ${error?.message ?? String(error)}`] },
		};
	}

	for (const key of Object.keys(fm)) {
		if (!KNOWN_FIELDS.has(key)) errors.push(`unknown field "${key}"`);
	}

	const id = fm.id;
	if (typeof id !== "string" || !id) errors.push("id is required");
	else if (!TOKEN_RE.test(id)) errors.push(`id "${id}" must match ${TOKEN_RE}`);

	if (!split.body) errors.push("body must not be empty");

	let cron: string | undefined;
	let timezone: string | undefined;
	if (fm.schedule !== undefined) {
		const schedule = fm.schedule;
		if (typeof schedule !== "object" || schedule === null || Array.isArray(schedule)) {
			errors.push("schedule must be a mapping");
		} else {
			const s = schedule as Record<string, unknown>;
			if (s.timezone !== undefined && typeof s.timezone !== "string") errors.push("schedule.timezone must be a string");
			else timezone = s.timezone as string | undefined;
			if (s.cron !== undefined) {
				if (typeof s.cron !== "string") errors.push("schedule.cron must be a string");
				else {
					const cronError = validateCron(s.cron, timezone);
					if (cronError) errors.push(cronError);
					else cron = s.cron;
				}
			}
		}
	}

	let on: string[] = [];
	if (fm.on !== undefined) {
		const list = asStringArray(fm.on);
		if (!list) errors.push("on must be a list of strings");
		else on = list;
	}

	let concurrency: Concurrency = "skip";
	if (fm.concurrency !== undefined) {
		if (typeof fm.concurrency !== "string" || !CONCURRENCIES.includes(fm.concurrency as Concurrency)) {
			errors.push(`concurrency must be one of ${CONCURRENCIES.join(", ")}`);
		} else concurrency = fm.concurrency as Concurrency;
	}

	if (fm.memory !== undefined && typeof fm.memory !== "boolean") errors.push("memory must be a boolean");

	let expectedRuntimeMs: number | undefined;
	if (fm.expectedRuntime !== undefined) {
		const ms = parseDuration(fm.expectedRuntime);
		if (ms === null) errors.push("expectedRuntime must be a positive duration such as 2m");
		else expectedRuntimeMs = ms;
	}

	let timeoutMs: number | undefined;
	if (fm.timeout !== undefined) {
		const ms = parseDuration(fm.timeout);
		if (ms === null) errors.push("timeout must be a positive duration such as 15m");
		else timeoutMs = ms;
	}

	let tools: string[] | undefined;
	if (fm.tools !== undefined) {
		const list = asStringArray(fm.tools);
		if (!list) errors.push("tools must be a list of strings");
		else tools = list;
	}

	let skills: string[] | undefined;
	if (fm.skills !== undefined) {
		const list = asStringArray(fm.skills);
		if (!list) errors.push("skills must be a list of strings");
		else skills = list;
	}

	const emits: EmitSpec[] = [];
	if (fm.emits !== undefined) {
		if (!Array.isArray(fm.emits)) errors.push("emits must be a list");
		else {
			fm.emits.forEach((entry, index) => {
				const spec = parseEmit(entry, errors, index);
				if (spec) emits.push(spec);
			});
		}
	}

	if (errors.length > 0) {
		return {
			ok: false,
			invalid: { path: input.path, id: typeof id === "string" ? id : undefined, errors },
		};
	}

	return {
		ok: true,
		job: {
			id: id as string,
			path: input.path,
			workspace: input.workspace,
			description: fm.description as string | undefined,
			agent: fm.agent as string | undefined,
			runtime: fm.runtime as string | undefined,
			model: fm.model as string | undefined,
			thinking: fm.thinking as string | boolean | undefined,
			tools,
			skills,
			turnBudget: fm.turnBudget as number | undefined,
			expectedRuntimeMs,
			timeoutMs,
			cron,
			timezone,
			on,
			concurrency,
			memory: fm.memory === true,
			emits,
			body: split.body,
		},
	};
}
