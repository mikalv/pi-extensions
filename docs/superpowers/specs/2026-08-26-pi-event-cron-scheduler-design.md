# pi-event-cron-scheduler — Design

**Date:** 2026-08-26
**Status:** Approved design, ready for implementation planning
**Package:** `packages/pi-event-cron-scheduler`

## Purpose

Executable markdown jobs for pi. A file in `<workspace>/scheduled/*.md` describes an
agent in YAML frontmatter and a task in its body. The extension runs it on a cron
schedule, on named events emitted by other jobs, or both.

The motivating problem: pure cron cannot express dependencies. If job A takes longer
than its interval and job B needs A's result, cron alone either runs B on stale data
or runs A twice. Named events solve this — B waits for the event A emits when it
actually finishes.

This is a personal-assistant instance capability. It is expected to have exactly one
user, but it ships in the extension collection like everything else.

## Constraints and existing building blocks

The design reuses what already exists rather than inventing parallel machinery:

- **`pi-agent-core`** provides `AgentDefinition` (`runtime`, `model`, `thinking`,
  `tools`, `skills`, `worktree`, `turnBudget`, `timeout`, `systemPrompt`) and a
  `ControlPlane` that executes it with audit logging. Scheduled markdown frontmatter is
  an `AgentDefinition` plus trigger fields.
- **Runtime tool availability is asymmetric.** `pi-inprocess` has a fixed builtin
  whitelist — `read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`. There is no
  `delete` tool, no `web_search`, no MCP tools. `pi-subprocess` passes tool names
  through as `--tools` to a real pi child, so MCP and extension tools work there.
  Jobs needing `web_search` or MCP must set `runtime: pi-subprocess`. Deletion is done
  via `bash` in either runtime.
- **Timeout enforcement is asymmetric.** `pi-subprocess` SIGKILLs on timeout expiry.
  `pi-inprocess` has no timeout at all, but accepts an `AbortSignal` checked between
  turns and during the model stream, so a deadline must be enforced by this extension.
- **Cross-extension registries use `globalThis` with a versioned contract** in this
  repo — `globalThis.__piTelegramUpdateHandlerRegistry__` (v1, load-order independent)
  and `globalThis[Symbol.for("vstack.pi.<topic>")]`. The sink registry follows the same
  pattern.
- **`@meeh/mm-scheduler` is untouched.** It is published (v0.2.4) and stays small. Its
  precedent of keeping core logic in a pi-free module testable from `node --test` is
  followed here.

## Lifecycle: in-session now, daemon later

Timers live in the pi extension process. All durable state — the event log, the leader
lock, the enabled set, the run records, the read cursor — is process-agnostic on disk,
so a future daemon takes the same lock, reads the same log, and writes the same state.
Adding the daemon is a deployment change, not a rewrite.

Because discovery is workspace-relative, a future daemon will need a registry of
workspaces to watch. That is a daemon-era concern, noted here so it is not a surprise.

## File format

Files live in `<workspace>/scheduled/*.md`.

```yaml
---
id: security-red-team                  # required, unique, stable. Key for state, lock, memory, event source
description: Red-team everything I own

agent: security-freak                  # optional named agent from .pi/agents; fields below override it
runtime: pi-subprocess                 # required for web_search / MCP tools
model: anthropic/claude-sonnet-4        # optional
thinking: high                         # optional
tools: [read, write, bash, web_search]
skills: [security_analysis]
turnBudget: 20
expectedRuntime: 2m                    # soft: emits job.overdue once, does not kill
timeout: 15m                           # hard: abort, job.timeout, free the slot

schedule:
  cron: "*/5 * * * *"                  # optional. Without cron, the job runs only on events
  timezone: Europe/Oslo
on: [threat-report.written]            # optional. Event names this job subscribes to
concurrency: skip                      # skip (default) | queue | parallel
memory: true                           # provides a per-job scratchpad file

emits:
  - event: threat-report.written
    when: success                      # success (default) | failure | always
    payload: { severity: high }
  - webhook: https://slack.com/api/webhook
    when: failure
    body: { text: "The job failed" }
  - notify: "Your AI went berserk"
  - telegram.send.message:             # from the sink registry, only if pi-telegram is loaded
      text: "Report ready"
---

Your task is to red-team everything I own. Write a log to trussel-<date>.md.
```

Decisions embedded above:

- `emits` is a flat list where each element has one handler key, replacing a nested
  `events: { accept:, trigger: [] }` shape. `accept` became top-level `on:` because it
  is a trigger, not an action, and belongs next to `schedule`.
