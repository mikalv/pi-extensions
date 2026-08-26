# pi-event-cron-scheduler

Executable scheduled markdown for pi. Drop a file in `scheduled/*.md`, give it a cron expression or
a list of events to listen for, and the body runs as a prompt in its own child process. Jobs can emit
events that trigger other jobs, so work that must happen in order does not depend on guessing how
long the previous step takes.

## A job file

```markdown
---
id: morning-news
description: Skim my feeds and decide whether anything is worth waking me for.
schedule:
  cron: "0 7 * * *"
  timezone: "Europe/Oslo"
model: "anthropic/sonnet"
tools: [read, write, web_search]
expectedRuntime: 5m
timeout: 20m
concurrency: skip
memory: true
emits:
  - event: news.triaged
    payload:
      digest: "news-digest.md"
  - notify: "Something in the feeds needs you."
    if: [alert-user]
  - telegram.send:
      chatId: "me"
      text: "Morning digest is ready."
    if: [alert-user, record]
    when: always
---

Read my feeds, write the digest to `news-digest.md`, and decide whether anything is urgent.
```

### Frontmatter fields

| Field             | Meaning                                                                          |
| ----------------- | -------------------------------------------------------------------------------- |
| `id`              | Required. Lowercase token, unique across the workspace.                          |
| `description`     | Shown in listings.                                                               |
| `schedule.cron`   | Cron expression, validated at parse time.                                        |
| `schedule.timezone` | IANA zone for the cron expression and for the timestamps in the prompt.        |
| `on`              | Event names that trigger this job.                                               |
| `agent`           | Named agent to run as. Needs a registered runner (see below).                     |
| `runtime`         | Selects a registered runner by name.                                             |
| `model`           | Model pattern, passed to the child as `--model`.                                 |
| `thinking`        | Thinking level, passed as `--thinking` when it is a string.                       |
| `tools`           | Tool allowlist, passed as `--tools`.                                             |
| `skills`          | Skills for the run. Needs a registered runner.                                   |
| `turnBudget`      | Turn cap for the run. Needs a registered runner.                                 |
| `expectedRuntime` | Soft limit. Emits `job.overdue` when passed, but the run continues.               |
| `timeout`         | Hard limit. Aborts the run and emits `job.timeout`. Defaults to 10 minutes.       |
| `concurrency`     | `skip` (default), `queue`, or `parallel` when a run is already in flight.         |
| `memory`          | Gives the job a scratchpad file it can rewrite between runs.                      |
| `emits`           | Sinks to fire after the run. See below.                                          |

Durations accept `ms`, `s`, `m`, `h`, or a plain number of milliseconds.

A file that fails validation is listed with its errors and never runs. Two files claiming the same
`id` invalidate each other, so a copy-paste mistake cannot silently shadow a working job.

## Enabling a job

A file on disk does nothing until you enable it. Activation is stored outside the workspace, in
`~/.pi/agent/state/pi-event-cron-scheduler/enabled.json`, so pulling a branch or letting an agent
write a file cannot start running things on your machine.

```
/cron list
/cron enable morning-news
/cron disable morning-news
/cron reload
/cron kill morning-news
/cron emit news.triaged
```

The `cron_jobs` tool exposes the same six actions to the agent.

## Sinks and conditional routing

Each entry in `emits` has exactly one handler key:

- `event: <name>` — put an event on the bus, with the optional `payload` mapping as its payload.
- `webhook: <https url>` — POST the optional `body` mapping as JSON.
- `notify: <text>` — show a notification in the session.
- anything else — look the key up in the sink registry, passing the mapping under it as arguments.

`when` limits a sink to `success` (default), `failure`, or `always`.

`if` makes the sink conditional on the job's own verdict. When any sink uses `if`, the prompt gains
an instruction to end its output with a continue line:

```
continue: [alert-user,record]
```

A sink fires when its `if` list shares at least one token with that line. `continue: []` means
nothing conditional fires. If the run never writes a continue line, the scheduler emits
`job.signal.missing` so you can see why nothing downstream happened.

Other extensions add their own sinks through a versioned registry on `globalThis`, so load order does
not matter and neither side needs to import the other:

```ts
import { registerSink } from "@meeh/pi-event-cron-scheduler/src/sinks.js";

registerSink("telegram.send", async (args, ctx) => {
  await sendTelegram(String(args.chatId), String(args.text));
  ctx.notify(`told ${args.chatId}`);
});
```

## How a run executes

By default a run is a child `pi --print --no-session` process in the job's workspace, so its context
is clean and its output is captured as text. `model`, `thinking`, and `tools` map to CLI flags.

`agent`, `runtime`, `skills`, and `turnBudget` have no CLI equivalent. A job using them fails with an
explicit error instead of quietly ignoring the field, until a runner is registered:

```ts
import { registerRunner } from "@meeh/pi-event-cron-scheduler/src/runner.js";

registerRunner("default", async ({ job, prompt, signal }) => {
  const record = await controlPlane.dispatch({ agent: job.agent ?? "worker", prompt, cwd: job.workspace, signal });
  return { status: record.status === "completed" ? "completed" : "failed", output: record.output ?? "" };
});
```

A runner named after the job's `runtime` wins over the one named `default`.

The prompt the job receives is its body plus a header stating which trigger fired, the current time
in the job's timezone, the event payload, how the previous run ended with a tail of its output, and
the memory file path when `memory: true`.

## The event bus

Events are appended to `~/.pi/agent/state/pi-event-cron-scheduler/events/YYYY-MM-DD.jsonl` and read
back through a cursor, so a crash mid-chain resumes instead of losing or repeating work. Logs older
than 14 days are pruned at startup.

The scheduler emits these itself, and `cron.`, `job.`, `chain.`, and `sink.` are reserved prefixes
that a job may not emit:

| Event                  | When                                                              |
| ---------------------- | ----------------------------------------------------------------- |
| `cron.tick`            | A cron expression fired.                                          |
| `job.started`          | A run began.                                                      |
| `job.completed`        | A run finished successfully.                                      |
| `job.failed`           | A run failed.                                                     |
| `job.skipped`          | A trigger arrived while a `skip` job was already running.          |
| `job.overdue`          | A run passed its `expectedRuntime`.                               |
| `job.timeout`          | A run hit its `timeout` and was aborted.                          |
| `job.abandoned`        | A run ignored the abort and its slot was reclaimed after a minute. |
| `job.interrupted`      | A run's process died; detected at the next startup.               |
| `job.signal.missing`   | A job with `if` sinks wrote no continue line.                     |
| `chain.limit.exceeded` | An event chain reached 8 hops and was cut.                        |
| `sink.missing`         | A sink named in `emits` is not registered.                        |

Jobs subscribe to any of them through `on`, which is how a job reacts to another job finishing, going
overdue, or failing.

## Multiple sessions

Every session parses, lists, enables, and disables. Only one holds `leader.lock` and actually
dispatches, refreshing a heartbeat every 15 seconds; another session takes over 45 seconds after that
heartbeat stops. `/cron list` names the current leader.

## State

Everything lives under `~/.pi/agent/state/pi-event-cron-scheduler/`:

```
enabled.json          which jobs are active, per workspace
runs.json             last 50 runs per job, with verdict and output tail
cursor.json           position in the event log
leader.lock           who dispatches
events/*.jsonl        the event log
memory/<id>.md        per-job scratchpad
```
