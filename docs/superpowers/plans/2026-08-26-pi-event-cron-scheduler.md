# pi-event-cron-scheduler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a pi extension that runs markdown files in `<workspace>/scheduled/*.md` as isolated agents, triggered by cron and by named events those files emit to each other.

**Architecture:** Frontmatter is an `AgentDefinition` for `@meeh/pi-agent-core` plus trigger fields, so execution delegates to its control plane rather than reimplementing agent running. All triggers funnel through one append-only event log on disk; a single leader process, elected by lockfile heartbeat, tails that log and dispatches. Every module is pi-free and takes an injected clock, so the engine is testable without a running pi.

**Tech Stack:** TypeScript, `bun:test`, `croner` 10.0.1 for cron, `yaml` ^2.9.0 for frontmatter, `@meeh/pi-agent-core` as peer dependency, Node builtins for fs/os/path.

**Spec:** `docs/superpowers/specs/2026-08-26-pi-event-cron-scheduler-design.md`

## Global Constraints

- Package directory `packages/pi-event-cron-scheduler`, name `@meeh/pi-event-cron-scheduler`, `"type": "module"`, `"private": true`.
- Tests use `import { describe, it, expect } from "bun:test"`. Run one file with `bun test packages/pi-event-cron-scheduler/test/<name>.test.ts` from the repo root.
- Local imports in `src/` and `test/` use the `.js` extension even for `.ts` files, e.g. `import { parseDuration } from "../src/frontmatter.js"`. This matches every other package in this repo.
- Node builtins use the `node:` prefix: `node:fs/promises`, `node:path`, `node:os`.
- No module in `src/` may import from `@earendil-works/*` except `src/index.ts`. Everything else must run in a plain `bun test` process.
- Every function needing the current time takes it as a parameter or reads an injected `clock: () => number`. Never call `Date.now()` inside a module under test.
- State root is `~/.pi/agent/state/pi-event-cron-scheduler`, but every module takes `stateDir` as an argument. Never hardcode `homedir()` outside `src/index.ts`.
- Reserved event prefixes jobs may not emit: `cron.`, `job.`, `chain.`, `sink.`
- Job id charset: `^[a-z0-9][a-z0-9._-]*$`
- Continue line prefix is the literal `continue:`; token charset equals the job id charset; the whole line must be under 200 characters.
- `runs.json` keeps at most 50 records per job id. Event log retention keeps 30 days. Chain depth limit is 8.
- Default run deadline when no `timeout` is given: 10 minutes. Grace before a run is marked `abandoned` after abort: 60 seconds.
- Leader heartbeat interval 15s; a lock is stale when its heartbeat is older than 45s.
- Pre-existing unrelated failure: `bun test packages/pi-agent-core/test/types.test.ts` reports 15 pass / 1 fail on `main`. Do not fix it and do not treat it as caused by this work.

---

## File Structure

Created in `packages/pi-event-cron-scheduler/`:

| File | Responsibility |
| --- | --- |
| `package.json` | Package metadata, `pi.extensions` entry, dependencies |
| `src/frontmatter.ts` | Duration parsing, continue-line parsing, YAML frontmatter parsing, job validation |
| `src/state.ts` | `enabled.json`, `runs.json`, `cursor.json` — atomic reads and writes |
| `src/bus.ts` | Event log append, read-from-offset, daily rotation, retention |
| `src/leader.ts` | Leader lockfile with heartbeat and stale takeover |
| `src/sinks.ts` | Sink selection (`when` and `if` gating), builtin sinks, `globalThis` registry |
| `src/context.ts` | Context header, memory scratchpad, continue-line instruction block |
| `src/engine.ts` | Cron wiring, subscriptions, concurrency, deadlines, chain limit, crash recovery |
| `src/index.ts` | pi extension adapter: `cron_jobs` tool, `/cron` command, leader lifecycle |
| `README.md` | Usage, frontmatter reference, runtime caveats |
| `test/*.test.ts` | One test file per `src` module |

`src/context.ts` is not in the spec's module list. It exists because header construction
needs the memory file, the previous run, and the derived instruction block at once, and
putting that in `engine.ts` would make the engine the largest file in the package for no
reason.

## Shared Types

These are defined in Task 2 in `src/frontmatter.ts` and imported by every later task. They
are listed here so a worker reading a single task knows the exact shapes.

```ts
export type Concurrency = "skip" | "queue" | "parallel";
export type When = "success" | "failure" | "always";
export type SinkKind = "event" | "webhook" | "notify" | "registry";

export interface EmitSpec {
  kind: SinkKind;
  target: string;                          // event name | webhook url | notify message | registry sink name
  when: When;
  ifTokens?: string[];                     // from frontmatter `if:`, lowercased
  args?: Record<string, unknown>;          // event payload | webhook body | registry args
}

export interface JobDefinition {
  id: string;
  path: string;                            // absolute path to the markdown file
  workspace: string;                       // absolute workspace root
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

export interface ContinueLine {
  raw: string;
  tokens: string[];                        // lowercased; empty array for `continue: []`
}

export interface BusEvent {
  id: string;
  ts: string;                              // ISO 8601
  event: string;
  source: string;                          // "cron" | job id | "tool" | sink name
  runId?: string;
  chain: number;
  payload?: Record<string, unknown>;
}

export type RunStatus =
  | "running"
  | "completed"
  | "failed"
  | "timed_out"
  | "abandoned"
  | "interrupted";

export interface RunRow {
  runId: string;
  jobId: string;
  workspace: string;
  status: RunStatus;
  pid: number;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  verdict?: string;                        // the raw continue line
  continueTokens?: string[];
  outputTail?: string;
}
```

---

### Task 1: Package scaffold, duration parsing, continue-line parsing

Both parsers are pure string functions with no I/O, so they come first and every later task
can rely on them. The scaffold is folded in here because these are the first files that need
it.

**Files:**
- Create: `packages/pi-event-cron-scheduler/package.json`
- Create: `packages/pi-event-cron-scheduler/src/frontmatter.ts`
- Test: `packages/pi-event-cron-scheduler/test/frontmatter.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `parseDuration(value: unknown): number | null` — accepts a positive number of
    milliseconds, or a string like `90s`, `2m`, `1h`, `500ms`. Returns `null` for anything
    else, including `0`, negatives, and unknown units.
  - `parseContinueLine(output: string): ContinueLine | null`
  - `TOKEN_RE: RegExp` — the shared `^[a-z0-9][a-z0-9._-]*$` pattern.

- [ ] **Step 1: Create the package manifest**

`packages/pi-event-cron-scheduler/package.json`:

```json
{
  "name": "@meeh/pi-event-cron-scheduler",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Executable scheduled markdown jobs for pi, triggered by cron and by named events.",
  "main": "src/index.ts",
  "keywords": ["pi-package", "pi-extension", "scheduler", "events"],
  "pi": {
    "extensions": ["./src/index.ts"]
  },
  "dependencies": {
    "croner": "10.0.1",
    "yaml": "^2.9.0"
  },
  "peerDependencies": {
    "@earendil-works/pi-coding-agent": "*",
    "@earendil-works/pi-ai": "*",
    "@earendil-works/pi-tui": "*",
    "@meeh/pi-agent-core": "*",
    "typebox": "*"
  },
  "peerDependenciesMeta": {
    "@earendil-works/pi-coding-agent": { "optional": true },
    "@earendil-works/pi-ai": { "optional": true },
    "@earendil-works/pi-tui": { "optional": true },
    "@meeh/pi-agent-core": { "optional": true },
    "typebox": { "optional": true }
  },
  "license": "MIT"
}
```

- [ ] **Step 2: Write the failing test**

`packages/pi-event-cron-scheduler/test/frontmatter.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { parseContinueLine, parseDuration } from "../src/frontmatter.js";

describe("parseDuration", () => {
  it("accepts duration strings and passes through millisecond numbers", () => {
    expect(parseDuration("500ms")).toBe(500);
    expect(parseDuration("90s")).toBe(90_000);
    expect(parseDuration("2m")).toBe(120_000);
    expect(parseDuration("1h")).toBe(3_600_000);
    expect(parseDuration(" 2m ")).toBe(120_000);
    expect(parseDuration(900_000)).toBe(900_000);
  });

  it("rejects zero, negatives, unknown units, and non-values", () => {
    expect(parseDuration(0)).toBeNull();
    expect(parseDuration(-5)).toBeNull();
    expect(parseDuration("2w")).toBeNull();
    expect(parseDuration("soon")).toBeNull();
    expect(parseDuration("")).toBeNull();
    expect(parseDuration(undefined)).toBeNull();
    expect(parseDuration({})).toBeNull();
  });
});

