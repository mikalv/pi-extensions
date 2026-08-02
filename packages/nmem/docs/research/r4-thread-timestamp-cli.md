# r4: Can the nmem CLI get a thread’s precise creation time?

> Research date: 2026-07-18
> Backend: `https://nmem.cnife.cn` (remote mode), CLI v0.10.30

---

## One-line conclusion

**The CLI cannot get the true “session start time” (first message timestamp) via `t list` / `t show`, but can reliably get it with `nmem fs cat messages.jsonl --line 1 --lines 1`.** If an approximation via `thread.created_at` is acceptable (import time; usually 1–9 minutes off), `nmem --json t show <id>`’s `created_at` is a full ISO timestamp.

---

## Five core questions

### Q1: What does `t list`’s `created_at` mean? Session start / import / record time? Day-only or with time?

**Conclusion: day-only (`"Jul 18, 2026"`); semantics are record/import date, not session start.**

Evidence:

- `nmem --json t list -n 2` probed output:

  ```json
  {"id":"pi-019f754a-...","created_at":"Jul 18, 2026",...}
  ```

- REST `GET /threads?limit=2` uses field name `date` (not `created_at`), also day-only `"Jul 18, 2026"`.
- Compared with `t show --json`’s `created_at: "2026-07-18T13:00:17.927969Z"`, t list truncates the time portion.

### Q2: Do `import_date` / `last_activity` include time-of-day? Which is closest to session start?

**Conclusion: `import_date` is a full ISO timestamp (sub-second precision), but means “import/record time”, not “session start”. `last_activity` only appears in search results and was not verified in this probe (search returns had no time fields).**

Evidence:

- REST `GET /threads/{id}` thread node has identical `created_at` and `import_date` (`"2026-07-18T13:00:17.927969Z"`) — both import time.
- CLI `t show --json` only exposes `created_at` (no `import_date`).
- Three-thread comparison (REST):

| Thread | thread.created_at | messages[0].timestamp | Delta |
|---|---|---|---|
| daily-recap adaptation discussion | 13:00:17.927969Z | 12:57:14.949000+00:00 | ~3 min |
| This research | 13:26:31.283791Z | 13:25:33.057000+00:00 | ~1 min |
| HPC inspection (6/30) | 01:12:40.315082Z | 01:03:46.513000+00:00 | ~9 min |

`import_date` / `created_at` are always ≥ `messages[0].timestamp`.

### Q3: Is `messages[0].timestamp` equal to session start? Format? Can the CLI get it?

**Conclusion: `messages[0].timestamp` is the closest “session start” field; ISO 8601 with timezone (e.g. `"2026-07-18T12:57:14.949000+00:00"`); CLI `t show --json` cannot get it (messages only return `index/role/content`).**

Evidence:

- REST `GET /threads/{id}` message array items include `timestamp` (confirmed in r3 REST docs L122).
- `nmem --json t show <id> -n 1` probed output messages only have `index/role/content` — **no `timestamp`**.
- CLI source is not available (Rust binary), but probing is sufficient: t show drops message timestamps.

**CLI alternative**: `nmem fs cat /threads/<src>/<thread-title-hash>/messages.jsonl --line 1 --lines 1` returns the first message’s full JSON, including `timestamp`.

Probed:

```json
{"id":"msgocc_...","role":"user","content":"...","order_index":0,
 "timestamp":"2026-07-18T12:57:14.949000+00:00","token_count":0}
```

Source: `nmem fs cat /threads/pi/nmem-CLI-线程精确创建时刻调研-00000000/messages.jsonl --line 1 --lines 1`

### Q4: Is there any CLI command/flag that directly returns precise thread creation time?

**Per-command conclusions:**