- `when` on each emit allows notifying on failure without notifying on success.
- `id` must match `^[a-z0-9][a-z0-9._-]*$`. It is not merely a convention: the id becomes
  part of the memory file path, so an unvalidated id is path traversal. Validation
  failure is a parse error and the job is listed as invalid, never run.
- Duplicate `id` values among the files discovered in one workspace are a startup error,
  not silent overwrite. Both files are reported and neither runs.
- `schedule.cron` and `on:` are independent triggers. A job with both runs on its cron
  ticks *and* whenever a subscribed event arrives. A job with neither is valid but inert,
  runnable only through `cron_jobs emit` — useful while developing one.
- `expectedRuntime` and `timeout` accept either a duration string (`2m`, `90s`, `1h`)
  or a number of milliseconds. Strings are parsed to ms before reaching
  `AgentDefinition.timeout`.
- There is no `enabled` field. See below.

## Reserved event namespace

The engine emits its own lifecycle events into the same bus, so they can be subscribed
to exactly like any other event — that is what makes `job.overdue` reach a phone and
`job.timeout` drive a retry without any dedicated configuration.

Reserved and engine-emitted: `cron.tick`, `job.started`, `job.completed`, `job.failed`,
`job.skipped`, `job.timeout`, `job.overdue`, `job.abandoned`, `job.interrupted`,
`chain.limit.exceeded`, `sink.missing`.

Job-defined event names must not begin with `cron.`, `job.`, `chain.`, or `sink.`. A
frontmatter `emits` entry that does is a validation error, so a job cannot forge
lifecycle events. Engine events carry the job id in their payload, so a subscriber
filters on payload rather than needing one event name per job.

## Activation

Activation lives outside the workspace, in
`~/.pi/agent/state/pi-event-cron-scheduler/enabled.json`:

```json
{
  "version": 1,
  "jobs": {
    "/Users/mikalv/pa-workspace::security-red-team": {
      "enabledAt": "2026-08-26T02:50:00.000Z",
      "path": "scheduled/security-red-team.md"
    }
  }
}
```

Keys are absolute workspace path plus `id`, so the same `id` in two workspaces is two
distinct jobs. Discovery is unaffected: every file in `scheduled/` is parsed and listed,
but only jobs present in `enabled.json` get a timer or an event subscription.
Activation happens through the `cron_jobs` tool, not by hand-editing JSON.

The reason activation is not a frontmatter flag: a `git pull`, a `git clone`, or a file
copied from an example cannot switch itself on. This also gives one source of truth for
"what is running", which is exactly what the listing tool shows, and it is the file a
future daemon reads.

Known limit: an agent with `write` and an unrestricted path can still edit
`enabled.json`. Only content hashing or the permission system prevents that. It is a
different threat from a repository file self-activating.

## Trigger engine

**Leader election.** On startup the extension attempts to take
`state/pi-event-cron-scheduler/leader.lock` with its pid and a `heartbeat` timestamp
renewed every 15 seconds. If the lock is held and fresh, this session runs as a
follower: it can list status and emit events, but owns no timers and dispatches nothing.
A heartbeat older than 45 seconds means the lock is dead and is taken over. A clean
shutdown releases the lock. A future daemon takes the same lock and wins naturally
because it is always alive.

Without this, two pi sessions open in the same workspace would both fire every cron
tick — a double-execution bug that exists today, before any daemon.

**Cron.** The leader creates one `croner` instance per enabled job from `cron` and
`timezone`. A tick does not invoke the job directly; it emits `cron.tick` for that job
id into the bus. There is exactly one path into execution.

**Bus.** `emit()` appends one line to `events/YYYY-MM-DD.jsonl`:
`{id, ts, event, source, runId, chain, payload}`. The leader follows the current day's
file from an offset persisted in `cursor.json`, using `fs.watch` on the events directory
with a 2-second poll as a safety net. For each new line, subscribers are looked up in
the `on:` table and jobs are started. Because only the leader reads, the offset is
sufficient — no dedupe layer is needed.

In that line, `id` is the event's own unique id, `source` identifies what emitted it
(`cron`, a job id, `tool`, or a sink), and `runId` is the run that emitted it when there
is one.

At midnight the writer rolls to a new file and the cursor moves to it, after reading the
previous file to its end, so a tick emitted at 23:59:59 is never lost. Retention is
deleting old day files: the default keeps 30 days, checked on leader startup.

**Chain limit.** Events emitted by a run inherit `chain + 1` from the event that started
that run. Above 8 the emit is rejected, logged as `chain.limit.exceeded`, and the job is
marked failed. Without this, two jobs subscribed to each other spin forever.