describe("parseContinueLine", () => {
  it("parses the bracketed list form from the last non-empty line", () => {
    const out = "did some work\n\ncontinue: [alert-user,record]\n\n";
    expect(parseContinueLine(out)).toEqual({
      raw: "continue: [alert-user,record]",
      tokens: ["alert-user", "record"],
    });
  });

  it("parses a bare token and an empty list, case-insensitively", () => {
    expect(parseContinueLine("CONTINUE: Alert-User")).toEqual({
      raw: "CONTINUE: Alert-User",
      tokens: ["alert-user"],
    });
    expect(parseContinueLine("continue: []")).toEqual({
      raw: "continue: []",
      tokens: [],
    });
  });

  it("returns null for prose, missing prefix, bad tokens, and over-long lines", () => {
    expect(parseContinueLine("I finished the report [see above]")).toBeNull();
    expect(parseContinueLine("alert-user")).toBeNull();
    expect(parseContinueLine("continue: [ok, BAD TOKEN]")).toBeNull();
    expect(parseContinueLine(`continue: [${"a".repeat(200)}]`)).toBeNull();
    expect(parseContinueLine("")).toBeNull();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `bun test packages/pi-event-cron-scheduler/test/frontmatter.test.ts`
Expected: FAIL, because `../src/frontmatter.js` does not exist yet.

- [ ] **Step 4: Write the minimal implementation**

`packages/pi-event-cron-scheduler/src/frontmatter.ts`:

```ts
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
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun test packages/pi-event-cron-scheduler/test/frontmatter.test.ts`
Expected: PASS, 3 tests in `parseContinueLine` and 2 in `parseDuration`.

- [ ] **Step 6: Commit**

```bash
git add packages/pi-event-cron-scheduler/package.json \
        packages/pi-event-cron-scheduler/src/frontmatter.ts \
        packages/pi-event-cron-scheduler/test/frontmatter.test.ts
git commit -m "feat(event-cron): add package scaffold with duration and continue-line parsing"
```

---

### Task 2: Frontmatter parsing and job validation

Turns one markdown file's text into a validated `JobDefinition` or a list of concrete error
strings. No filesystem access — the caller supplies the content.

`croner` is imported here because cron validation belongs with the rest of the validation,
and croner's constructor is the only honest way to know an expression parses. Verified API:
`new Cron(pattern, options?, fn?)` with `CronOptions.timezone` and `CronOptions.paused`, and
`nextRun(prev?): Date | null` (`node_modules/croner/dist/croner.d.ts:163-218,541-548`).

**Files:**
- Modify: `packages/pi-event-cron-scheduler/src/frontmatter.ts`
- Modify: `packages/pi-event-cron-scheduler/test/frontmatter.test.ts`

**Interfaces:**
- Consumes: `TOKEN_RE`, `parseDuration` from Task 1.
- Produces:
  - All types listed in Shared Types above, exported from `src/frontmatter.ts`.
  - `RESERVED_EVENT_PREFIXES: readonly string[]`
  - `parseJobFile(input: { path: string; workspace: string; content: string }): ParseJobResult`
    where `type ParseJobResult = { ok: true; job: JobDefinition } | { ok: false; invalid: InvalidJob }`
  - `validateCron(expr: string, timezone?: string): string | null` — returns an error message
    or `null` when the expression is valid.

- [ ] **Step 1: Write the failing test**

Append to `packages/pi-event-cron-scheduler/test/frontmatter.test.ts`:

```ts
import { parseJobFile, validateCron } from "../src/frontmatter.js";

const FULL = `---
id: security-red-team
description: Red-team everything I own
agent: security-freak
runtime: pi-subprocess
tools: [read, write, bash]
expectedRuntime: 2m
timeout: 15m
schedule:
  cron: "*/5 * * * *"
  timezone: Europe/Oslo
on: [threat-report.written]
concurrency: queue
memory: true
emits:
  - event: threat-report.written
    when: success
    if: [Found-Threats]
    payload: { severity: high }
  - webhook: https://example.com/hook
    when: failure
    body: { text: failed }
  - notify: Your AI went berserk
  - telegram.send.message:
      text: Report ready
---

Go red-team everything.
`;

describe("parseJobFile", () => {
  it("parses a full file into a JobDefinition", () => {
    const res = parseJobFile({ path: "/ws/scheduled/rt.md", workspace: "/ws", content: FULL });
    if (!res.ok) throw new Error(`expected ok, got ${res.invalid.errors.join("; ")}`);
    const job = res.job;
    expect(job.id).toBe("security-red-team");
    expect(job.agent).toBe("security-freak");
    expect(job.tools).toEqual(["read", "write", "bash"]);
    expect(job.expectedRuntimeMs).toBe(120_000);
    expect(job.timeoutMs).toBe(900_000);
    expect(job.cron).toBe("*/5 * * * *");
    expect(job.timezone).toBe("Europe/Oslo");
    expect(job.on).toEqual(["threat-report.written"]);
    expect(job.concurrency).toBe("queue");
    expect(job.memory).toBe(true);
    expect(job.body).toBe("Go red-team everything.");
  });

  it("normalises every emit shape and lowercases if-tokens", () => {
    const res = parseJobFile({ path: "/ws/scheduled/rt.md", workspace: "/ws", content: FULL });
    if (!res.ok) throw new Error("expected ok");
    expect(res.job.emits).toEqual([
      {
        kind: "event",
        target: "threat-report.written",
        when: "success",
        ifTokens: ["found-threats"],
        args: { severity: "high" },
      },
      {
        kind: "webhook",
        target: "https://example.com/hook",
        when: "failure",
        args: { text: "failed" },
      },
      { kind: "notify", target: "Your AI went berserk", when: "success" },
      {
        kind: "registry",
        target: "telegram.send.message",
        when: "success",
        args: { text: "Report ready" },
      },
    ]);
  });

  it("defaults concurrency to skip, memory to false, and on to an empty list", () => {
    const res = parseJobFile({
      path: "/ws/scheduled/min.md",
      workspace: "/ws",
      content: "---\nid: minimal\n---\n\nDo a thing.\n",
    });
    if (!res.ok) throw new Error("expected ok");
    expect(res.job.concurrency).toBe("skip");
    expect(res.job.memory).toBe(false);
    expect(res.job.on).toEqual([]);
    expect(res.job.emits).toEqual([]);
  });

  it("rejects a missing id, a bad id charset, and a traversal id", () => {
    const noId = parseJobFile({ path: "/ws/a.md", workspace: "/ws", content: "---\ndescription: x\n---\nbody\n" });
    expect(noId.ok).toBe(false);
    if (!noId.ok) expect(noId.invalid.errors.join(" ")).toContain("id is required");

    const badId = parseJobFile({ path: "/ws/a.md", workspace: "/ws", content: "---\nid: Bad Id\n---\nbody\n" });
    expect(badId.ok).toBe(false);

    const traversal = parseJobFile({
      path: "/ws/a.md",
      workspace: "/ws",
      content: "---\nid: ../../etc/passwd\n---\nbody\n",
    });
    expect(traversal.ok).toBe(false);
  });

  it("rejects reserved event prefixes, unknown fields, bad cron, and bad durations", () => {
    const reserved = parseJobFile({
      path: "/ws/a.md",
      workspace: "/ws",
      content: "---\nid: a\nemits:\n  - event: job.completed\n---\nbody\n",
    });
    expect(reserved.ok).toBe(false);
    if (!reserved.ok) expect(reserved.invalid.errors.join(" ")).toContain("reserved");

    const unknown = parseJobFile({
      path: "/ws/a.md",
      workspace: "/ws",
      content: "---\nid: a\nnope: 1\n---\nbody\n",
    });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.invalid.errors.join(" ")).toContain("unknown field");

    const badCron = parseJobFile({
      path: "/ws/a.md",
      workspace: "/ws",
      content: '---\nid: a\nschedule:\n  cron: "not a cron"\n---\nbody\n',
    });
    expect(badCron.ok).toBe(false);

    const badDuration = parseJobFile({
      path: "/ws/a.md",
      workspace: "/ws",
      content: "---\nid: a\ntimeout: 2w\n---\nbody\n",
    });
    expect(badDuration.ok).toBe(false);
  });

  it("rejects malformed YAML and a missing body without throwing", () => {
    const broken = parseJobFile({ path: "/ws/a.md", workspace: "/ws", content: "---\nid: [unclosed\n---\nbody\n" });
    expect(broken.ok).toBe(false);

    const noBody = parseJobFile({ path: "/ws/a.md", workspace: "/ws", content: "---\nid: a\n---\n\n   \n" });
    expect(noBody.ok).toBe(false);
    if (!noBody.ok) expect(noBody.invalid.errors.join(" ")).toContain("body");
  });
});

describe("validateCron", () => {
  it("accepts a valid expression with a timezone and rejects nonsense", () => {
    expect(validateCron("*/5 * * * *", "Europe/Oslo")).toBeNull();
    expect(validateCron("not a cron")).not.toBeNull();
    expect(validateCron("*/5 * * * *", "Mars/Olympus")).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test packages/pi-event-cron-scheduler/test/frontmatter.test.ts`
Expected: FAIL, `parseJobFile` and `validateCron` are not exported.

- [ ] **Step 3: Write the minimal implementation**

Append to `packages/pi-event-cron-scheduler/src/frontmatter.ts`:

```ts
import { Cron } from "croner";
import { parse as parseYaml } from "yaml";

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

export type ParseJobResult =
  | { ok: true; job: JobDefinition }
  | { ok: false; invalid: InvalidJob };

export const RESERVED_EVENT_PREFIXES = ["cron.", "job.", "chain.", "sink."] as const;

const KNOWN_FIELDS = new Set([
  "id", "description", "agent", "runtime", "model", "thinking", "tools", "skills",
  "turnBudget", "expectedRuntime", "timeout", "schedule", "on", "concurrency",
  "memory", "emits",
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
    return { kind: "event", target: value, when: when as When, ifTokens, args: raw.payload as any };
  }

  if (key === "webhook") {
    if (typeof value !== "string" || !/^https?:\/\//.test(value)) {
      errors.push(`emits[${index}].webhook must be an http(s) URL`);
      return null;
    }
    return { kind: "webhook", target: value, when: when as When, ifTokens, args: raw.body as any };
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

export function parseJobFile(input: {
  path: string;
  workspace: string;
  content: string;
}): ParseJobResult {
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test packages/pi-event-cron-scheduler/test/frontmatter.test.ts`
Expected: PASS, all `parseJobFile` and `validateCron` cases green alongside Task 1's tests.

- [ ] **Step 5: Commit**

```bash
git add packages/pi-event-cron-scheduler/src/frontmatter.ts \
        packages/pi-event-cron-scheduler/test/frontmatter.test.ts
git commit -m "feat(event-cron): parse and validate scheduled markdown frontmatter"
```

---

### Task 3: Job discovery with duplicate id detection

Reads a workspace's `scheduled/` directory and returns valid jobs plus invalid ones. A
duplicate id invalidates every file claiming it, so neither runs — silently picking one
would mean a file you edited was not the file that ran.

**Files:**
- Create: `packages/pi-event-cron-scheduler/src/discovery.ts`
- Test: `packages/pi-event-cron-scheduler/test/discovery.test.ts`

**Interfaces:**
- Consumes: `parseJobFile`, `JobDefinition`, `InvalidJob` from Task 2.
- Produces:
  - `interface DiscoveryResult { jobs: JobDefinition[]; invalid: InvalidJob[] }`
  - `scheduledDir(workspace: string): string`
  - `discoverJobs(workspace: string): Promise<DiscoveryResult>`

- [ ] **Step 1: Write the failing test**

`packages/pi-event-cron-scheduler/test/discovery.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverJobs, scheduledDir } from "../src/discovery.js";

let ws: string;

async function writeJob(name: string, body: string): Promise<void> {
  await mkdir(scheduledDir(ws), { recursive: true });
  await writeFile(join(scheduledDir(ws), name), body, "utf8");
}

beforeEach(async () => {
  ws = await mkdtemp(join(tmpdir(), "eventcron-ws-"));
});

afterEach(async () => {
  await rm(ws, { recursive: true, force: true });
});

describe("discoverJobs", () => {
  it("returns an empty result when scheduled/ does not exist", async () => {
    expect(await discoverJobs(ws)).toEqual({ jobs: [], invalid: [] });
  });

  it("parses .md files, ignores other extensions, and sorts by id", async () => {
    await writeJob("b.md", "---\nid: beta\n---\n\nBeta task.\n");
    await writeJob("a.md", "---\nid: alpha\n---\n\nAlpha task.\n");
    await writeJob("notes.txt", "id: ignored");

    const result = await discoverJobs(ws);
    expect(result.jobs.map((job) => job.id)).toEqual(["alpha", "beta"]);
    expect(result.jobs[0].workspace).toBe(ws);
    expect(result.invalid).toEqual([]);
  });

  it("reports an invalid file without dropping the valid ones", async () => {
    await writeJob("good.md", "---\nid: good\n---\n\nGood.\n");
    await writeJob("bad.md", "---\nid: Bad Id\n---\n\nBad.\n");

    const result = await discoverJobs(ws);
    expect(result.jobs.map((job) => job.id)).toEqual(["good"]);
    expect(result.invalid).toHaveLength(1);
    expect(result.invalid[0].path).toContain("bad.md");
  });

  it("invalidates every file sharing an id and runs none of them", async () => {
    await writeJob("one.md", "---\nid: twin\n---\n\nOne.\n");
    await writeJob("two.md", "---\nid: twin\n---\n\nTwo.\n");
    await writeJob("solo.md", "---\nid: solo\n---\n\nSolo.\n");

    const result = await discoverJobs(ws);
    expect(result.jobs.map((job) => job.id)).toEqual(["solo"]);
    expect(result.invalid).toHaveLength(2);
    for (const entry of result.invalid) {
      expect(entry.id).toBe("twin");
      expect(entry.errors.join(" ")).toContain("duplicate id");
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test packages/pi-event-cron-scheduler/test/discovery.test.ts`
Expected: FAIL, `../src/discovery.js` does not exist.

- [ ] **Step 3: Write the minimal implementation**

`packages/pi-event-cron-scheduler/src/discovery.ts`:

```ts
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { type InvalidJob, type JobDefinition, parseJobFile } from "./frontmatter.js";

export interface DiscoveryResult {
  jobs: JobDefinition[];
  invalid: InvalidJob[];
}

export function scheduledDir(workspace: string): string {
  return join(workspace, "scheduled");
}

export async function discoverJobs(workspace: string): Promise<DiscoveryResult> {
  const dir = scheduledDir(workspace);

  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (error: any) {
    if (error?.code === "ENOENT") return { jobs: [], invalid: [] };
    throw error;
  }

  const parsed: JobDefinition[] = [];
  const invalid: InvalidJob[] = [];

  for (const entry of entries.filter((name) => name.endsWith(".md")).sort()) {
    const path = join(dir, entry);
    const content = await readFile(path, "utf8");
    const result = parseJobFile({ path, workspace, content });
    if (result.ok) parsed.push(result.job);
    else invalid.push(result.invalid);
  }

  const byId = new Map<string, JobDefinition[]>();
  for (const job of parsed) {
    const bucket = byId.get(job.id);
    if (bucket) bucket.push(job);
    else byId.set(job.id, [job]);
  }

  const jobs: JobDefinition[] = [];
  for (const [id, bucket] of byId) {
    if (bucket.length === 1) {
      jobs.push(bucket[0]);
      continue;
    }
    const paths = bucket.map((job) => job.path).join(", ");
    for (const job of bucket) {
      invalid.push({ path: job.path, id, errors: [`duplicate id "${id}" also declared in ${paths}`] });
    }
  }

  jobs.sort((a, b) => a.id.localeCompare(b.id));
  invalid.sort((a, b) => a.path.localeCompare(b.path));
  return { jobs, invalid };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test packages/pi-event-cron-scheduler/test/discovery.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/pi-event-cron-scheduler/src/discovery.ts \
        packages/pi-event-cron-scheduler/test/discovery.test.ts
git commit -m "feat(event-cron): discover scheduled jobs and reject duplicate ids"
```

---

### Task 4: State layer

Three JSON files under `stateDir`, all written atomically through a temp file and rename so
a crash mid-write cannot leave truncated JSON. `runs.json` is capped per job on write.

**Files:**
- Create: `packages/pi-event-cron-scheduler/src/state.ts`
- Test: `packages/pi-event-cron-scheduler/test/state.test.ts`

**Interfaces:**
- Consumes: `RunRow`, `RunStatus` type shapes from Shared Types (declare them in this file and
  re-export; they are state concerns, not frontmatter concerns).
- Produces:
  - `RUNS_PER_JOB = 50`
  - `enabledKey(workspace: string, id: string): string` — `` `${workspace}::${id}` ``
  - `loadEnabled(stateDir: string): Promise<EnabledFile>` where
    `interface EnabledFile { version: 1; jobs: Record<string, { enabledAt: string; path: string }> }`
  - `isEnabled(file: EnabledFile, workspace: string, id: string): boolean`
  - `setEnabled(stateDir: string, input: { workspace: string; id: string; path: string; on: boolean; now: Date }): Promise<EnabledFile>`
  - `loadRuns(stateDir: string): Promise<RunRow[]>`
  - `saveRun(stateDir: string, row: RunRow): Promise<void>` — upserts by `runId`, keeps the
    newest `RUNS_PER_JOB` rows per `jobId`
  - `findRun(rows: RunRow[], runId: string): RunRow | undefined`
  - `lastRunFor(rows: RunRow[], jobId: string): RunRow | undefined`
  - `medianDurationMs(rows: RunRow[], jobId: string): number | undefined`
  - `readCursor(stateDir: string): Promise<Cursor>` where `interface Cursor { file: string; offset: number }`
  - `writeCursor(stateDir: string, cursor: Cursor): Promise<void>`
  - `writeJsonAtomic(path: string, value: unknown): Promise<void>`

- [ ] **Step 1: Write the failing test**

`packages/pi-event-cron-scheduler/test/state.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  RUNS_PER_JOB,
  enabledKey,
  isEnabled,
  lastRunFor,
  loadEnabled,
  loadRuns,
  medianDurationMs,
  readCursor,
  saveRun,
  setEnabled,
  writeCursor,
  type RunRow,
} from "../src/state.js";

let dir: string;

function row(overrides: Partial<RunRow> & { runId: string; jobId: string }): RunRow {
  return {
    workspace: "/ws",
    status: "completed",
    pid: 42,
    startedAt: "2026-08-26T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "eventcron-state-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("enabled.json", () => {
  it("returns an empty file when nothing is on disk", async () => {
    expect(await loadEnabled(dir)).toEqual({ version: 1, jobs: {} });
  });

  it("keys by workspace and id so the same id in two workspaces is two jobs", async () => {
    const now = new Date("2026-08-26T02:50:00.000Z");
    await setEnabled(dir, { workspace: "/ws-a", id: "twin", path: "scheduled/t.md", on: true, now });
    const file = await setEnabled(dir, { workspace: "/ws-b", id: "twin", path: "scheduled/t.md", on: true, now });

    expect(Object.keys(file.jobs).sort()).toEqual([enabledKey("/ws-a", "twin"), enabledKey("/ws-b", "twin")]);
    expect(file.jobs[enabledKey("/ws-a", "twin")].enabledAt).toBe("2026-08-26T02:50:00.000Z");
    expect(isEnabled(file, "/ws-a", "twin")).toBe(true);
    expect(isEnabled(file, "/ws-c", "twin")).toBe(false);
  });

  it("round-trips through disk and removes on disable", async () => {
    const now = new Date("2026-08-26T02:50:00.000Z");
    await setEnabled(dir, { workspace: "/ws", id: "a", path: "scheduled/a.md", on: true, now });
    expect(isEnabled(await loadEnabled(dir), "/ws", "a")).toBe(true);

    await setEnabled(dir, { workspace: "/ws", id: "a", path: "scheduled/a.md", on: false, now });
    expect(isEnabled(await loadEnabled(dir), "/ws", "a")).toBe(false);
  });
});

describe("runs.json", () => {
  it("upserts by runId rather than appending duplicates", async () => {
    await saveRun(dir, row({ runId: "r1", jobId: "a", status: "running" }));
    await saveRun(dir, row({ runId: "r1", jobId: "a", status: "completed", durationMs: 1200 }));

    const rows = await loadRuns(dir);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("completed");
    expect(rows[0].durationMs).toBe(1200);
  });

  it(`keeps only the newest ${RUNS_PER_JOB} rows per job`, async () => {
    for (let i = 0; i < RUNS_PER_JOB + 10; i++) {
      await saveRun(dir, row({
        runId: `r${i}`,
        jobId: "a",
        startedAt: new Date(Date.UTC(2026, 7, 26, 0, i)).toISOString(),
      }));
    }
    await saveRun(dir, row({ runId: "other", jobId: "b" }));

    const rows = await loadRuns(dir);
    expect(rows.filter((r) => r.jobId === "a")).toHaveLength(RUNS_PER_JOB);
    expect(rows.filter((r) => r.jobId === "b")).toHaveLength(1);
    expect(rows.some((r) => r.runId === "r0")).toBe(false);
    expect(rows.some((r) => r.runId === `r${RUNS_PER_JOB + 9}`)).toBe(true);
  });

  it("reports the last run and the median duration per job", async () => {
    await saveRun(dir, row({ runId: "r1", jobId: "a", startedAt: "2026-08-26T00:01:00.000Z", durationMs: 100 }));
    await saveRun(dir, row({ runId: "r2", jobId: "a", startedAt: "2026-08-26T00:02:00.000Z", durationMs: 300 }));
    await saveRun(dir, row({ runId: "r3", jobId: "a", startedAt: "2026-08-26T00:03:00.000Z", durationMs: 200 }));
    await saveRun(dir, row({ runId: "r4", jobId: "a", startedAt: "2026-08-26T00:04:00.000Z", status: "running" }));

    const rows = await loadRuns(dir);
    expect(lastRunFor(rows, "a")?.runId).toBe("r4");
    expect(medianDurationMs(rows, "a")).toBe(200);
    expect(medianDurationMs(rows, "missing")).toBeUndefined();
  });
});

describe("cursor.json", () => {
  it("defaults to an empty cursor and round-trips", async () => {
    expect(await readCursor(dir)).toEqual({ file: "", offset: 0 });
    await writeCursor(dir, { file: "2026-08-26.jsonl", offset: 512 });
    expect(await readCursor(dir)).toEqual({ file: "2026-08-26.jsonl", offset: 512 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test packages/pi-event-cron-scheduler/test/state.test.ts`
Expected: FAIL, `../src/state.js` does not exist.

- [ ] **Step 3: Write the minimal implementation**

`packages/pi-event-cron-scheduler/src/state.ts`:

```ts
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export const RUNS_PER_JOB = 50;

export type RunStatus =
  | "running"
  | "completed"
  | "failed"
  | "timed_out"
  | "abandoned"
  | "interrupted";

export interface RunRow {
  runId: string;
  jobId: string;
  workspace: string;
  status: RunStatus;
  pid: number;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  verdict?: string;
  continueTokens?: string[];
  outputTail?: string;
}

export interface EnabledFile {
  version: 1;
  jobs: Record<string, { enabledAt: string; path: string }>;
}

export interface Cursor {
  file: string;
  offset: number;
}

export function enabledKey(workspace: string, id: string): string {
  return `${workspace}::${id}`;
}

export async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tmp, path);
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error: any) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

export async function loadEnabled(stateDir: string): Promise<EnabledFile> {
  const file = await readJson<EnabledFile>(join(stateDir, "enabled.json"), { version: 1, jobs: {} });
  return { version: 1, jobs: file.jobs ?? {} };
}

export function isEnabled(file: EnabledFile, workspace: string, id: string): boolean {
  return Boolean(file.jobs[enabledKey(workspace, id)]);
}

export async function setEnabled(
  stateDir: string,
  input: { workspace: string; id: string; path: string; on: boolean; now: Date },
): Promise<EnabledFile> {
  const file = await loadEnabled(stateDir);
  const key = enabledKey(input.workspace, input.id);
  if (input.on) file.jobs[key] = { enabledAt: input.now.toISOString(), path: input.path };
  else delete file.jobs[key];
  await writeJsonAtomic(join(stateDir, "enabled.json"), file);
  return file;
}

export async function loadRuns(stateDir: string): Promise<RunRow[]> {
  const file = await readJson<{ version: 1; runs: RunRow[] }>(join(stateDir, "runs.json"), {
    version: 1,
    runs: [],
  });
  return file.runs ?? [];
}

export async function saveRun(stateDir: string, run: RunRow): Promise<void> {
  const rows = (await loadRuns(stateDir)).filter((existing) => existing.runId !== run.runId);
  rows.push(run);

  const perJob = new Map<string, RunRow[]>();
  for (const rowValue of rows) {
    const bucket = perJob.get(rowValue.jobId);
    if (bucket) bucket.push(rowValue);
    else perJob.set(rowValue.jobId, [rowValue]);
  }

  const kept: RunRow[] = [];
  for (const bucket of perJob.values()) {
    bucket.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    kept.push(...bucket.slice(-RUNS_PER_JOB));
  }
  kept.sort((a, b) => a.startedAt.localeCompare(b.startedAt));

  await writeJsonAtomic(join(stateDir, "runs.json"), { version: 1, runs: kept });
}

export function findRun(rows: RunRow[], runId: string): RunRow | undefined {
  return rows.find((row) => row.runId === runId);
}

export function lastRunFor(rows: RunRow[], jobId: string): RunRow | undefined {
  return rows
    .filter((row) => row.jobId === jobId)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .at(-1);
}

export function medianDurationMs(rows: RunRow[], jobId: string): number | undefined {
  const durations = rows
    .filter((row) => row.jobId === jobId && typeof row.durationMs === "number")
    .map((row) => row.durationMs as number)
    .sort((a, b) => a - b);
  if (durations.length === 0) return undefined;
  const middle = Math.floor(durations.length / 2);
  return durations.length % 2 === 1
    ? durations[middle]
    : Math.round((durations[middle - 1] + durations[middle]) / 2);
}

export async function readCursor(stateDir: string): Promise<Cursor> {
  return readJson<Cursor>(join(stateDir, "cursor.json"), { file: "", offset: 0 });
}

export async function writeCursor(stateDir: string, cursor: Cursor): Promise<void> {
  await writeJsonAtomic(join(stateDir, "cursor.json"), cursor);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test packages/pi-event-cron-scheduler/test/state.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/pi-event-cron-scheduler/src/state.ts \
        packages/pi-event-cron-scheduler/test/state.test.ts
git commit -m "feat(event-cron): add atomic state layer for enabled jobs, runs, and cursor"
```

---

### Task 5: Event bus

Append-only JSONL per day, read from a byte offset, roll across days without losing the tail
of yesterday's file, and never hand a half-written line to the dispatcher.

Offsets are byte offsets, so reads use a `Buffer` and cut at the last newline. A line without
a trailing newline is treated as not yet written.

**Files:**
- Create: `packages/pi-event-cron-scheduler/src/bus.ts`
- Test: `packages/pi-event-cron-scheduler/test/bus.test.ts`

**Interfaces:**
- Consumes: `Cursor` from Task 4.
- Produces:
  - `interface BusEvent { id: string; ts: string; event: string; source: string; runId?: string; chain: number; payload?: Record<string, unknown> }`
  - `eventsDir(stateDir: string): string`
  - `logNameFor(now: Date): string` — `"2026-08-26.jsonl"`, UTC date
  - `newEvent(input: { event: string; source: string; runId?: string; chain?: number; payload?: Record<string, unknown> }, now: Date, idFn?: () => string): BusEvent`
  - `appendEvent(stateDir: string, event: BusEvent, now: Date): Promise<void>`
  - `readNewEvents(stateDir: string, cursor: Cursor): Promise<{ events: BusEvent[]; cursor: Cursor }>`
  - `pruneOldLogs(stateDir: string, keepDays: number, now: Date): Promise<string[]>`

- [ ] **Step 1: Write the failing test**

`packages/pi-event-cron-scheduler/test/bus.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { appendFile, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendEvent, eventsDir, logNameFor, newEvent, pruneOldLogs, readNewEvents } from "../src/bus.js";

let dir: string;
let counter = 0;
const ids = () => `id-${++counter}`;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "eventcron-bus-"));
  counter = 0;
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("logNameFor", () => {
  it("names the file after the UTC date", () => {
    expect(logNameFor(new Date("2026-08-26T23:59:59.000Z"))).toBe("2026-08-26.jsonl");
  });
});

describe("appendEvent and readNewEvents", () => {
  it("returns appended events once and advances the cursor", async () => {
    const now = new Date("2026-08-26T04:00:00.000Z");
    await appendEvent(dir, newEvent({ event: "cron.tick", source: "cron", payload: { jobId: "a" } }, now, ids), now);
    await appendEvent(dir, newEvent({ event: "news.found", source: "a", chain: 1 }, now, ids), now);

    const first = await readNewEvents(dir, { file: "", offset: 0 });
    expect(first.events.map((e) => e.event)).toEqual(["cron.tick", "news.found"]);
    expect(first.events[0].payload).toEqual({ jobId: "a" });
    expect(first.events[1].chain).toBe(1);
    expect(first.cursor.file).toBe("2026-08-26.jsonl");
    expect(first.cursor.offset).toBeGreaterThan(0);

    const second = await readNewEvents(dir, first.cursor);
    expect(second.events).toEqual([]);
    expect(second.cursor).toEqual(first.cursor);

    await appendEvent(dir, newEvent({ event: "third", source: "tool" }, now, ids), now);
    const third = await readNewEvents(dir, second.cursor);
    expect(third.events.map((e) => e.event)).toEqual(["third"]);
  });

  it("reads the tail of the previous day before moving to today", async () => {
    const yesterday = new Date("2026-08-25T23:59:59.000Z");
    const today = new Date("2026-08-26T00:00:01.000Z");
    await appendEvent(dir, newEvent({ event: "late-tick", source: "cron" }, yesterday, ids), yesterday);
    await appendEvent(dir, newEvent({ event: "early-tick", source: "cron" }, today, ids), today);

    const result = await readNewEvents(dir, { file: "2026-08-25.jsonl", offset: 0 });
    expect(result.events.map((e) => e.event)).toEqual(["late-tick", "early-tick"]);
    expect(result.cursor.file).toBe("2026-08-26.jsonl");
  });

  it("ignores a line that has no trailing newline yet", async () => {
    const now = new Date("2026-08-26T04:00:00.000Z");
    await appendEvent(dir, newEvent({ event: "complete", source: "cron" }, now, ids), now);
    await mkdir(eventsDir(dir), { recursive: true });
    await appendFile(join(eventsDir(dir), logNameFor(now)), '{"event":"half', "utf8");

    const result = await readNewEvents(dir, { file: "", offset: 0 });
    expect(result.events.map((e) => e.event)).toEqual(["complete"]);

    await appendFile(join(eventsDir(dir), logNameFor(now)), '-written","id":"x","ts":"t","source":"s","chain":0}\n', "utf8");
    const after = await readNewEvents(dir, result.cursor);
    expect(after.events.map((e) => e.event)).toEqual(["half-written"]);
  });

  it("returns an empty result when the events directory is missing", async () => {
    expect(await readNewEvents(dir, { file: "", offset: 0 })).toEqual({
      events: [],
      cursor: { file: "", offset: 0 },
    });
  });
});

describe("pruneOldLogs", () => {
  it("deletes day files older than the retention window and keeps the rest", async () => {
    const now = new Date("2026-08-26T04:00:00.000Z");
    for (const day of ["2026-07-01", "2026-08-20", "2026-08-26"]) {
      await appendEvent(dir, newEvent({ event: "x", source: "cron" }, new Date(`${day}T00:00:00.000Z`), ids), new Date(`${day}T00:00:00.000Z`));
    }

    const removed = await pruneOldLogs(dir, 30, now);
    expect(removed).toEqual(["2026-07-01.jsonl"]);
    expect((await readdir(eventsDir(dir))).sort()).toEqual(["2026-08-20.jsonl", "2026-08-26.jsonl"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test packages/pi-event-cron-scheduler/test/bus.test.ts`
Expected: FAIL, `../src/bus.js` does not exist.

- [ ] **Step 3: Write the minimal implementation**

`packages/pi-event-cron-scheduler/src/bus.ts`:

```ts
import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readdir, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { Cursor } from "./state.js";

export interface BusEvent {
  id: string;
  ts: string;
  event: string;
  source: string;
  runId?: string;
  chain: number;
  payload?: Record<string, unknown>;
}

const LOG_RE = /^\d{4}-\d{2}-\d{2}\.jsonl$/;
const DAY_MS = 86_400_000;

export function eventsDir(stateDir: string): string {
  return join(stateDir, "events");
}

export function logNameFor(now: Date): string {
  return `${now.toISOString().slice(0, 10)}.jsonl`;
}

export function newEvent(
  input: {
    event: string;
    source: string;
    runId?: string;
    chain?: number;
    payload?: Record<string, unknown>;
  },
  now: Date,
  idFn: () => string = randomUUID,
): BusEvent {
  return {
    id: idFn(),
    ts: now.toISOString(),
    event: input.event,
    source: input.source,
    runId: input.runId,
    chain: input.chain ?? 0,
    payload: input.payload,
  };
}

export async function appendEvent(stateDir: string, event: BusEvent, now: Date): Promise<void> {
  const dir = eventsDir(stateDir);
  await mkdir(dir, { recursive: true });
  await appendFile(join(dir, logNameFor(now)), `${JSON.stringify(event)}\n`, "utf8");
}

export async function readNewEvents(
  stateDir: string,
  cursor: Cursor,
): Promise<{ events: BusEvent[]; cursor: Cursor }> {
  const dir = eventsDir(stateDir);

  let names: string[];
  try {
    names = (await readdir(dir)).filter((name) => LOG_RE.test(name)).sort();
  } catch (error: any) {
    if (error?.code === "ENOENT") return { events: [], cursor };
    throw error;
  }

  const pending = names.filter((name) => !cursor.file || name >= cursor.file);
  const events: BusEvent[] = [];
  let nextCursor = cursor;

  for (const name of pending) {
    const buffer = await readFile(join(dir, name));
    const startOffset = name === cursor.file ? cursor.offset : 0;
    const slice = buffer.subarray(startOffset);
    const lastNewline = slice.lastIndexOf(0x0a);

    if (lastNewline === -1) {
      nextCursor = { file: name, offset: startOffset };
      continue;
    }

    const usable = slice.subarray(0, lastNewline + 1).toString("utf8");
    for (const line of usable.split("\n")) {
      if (!line.trim()) continue;
      try {
        events.push(JSON.parse(line) as BusEvent);
      } catch {
        // A corrupt line must not stall the bus forever; skip it.
      }
    }
    nextCursor = { file: name, offset: startOffset + lastNewline + 1 };
  }

  return { events, cursor: nextCursor };
}

export async function pruneOldLogs(stateDir: string, keepDays: number, now: Date): Promise<string[]> {
  const dir = eventsDir(stateDir);
  let names: string[];
  try {
    names = (await readdir(dir)).filter((name) => LOG_RE.test(name));
  } catch (error: any) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }

  const cutoff = now.getTime() - keepDays * DAY_MS;
  const removed: string[] = [];
  for (const name of names.sort()) {
    const day = Date.parse(`${name.slice(0, 10)}T00:00:00.000Z`);
    if (Number.isFinite(day) && day < cutoff) {
      await unlink(join(dir, name));
      removed.push(name);
    }
  }
  return removed;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test packages/pi-event-cron-scheduler/test/bus.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/pi-event-cron-scheduler/src/bus.ts \
        packages/pi-event-cron-scheduler/test/bus.test.ts
git commit -m "feat(event-cron): add append-only event bus with rotation and retention"
```

---

### Task 6: Leader lock

One process owns timers and dispatch. Everyone else can still read status and append events.
The empty case uses an exclusive create (`flag: "wx"`) so two simultaneous starts cannot both
win; a stale takeover writes through a temp file and then re-reads to confirm which pid
actually won.

**Files:**
- Create: `packages/pi-event-cron-scheduler/src/leader.ts`
- Test: `packages/pi-event-cron-scheduler/test/leader.test.ts`

**Interfaces:**
- Consumes: `writeJsonAtomic` from Task 4.
- Produces:
  - `HEARTBEAT_MS = 15_000`, `STALE_MS = 45_000`
  - `interface LockFile { pid: number; heartbeat: string; acquiredAt: string }`
  - `class LeaderLock` with constructor
    `{ stateDir: string; pid: number; clock: () => number; staleMs?: number }` and methods
    `tryAcquire(): Promise<boolean>`, `heartbeat(): Promise<void>`, `release(): Promise<void>`,
    `read(): Promise<LockFile | null>`, and a readonly `held: boolean`.

- [ ] **Step 1: Write the failing test**

`packages/pi-event-cron-scheduler/test/leader.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LeaderLock, STALE_MS } from "../src/leader.js";

let dir: string;
let now = Date.parse("2026-08-26T04:00:00.000Z");
const clock = () => now;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "eventcron-leader-"));
  now = Date.parse("2026-08-26T04:00:00.000Z");
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("LeaderLock", () => {
  it("acquires an unheld lock and records the pid", async () => {
    const lock = new LeaderLock({ stateDir: dir, pid: 100, clock });
    expect(await lock.tryAcquire()).toBe(true);
    expect(lock.held).toBe(true);
    expect((await lock.read())?.pid).toBe(100);
  });

  it("refuses a second holder while the heartbeat is fresh", async () => {
    const first = new LeaderLock({ stateDir: dir, pid: 100, clock });
    expect(await first.tryAcquire()).toBe(true);

    now += 30_000;
    const second = new LeaderLock({ stateDir: dir, pid: 200, clock });
    expect(await second.tryAcquire()).toBe(false);
    expect(second.held).toBe(false);
    expect((await second.read())?.pid).toBe(100);
  });

  it("takes over once the heartbeat is stale", async () => {
    const dead = new LeaderLock({ stateDir: dir, pid: 100, clock });
    expect(await dead.tryAcquire()).toBe(true);

    now += STALE_MS + 1_000;
    const fresh = new LeaderLock({ stateDir: dir, pid: 200, clock });
    expect(await fresh.tryAcquire()).toBe(true);
    expect((await fresh.read())?.pid).toBe(200);
  });

  it("renews its own heartbeat and stays acquirable by itself", async () => {
    const lock = new LeaderLock({ stateDir: dir, pid: 100, clock });
    await lock.tryAcquire();
    const before = (await lock.read())?.heartbeat;

    now += 20_000;
    await lock.heartbeat();
    const after = await lock.read();
    expect(after?.heartbeat).not.toBe(before);
    expect(after?.acquiredAt).toBe(new Date(Date.parse("2026-08-26T04:00:00.000Z")).toISOString());
    expect(await lock.tryAcquire()).toBe(true);
  });

  it("releases so another pid can take over immediately", async () => {
    const first = new LeaderLock({ stateDir: dir, pid: 100, clock });
    await first.tryAcquire();
    await first.release();
    expect(first.held).toBe(false);
    expect(await first.read()).toBeNull();

    const second = new LeaderLock({ stateDir: dir, pid: 200, clock });
    expect(await second.tryAcquire()).toBe(true);
  });

  it("does nothing on heartbeat or release when the lock is not held", async () => {
    const lock = new LeaderLock({ stateDir: dir, pid: 100, clock });
    await lock.heartbeat();
    await lock.release();
    expect(await lock.read()).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test packages/pi-event-cron-scheduler/test/leader.test.ts`
Expected: FAIL, `../src/leader.js` does not exist.

- [ ] **Step 3: Write the minimal implementation**

`packages/pi-event-cron-scheduler/src/leader.ts`:

```ts
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { writeJsonAtomic } from "./state.js";

export const HEARTBEAT_MS = 15_000;
export const STALE_MS = 45_000;

export interface LockFile {
  pid: number;
  heartbeat: string;
  acquiredAt: string;
}

export class LeaderLock {
  private readonly path: string;
  private readonly pid: number;
  private readonly clock: () => number;
  private readonly staleMs: number;
  private acquiredAt?: string;
  private isHeld = false;

  constructor(options: { stateDir: string; pid: number; clock: () => number; staleMs?: number }) {
    this.path = join(options.stateDir, "leader.lock");
    this.pid = options.pid;
    this.clock = options.clock;
    this.staleMs = options.staleMs ?? STALE_MS;
  }

  get held(): boolean {
    return this.isHeld;
  }

  async read(): Promise<LockFile | null> {
    try {
      return JSON.parse(await readFile(this.path, "utf8")) as LockFile;
    } catch (error: any) {
      if (error?.code === "ENOENT") return null;
      return null;
    }
  }

  async tryAcquire(): Promise<boolean> {
    const nowIso = new Date(this.clock()).toISOString();
    const existing = await this.read();

    if (!existing) {
      const payload: LockFile = { pid: this.pid, heartbeat: nowIso, acquiredAt: nowIso };
      try {
        await mkdir(join(this.path, ".."), { recursive: true });
        await writeFile(this.path, `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
        this.acquiredAt = nowIso;
        this.isHeld = true;
        return true;
      } catch {
        // Someone created it between our read and our write; fall through and re-evaluate.
        return this.tryAcquire();
      }
    }

    if (existing.pid === this.pid) {
      this.acquiredAt = existing.acquiredAt;
      this.isHeld = true;
      return true;
    }

    const age = this.clock() - Date.parse(existing.heartbeat);
    if (Number.isFinite(age) && age <= this.staleMs) {
      this.isHeld = false;
      return false;
    }

    await writeJsonAtomic(this.path, { pid: this.pid, heartbeat: nowIso, acquiredAt: nowIso });
    const confirmed = await this.read();
    this.isHeld = confirmed?.pid === this.pid;
    if (this.isHeld) this.acquiredAt = nowIso;
    return this.isHeld;
  }

  async heartbeat(): Promise<void> {
    if (!this.isHeld) return;
    const nowIso = new Date(this.clock()).toISOString();
    await writeJsonAtomic(this.path, {
      pid: this.pid,
      heartbeat: nowIso,
      acquiredAt: this.acquiredAt ?? nowIso,
    });
  }

  async release(): Promise<void> {
    if (!this.isHeld) return;
    this.isHeld = false;
    try {
      await unlink(this.path);
    } catch {
      // Already gone; releasing is best-effort.
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test packages/pi-event-cron-scheduler/test/leader.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/pi-event-cron-scheduler/src/leader.ts \
        packages/pi-event-cron-scheduler/test/leader.test.ts
git commit -m "feat(event-cron): elect a single dispatching leader via lockfile heartbeat"
```

---

### Task 7: Sink selection and dispatch

Two separable concerns in one file: a pure gating function that decides which sinks fire, and
a dispatcher that runs them. Gating is pure because it carries the `when` plus `if` rules,
which is where mistakes are expensive and tests are cheap.

A sink never fails a job. `dispatchSinks` reports outcomes and never rethrows; the caller
decides what to log.

**Files:**
- Create: `packages/pi-event-cron-scheduler/src/sinks.ts`
- Test: `packages/pi-event-cron-scheduler/test/sinks.test.ts`

**Interfaces:**
- Consumes: `EmitSpec` from Task 2, `RunStatus` from Task 4.
- Produces:
  - `SINK_REGISTRY_KEY = "__piEventCronSinkRegistry__"`
  - `type SinkHandler = (args: Record<string, unknown>, ctx: SinkContext) => Promise<void>`
  - `interface SinkRegistry { version: 1; sinks: Record<string, SinkHandler> }`
  - `getSinkRegistry(scope?: Record<string, unknown>): SinkRegistry` — creates it if absent, so
    load order between extensions does not matter
  - `registerSink(name: string, handler: SinkHandler, scope?: Record<string, unknown>): void`
  - `interface SinkContext { jobId: string; runId: string; workspace: string; now: Date; emit: (event: string, payload?: Record<string, unknown>) => Promise<void>; notify: (message: string) => void; fetchImpl?: typeof fetch; scope?: Record<string, unknown> }`
  - `selectSinks(emits: EmitSpec[], input: { status: RunStatus; tokens: string[] | null }): EmitSpec[]`
  - `interface DispatchOutcome { spec: EmitSpec; ok: boolean; missing?: boolean; error?: string }`
  - `dispatchSinks(specs: EmitSpec[], ctx: SinkContext): Promise<DispatchOutcome[]>`

- [ ] **Step 1: Write the failing test**

`packages/pi-event-cron-scheduler/test/sinks.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import type { EmitSpec } from "../src/frontmatter.js";
import {
  dispatchSinks,
  getSinkRegistry,
  registerSink,
  selectSinks,
  type SinkContext,
} from "../src/sinks.js";

const evt = (over: Partial<EmitSpec> = {}): EmitSpec => ({
  kind: "event",
  target: "news.found",
  when: "success",
  ...over,
});

function ctx(over: Partial<SinkContext> = {}): SinkContext {
  return {
    jobId: "a",
    runId: "r1",
    workspace: "/ws",
    now: new Date("2026-08-26T04:00:00.000Z"),
    emit: async () => {},
    notify: () => {},
    scope: {},
    ...over,
  };
}

describe("selectSinks", () => {
  it("matches when against the run status", () => {
    const specs = [
      evt({ target: "on-success", when: "success" }),
      evt({ target: "on-failure", when: "failure" }),
      evt({ target: "on-always", when: "always" }),
    ];
    expect(selectSinks(specs, { status: "completed", tokens: null }).map((s) => s.target))
      .toEqual(["on-success", "on-always"]);
    expect(selectSinks(specs, { status: "failed", tokens: null }).map((s) => s.target))
      .toEqual(["on-failure", "on-always"]);
    expect(selectSinks(specs, { status: "timed_out", tokens: null }).map((s) => s.target))
      .toEqual(["on-failure", "on-always"]);
    expect(selectSinks(specs, { status: "interrupted", tokens: null }).map((s) => s.target))
      .toEqual(["on-failure", "on-always"]);
  });

  it("fires an if-guarded sink only when a token matches", () => {
    const specs = [
      evt({ target: "alerted", ifTokens: ["alert-user"] }),
      evt({ target: "recorded", ifTokens: ["record"] }),
      evt({ target: "unguarded" }),
    ];
    expect(selectSinks(specs, { status: "completed", tokens: ["alert-user", "record"] }).map((s) => s.target))
      .toEqual(["alerted", "recorded", "unguarded"]);
    expect(selectSinks(specs, { status: "completed", tokens: ["record"] }).map((s) => s.target))
      .toEqual(["recorded", "unguarded"]);
    expect(selectSinks(specs, { status: "completed", tokens: [] }).map((s) => s.target))
      .toEqual(["unguarded"]);
  });

  it("skips if-guarded sinks when there is no continue line at all", () => {
    const specs = [evt({ target: "guarded", ifTokens: ["go"] }), evt({ target: "unguarded" })];
    expect(selectSinks(specs, { status: "completed", tokens: null }).map((s) => s.target))
      .toEqual(["unguarded"]);
  });

  it("requires when and if to both pass", () => {
    const specs = [evt({ target: "both", when: "failure", ifTokens: ["go"] })];
    expect(selectSinks(specs, { status: "completed", tokens: ["go"] })).toEqual([]);
    expect(selectSinks(specs, { status: "failed", tokens: ["nope"] })).toEqual([]);
    expect(selectSinks(specs, { status: "failed", tokens: ["go"] })).toHaveLength(1);
  });
});

describe("dispatchSinks", () => {
  it("emits events, posts webhooks, and notifies", async () => {
    const emitted: Array<{ event: string; payload?: Record<string, unknown> }> = [];
    const notified: string[] = [];
    const posted: Array<{ url: string; body: string }> = [];

    const fetchImpl = (async (url: any, init: any) => {
      posted.push({ url: String(url), body: String(init?.body) });
      return { ok: true, status: 200 } as any;
    }) as unknown as typeof fetch;

    const outcomes = await dispatchSinks(
      [
        evt({ kind: "event", target: "news.found", args: { severity: "high" } }),
        evt({ kind: "webhook", target: "https://example.com/hook", args: { text: "hi" } }),
        evt({ kind: "notify", target: "look at me" }),
      ],
      ctx({
        emit: async (event, payload) => {
          emitted.push({ event, payload });
        },
        notify: (message) => notified.push(message),
        fetchImpl,
      }),
    );

    expect(outcomes.every((o) => o.ok)).toBe(true);
    expect(emitted).toEqual([{ event: "news.found", payload: { severity: "high" } }]);
    expect(posted[0].url).toBe("https://example.com/hook");
    expect(JSON.parse(posted[0].body)).toEqual({ text: "hi" });
    expect(notified).toEqual(["look at me"]);
  });

  it("reports a registry sink as missing without throwing", async () => {
    const outcomes = await dispatchSinks(
      [evt({ kind: "registry", target: "telegram.send.message", args: { text: "x" } })],
      ctx(),
    );
    expect(outcomes[0].ok).toBe(false);
    expect(outcomes[0].missing).toBe(true);
  });

  it("calls a registered sink and keeps going when one throws", async () => {
    const scope: Record<string, unknown> = {};
    const seen: Array<Record<string, unknown>> = [];
    registerSink("good.sink", async (args) => {
      seen.push(args);
    }, scope);
    registerSink("bad.sink", async () => {
      throw new Error("slack is down");
    }, scope);

    const outcomes = await dispatchSinks(
      [
        evt({ kind: "registry", target: "bad.sink", args: {} }),
        evt({ kind: "registry", target: "good.sink", args: { a: 1 } }),
      ],
      ctx({ scope }),
    );

    expect(outcomes[0].ok).toBe(false);
    expect(outcomes[0].error).toContain("slack is down");
    expect(outcomes[1].ok).toBe(true);
    expect(seen).toEqual([{ a: 1 }]);
  });

  it("reuses an existing registry object so load order does not matter", () => {
    const scope: Record<string, unknown> = {};
    const first = getSinkRegistry(scope);
    registerSink("x", async () => {}, scope);
    expect(getSinkRegistry(scope)).toBe(first);
    expect(Object.keys(getSinkRegistry(scope).sinks)).toEqual(["x"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test packages/pi-event-cron-scheduler/test/sinks.test.ts`
Expected: FAIL, `../src/sinks.js` does not exist.

- [ ] **Step 3: Write the minimal implementation**

`packages/pi-event-cron-scheduler/src/sinks.ts`:

```ts
import type { EmitSpec } from "./frontmatter.js";
import type { RunStatus } from "./state.js";

export const SINK_REGISTRY_KEY = "__piEventCronSinkRegistry__";

export interface SinkContext {
  jobId: string;
  runId: string;
  workspace: string;
  now: Date;
  emit: (event: string, payload?: Record<string, unknown>) => Promise<void>;
  notify: (message: string) => void;
  fetchImpl?: typeof fetch;
  scope?: Record<string, unknown>;
}

export type SinkHandler = (args: Record<string, unknown>, ctx: SinkContext) => Promise<void>;

export interface SinkRegistry {
  version: 1;
  sinks: Record<string, SinkHandler>;
}

export interface DispatchOutcome {
  spec: EmitSpec;
  ok: boolean;
  missing?: boolean;
  error?: string;
}

const FAILURE_STATUSES: RunStatus[] = ["failed", "timed_out", "abandoned", "interrupted"];

export function getSinkRegistry(scope: Record<string, unknown> = globalThis as any): SinkRegistry {
  const existing = scope[SINK_REGISTRY_KEY] as SinkRegistry | undefined;
  if (existing && existing.version === 1 && existing.sinks) return existing;
  const created: SinkRegistry = { version: 1, sinks: {} };
  scope[SINK_REGISTRY_KEY] = created;
  return created;
}

export function registerSink(
  name: string,
  handler: SinkHandler,
  scope: Record<string, unknown> = globalThis as any,
): void {
  getSinkRegistry(scope).sinks[name] = handler;
}

export function selectSinks(
  emits: EmitSpec[],
  input: { status: RunStatus; tokens: string[] | null },
): EmitSpec[] {
  const failed = FAILURE_STATUSES.includes(input.status);
  return emits.filter((spec) => {
    if (spec.when === "success" && failed) return false;
    if (spec.when === "failure" && !failed) return false;
    if (!spec.ifTokens) return true;
    if (!input.tokens) return false;
    return spec.ifTokens.some((token) => input.tokens!.includes(token));
  });
}

async function runOne(spec: EmitSpec, ctx: SinkContext): Promise<DispatchOutcome> {
  if (spec.kind === "event") {
    await ctx.emit(spec.target, spec.args);
    return { spec, ok: true };
  }

  if (spec.kind === "webhook") {
    const doFetch = ctx.fetchImpl ?? fetch;
    const response = await doFetch(spec.target, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(spec.args ?? {}),
    });
    if (!response.ok) return { spec, ok: false, error: `webhook returned ${response.status}` };
    return { spec, ok: true };
  }

  if (spec.kind === "notify") {
    ctx.notify(spec.target);
    return { spec, ok: true };
  }

  const handler = getSinkRegistry(ctx.scope ?? (globalThis as any)).sinks[spec.target];
  if (!handler) return { spec, ok: false, missing: true, error: `sink "${spec.target}" is not registered` };
  await handler(spec.args ?? {}, ctx);
  return { spec, ok: true };
}

export async function dispatchSinks(specs: EmitSpec[], ctx: SinkContext): Promise<DispatchOutcome[]> {
  const outcomes: DispatchOutcome[] = [];
  for (const spec of specs) {
    try {
      outcomes.push(await runOne(spec, ctx));
    } catch (error: any) {
      outcomes.push({ spec, ok: false, error: error?.message ?? String(error) });
    }
  }
  return outcomes;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test packages/pi-event-cron-scheduler/test/sinks.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/pi-event-cron-scheduler/src/sinks.ts \
        packages/pi-event-cron-scheduler/test/sinks.test.ts
git commit -m "feat(event-cron): gate and dispatch sinks with an open globalThis registry"
```

---

### Task 8: Context header, memory scratchpad, continue instruction

There is no templating, so this header is the only channel through which a job learns the
date, its trigger, the event payload, the previous run, and its memory. The continue-line
instruction is derived from the `if:` tokens actually present in the file, so it cannot drift
from what the sinks match on.

Memory is truncated from the end rather than the start: recent notes matter more than the
first ones ever written.

**Files:**
- Create: `packages/pi-event-cron-scheduler/src/context.ts`
- Test: `packages/pi-event-cron-scheduler/test/context.test.ts`

**Interfaces:**
- Consumes: `JobDefinition` from Task 2, `RunRow` from Task 4.
- Produces:
  - `MEMORY_MAX_CHARS = 8192`, `OUTPUT_TAIL_CHARS = 4000`
  - `memoryPath(stateDir: string, jobId: string): string`
  - `readMemory(stateDir: string, jobId: string): Promise<string>` — creates the file empty on
    first call, returns at most `MEMORY_MAX_CHARS` from the end
  - `truncateTail(text: string, max: number): string`
  - `collectIfTokens(job: JobDefinition): string[]` — unique, sorted
  - `continueInstruction(tokens: string[]): string` — empty string when `tokens` is empty
  - `buildContextHeader(input: ContextInput): string` where
    `interface ContextInput { job: JobDefinition; now: Date; trigger: { event: string; source: string }; payload?: Record<string, unknown>; previous?: RunRow; memory?: { path: string; content: string } }`
  - `buildPrompt(input: ContextInput): string` — header, blank line, job body, then the
    continue instruction when there is one

- [ ] **Step 1: Write the failing test**

`packages/pi-event-cron-scheduler/test/context.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { JobDefinition } from "../src/frontmatter.js";
import {
  MEMORY_MAX_CHARS,
  buildContextHeader,
  buildPrompt,
  collectIfTokens,
  continueInstruction,
  memoryPath,
  readMemory,
  truncateTail,
} from "../src/context.js";

const NOW = new Date("2026-08-26T02:56:00.000Z");

function job(over: Partial<JobDefinition> = {}): JobDefinition {
  return {
    id: "security-red-team",
    path: "/ws/scheduled/rt.md",
    workspace: "/ws",
    on: [],
    concurrency: "skip",
    memory: false,
    emits: [],
    body: "Go red-team everything.",
    ...over,
  };
}

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "eventcron-ctx-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("buildContextHeader", () => {
  it("states the job, trigger, time in the job timezone, and the ISO date", () => {
    const header = buildContextHeader({
      job: job({ cron: "*/5 * * * *", timezone: "Europe/Oslo" }),
      now: NOW,
      trigger: { event: "cron.tick", source: "cron" },
    });
    expect(header).toContain("[scheduled job: security-red-team]");
    expect(header).toContain("Triggered by: cron.tick");
    expect(header).toContain("*/5 * * * * Europe/Oslo");
    expect(header).toContain("ISO date: 2026-08-26");
    expect(header).toContain("04:56");
    expect(header).toContain("Workspace: /ws");
  });

  it("includes the event payload and the previous run with its continue tokens", () => {
    const header = buildContextHeader({
      job: job(),
      now: NOW,
      trigger: { event: "threat-report.written", source: "scout" },
      payload: { severity: "high" },
      previous: {
        runId: "r0",
        jobId: "security-red-team",
        workspace: "/ws",
        status: "completed",
        pid: 1,
        startedAt: "2026-08-26T02:48:00.000Z",
        completedAt: "2026-08-26T02:51:12.000Z",
        durationMs: 192_000,
        continueTokens: ["found-threats"],
        outputTail: "three hosts responded",
      },
    });
    expect(header).toContain('Event payload: {"severity":"high"}');
    expect(header).toContain("Previous run: completed");
    expect(header).toContain("continue: [found-threats]");
    expect(header).toContain("three hosts responded");
  });

  it("omits the memory block entirely when memory is off", () => {
    const header = buildContextHeader({ job: job(), now: NOW, trigger: { event: "cron.tick", source: "cron" } });
    expect(header).not.toContain("Memory file");
    expect(header).not.toContain("--- memory ---");
  });

  it("includes the memory path and content when memory is on", () => {
    const header = buildContextHeader({
      job: job({ memory: true }),
      now: NOW,
      trigger: { event: "cron.tick", source: "cron" },
      memory: { path: "/state/memory/security-red-team.md", content: "remember the open port" },
    });
    expect(header).toContain("Memory file: /state/memory/security-red-team.md");
    expect(header).toContain("--- memory ---");
    expect(header).toContain("remember the open port");
    expect(header).toContain("--- end memory ---");
  });
});

describe("collectIfTokens and continueInstruction", () => {
  it("collects unique sorted tokens across emits", () => {
    const tokens = collectIfTokens(job({
      emits: [
        { kind: "event", target: "a", when: "success", ifTokens: ["record", "alert-user"] },
        { kind: "notify", target: "n", when: "failure", ifTokens: ["record"] },
        { kind: "event", target: "b", when: "always" },
      ],
    }));
    expect(tokens).toEqual(["alert-user", "record"]);
  });

  it("returns an empty string when no emit uses if", () => {
    expect(continueInstruction([])).toBe("");
  });

  it("lists exactly the tokens in use and both accepted forms", () => {
    const text = continueInstruction(["alert-user", "record"]);
    expect(text).toContain("continue: [alert-user,record]");
    expect(text).toContain("continue: alert-user");
    expect(text).toContain("continue: []");
    expect(text).not.toContain("TRUE");
  });
});

describe("buildPrompt", () => {
  it("puts the header first, the body next, and the instruction last", () => {
    const prompt = buildPrompt({
      job: job({ emits: [{ kind: "event", target: "a", when: "success", ifTokens: ["go"] }] }),
      now: NOW,
      trigger: { event: "cron.tick", source: "cron" },
    });
    const headerAt = prompt.indexOf("[scheduled job:");
    const bodyAt = prompt.indexOf("Go red-team everything.");
    const instructionAt = prompt.indexOf("continue: [go]");
    expect(headerAt).toBeGreaterThanOrEqual(0);
    expect(bodyAt).toBeGreaterThan(headerAt);
    expect(instructionAt).toBeGreaterThan(bodyAt);
  });

  it("adds no instruction when the job uses no if", () => {
    const prompt = buildPrompt({ job: job(), now: NOW, trigger: { event: "cron.tick", source: "cron" } });
    expect(prompt).not.toContain("continue:");
  });
});

describe("memory files", () => {
  it("creates the file empty on first read and keeps later content", async () => {
    expect(await readMemory(dir, "a")).toBe("");
    expect(await readFile(memoryPath(dir, "a"), "utf8")).toBe("");

    await writeFile(memoryPath(dir, "a"), "noted", "utf8");
    expect(await readMemory(dir, "a")).toBe("noted");
  });

  it("keeps the end of an oversized memory file", async () => {
    await readMemory(dir, "big");
    await writeFile(memoryPath(dir, "big"), `${"x".repeat(MEMORY_MAX_CHARS)}TAIL`, "utf8");
    const content = await readMemory(dir, "big");
    expect(content.length).toBe(MEMORY_MAX_CHARS);
    expect(content.endsWith("TAIL")).toBe(true);
  });

  it("truncateTail keeps the end and leaves short text alone", () => {
    expect(truncateTail("short", 10)).toBe("short");
    expect(truncateTail("abcdefghij", 4)).toBe("ghij");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test packages/pi-event-cron-scheduler/test/context.test.ts`
Expected: FAIL, `../src/context.js` does not exist.

- [ ] **Step 3: Write the minimal implementation**

`packages/pi-event-cron-scheduler/src/context.ts`:

```ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { JobDefinition } from "./frontmatter.js";
import type { RunRow } from "./state.js";

export const MEMORY_MAX_CHARS = 8192;
export const OUTPUT_TAIL_CHARS = 4000;

export interface ContextInput {
  job: JobDefinition;
  now: Date;
  trigger: { event: string; source: string };
  payload?: Record<string, unknown>;
  previous?: RunRow;
  memory?: { path: string; content: string };
}

export function memoryPath(stateDir: string, jobId: string): string {
  return join(stateDir, "memory", `${jobId}.md`);
}

export function truncateTail(text: string, max: number): string {
  return text.length <= max ? text : text.slice(text.length - max);
}

export async function readMemory(stateDir: string, jobId: string): Promise<string> {
  const path = memoryPath(stateDir, jobId);
  try {
    return truncateTail(await readFile(path, "utf8"), MEMORY_MAX_CHARS);
  } catch (error: any) {
    if (error?.code !== "ENOENT") throw error;
    await mkdir(join(stateDir, "memory"), { recursive: true });
    await writeFile(path, "", "utf8");
    return "";
  }
}

export function collectIfTokens(job: JobDefinition): string[] {
  const tokens = new Set<string>();
  for (const spec of job.emits) {
    for (const token of spec.ifTokens ?? []) tokens.add(token);
  }
  return [...tokens].sort();
}

export function continueInstruction(tokens: string[]): string {
  if (tokens.length === 0) return "";
  return [
    "---",
    "When you are done, the LAST line of your output must be a continue line naming which",
    "follow-up actions should run. Accepted tokens for this job:",
    ...tokens.map((token) => `  - ${token}`),
    "",
    "Accepted forms:",
    `  continue: [${tokens.join(",")}]     (several)`,
    `  continue: ${tokens[0]}     (one)`,
    "  continue: []     (none apply)",
    "",
    "Write nothing after that line.",
  ].join("\n");
}

function formatLocal(now: Date, timezone?: string): string {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return formatter.format(now);
}

export function buildContextHeader(input: ContextInput): string {
  const { job, now, trigger } = input;
  const scheduleSuffix = job.cron ? ` (${job.cron}${job.timezone ? ` ${job.timezone}` : ""})` : "";
  const zone = job.timezone ?? "local time";

  const lines = [
    `[scheduled job: ${job.id}]`,
    `Triggered by: ${trigger.event}${scheduleSuffix} from ${trigger.source}`,
    `Now: ${formatLocal(now, job.timezone)} (${zone}) | ISO date: ${now.toISOString().slice(0, 10)}`,
    `Workspace: ${job.workspace}`,
  ];

  if (input.payload && Object.keys(input.payload).length > 0) {
    lines.push(`Event payload: ${JSON.stringify(input.payload)}`);
  }

  const previous = input.previous;
  if (previous) {
    const when = previous.completedAt ?? previous.startedAt;
    const duration = previous.durationMs === undefined ? "" : `, ${Math.round(previous.durationMs / 1000)}s`;
    const tokens = previous.continueTokens ? `, continue: [${previous.continueTokens.join(",")}]` : "";
    lines.push(`Previous run: ${previous.status} at ${when}${duration}${tokens}`);
    if (previous.outputTail) {
      lines.push("--- previous output tail ---", truncateTail(previous.outputTail, OUTPUT_TAIL_CHARS), "--- end previous output ---");
    }
  }

  if (job.memory && input.memory) {
    lines.push(
      `Memory file: ${input.memory.path}`,
      "You may rewrite that file with the write tool to remember things for the next run.",
      "--- memory ---",
      input.memory.content,
      "--- end memory ---",
    );
  }

  return lines.join("\n");
}

export function buildPrompt(input: ContextInput): string {
  const instruction = continueInstruction(collectIfTokens(input.job));
  const parts = [buildContextHeader(input), "", input.job.body];
  if (instruction) parts.push("", instruction);
  return parts.join("\n");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test packages/pi-event-cron-scheduler/test/context.test.ts`
Expected: PASS, 11 tests. The `04:56` assertion holds because `02:56Z` is `04:56` in
`Europe/Oslo` during summer time.

- [ ] **Step 5: Commit**

```bash
git add packages/pi-event-cron-scheduler/src/context.ts \
        packages/pi-event-cron-scheduler/test/context.test.ts
git commit -m "feat(event-cron): build job prompts with context, memory, and continue instruction"
```

---

### Task 9: Engine core — routing, concurrency, chain limit

The engine reads events, decides which jobs they start, runs them through an injected
`runAgent`, then gates and dispatches their sinks. Deadlines and crash recovery come in Task
10; this task deliberately has no timers so its tests are pure control flow.

`cron.tick` is not in any job's `on:`. It is routed by `payload.jobId`, which is why cron can
stay entirely in `src/index.ts` while the engine remains testable without croner.

**Files:**
- Create: `packages/pi-event-cron-scheduler/src/engine.ts`
- Test: `packages/pi-event-cron-scheduler/test/engine.test.ts`

**Interfaces:**
- Consumes: `JobDefinition` (Task 2), state helpers (Task 4), bus helpers (Task 5),
  `selectSinks`/`dispatchSinks` (Task 7), `buildPrompt`/`readMemory`/`memoryPath`/`OUTPUT_TAIL_CHARS` (Task 8),
  `parseContinueLine` (Task 1).
- Produces:
  - `CHAIN_LIMIT = 8`, `OUTPUT_STORE_CHARS = 12_000`
  - `type RunAgent = (input: { job: JobDefinition; prompt: string; signal: AbortSignal }) => Promise<{ status: "completed" | "failed"; output: string; error?: string }>`
  - `interface EngineDeps { stateDir: string; jobs: JobDefinition[]; clock: () => number; pid: number; runAgent: RunAgent; notify: (message: string) => void; fetchImpl?: typeof fetch; scope?: Record<string, unknown>; idFn?: () => string }`
  - `class Engine` with `emit(input): Promise<void>`, `drain(): Promise<void>`,
    `handleEvent(event: BusEvent): Promise<void>`, `setJobs(jobs: JobDefinition[]): void`,
    `inFlightCount(jobId: string): number`, and `idle(): Promise<void>` which resolves when no
    run is in flight.

- [ ] **Step 1: Write the failing test**

`packages/pi-event-cron-scheduler/test/engine.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readNewEvents } from "../src/bus.js";
import { Engine, type RunAgent } from "../src/engine.js";
import type { EmitSpec, JobDefinition } from "../src/frontmatter.js";
import { loadRuns } from "../src/state.js";

let dir: string;
let now = Date.parse("2026-08-26T04:00:00.000Z");
let counter = 0;

const clock = () => now;
const ids = () => `id-${++counter}`;

function job(over: Partial<JobDefinition> = {}): JobDefinition {
  return {
    id: "a",
    path: "/ws/scheduled/a.md",
    workspace: "/ws",
    on: [],
    concurrency: "skip",
    memory: false,
    emits: [],
    body: "Do the thing.",
    ...over,
  };
}

function emitSpec(over: Partial<EmitSpec> = {}): EmitSpec {
  return { kind: "event", target: "news.found", when: "success", ...over };
}

/** A runner whose completion is controlled by the test. */
function controllable() {
  const calls: Array<{ prompt: string; resolve: (output: string) => void; reject: (error: Error) => void }> = [];
  const runAgent: RunAgent = ({ prompt }) =>
    new Promise((resolve, reject) => {
      calls.push({
        prompt,
        resolve: (output) => resolve({ status: "completed", output }),
        reject: (error) => resolve({ status: "failed", output: "", error: error.message }),
      });
    });
  return { calls, runAgent };
}

function engineWith(jobs: JobDefinition[], runAgent: RunAgent, scope: Record<string, unknown> = {}): Engine {
  return new Engine({
    stateDir: dir,
    jobs,
    clock,
    pid: 777,
    runAgent,
    notify: () => {},
    scope,
    idFn: ids,
  });
}

async function allEvents(): Promise<string[]> {
  const { events } = await readNewEvents(dir, { file: "", offset: 0 });
  return events.map((event) => event.event);
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "eventcron-engine-"));
  now = Date.parse("2026-08-26T04:00:00.000Z");
  counter = 0;
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("routing", () => {
  it("runs the job named by a cron.tick payload and prompts it with its body", async () => {
    const { calls, runAgent } = controllable();
    const engine = engineWith([job()], runAgent);

    await engine.emit({ event: "cron.tick", source: "cron", payload: { jobId: "a" } });
    await engine.drain();

    expect(calls).toHaveLength(1);
    expect(calls[0].prompt).toContain("[scheduled job: a]");
    expect(calls[0].prompt).toContain("Do the thing.");

    calls[0].resolve("done");
    await engine.idle();
    expect(await allEvents()).toContain("job.completed");
  });

  it("starts only the jobs subscribed to an event", async () => {
    const { calls, runAgent } = controllable();
    const listener = job({ id: "listener", on: ["news.found"] });
    const bystander = job({ id: "bystander" });
    const engine = engineWith([listener, bystander], runAgent);

    await engine.emit({ event: "news.found", source: "scout" });
    await engine.drain();

    expect(calls).toHaveLength(1);
    expect(calls[0].prompt).toContain("[scheduled job: listener]");
  });

  it("drains each event exactly once across calls", async () => {
    const { calls, runAgent } = controllable();
    const engine = engineWith([job({ on: ["tick"] })], runAgent);

    await engine.emit({ event: "tick", source: "tool" });
    await engine.drain();
    await engine.drain();
    expect(calls).toHaveLength(1);
  });
});

describe("concurrency", () => {
  it("skips a trigger that arrives while a run is in flight", async () => {
    const { calls, runAgent } = controllable();
    const engine = engineWith([job({ on: ["tick"], concurrency: "skip" })], runAgent);

    await engine.emit({ event: "tick", source: "tool" });
    await engine.drain();
    await engine.emit({ event: "tick", source: "tool" });
    await engine.drain();

    expect(calls).toHaveLength(1);
    expect(await allEvents()).toContain("job.skipped");

    calls[0].resolve("done");
    await engine.idle();
    expect(calls).toHaveLength(1);
  });

  it("queues at most one pending trigger and starts it when the slot frees", async () => {
    const { calls, runAgent } = controllable();
    const engine = engineWith([job({ on: ["tick"], concurrency: "queue" })], runAgent);

    await engine.emit({ event: "tick", source: "tool" });
    await engine.drain();
    for (let i = 0; i < 3; i++) {
      await engine.emit({ event: "tick", source: "tool" });
      await engine.drain();
    }
    expect(calls).toHaveLength(1);

    calls[0].resolve("first");
    await engine.idle();
    expect(calls).toHaveLength(2);

    calls[1].resolve("second");
    await engine.idle();
    expect(calls).toHaveLength(2);
  });

  it("runs in parallel without a cap when asked", async () => {
    const { calls, runAgent } = controllable();
    const engine = engineWith([job({ on: ["tick"], concurrency: "parallel" })], runAgent);

    await engine.emit({ event: "tick", source: "tool" });
    await engine.drain();
    await engine.emit({ event: "tick", source: "tool" });
    await engine.drain();

    expect(calls).toHaveLength(2);
    expect(engine.inFlightCount("a")).toBe(2);

    calls[0].resolve("one");
    calls[1].resolve("two");
    await engine.idle();
  });
});

describe("continue line and sinks", () => {
  it("stores the continue line and fires only the matching if-guarded sinks", async () => {
    const { calls, runAgent } = controllable();
    const engine = engineWith([
      job({
        on: ["tick"],
        emits: [
          emitSpec({ target: "user.alerted", ifTokens: ["alert-user"] }),
          emitSpec({ target: "run.recorded", ifTokens: ["record"] }),
        ],
      }),
    ], runAgent);

    await engine.emit({ event: "tick", source: "tool" });
    await engine.drain();
    calls[0].resolve("worked hard\ncontinue: [record]");
    await engine.idle();

    const events = await allEvents();
    expect(events).toContain("run.recorded");
    expect(events).not.toContain("user.alerted");

    const runs = await loadRuns(dir);
    expect(runs[0].verdict).toBe("continue: [record]");
    expect(runs[0].continueTokens).toEqual(["record"]);
    expect(runs[0].status).toBe("completed");
  });

  it("emits job.signal.missing once when an if-using job produces no continue line", async () => {
    const { calls, runAgent } = controllable();
    const engine = engineWith([
      job({ on: ["tick"], emits: [emitSpec({ target: "user.alerted", ifTokens: ["alert-user"] })] }),
    ], runAgent);

    await engine.emit({ event: "tick", source: "tool" });
    await engine.drain();
    calls[0].resolve("I forgot the line entirely");
    await engine.idle();

    const events = await allEvents();
    expect(events.filter((event) => event === "job.signal.missing")).toHaveLength(1);
    expect(events).not.toContain("user.alerted");
  });

  it("emits job.failed when the runner reports failure and skips success sinks", async () => {
    const { calls, runAgent } = controllable();
    const engine = engineWith([
      job({ on: ["tick"], emits: [emitSpec({ target: "news.found", when: "success" })] }),
    ], runAgent);

    await engine.emit({ event: "tick", source: "tool" });
    await engine.drain();
    calls[0].reject(new Error("model exploded"));
    await engine.idle();

    const events = await allEvents();
    expect(events).toContain("job.failed");
    expect(events).not.toContain("news.found");
    expect((await loadRuns(dir))[0].status).toBe("failed");
  });
});

describe("chain limit", () => {
  it("rejects an emit past the limit, records it, and fails the run", async () => {
    const { calls, runAgent } = controllable();
    const engine = engineWith([
      job({ on: ["tick"], emits: [emitSpec({ target: "news.found" })] }),
    ], runAgent);

    await engine.emit({ event: "tick", source: "tool", chain: 8 });
    await engine.drain();
    calls[0].resolve("done");
    await engine.idle();

    const events = await allEvents();
    expect(events).toContain("chain.limit.exceeded");
    expect(events).not.toContain("news.found");
    expect((await loadRuns(dir))[0].status).toBe("failed");
  });

  it("increments chain for events a run emits", async () => {
    const { calls, runAgent } = controllable();
    const engine = engineWith([
      job({ on: ["tick"], emits: [emitSpec({ target: "news.found" })] }),
    ], runAgent);

    await engine.emit({ event: "tick", source: "tool", chain: 2 });
    await engine.drain();
    calls[0].resolve("done");
    await engine.idle();

    const { events } = await readNewEvents(dir, { file: "", offset: 0 });
    const emitted = events.find((event) => event.event === "news.found");
    expect(emitted?.chain).toBe(3);
    expect(emitted?.source).toBe("a");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test packages/pi-event-cron-scheduler/test/engine.test.ts`
Expected: FAIL, `../src/engine.js` does not exist.

- [ ] **Step 3: Write the minimal implementation**

`packages/pi-event-cron-scheduler/src/engine.ts`:

```ts
import { type BusEvent, appendEvent, newEvent, readNewEvents } from "./bus.js";
import { OUTPUT_TAIL_CHARS, buildPrompt, collectIfTokens, memoryPath, readMemory, truncateTail } from "./context.js";
import { type JobDefinition, parseContinueLine } from "./frontmatter.js";
import { dispatchSinks, selectSinks } from "./sinks.js";
import { type Cursor, type RunRow, type RunStatus, lastRunFor, loadRuns, readCursor, saveRun, writeCursor } from "./state.js";

export const CHAIN_LIMIT = 8;
export const OUTPUT_STORE_CHARS = 12_000;

export type RunAgent = (input: {
  job: JobDefinition;
  prompt: string;
  signal: AbortSignal;
}) => Promise<{ status: "completed" | "failed"; output: string; error?: string }>;

export interface EngineDeps {
  stateDir: string;
  jobs: JobDefinition[];
  clock: () => number;
  pid: number;
  runAgent: RunAgent;
  notify: (message: string) => void;
  fetchImpl?: typeof fetch;
  scope?: Record<string, unknown>;
  idFn?: () => string;
}

interface RunHandle {
  runId: string;
  jobId: string;
  controller: AbortController;
  promise: Promise<void>;
}

export class Engine {
  private jobs: JobDefinition[];
  private readonly inFlight = new Map<string, Set<RunHandle>>();
  private readonly pending = new Map<string, BusEvent>();

  constructor(private readonly deps: EngineDeps) {
    this.jobs = deps.jobs;
  }

  setJobs(jobs: JobDefinition[]): void {
    this.jobs = jobs;
  }

  inFlightCount(jobId: string): number {
    return this.inFlight.get(jobId)?.size ?? 0;
  }

  async idle(): Promise<void> {
    while (true) {
      const running = [...this.inFlight.values()].flatMap((set) => [...set]);
      if (running.length === 0) return;
      await Promise.all(running.map((handle) => handle.promise));
    }
  }

  async emit(input: {
    event: string;
    source: string;
    runId?: string;
    chain?: number;
    payload?: Record<string, unknown>;
  }): Promise<void> {
    const now = new Date(this.deps.clock());
    await appendEvent(this.deps.stateDir, newEvent(input, now, this.deps.idFn), now);
  }

  async drain(): Promise<void> {
    const cursor: Cursor = await readCursor(this.deps.stateDir);
    const { events, cursor: next } = await readNewEvents(this.deps.stateDir, cursor);
    await writeCursor(this.deps.stateDir, next);
    for (const event of events) await this.handleEvent(event);
  }

  async handleEvent(event: BusEvent): Promise<void> {
    if (event.event === "cron.tick") {
      const jobId = event.payload?.jobId;
      const job = this.jobs.find((candidate) => candidate.id === jobId);
      if (job) await this.trigger(job, event);
      return;
    }
    for (const job of this.jobs) {
      if (job.on.includes(event.event)) await this.trigger(job, event);
    }
  }

  private async trigger(job: JobDefinition, event: BusEvent): Promise<void> {
    const running = this.inFlightCount(job.id);
    if (running > 0 && job.concurrency !== "parallel") {
      if (job.concurrency === "skip") {
        await this.emit({
          event: "job.skipped",
          source: job.id,
          chain: event.chain,
          payload: { jobId: job.id, trigger: event.event },
        });
      } else {
        this.pending.set(job.id, event);
      }
      return;
    }
    this.start(job, event);
  }

  private start(job: JobDefinition, event: BusEvent): void {
    const runId = (this.deps.idFn ?? (() => `${Date.now()}`))();
    const controller = new AbortController();
    const handle: RunHandle = { runId, jobId: job.id, controller, promise: Promise.resolve() };

    const bucket = this.inFlight.get(job.id) ?? new Set<RunHandle>();
    bucket.add(handle);
    this.inFlight.set(job.id, bucket);

    handle.promise = this.execute(job, event, handle).finally(async () => {
      bucket.delete(handle);
      if (bucket.size === 0) this.inFlight.delete(job.id);
      const queued = this.pending.get(job.id);
      if (queued && this.inFlightCount(job.id) === 0) {
        this.pending.delete(job.id);
        this.start(job, queued);
      }
    });
  }

  private async execute(job: JobDefinition, event: BusEvent, handle: RunHandle): Promise<void> {
    const startedMs = this.deps.clock();
    const startedAt = new Date(startedMs).toISOString();

    const rows = await loadRuns(this.deps.stateDir);
    const previous = lastRunFor(rows, job.id);

    const row: RunRow = {
      runId: handle.runId,
      jobId: job.id,
      workspace: job.workspace,
      status: "running",
      pid: this.deps.pid,
      startedAt,
    };
    await saveRun(this.deps.stateDir, row);

    await this.emit({
      event: "job.started",
      source: job.id,
      runId: handle.runId,
      chain: event.chain,
      payload: { jobId: job.id, trigger: event.event },
    });

    const memory = job.memory
      ? { path: memoryPath(this.deps.stateDir, job.id), content: await readMemory(this.deps.stateDir, job.id) }
      : undefined;

    const prompt = buildPrompt({
      job,
      now: new Date(startedMs),
      trigger: { event: event.event, source: event.source },
      payload: event.payload,
      previous,
      memory,
    });

    let status: RunStatus;
    let output = "";
    try {
      const result = await this.deps.runAgent({ job, prompt, signal: handle.controller.signal });
      output = result.output ?? "";
      status = result.status === "completed" ? "completed" : "failed";
    } catch (error: any) {
      status = "failed";
      output = error?.message ?? String(error);
    }

    const parsed = parseContinueLine(output);
    const usesIf = collectIfTokens(job).length > 0;

    if (usesIf && !parsed) {
      await this.emit({
        event: "job.signal.missing",
        source: job.id,
        runId: handle.runId,
        chain: event.chain,
        payload: { jobId: job.id, runId: handle.runId },
      });
    }

    let chainExceeded = false;
    const selected = selectSinks(job.emits, { status, tokens: parsed ? parsed.tokens : null });
    const outcomes = await dispatchSinks(selected, {
      jobId: job.id,
      runId: handle.runId,
      workspace: job.workspace,
      now: new Date(this.deps.clock()),
      notify: this.deps.notify,
      fetchImpl: this.deps.fetchImpl,
      scope: this.deps.scope,
      emit: async (name, payload) => {
        const nextChain = event.chain + 1;
        if (nextChain > CHAIN_LIMIT) {
          chainExceeded = true;
          await this.emit({
            event: "chain.limit.exceeded",
            source: job.id,
            runId: handle.runId,
            chain: event.chain,
            payload: { jobId: job.id, runId: handle.runId, rejected: name },
          });
          return;
        }
        await this.emit({ event: name, source: job.id, runId: handle.runId, chain: nextChain, payload });
      },
    });

    for (const outcome of outcomes) {
      if (outcome.missing) {
        await this.emit({
          event: "sink.missing",
          source: job.id,
          runId: handle.runId,
          chain: event.chain,
          payload: { jobId: job.id, sink: outcome.spec.target },
        });
      }
    }

    const finalStatus: RunStatus = chainExceeded ? "failed" : status;
    const completedMs = this.deps.clock();
    await saveRun(this.deps.stateDir, {
      ...row,
      status: finalStatus,
      completedAt: new Date(completedMs).toISOString(),
      durationMs: completedMs - startedMs,
      verdict: parsed?.raw,
      continueTokens: parsed?.tokens,
      outputTail: truncateTail(output, Math.min(OUTPUT_STORE_CHARS, OUTPUT_TAIL_CHARS)),
    });

    await this.emit({
      event: finalStatus === "completed" ? "job.completed" : "job.failed",
      source: job.id,
      runId: handle.runId,
      chain: event.chain,
      payload: { jobId: job.id, runId: handle.runId, status: finalStatus },
    });
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test packages/pi-event-cron-scheduler/test/engine.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/pi-event-cron-scheduler/src/engine.ts \
        packages/pi-event-cron-scheduler/test/engine.test.ts
git commit -m "feat(event-cron): route events to jobs with concurrency policy and chain limit"
```

---

### Task 10: Deadlines, overdue signal, abandonment, crash recovery

This is what stops a hung job from deadlocking a `skip` schedule forever. Timers are injected
so the tests fire them directly instead of waiting.

The grace period matters because `pi-inprocess` abort is cooperative: a hung `bash` call may
never return. When the run has not settled `graceMs` after abort, the slot is freed anyway and
the run is recorded as `abandoned`.

**Files:**
- Modify: `packages/pi-event-cron-scheduler/src/engine.ts`
- Modify: `packages/pi-event-cron-scheduler/test/engine.test.ts`

**Interfaces:**
- Consumes: everything from Task 9.
- Produces (additions to `src/engine.ts`):
  - `DEFAULT_TIMEOUT_MS = 600_000`, `GRACE_MS = 60_000`
  - `EngineDeps` gains `setTimer: (fn: () => void, ms: number) => TimerHandle`,
    `clearTimer: (handle: TimerHandle) => void`, optional `defaultTimeoutMs?: number`,
    optional `graceMs?: number`, optional `isPidAlive?: (pid: number) => boolean`
  - `type TimerHandle = unknown`
  - `Engine.recoverInterrupted(): Promise<RunRow[]>`

- [ ] **Step 1: Write the failing test**

Append to `packages/pi-event-cron-scheduler/test/engine.test.ts`. It needs a timer harness, so
add this helper next to `controllable()`:

```ts
/** Records timers so a test can fire them on demand. */
function timerHarness() {
  const timers: Array<{ fn: () => void; ms: number; cancelled: boolean }> = [];
  const setTimer = (fn: () => void, ms: number) => {
    const entry = { fn, ms, cancelled: false };
    timers.push(entry);
    return entry;
  };
  const clearTimer = (handle: any) => {
    if (handle) handle.cancelled = true;
  };
  const fire = (ms: number) => {
    for (const timer of [...timers]) {
      if (!timer.cancelled && timer.ms === ms) {
        timer.cancelled = true;
        timer.fn();
      }
    }
  };
  return { timers, setTimer, clearTimer, fire };
}
```

Then append these suites:

```ts
describe("deadlines", () => {
  it("aborts on timeout, records timed_out, and frees the slot", async () => {
    const { calls, runAgent } = controllable();
    const harness = timerHarness();
    const engine = new Engine({
      stateDir: dir,
      jobs: [job({ on: ["tick"], concurrency: "skip", timeoutMs: 5_000 })],
      clock,
      pid: 777,
      runAgent,
      notify: () => {},
      scope: {},
      idFn: ids,
      setTimer: harness.setTimer,
      clearTimer: harness.clearTimer,
    });

    await engine.emit({ event: "tick", source: "tool" });
    await engine.drain();
    expect(engine.inFlightCount("a")).toBe(1);

    harness.fire(5_000);
    calls[0].resolve("aborted mid-flight");
    await engine.idle();

    expect(await allEvents()).toContain("job.timeout");
    expect((await loadRuns(dir))[0].status).toBe("timed_out");
    expect(engine.inFlightCount("a")).toBe(0);

    await engine.emit({ event: "tick", source: "tool" });
    await engine.drain();
    expect(calls).toHaveLength(2);
  });

  it("uses the default deadline when the job sets no timeout", async () => {
    const { runAgent } = controllable();
    const harness = timerHarness();
    const engine = new Engine({
      stateDir: dir,
      jobs: [job({ on: ["tick"] })],
      clock,
      pid: 777,
      runAgent,
      notify: () => {},
      scope: {},
      idFn: ids,
      setTimer: harness.setTimer,
      clearTimer: harness.clearTimer,
    });

    await engine.emit({ event: "tick", source: "tool" });
    await engine.drain();
    expect(harness.timers.some((timer) => timer.ms === DEFAULT_TIMEOUT_MS)).toBe(true);
  });

  it("emits job.overdue exactly once and lets the run continue", async () => {
    const { calls, runAgent } = controllable();
    const harness = timerHarness();
    const engine = new Engine({
      stateDir: dir,
      jobs: [job({ on: ["tick"], expectedRuntimeMs: 2_000, timeoutMs: 60_000 })],
      clock,
      pid: 777,
      runAgent,
      notify: () => {},
      scope: {},
      idFn: ids,
      setTimer: harness.setTimer,
      clearTimer: harness.clearTimer,
    });

    await engine.emit({ event: "tick", source: "tool" });
    await engine.drain();

    harness.fire(2_000);
    harness.fire(2_000);

    calls[0].resolve("slow but fine");
    await engine.idle();

    const events = await allEvents();
    expect(events.filter((event) => event === "job.overdue")).toHaveLength(1);
    expect(events).toContain("job.completed");
    expect((await loadRuns(dir))[0].status).toBe("completed");
  });

  it("abandons a run that ignores its abort and frees the slot anyway", async () => {
    const { calls, runAgent } = controllable();
    const harness = timerHarness();
    const engine = new Engine({
      stateDir: dir,
      jobs: [job({ on: ["tick"], concurrency: "skip", timeoutMs: 5_000 })],
      clock,
      pid: 777,
      runAgent,
      notify: () => {},
      scope: {},
      idFn: ids,
      setTimer: harness.setTimer,
      clearTimer: harness.clearTimer,
      graceMs: GRACE_MS,
    });

    await engine.emit({ event: "tick", source: "tool" });
    await engine.drain();

    harness.fire(5_000);
    harness.fire(GRACE_MS);

    expect(engine.inFlightCount("a")).toBe(0);
    const events = await allEvents();
    expect(events).toContain("job.abandoned");
    expect((await loadRuns(dir)).find((row) => row.runId === "id-2")?.status).toBe("abandoned");

    await engine.emit({ event: "tick", source: "tool" });
    await engine.drain();
    expect(calls).toHaveLength(2);
  });
});

describe("recoverInterrupted", () => {
  it("marks running rows from a dead pid as interrupted and announces them", async () => {
    await saveRun(dir, {
      runId: "ghost",
      jobId: "a",
      workspace: "/ws",
      status: "running",
      pid: 4242,
      startedAt: "2026-08-26T03:00:00.000Z",
    });

    const { runAgent } = controllable();
    const harness = timerHarness();
    const engine = new Engine({
      stateDir: dir,
      jobs: [job()],
      clock,
      pid: 777,
      runAgent,
      notify: () => {},
      scope: {},
      idFn: ids,
      setTimer: harness.setTimer,
      clearTimer: harness.clearTimer,
      isPidAlive: () => false,
    });

    const recovered = await engine.recoverInterrupted();
    expect(recovered.map((row) => row.runId)).toEqual(["ghost"]);
    expect((await loadRuns(dir)).find((row) => row.runId === "ghost")?.status).toBe("interrupted");
    expect(await allEvents()).toContain("job.interrupted");
  });

  it("leaves rows alone when the owning pid is still alive", async () => {
    await saveRun(dir, {
      runId: "alive",
      jobId: "a",
      workspace: "/ws",
      status: "running",
      pid: 4242,
      startedAt: "2026-08-26T03:00:00.000Z",
    });

    const { runAgent } = controllable();
    const harness = timerHarness();
    const engine = new Engine({
      stateDir: dir,
      jobs: [job()],
      clock,
      pid: 777,
      runAgent,
      notify: () => {},
      scope: {},
      idFn: ids,
      setTimer: harness.setTimer,
      clearTimer: harness.clearTimer,
      isPidAlive: () => true,
    });

    expect(await engine.recoverInterrupted()).toEqual([]);
    expect((await loadRuns(dir))[0].status).toBe("running");
  });
});
```

Update the imports at the top of the test file to add the new names:

```ts
import { DEFAULT_TIMEOUT_MS, Engine, GRACE_MS, type RunAgent } from "../src/engine.js";
import { loadRuns, saveRun } from "../src/state.js";
```

The existing Task 9 `engineWith` helper must also supply the new required deps, so replace it
with:

```ts
function engineWith(jobs: JobDefinition[], runAgent: RunAgent, scope: Record<string, unknown> = {}): Engine {
  const harness = timerHarness();
  return new Engine({
    stateDir: dir,
    jobs,
    clock,
    pid: 777,
    runAgent,
    notify: () => {},
    scope,
    idFn: ids,
    setTimer: harness.setTimer,
    clearTimer: harness.clearTimer,
  });
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test packages/pi-event-cron-scheduler/test/engine.test.ts`
Expected: FAIL, `DEFAULT_TIMEOUT_MS` and `GRACE_MS` are not exported and no timers are armed.

- [ ] **Step 3: Extend the implementation**

In `packages/pi-event-cron-scheduler/src/engine.ts`, add the constants and the new dep fields:

```ts
export const DEFAULT_TIMEOUT_MS = 600_000;
export const GRACE_MS = 60_000;

export type TimerHandle = unknown;
```

Replace the `EngineDeps` interface with:

```ts
export interface EngineDeps {
  stateDir: string;
  jobs: JobDefinition[];
  clock: () => number;
  pid: number;
  runAgent: RunAgent;
  notify: (message: string) => void;
  setTimer: (fn: () => void, ms: number) => TimerHandle;
  clearTimer: (handle: TimerHandle) => void;
  fetchImpl?: typeof fetch;
  scope?: Record<string, unknown>;
  idFn?: () => string;
  defaultTimeoutMs?: number;
  graceMs?: number;
  isPidAlive?: (pid: number) => boolean;
}
```

Replace the `RunHandle` interface with one that carries the timers and terminal-state flags:

```ts
interface RunHandle {
  runId: string;
  jobId: string;
  controller: AbortController;
  promise: Promise<void>;
  startedMs: number;
  row: RunRow;
  overdueFired: boolean;
  timedOut: boolean;
  abandoned: boolean;
  settled: boolean;
  overdueTimer?: TimerHandle;
  deadlineTimer?: TimerHandle;
  graceTimer?: TimerHandle;
}
```

Add a slot-release helper and the two timer arms as private methods on `Engine`:

```ts
  private releaseSlot(job: JobDefinition, handle: RunHandle): void {
    const bucket = this.inFlight.get(job.id);
    if (!bucket || !bucket.has(handle)) return;
    bucket.delete(handle);
    if (bucket.size === 0) this.inFlight.delete(job.id);

    const queued = this.pending.get(job.id);
    if (queued && this.inFlightCount(job.id) === 0) {
      this.pending.delete(job.id);
      this.start(job, queued);
    }
  }

  private armTimers(job: JobDefinition, event: BusEvent, handle: RunHandle): void {
    if (job.expectedRuntimeMs !== undefined) {
      handle.overdueTimer = this.deps.setTimer(() => {
        if (handle.overdueFired || handle.settled) return;
        handle.overdueFired = true;
        void this.emit({
          event: "job.overdue",
          source: job.id,
          runId: handle.runId,
          chain: event.chain,
          payload: {
            jobId: job.id,
            runId: handle.runId,
            elapsedMs: this.deps.clock() - handle.startedMs,
            expectedRuntimeMs: job.expectedRuntimeMs,
          },
        });
      }, job.expectedRuntimeMs);
    }

    const deadlineMs = job.timeoutMs ?? this.deps.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    handle.deadlineTimer = this.deps.setTimer(() => {
      if (handle.settled) return;
      handle.timedOut = true;
      handle.controller.abort();
      void this.emit({
        event: "job.timeout",
        source: job.id,
        runId: handle.runId,
        chain: event.chain,
        payload: { jobId: job.id, runId: handle.runId, deadlineMs },
      });

      const graceMs = this.deps.graceMs ?? GRACE_MS;
      handle.graceTimer = this.deps.setTimer(() => {
        if (handle.settled) return;
        handle.abandoned = true;
        const completedMs = this.deps.clock();
        void saveRun(this.deps.stateDir, {
          ...handle.row,
          status: "abandoned",
          completedAt: new Date(completedMs).toISOString(),
          durationMs: completedMs - handle.startedMs,
        });
        void this.emit({
          event: "job.abandoned",
          source: job.id,
          runId: handle.runId,
          chain: event.chain,
          payload: { jobId: job.id, runId: handle.runId },
        });
        this.releaseSlot(job, handle);
      }, graceMs);
    }, deadlineMs);
  }

  private clearTimers(handle: RunHandle): void {
    for (const timer of [handle.overdueTimer, handle.deadlineTimer, handle.graceTimer]) {
      if (timer) this.deps.clearTimer(timer);
    }
  }
```

Replace `start` so it builds the richer handle and releases through the helper:

```ts
  private start(job: JobDefinition, event: BusEvent): void {
    const runId = (this.deps.idFn ?? (() => `${this.deps.clock()}`))();
    const startedMs = this.deps.clock();
    const handle: RunHandle = {
      runId,
      jobId: job.id,
      controller: new AbortController(),
      promise: Promise.resolve(),
      startedMs,
      row: {
        runId,
        jobId: job.id,
        workspace: job.workspace,
        status: "running",
        pid: this.deps.pid,
        startedAt: new Date(startedMs).toISOString(),
      },
      overdueFired: false,
      timedOut: false,
      abandoned: false,
      settled: false,
    };

    const bucket = this.inFlight.get(job.id) ?? new Set<RunHandle>();
    bucket.add(handle);
    this.inFlight.set(job.id, bucket);

    handle.promise = this.execute(job, event, handle).finally(() => {
      handle.settled = true;
      this.clearTimers(handle);
      this.releaseSlot(job, handle);
    });
  }
```

In `execute`, three edits. Replace the block that builds and saves the initial row with:

```ts
    const startedMs = handle.startedMs;
    const rows = await loadRuns(this.deps.stateDir);
    const previous = lastRunFor(rows, job.id);
    const row = handle.row;
    await saveRun(this.deps.stateDir, row);
    this.armTimers(job, event, handle);
```

Replace the status resolution after `runAgent` with a version that honours the timeout and
abandonment flags:

```ts
    let status: RunStatus;
    let output = "";
    try {
      const result = await this.deps.runAgent({ job, prompt, signal: handle.controller.signal });
      output = result.output ?? "";
      status = result.status === "completed" ? "completed" : "failed";
    } catch (error: any) {
      status = "failed";
      output = error?.message ?? String(error);
    }
    if (handle.timedOut) status = "timed_out";
```

And guard the terminal write so a late settle cannot overwrite an abandoned row — wrap the
final `saveRun` and the closing `job.completed`/`job.failed` emit in:

```ts
    if (handle.abandoned) return;
```

placed immediately before them, and make the closing emit cover all three terminal states:

```ts
    await this.emit({
      event: finalStatus === "completed" ? "job.completed" : "job.failed",
      source: job.id,
      runId: handle.runId,
      chain: event.chain,
      payload: { jobId: job.id, runId: handle.runId, status: finalStatus },
    });
```

`job.timeout` has already been emitted by the deadline timer, so a `timed_out` run also emits
`job.failed`. That is intentional: a subscriber watching `job.failed` should not have to also
subscribe to `job.timeout` to notice a dead run.

Finally add crash recovery as a public method:

```ts
  async recoverInterrupted(): Promise<RunRow[]> {
    const alive = this.deps.isPidAlive ?? ((pid: number) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    });

    const rows = await loadRuns(this.deps.stateDir);
    const stale = rows.filter(
      (row) => row.status === "running" && (row.pid === this.deps.pid ? false : !alive(row.pid)),
    );

    const recovered: RunRow[] = [];
    for (const row of stale) {
      const updated: RunRow = {
        ...row,
        status: "interrupted",
        completedAt: new Date(this.deps.clock()).toISOString(),
      };
      await saveRun(this.deps.stateDir, updated);
      await this.emit({
        event: "job.interrupted",
        source: row.jobId,
        runId: row.runId,
        payload: { jobId: row.jobId, runId: row.runId, pid: row.pid },
      });
      recovered.push(updated);
    }
    return recovered;
  }
```

- [ ] **Step 4: Run the whole package test suite**

Run: `bun test packages/pi-event-cron-scheduler/`
Expected: PASS, every file green including the Task 9 suites, which now go through the timer
harness.

- [ ] **Step 5: Commit**

```bash
git add packages/pi-event-cron-scheduler/src/engine.ts \
        packages/pi-event-cron-scheduler/test/engine.test.ts
git commit -m "feat(event-cron): enforce deadlines, overdue signals, and crash recovery"
```

---

### Task 11: List rendering

The listing is the whole diagnostic surface, so it is a pure function with tests rather than
string building buried in the extension adapter. Next-run computation is injected so this file
never imports croner.

**Files:**
- Create: `packages/pi-event-cron-scheduler/src/format.ts`
- Test: `packages/pi-event-cron-scheduler/test/format.test.ts`

**Interfaces:**
- Consumes: `JobDefinition`/`InvalidJob` (Task 2), `EnabledFile`/`RunRow` (Task 4).
- Produces:
  - `formatDurationMs(ms: number | undefined): string` — `"3m12s"`, `"800ms"`, `"-"` for undefined
  - `formatJobList(input: JobListInput): string` where
    `interface JobListInput { workspace: string; jobs: JobDefinition[]; invalid: InvalidJob[]; enabled: EnabledFile; runs: RunRow[]; leaderPid: number | null; selfPid: number; inFlight: (jobId: string) => number; nextRunFor: (job: JobDefinition) => Date | null }`

- [ ] **Step 1: Write the failing test**

`packages/pi-event-cron-scheduler/test/format.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { formatDurationMs, formatJobList } from "../src/format.js";
import type { JobDefinition } from "../src/frontmatter.js";
import { enabledKey, type EnabledFile, type RunRow } from "../src/state.js";

function job(over: Partial<JobDefinition> = {}): JobDefinition {
  return {
    id: "a",
    path: "/ws/scheduled/a.md",
    workspace: "/ws",
    on: [],
    concurrency: "skip",
    memory: false,
    emits: [],
    body: "Do it.",
    ...over,
  };
}

const enabled: EnabledFile = {
  version: 1,
  jobs: { [enabledKey("/ws", "a")]: { enabledAt: "2026-08-26T02:50:00.000Z", path: "scheduled/a.md" } },
};

const runs: RunRow[] = [
  {
    runId: "r1",
    jobId: "a",
    workspace: "/ws",
    status: "completed",
    pid: 1,
    startedAt: "2026-08-26T02:48:00.000Z",
    completedAt: "2026-08-26T02:51:12.000Z",
    durationMs: 192_000,
    verdict: "continue: [record]",
    continueTokens: ["record"],
  },
];

function render(over: Partial<Parameters<typeof formatJobList>[0]> = {}): string {
  return formatJobList({
    workspace: "/ws",
    jobs: [job({ cron: "*/5 * * * *", timezone: "Europe/Oslo", on: ["news.found"], emits: [{ kind: "event", target: "done", when: "success" }] })],
    invalid: [],
    enabled,
    runs,
    leaderPid: 777,
    selfPid: 777,
    inFlight: () => 0,
    nextRunFor: () => new Date("2026-08-26T03:00:00.000Z"),
    ...over,
  });
}

describe("formatDurationMs", () => {
  it("renders sub-second, seconds, and minutes", () => {
    expect(formatDurationMs(800)).toBe("800ms");
    expect(formatDurationMs(12_000)).toBe("12s");
    expect(formatDurationMs(192_000)).toBe("3m12s");
    expect(formatDurationMs(undefined)).toBe("-");
  });
});

describe("formatJobList", () => {
  it("marks enabled jobs and shows cron, next run, triggers, and last result", () => {
    const text = render();
    expect(text).toContain("a");
    expect(text).toContain("*/5 * * * *");
    expect(text).toContain("Europe/Oslo");
    expect(text).toContain("on: news.found");
    expect(text).toContain("emits: done");
    expect(text).toContain("last: completed");
    expect(text).toContain("3m12s");
    expect(text).toContain("continue: [record]");
    expect(text).toContain("enabled");
  });

  it("lists a disabled job instead of hiding it", () => {
    const text = render({ enabled: { version: 1, jobs: {} } });
    expect(text).toContain("a");
    expect(text).toContain("disabled");
  });

  it("names this process as leader or reports which pid holds it", () => {
    expect(render()).toContain("leader: this session");
    expect(render({ leaderPid: 999 })).toContain("leader: pid 999");
    expect(render({ leaderPid: null })).toContain("leader: none");
  });

  it("shows running counts and invalid files with their errors", () => {
    const text = render({
      inFlight: () => 2,
      invalid: [{ path: "/ws/scheduled/bad.md", id: "twin", errors: ['duplicate id "twin"'] }],
    });
    expect(text).toContain("running: 2");
    expect(text).toContain("bad.md");
    expect(text).toContain('duplicate id "twin"');
  });

  it("says so when the workspace has no scheduled files", () => {
    const text = render({ jobs: [], invalid: [] });
    expect(text).toContain("No scheduled/*.md files");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test packages/pi-event-cron-scheduler/test/format.test.ts`
Expected: FAIL, `../src/format.js` does not exist.

- [ ] **Step 3: Write the minimal implementation**

`packages/pi-event-cron-scheduler/src/format.ts`:

```ts
import type { InvalidJob, JobDefinition } from "./frontmatter.js";
import { type EnabledFile, type RunRow, isEnabled, lastRunFor, medianDurationMs } from "./state.js";

export interface JobListInput {
  workspace: string;
  jobs: JobDefinition[];
  invalid: InvalidJob[];
  enabled: EnabledFile;
  runs: RunRow[];
  leaderPid: number | null;
  selfPid: number;
  inFlight: (jobId: string) => number;
  nextRunFor: (job: JobDefinition) => Date | null;
}

export function formatDurationMs(ms: number | undefined): string {
  if (ms === undefined) return "-";
  if (ms < 1000) return `${ms}ms`;
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes === 0 ? `${seconds}s` : `${minutes}m${seconds}s`;
}

function leaderLine(input: JobListInput): string {
  if (input.leaderPid === null) return "leader: none";
  if (input.leaderPid === input.selfPid) return "leader: this session";
  return `leader: pid ${input.leaderPid}`;
}

export function formatJobList(input: JobListInput): string {
  const lines = [`Scheduled jobs in ${input.workspace} (${leaderLine(input)})`, ""];

  if (input.jobs.length === 0 && input.invalid.length === 0) {
    lines.push("No scheduled/*.md files found.");
    return lines.join("\n");
  }

  for (const job of input.jobs) {
    const state = isEnabled(input.enabled, input.workspace, job.id) ? "enabled" : "disabled";
    const running = input.inFlight(job.id);
    const last = lastRunFor(input.runs, job.id);
    const next = input.nextRunFor(job);

    lines.push(`${job.id} [${state}]${running > 0 ? `  running: ${running}` : ""}`);
    if (job.description) lines.push(`  ${job.description}`);
    if (job.cron) {
      lines.push(`  cron: ${job.cron}${job.timezone ? ` ${job.timezone}` : ""}  next: ${next ? next.toISOString() : "-"}`);
    }
    if (job.on.length > 0) lines.push(`  on: ${job.on.join(", ")}`);
    if (job.emits.length > 0) {
      lines.push(`  emits: ${job.emits.map((spec) => `${spec.target}${spec.ifTokens ? ` if:[${spec.ifTokens.join(",")}]` : ""}`).join(", ")}`);
    }
    lines.push(
      `  concurrency: ${job.concurrency}  median: ${formatDurationMs(medianDurationMs(input.runs, job.id))}`,
    );
    if (last) {
      lines.push(
        `  last: ${last.status} at ${last.completedAt ?? last.startedAt} in ${formatDurationMs(last.durationMs)}${last.verdict ? `  ${last.verdict}` : ""}`,
      );
    } else {
      lines.push("  last: never run");
    }
    lines.push("");
  }

  if (input.invalid.length > 0) {
    lines.push("Invalid files (never run):");
    for (const entry of input.invalid) {
      lines.push(`  ${entry.path}${entry.id ? ` (id: ${entry.id})` : ""}`);
      for (const error of entry.errors) lines.push(`    - ${error}`);
    }
  }

  return lines.join("\n").trimEnd();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test packages/pi-event-cron-scheduler/test/format.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/pi-event-cron-scheduler/src/format.ts \
        packages/pi-event-cron-scheduler/test/format.test.ts
git commit -m "feat(event-cron): render the scheduled job listing"
```

---

### Task 12: Extension adapter, tool, command, README

Everything testable already has tests. This task is the glue that cannot be unit tested without
a live pi session, so it is verified by hand at the end.

The verified host API this file depends on:
- `export default function ext(pi: ExtensionAPI)`, as in `packages/scheduler/index.ts:108`
- `pi.on("session_start" | "session_shutdown", (event, ctx) => void)`
- `pi.registerTool({ name, label, description, promptSnippet, parameters, execute(toolCallId, params, signal, onUpdate, ctx) })`
  returning `{ content: [{ type: "text", text }], details }`
- `pi.registerCommand(name, { description, handler(args, ctx) })`
- `ctx.cwd`, `ctx.ui.notify(text, level)`, `ctx.ui.setStatus(key, text | undefined)`
- `ControlPlane.dispatch(options: ExecutionOptions, customAgentDef?: AgentDefinition): Promise<RunRecord>`
  from `@meeh/pi-agent-core`, where `ExecutionOptions` accepts
  `{ agent: string | AgentDefinition, prompt, cwd, runtime, model, thinking, tools, turnBudget, timeout, signal, ctx, taskForDisplay }`
  and `RunRecord` exposes `status`, `output`, `error`

`RunRecord.status` has more terminal values than ours (`aborted`, `time_limited`,
`budget_limited`). Only `completed` maps to success; the engine turns the rest into `failed`,
and into `timed_out` when it was our own deadline that aborted the run.

**Files:**
- Create: `packages/pi-event-cron-scheduler/src/index.ts`
- Create: `packages/pi-event-cron-scheduler/README.md`

**Interfaces:**
- Consumes: every module from Tasks 1–11.
- Produces: the `cron_jobs` tool, the `/cron` command, and the leader lifecycle. No new exports
  that other modules consume.

- [ ] **Step 1: Write the extension adapter**

`packages/pi-event-cron-scheduler/src/index.ts`:

```ts
import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { type AgentDefinition, ControlPlane } from "@meeh/pi-agent-core";
import { Cron } from "croner";
import { homedir } from "node:os";
import { join } from "node:path";
import { Type } from "typebox";

import { pruneOldLogs } from "./bus.js";
import { discoverJobs, scheduledDir } from "./discovery.js";
import { DEFAULT_TIMEOUT_MS, Engine, type RunAgent } from "./engine.js";
import { formatJobList } from "./format.js";
import type { InvalidJob, JobDefinition } from "./frontmatter.js";
import { HEARTBEAT_MS, LeaderLock } from "./leader.js";
import { isEnabled, loadEnabled, loadRuns, setEnabled } from "./state.js";

const ACTIONS = ["list", "enable", "disable", "kill", "reload", "emit"] as const;
const DRAIN_INTERVAL_MS = 2_000;
const KEEP_LOG_DAYS = 14;

function stateDir(): string {
  return join(homedir(), ".pi", "agent", "state", "pi-event-cron-scheduler");
}

function inlineAgent(job: JobDefinition): AgentDefinition {
  return {
    name: `cron:${job.id}`,
    description: job.description ?? `Scheduled job ${job.id}`,
    runtime: job.runtime,
    model: job.model,
    thinking: job.thinking,
    tools: job.tools,
    turnBudget: job.turnBudget,
    skills: job.skills,
  };
}

export default function eventCronExtension(pi: ExtensionAPI) {
  const dir = stateDir();
  const plane = new ControlPlane();
  const lock = new LeaderLock({ stateDir: dir, pid: process.pid, clock: () => Date.now() });

  let jobs: JobDefinition[] = [];
  let invalid: InvalidJob[] = [];
  let crons: Cron[] = [];
  let engine: Engine | undefined;
  let drainTimer: ReturnType<typeof setInterval> | undefined;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;

  const runAgent =
    (ctx: ExtensionContext): RunAgent =>
    async ({ job, prompt, signal }) => {
      const record = await plane.dispatch({
        agent: job.agent ?? inlineAgent(job),
        prompt,
        cwd: job.workspace,
        runtime: job.runtime,
        model: job.model,
        thinking: job.thinking,
        tools: job.tools,
        turnBudget: job.turnBudget,
        timeout: job.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        signal,
        ctx,
        taskForDisplay: `cron: ${job.id}`,
      });
      return {
        status: record.status === "completed" ? "completed" : "failed",
        output: record.output ?? "",
        error: record.error,
      };
    };

  function updateStatus(ctx: ExtensionContext): void {
    if (!engine) {
      ctx.ui.setStatus("event-cron", undefined);
      return;
    }
    const running = jobs.reduce((total, job) => total + engine!.inFlightCount(job.id), 0);
    ctx.ui.setStatus("event-cron", running > 0 ? `⏱ ${running} job${running === 1 ? "" : "s"} running` : undefined);
  }

  /** Enabled jobs only: a disabled file is parsed and listed but never scheduled or triggered. */
  async function activeJobs(ctx: ExtensionContext): Promise<JobDefinition[]> {
    const enabled = await loadEnabled(dir);
    return jobs.filter((job) => isEnabled(enabled, ctx.cwd, job.id));
  }

  function stopCrons(): void {
    for (const cron of crons) cron.stop();
    crons = [];
  }

  async function armCrons(ctx: ExtensionContext): Promise<void> {
    stopCrons();
    if (!engine) return;
    const active = await activeJobs(ctx);
    engine.setJobs(active);

    for (const job of active) {
      if (!job.cron) continue;
      crons.push(
        new Cron(job.cron, { timezone: job.timezone, protect: false }, () => {
          void engine!
            .emit({ event: "cron.tick", source: "cron", payload: { jobId: job.id } })
            .then(() => engine!.drain())
            .then(() => updateStatus(ctx))
            .catch((error) => ctx.ui.notify(`event-cron: ${error?.message ?? error}`, "error"));
        }),
      );
    }
  }

  async function reload(ctx: ExtensionContext): Promise<string> {
    const discovered = await discoverJobs(ctx.cwd);
    jobs = discovered.jobs;
    invalid = discovered.invalid;
    await armCrons(ctx);
    const active = await activeJobs(ctx);
    return `event-cron: ${active.length} enabled, ${jobs.length - active.length} disabled, ${invalid.length} invalid`;
  }

  async function renderList(ctx: ExtensionContext): Promise<string> {
    const [enabled, runs, lockFile] = await Promise.all([loadEnabled(dir), loadRuns(dir), lock.read()]);
    return formatJobList({
      workspace: ctx.cwd,
      jobs,
      invalid,
      enabled,
      runs,
      leaderPid: lockFile?.pid ?? null,
      selfPid: process.pid,
      inFlight: (jobId) => engine?.inFlightCount(jobId) ?? 0,
      nextRunFor: (job) => {
        if (!job.cron) return null;
        try {
          return new Cron(job.cron, { timezone: job.timezone }).nextRun();
        } catch {
          return null;
        }
      },
    });
  }

  pi.on("session_start", async (_event: any, ctx: ExtensionContext) => {
    engine = new Engine({
      stateDir: dir,
      jobs: [],
      clock: () => Date.now(),
      pid: process.pid,
      runAgent: runAgent(ctx),
      notify: (message) => ctx.ui.notify(message, "info"),
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    });

    await reload(ctx);

    // Only the leader dispatches. Followers still parse, list, and enable/disable.
    if (!(await lock.tryAcquire())) return;

    await engine.recoverInterrupted();
    await pruneOldLogs(dir, KEEP_LOG_DAYS, new Date());
    await armCrons(ctx);

    heartbeatTimer = setInterval(() => void lock.heartbeat(), HEARTBEAT_MS);
    drainTimer = setInterval(() => {
      void engine!
        .drain()
        .then(() => updateStatus(ctx))
        .catch((error) => ctx.ui.notify(`event-cron: ${error?.message ?? error}`, "error"));
    }, DRAIN_INTERVAL_MS);
  });

  pi.on("session_shutdown", async (_event: any, ctx: ExtensionContext) => {
    stopCrons();
    if (drainTimer) clearInterval(drainTimer);
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    ctx.ui.setStatus("event-cron", undefined);
    await lock.release();
  });

  pi.registerTool({
    name: "cron_jobs",
    label: "Scheduled Jobs",
    description:
      "Inspect and control executable scheduled markdown jobs in scheduled/*.md: list them with their next run and last result, enable or disable one, kill a stuck run, reload files from disk, or emit an event by hand.",
    promptSnippet: "List, enable, disable, kill, reload, or manually trigger scheduled markdown jobs",
    promptGuidelines: [
      "Use action='list' when the user asks what is scheduled, why a job did not run, or what a job last decided.",
      "A job in scheduled/*.md does nothing until action='enable' is called for it in this workspace.",
      "Use action='emit' to test a job that is triggered by an event rather than by cron.",
    ],
    parameters: Type.Object({
      action: StringEnum(ACTIONS, { description: "What to do. Default list.", default: "list" }),
      id: Type.Optional(Type.String({ description: "Job id, required for enable, disable, and kill." })),
      event: Type.Optional(Type.String({ description: "Event name for action='emit'." })),
      payload: Type.Optional(Type.String({ description: "JSON object string used as the payload for action='emit'." })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx: ExtensionContext) {
      const action = params.action ?? "list";

      if (action === "list") {
        const text = await renderList(ctx);
        return { content: [{ type: "text", text }], details: { jobs, invalid } };
      }

      if (action === "reload") {
        const text = await reload(ctx);
        return { content: [{ type: "text", text }], details: { jobs, invalid } };
      }

      if (action === "enable" || action === "disable") {
        if (!params.id) throw new Error(`action='${action}' needs an id`);
        const job = jobs.find((candidate) => candidate.id === params.id);
        if (!job) throw new Error(`no valid job with id "${params.id}" in ${scheduledDir(ctx.cwd)}`);
        await setEnabled(dir, {
          workspace: ctx.cwd,
          id: job.id,
          path: job.path,
          enabled: action === "enable",
          now: new Date(),
        });
        await armCrons(ctx);
        return {
          content: [{ type: "text", text: `${action}d ${job.id}` }],
          details: { id: job.id, enabled: action === "enable" },
        };
      }

      if (action === "kill") {
        if (!params.id) throw new Error("action='kill' needs an id");
        const killed = engine?.kill(params.id) ?? 0;
        updateStatus(ctx);
        return {
          content: [{ type: "text", text: killed === 0 ? `no run in flight for ${params.id}` : `aborted ${killed} run(s) of ${params.id}` }],
          details: { id: params.id, killed },
        };
      }

      if (!params.event) throw new Error("action='emit' needs an event");
      const payload = params.payload ? (JSON.parse(params.payload) as Record<string, unknown>) : undefined;
      await engine?.emit({ event: params.event, source: "tool", payload });
      await engine?.drain();
      updateStatus(ctx);
      return { content: [{ type: "text", text: `emitted ${params.event}` }], details: { event: params.event, payload } };
    },
  });

  pi.registerCommand("cron", {
    description: "List scheduled markdown jobs, or enable/disable/kill/reload/emit",
    handler: async (args: string, ctx: ExtensionContext) => {
      const [action = "list", argument] = args.trim().split(/\s+/);
      try {
        if (action === "list") {
          ctx.ui.notify(await renderList(ctx), "info");
          return;
        }
        if (action === "reload") {
          ctx.ui.notify(await reload(ctx), "info");
          return;
        }
        if (action === "enable" || action === "disable") {
          if (!argument) throw new Error(`Usage: /cron ${action} <id>`);
          const job = jobs.find((candidate) => candidate.id === argument);
          if (!job) throw new Error(`no valid job with id "${argument}"`);
          await setEnabled(dir, { workspace: ctx.cwd, id: job.id, path: job.path, enabled: action === "enable", now: new Date() });
          await armCrons(ctx);
          ctx.ui.notify(`${action}d ${job.id}`, "info");
          return;
        }
        if (action === "kill") {
          if (!argument) throw new Error("Usage: /cron kill <id>");
          ctx.ui.notify(`aborted ${engine?.kill(argument) ?? 0} run(s) of ${argument}`, "info");
          updateStatus(ctx);
          return;
        }
        if (action === "emit") {
          if (!argument) throw new Error("Usage: /cron emit <event>");
          await engine?.emit({ event: argument, source: "command" });
          await engine?.drain();
          updateStatus(ctx);
          ctx.ui.notify(`emitted ${argument}`, "info");
          return;
        }
        ctx.ui.notify("Usage: /cron [list|enable <id>|disable <id>|kill <id>|reload|emit <event>]", "info");
      } catch (error: any) {
        ctx.ui.notify(error?.message ?? String(error), "error");
      }
    },
  });
}
```

- [ ] **Step 2: Add the kill method the adapter calls**

The tool and the command both call `engine.kill(jobId)`, which Task 9 and Task 10 did not add.
Append it to `Engine` in `packages/pi-event-cron-scheduler/src/engine.ts`:

```ts
  /** Aborts every in-flight run of a job. Returns how many were signalled. */
  kill(jobId: string): number {
    const bucket = this.inFlight.get(jobId);
    if (!bucket) return 0;
    for (const handle of bucket) {
      handle.timedOut = true;
      handle.controller.abort();
    }
    return bucket.size;
  }
```

Add a test for it in `packages/pi-event-cron-scheduler/test/engine.test.ts`:

```ts
describe("kill", () => {
  it("aborts in-flight runs and records them as timed_out", async () => {
    const { calls, runAgent } = controllable();
    const engine = engineWith([job({ on: ["tick"] })], runAgent);

    await engine.emit({ event: "tick", source: "tool" });
    await engine.drain();

    expect(engine.kill("a")).toBe(1);
    expect(engine.kill("nope")).toBe(0);

    calls[0].resolve("stopped");
    await engine.idle();
    expect((await loadRuns(dir))[0].status).toBe("timed_out");
  });
});
```

Run: `bun test packages/pi-event-cron-scheduler/test/engine.test.ts`
Expected: PASS, including the new suite.

- [ ] **Step 3: Write the README**

`packages/pi-event-cron-scheduler/README.md` (written with a four-backtick outer fence here only
so the nested examples survive; the file itself uses ordinary three-backtick fences):

````markdown
# @meeh/pi-event-cron-scheduler

Executable scheduled markdown for pi. Drop a file in `<workspace>/scheduled/`, enable it once,
and it runs on a cron schedule or when another job emits an event it listens for.

Each run is an isolated subagent through `@meeh/pi-agent-core`, not a prompt injected into your
session, so a job cannot pollute the context you are working in.

## A job file

```markdown
---
id: security-red-team
description: Red-team everything I own
agent: security-freak
runtime: pi-subprocess
tools: [read, write, bash, web_search]
expectedRuntime: 2m
timeout: 15m
schedule:
  cron: "0 3 * * *"
  timezone: Europe/Oslo
concurrency: skip
memory: true
emits:
  - event: threat-report.written
    when: success
    if: [found-threats]
  - notify: Red team run failed
    when: failure
---

Red-team everything I own. Write findings to `trussel-<date>.md`.
```

The body is the prompt. A context header is prepended at run time with the date, the trigger,
the event payload, the previous run's result, and the memory file path when `memory: true`.

## Activation

A file in `scheduled/` does nothing until you enable it. Activation lives in
`~/.pi/agent/state/pi-event-cron-scheduler/enabled.json`, keyed by workspace and id, so pulling
a repo or letting an agent write a markdown file cannot start anything on your machine.

```
/cron list
/cron enable security-red-team
```

## Events

Cron is not enough on its own: if a job overruns its interval, a follower that needs its output
would run against stale results. So jobs chain on events instead.

`emits:` sends an event when a run finishes; `on:` subscribes to one. The bus is an append-only
JSONL log under `~/.pi/agent/state/pi-event-cron-scheduler/events/YYYY-MM-DD.jsonl`, and a
single leader session dispatches from it, so nothing runs twice and nothing is lost across a
crash.

The engine emits `job.started`, `job.completed`, `job.failed`, `job.skipped`, `job.overdue`,
`job.timeout`, `job.abandoned`, `job.interrupted`, `sink.missing`, and `chain.limit.exceeded`.
The prefixes `cron.`, `job.`, `chain.`, and `sink.` are reserved. A chain of events stops after
8 hops.

## Conditional sinks

When any `emits` entry has an `if:`, the run is told to end its output with a continue line:

```
continue: [found-threats,alert-user]
```

Only sinks whose `if:` tokens appear in that line fire. `continue: []` means nothing follows.
The raw line is kept on the run record, so `/cron list` shows what the job decided.

## Sinks

Built in: `event:`, `webhook:`, `notify:`. Other extensions can add their own by registering on
`globalThis.__piEventCronSinkRegistry__`:

```ts
import { registerSink } from "@meeh/pi-event-cron-scheduler/src/sinks.js";

registerSink("telegram.send.message", async (args) => {
  await sendMessage(String(args.text));
});
```

A job referencing an unregistered sink still runs; the miss is recorded as `sink.missing`
rather than failing the run.

## Deadlines

`expectedRuntime` is soft: overrunning it emits `job.overdue` and the run continues.
`timeout` is hard: the run is aborted, recorded `timed_out`, and its slot is freed. If an
aborted run ignores the signal for another 60 seconds it is recorded `abandoned` and the slot is
freed anyway, so a hung job cannot block a `skip` schedule forever. Runs left `running` by a
killed process are recovered as `interrupted` on the next session start.

## Commands and tool

`/cron [list|enable <id>|disable <id>|kill <id>|reload|emit <event>]`, and the same surface as
the `cron_jobs` tool so the agent can inspect its own schedule.
````

- [ ] **Step 4: Verify the whole package**

```bash
bun test packages/pi-event-cron-scheduler/
bunx tsc --noEmit -p packages/pi-event-cron-scheduler
```

Expected: all suites pass, no type errors in this package. The pre-existing failure in
`packages/pi-agent-core/test/types.test.ts` is unrelated; do not touch it.

- [ ] **Step 5: Verify by hand in a live session**

This is the only check that covers the adapter, croner, and `ControlPlane` together.

1. In a scratch workspace, create `scheduled/hello.md`:

```markdown
---
id: hello
description: Smoke test
tools: [read]
timeout: 2m
schedule:
  cron: "* * * * *"
  timezone: Europe/Oslo
emits:
  - notify: hello job says go
    if: [go]
---

Reply with one sentence about the current date, then end your output with `continue: [go]`.
```

2. Start pi there and run `/cron list`. Expect `hello [disabled]` with its cron and next run.
3. Run `/cron enable hello`, then `/cron list` again. Expect `[enabled]` and `leader: this session`.
4. Wait for the next minute boundary. Expect the notify sink to fire.
5. Run `/cron list`. Expect `last: completed` with a duration and `continue: [go]`.
6. Confirm the run was isolated: your own session context should contain no trace of the job's
   reasoning, only the notification.
7. Inspect the bus: `~/.pi/agent/state/pi-event-cron-scheduler/events/<today>.jsonl` should hold
   `cron.tick`, `job.started`, and `job.completed`.
8. Run `/cron disable hello` and confirm the next minute passes with no run.

- [ ] **Step 6: Commit**

```bash
git add packages/pi-event-cron-scheduler/src/index.ts \
        packages/pi-event-cron-scheduler/src/engine.ts \
        packages/pi-event-cron-scheduler/test/engine.test.ts \
        packages/pi-event-cron-scheduler/README.md
git commit -m "feat(event-cron): expose the cron_jobs tool, /cron command, and leader lifecycle"
```

---

## Definition of done

- `bun test packages/pi-event-cron-scheduler/` is green.
- `bunx tsc --noEmit -p packages/pi-event-cron-scheduler` reports no errors.
- The manual walkthrough in Task 12 Step 5 passes end to end.
- A file in `scheduled/` that was never explicitly enabled has never executed.
- No changes outside `packages/pi-event-cron-scheduler/` and `docs/`.