| Command | Precise time? | Notes |
|---|---|---|
| `nmem t list --json` | ❌ no | Only `created_at: "Jul 18, 2026"` (date, no time) |
| `nmem t show --json <id>` | ⚠️ partial | Gets `created_at` (import time, full ISO), not session start |
| `nmem t search --json` | ❌ no | Results have no time fields |
| `nmem feed --json` | ❌ no | Events have `created_at` but events are not thread-creation |
| `nmem fs stat <path> --json` | ❌ no | `created_at`/`updated_at` both `null` |
| `nmem fs cat <meta.md>` | ⚠️ partial | Gets `created_at` (import time, same as t show) |
| `nmem fs cat <messages.jsonl> --line 1 --lines 1` | ✅ **yes** | Gets `messages[0].timestamp` (true session start) |
| `nmem export` | ❌ no (not fully tested) | Can export full data but too heavy for routine queries |
| `nmem stats` | ❌ no | Counts only; no time fields |
| `nmem context` | ❌ no | Session-start context; does not expose thread times |

### Q5: If the CLI cannot get it, what’s the best alternative?

**The CLI can get true session start via `nmem fs cat messages.jsonl --line 1 --lines 1`**, so no separate “alternative” is required.

If only an approximation is needed (tolerate 1–9 min skew), `nmem --json t show <id>`’s `created_at` is the lightweight choice (no extra fs cat).

---

## Full research log

### Step 1: Environment

```bash
nmem status
# cli v0.10.30, server v0.10.30, mode remote, api https://nmem.cnife.cn

nmem config show
# API key: set
```

Config source: `/home/cnife/.nowledge-mem/config.json` contains `apiKey`.

### Step 2: --help notes

| Command | Relevant flags |
|---|---|
| `nmem t list --help` | `-n/--limit`, `-j/--json`, `--source`, `--space`, `--offset` |
| `nmem t show --help` | `-n/--limit` (message count), `-j/--json`, `--offset`, `--content-limit` |
| `nmem t search --help` | `-n/--limit`, `-j/--json`, `--source`, `--space` |
| `nmem feed --help` | `--days`, `--from/--to`, `--type`, `--all`, `-n/--limit` (event count) |
| `nmem fs --help` | subcommands: `ls/cat/stat/find/grep/recall/write/rm` |
| `nmem fs stat --help` | `-j/--json`, `<PATH>` |
| `nmem fs cat --help` | `--line`, `--lines`, `--raw`, `--frontmatter`, `--fragment` |
| `nmem export --help` | `--no-zip`, `--overwrite`, `--no-memories/--no-threads/...` (selective export) |
| `nmem stats --help` | `-j/--json` |
| `nmem context --help` | no time-related flags |

### Step 3: CLI probes

**`nmem --json t list -n 2`**: `created_at: "Jul 18, 2026"` date-only.

**`nmem --json feed --days 1 -n 3 --all`**: events have full `created_at` (e.g. `"2026-07-18T13:06:36.106680+00:00"`), but events do not directly map to thread creation.

**`nmem --json fs ls /threads/`** → lists thread dirs grouped by source.
**`nmem --json fs stat /threads/pi/<some-thread>/`** → `created_at: null, updated_at: null`.

**`nmem fs cat /threads/pi/.../meta.md`**:

```yaml
---
created_at: "2026-06-30T01:12:40.315082Z"
updated_at: "2026-07-01T07:45:34.441196Z"
---
```

Source: `nmem fs cat /threads/pi/nmem-CLI-线程精确创建时刻调研-00000000/meta.md`

**`nmem --json fs cat /threads/pi/.../messages.jsonl --line 1 --lines 1`**:

```json
{"id":"...","role":"user","content":"...","order_index":0,
 "timestamp":"2026-07-18T12:57:14.949000+00:00","token_count":0}
```

Source: `nmem fs cat /threads/pi/nmem-CLI-线程精确创建时刻调研-00000000/messages.jsonl --line 1 --lines 1`

### Step 4: Direct REST API calls

Python `urllib` with Authorization Bearer + X-NMEM-API-Key.

**`GET /threads?limit=2`**:

```json
{"threads":[{"id":"pi-...","date":"Jul 18, 2026",...}],"pagination":{...}}
```

Field name is `date` (not `created_at`), date-only.

**`GET /threads/{id}?offset=0&limit=1`**:

```json
{"thread":{"id":"...","created_at":"2026-07-18T13:00:17.927969Z",
           "import_date":"2026-07-18T13:00:17.927969Z",...},
 "messages":[{"id":"...","timestamp":"2026-07-18T12:57:14.949000+00:00",
              "created_at":"2026-07-18T13:00:17.927969+00:00",...}]}
```

- `thread.created_at` = `import_date` (import time)
- `messages[0].timestamp` (true time)
- `messages[0].created_at` (import time)

Full three-thread comparison is in the Q2 table.

### Step 5: CLI source

nmem CLI is a Rust binary (`/home/cnife/.local/share/uv/tools/nmem-cli/bin/nmem`, 14MB). No local Rust sources available.

### Step 6: REST docs

Source: `/home/cnife/code/pi-extensions/packages/nmem/docs/research/r3-rest-api-docs.md`

- L105: search returns `last_activity` (precision not confirmed by probe)
- L121: `GET /threads/{id}` thread node includes `import_date`
- L122: messages include `timestamp`

---

## Recommendations for daily-recap

### Remote sessions with CST 04:00 day boundary

For **remote sessions** (no local jsonl), use the following to get precise session start:

**Recommended CLI path (exact):**

```bash
# 1. Get thread short-id from FS path
THREAD_INFO=$(nmem --json t show <thread_id> -n 1 2>/dev/null)
# 2. Build short-id from thread title (note: get accurate path via fs ls first)
nmem fs cat /threads/<source>/<title-short-id>/messages.jsonl --line 1 --lines 1
```

**More practical combo (list, then get time):**

```bash
# Use t show --json created_at (approximate, lightweight)
nmem --json t show <thread_id> | python3 -c "import sys,json; print(json.load(sys.stdin)['created_at'])"
```

**When `messages[0].timestamp` is required:**

```bash
# Find thread FS path via fs ls first
FS_PATH=$(nmem --json fs ls /threads/pi/ | python3 -c "
import sys, json
data = json.load(sys.stdin)
# Find target thread path in entries
entries = data.get('entries', [])
import re
# Match by title or id
# ...
")
# Then read first message timestamp
nmem fs cat "$FS_PATH/messages.jsonl" --line 1 --lines 1 | python3 -c "import sys,json; print(json.loads(sys.stdin.read())['timestamp'])"
```

### Recommended time-field priority

| Priority | Field | CLI path | Precision | Cost |
|---|---|---|---|---|
| 1 (best) | `messages[0].timestamp` | `fs cat messages.jsonl --line 1 --lines 1` | microsecond | 2 CLI calls + one JSON parse |
| 2 (lightweight) | `thread.created_at` | `t show --json <id>` | skew <10min | 1 CLI call |
| 3 (unusable) | `t list` `created_at` | `t list --json` | day-only | — |

### Caveats

1. `messages[0].timestamp` is the first message’s time. For Pi sessions, the first message may be a plugin-injected `inline-skills` or `rpiv-git-context` system message — still earlier than the user’s first real message, and the earliest time nmem can provide.
2. If you care about the **real first user message** (not system), you may need to read messages.jsonl and take the first with `role != "system"`.
3. `fs cat messages.jsonl` returns full JSONL; use `--line 1 --lines 1` to avoid reading large files.
4. FS path short-ids (e.g. `nmem-CLI-线程精确创建时刻调研-00000000`) are not stable — they are title + hash. Same title may differ across spaces/times. Prefer `nmem --json fs ls /threads/pi/` for live paths.

### Backend REST API fallback

If CLI is inconvenient, a Python script can call REST directly:

```python
import urllib.request, json
headers = {"Authorization": f"Bearer {API_KEY}", "X-NMEM-API-Key": API_KEY}
req = urllib.request.Request(f"{API_URL}/threads/{thread_id}?offset=0&limit=1", headers=headers)
data = json.loads(urllib.request.urlopen(req).read())
msg0_ts = data["messages"][0]["timestamp"]  # precise session start
```