**Concurrency.** The leader holds a per-job-id in-flight set. `skip` emits `job.skipped`
and moves on. `queue` remembers at most one pending trigger and starts it as soon as the
current run leaves the in-flight set, whether it completed, failed, or timed out; further
triggers arriving while one is already pending collapse into that single pending entry, so
the queue never exceeds one. `parallel` starts regardless, with no cap.

**Deadlines.** Every run gets an effective deadline: `timeout` from frontmatter, else 10
minutes. The leader creates an `A
[pruned: omitted ~12001 chars; full: /var/folders/d7/74v2x25j087490y19nkmbst00000gp/T/pi-prune-context/tool-output-1787713412211-e09596aebf4c5.txt]
ted empty on
first run, its content is prepended as above, and its path is stated so the agent can
write it with `write`. No new tools. Without `memory`, the file is never mentioned, so
the job does not know it exists.

## Sinks

Three are builtin and dependency-free: `event` (emit into the bus), `webhook` (POST with
a JSON body), and `notify` (`ctx.ui.notify` when a TUI is present, otherwise logged
only).

Everything else comes from a registry at `globalThis.__piEventCronSinkRegistry__` with
`version: 1`, where `pi-telegram` registers `telegram.send.message` itself. Whichever
extension loads first creates the registry, so load order is irrelevant — the same
contract shape pi-telegram already uses for its own update handlers.

A sink named in frontmatter that is absent from the registry at runtime is not a crash:
it is logged as `sink.missing` and the remaining sinks still run.

A sink that throws does not fail the job. The run has already finished; a Slack webhook
being down must not turn a completed red-team report into a failed job.

## Tool and command surface

One tool, `cron_jobs`, with `action: list | enable | disable | kill | reload | emit`,
following the shape of the existing `manage_scheduled_task`.

`list` shows every file in `scheduled/`: whether it is enabled, its cron expression and
next run, the events it subscribes to and emits, last status, median duration from
`runs.json`, and who holds the leader lock. Inactive files are listed too, otherwise
their existence is invisible. `kill` takes a job id and aborts that job's in-flight runs
through the same path as a timeout, so the slot is freed the same way. `emit` takes an
event name and an optional payload, so a chain can be tested by hand without waiting for
cron; events emitted this way carry `source: tool` and `chain: 0`.

A `/cron` slash command renders the same list for humans.

No widget. The existing scheduler already has one and two stacked clock widgets are
noise. A status line entry appears while something is running; the list is on demand.

## Package layout

`packages/pi-event-cron-scheduler`, with logic in pi-free modules and `index.ts` as a
thin extension adapter:

- `frontmatter.ts` — parsing, validation, duration parsing
- `bus.ts` — append, offset reading, daily rotation
- `leader.ts` — lock and heartbeat
- `engine.ts` — cron, subscriptions, concurrency, deadlines, chain limit
- `sinks.ts` — builtins and the registry
- `state.ts` — `enabled.json`, `runs.json`, `cursor.json`

`runs.json` keeps the most recent 50 records per job and drops older ones on write, so a
job on a five-minute cron does not grow the file without bound. Median duration in `list`
is computed from what remains.

`pi-agent-core` is a peer dependency; `croner` is the only runtime dependency.

## Testing

Everything time-dependent takes an injected clock, and all disk access points at a
tmpdir, so tests are fast and deterministic.

Required coverage:

- frontmatter validation, including duplicate ids, unknown fields, ids failing the
  charset rule, and `emits` entries using a reserved event prefix
- duration string parsing
- cron validation with timezone
- append and offset reading across a daily rotation
- leader lock taken over on a dead heartbeat, and *not* taken on a fresh one
- `skip` / `queue` / `parallel` against a fake runner
- chain limit at 8
- `expectedRuntime` emitting `job.overdue` exactly once, never twice
- `timeout` aborting and freeing the slot
- `abandoned` after the 60-second grace period
- sink dispatch against a fake registry, including `sink.missing`
- a throwing sink not failing the job

## Deliberately out of scope for v1

- The daemon itself. The lock, log, and state formats are shaped for it.
- Catch-up of ticks missed while pi was closed. If pi was down at 03:00, nothing ran.
- Auto-retry with backoff.
- `fs.watch` on `scheduled/` — reload is explicit.
- Inbound webhooks.
- Automatic computation of expected runtime. `list` shows median duration so the number
  can be chosen from reality; anomaly detection is a different product.
