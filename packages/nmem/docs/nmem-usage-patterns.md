# nmem CLI usage patterns research

> Research date: 2026-07-15
> Purpose: Inform design of better agent wrapper commands (axi)
> Method: Read nmem CLI source/docs + analyze real usage patterns in Pi Agent session logs

---

## 1. Environment

| Attribute | Value |
|------|-----|
| CLI path | `~/.local/bin/nmem → ~/.local/share/uv/tools/nmem-cli/bin/nmem` |
| Version | `nmem 0.10.27` |
| Install method | uv tool |
| Backend status | `ok`, local mode, API `http://127.0.0.1:14242` |
| Service mode | systemd service not installed (`nmem service install` not run) |

**Source**: `which nmem`, `nmem --version`, `nmem status`, `nmem service status`

---

## 2. Command landscape

nmem exposes 20+ top-level commands; full list via `nmem --help`. Grouped by domain below.

### 2.1 Session / thread ops (most used)

```
nmem threads|t list    [-n LIMIT] [--offset] [--source] [--space] [--json]
nmem threads|t show ID [--limit N] [--offset N] [--content-limit N] [--json]
nmem threads|t search QUERY...
nmem threads|t create  --title TITLE [--content|-c|--messages|-m|--file|-f]
nmem threads|t import  [--file|-f FILE] [--messages|-m JSON] [--title|-t] [--stdin]
nmem threads|t save    --from <host> [--mode current|all] [--session-id] [--summary]
nmem threads|t sync    --from <host> [--apply] [--all-projects] [--limit]
nmem threads|t append  ID [--messages|-m JSON|--content|-c TEXT] [--role]
nmem threads|t delete  ID
nmem threads|t triage  [THREAD_ID|--content|-c|--file|-f]
nmem threads|t distill THREAD_ID
```

**Source**: `nmem t --help`, `nmem t list --help`, `nmem t show --help`, `nmem t create --help`, `nmem t import --help`, `nmem t save --help`, `nmem t sync --help`, `nmem t append --help`

### 2.2 Memory ops

```
nmem memories|m search QUERY...  [--label|-l] [--time|-t] [--unit-type]
                                  [--importance-min] [--mode normal|deep]
                                  [--recorded-from/to] [--event-from/to]
                                  [--limit] [--json]
nmem memories|m add    CONTENT  -t TITLE [--unit-type] [-i IMPORTANCE] [-l LABEL]
nmem memories|m show   ID
nmem memories|m list   [--limit] [--time] [--unit-type] [--json]
nmem memories|m update ID [--title] [--content] [--importance] [--unit-type]
nmem memories|m delete/archive/forget/deprecate/supersede ID
nmem memories|m move   ID [--space]
```

**Source**: `nmem m --help`, `nmem m search --help`, `nmem m add --help`

### 2.3 System admin

```
nmem status        # server health check + version
nmem serve         # run backend server
nmem service       # manage systemd service (install/start/stop/status/uninstall)
nmem config        # connection config (API URL + key)
nmem plugins       # plugin management
nmem models        # embedding model management (status/download/reindex)
```

**Source**: `nmem status --help`, `nmem service --help`

### 2.4 Import / export

```
nmem export  PATH   [--overwrite] [--no-zip] [--no-memories|threads|...]
nmem import  PATH
```

**Source**: `nmem export --help`

### 2.5 Context and knowledge discovery

```
nmem working-memory|wm  [read|edit|patch|history]  [--date DATE]
nmem context            [--space]  # Owner/agent/space/rules bundle
nmem feed               [--days N] [--type TYPE] [--from/to DATE] [--limit]
nmem fs                 [ls|cat|find|grep|recall|stat|write|rm|capabilities]
nmem wiki               [read|export|list]
nmem graph              [expand|evolves]
nmem entities           [create|show|search|update|delete|list]
nmem ask                QUERY...
nmem library|s|lib|l    [list|add|read|search|delete]
nmem communities        [list|show|search]
```

**Source**: `nmem working-memory --help`, `nmem feed --help`, `nmem fs --help`, `nmem ask --help`

### 2.6 Spaces and permissions

```
nmem spaces      [list|create|delete|rename|...]
nmem license     [status|activate]
nmem key         [show|rotate]
nmem skills      [search|show|install|list|uninstall|sync]
nmem agents      [list|create|show|update|delete]
nmem rules       [list|edit|show|delete|read]
nmem tui         # start interactive TUI
```

**Source**: `nmem --help`

---

## 3. Usage patterns observed in session logs

Patterns below come from full-text search of Pi Agent session files (~30 session files matched `nmem`).

### 3.1 High-frequency commands (by hit count)

| Command pattern | Hits | File source |
|---------|--------|---------|
| `nmem t show` | 56 | `personal_code-skills/2026-07-14T06-55-06...` |
| `nmem t list` / `nmem --json t list -n 25` | 10+9 | `personal_code-skills/2026-07-14T06-55-06...` |
| `nmem t list` | 21 | `personal_code-skills/2026-07-03T13-45-14...` |
| `nmem t show` | 24 | `personal_code-skills/2026-07-03T13-45-14...` |
| `nmem t show` (paged args) | 56 | same |
| `nmem --version` | 3 | `personal_code-skills/2026-07-03T13-45-14...` |
| `nmem t save --from` | 4+ | `personal_code-nmem-import-pi-sessions/2026-06-10...` |
| `nmem status` | 3 | `personal_code-nmem-import-pi-sessions/2026-06-10...` |
| `nmem --json t create` | 2 | `personal_code-nmem-import-pi-sessions/2026-06-10...` |
| `nmem t import` | 3 | same |
| `nmem m search "query"` | 1 | `personal_code-skills/2026-07-03T13-45-14...` |
| `nmem t search "query"` | 1 | `personal_code-skills/2026-06-16T05-39-05...` |
| `nmem serve` | 1 | same |
| `nmem export` | 1 | `personal_code-nmem-import-pi-sessions/2026-06-10...` |
| `nmem plugins check` | 1 | same |
| `nmem feed` | 1 | `personal_code-skills/2026-07-14T06-55-06...` |

**Source**: rg full-text search `/home/cnife/.pi/agent/sessions/` + `/home/cnife/.omp/agent/sessions/`

### 3.2 Typical workflows

#### A. Session collection in daily-recap (most complete scenario)

From the daily-recap skill development session under `personal_code-skills`.

```
# Health check
nmem --version

# List recent threads (today's thread list)
nmem --json t list -n 25

# Filter output by created_at for threads created today
# For each thread:

# Read session content (paged)
nmem --json t show "<thread_id>" --limit 5 --offset 0 --content-limit 1000
nmem --json t show "<thread_id>" --limit 5 --offset 5 --content-limit 1000
# ... until all messages are read
```

**Key observations**:
- `--json` for script parsing; plain text for humans
- Session reads must be **paged** — `--offset 0`, `--offset 5`, `--offset 10` — default `--limit` of 10 is not enough for a full conversation
- `--content-limit 1000` truncates long messages
- Sessions that already have local jsonl files do not call `nmem t show`; only remote sessions do

#### B. Importing sessions into nmem (one-off task)

From the `personal_code-nmem-import-pi-sessions` session.

```
# Method 1: create from messages
nmem threads create --id "pi-{uuid}" --title "..." --messages '[...]'

# Method 2: import from JSON/markdown file
nmem threads import --file session.md

# Method 3: bulk import a directory
nmem threads import --directory pi-sessions-md

# Method 4: save from another agent
nmem threads save --from claude-code
nmem threads save --from gemini-cli
```

**Key observations**:
- Four different import paths with inconsistent parameter models
- `nmem threads create --id` requires manually constructing message JSON
- `nmem threads import --file` accepts markdown or JSON
- `nmem threads save --from` auto-discovers agent sessions — most convenient, but only for supported agents

#### C. Memory search

From search-memory skill usage in `personal_code-skills`.

```
# Semantic search
nmem memories search "project keywords work" --json
nmem --json m search "query"
```

**Key observations**:
- Semantic search needs precise keywords
- Output includes importance, type, and labels, but the agent must parse relevance itself

#### D. Status checks and failure handling

From the daily-recap skill failure-handling table.

```
# Check nmem availability
nmem --version
# On failure: hard stop, fall back to local jsonl
```

**Failure modes**:
| Symptom | Cause | Handling |
|------|------|------|
| nmem unavailable | CLI not installed / not logged in | Hard stop; ask user whether to use local sessions only |
| `nmem t list` has no today threads | Nothing synced via nmem today | Use local session files only |
| `nmem t show` timeout / empty | nmem server issue | Mark that session as "content pending" |
| nmem has thread but no local file | Session from another machine | Treat as remote session flow |

---

## 4. Pain points

### 4.1 Verbose session reads

`nmem t show` needs multiple calls to finish one full session:

```
nmem t show <id> --limit 5 --offset 0   # call 1
nmem t show <id> --limit 5 --offset 5   # call 2
nmem t show <id> --limit 5 --offset 10  # call 3
...
```

**Impact**: agent must loop or make many tool calls; humans must remember the last offset

### 4.2 Verbose flags

Typical call:
```
nmem --json t show "<thread_id>" --limit 5 --offset 0 --content-limit 1000
```

`--json` every time; `--content-limit 1000` is non-memorable and must be re-chosen each time.

### 4.3 Scattered import entry points

| Entry | Use case | Parameter model |
|------|---------|---------|
| `nmem t create` | Create from scratch | `--title` required; `--messages/-m` or `--content/-c` |
| `nmem t import` | Import from file | `--file/-f` or `--stdin` |
| `nmem t save` | Save from agent | `--from <host>` required |
| `nmem t sync` | Bulk sync | `--from <host>` + `--apply` |

Overlapping semantics (create vs import vs save vs sync), inconsistent parameters.

### 4.4 Search quality

- `nmem m search` semantic search is not good enough (session feedback: "search quality is poor")
- Search returns agent-friendly JSON, but the agent still decides which results matter

### 4.5 No clean fallback

nmem backend must be running and reachable. When unavailable, daily-recap can only hard-stop or degrade to local jsonl — fallback logic lives scattered in SKILL.md rather than centralized.

---

## 5. Known aliases / abbreviations

nmem CLI itself supports:

| Full name | Alias |
|------|------|
| `threads` | `t` |
| `memories` | `m` |
| `working-memory` | `wm` |
| `library` | `s`, `lib`, `l` |

**Source**: `(alias: ...)` annotations in `nmem --help`

Also: `--limit` has `-n`; `--messages` has `-m` on some subcommands (but on `t show`, `--messages` is deprecated in favor of `--limit`).

---

## 6. Design implications for wrapper commands (axi)

Based on this research, a good wrapper should:

1. **One-shot full session read**: `axi t show <id>` auto-pages and concatenates — no manual offset
2. **Smart defaults**: `--json` default in agent mode; `--content-limit` adjusted from context
3. **Unified import entry**: merge `create/import/save/sync` into `axi t save --from <host>|--file <path>|--messages <json>`
4. **Built-in fallback**: when nmem is down, auto-degrade to local jsonl / direct filesystem query
5. **Concise filter/search**: `axi m search "term" --today --label backend` instead of long flag stacks
6. **Fast memory write**: `axi m add -t "Title" -c "content" -l tag`, default decision type + default importance

---

## Appendix A: session file references

Sessions analyzed:

- `/home/cnife/.pi/agent/sessions/--home-cnife-personal_code-skills--/2026-07-14T06-55-06-515Z_019f5f68-6b13-75dd-b5ac-223d24bdeb38.jsonl` — daily-recap development; densest nmem usage
- `/home/cnife/.pi/agent/sessions/--home-cnife-personal_code-skills--/2026-07-03T13-45-14-382Z_019f2839-f38e-7821-93c9-9e0bbc433cd0.jsonl` — search-memory skill development
- `/home/cnife/.pi/agent/sessions/--home-cnife-personal_code-skills--/2026-07-14T02-26-15-405Z_019f5e72-46ed-75f9-814f-c45795d1dc6d.jsonl` — nmem background intelligence fix
- `/home/cnife/.pi/agent/sessions/--home-cnife-personal_code-nmem-import-pi-sessions--/2026-06-10T08-14-51-428Z_019eb099-3623-72d3-9395-162524c967e5.jsonl` — import pi sessions into nmem
- `/home/cnife/.pi/agent/sessions/--home-cnife-personal_code-nmem-import-pi-sessions--/2026-06-10T09-19-09-610Z_019eb0d4-152a-785a-95b3-369ff729510a.jsonl` — nmem API testing
- `/home/cnife/.pi/agent/sessions/--home-cnife-personal_code-nmem-import-pi-sessions--/2026-06-11T03-14-54-006Z_019eb4ac-f3b6-7ded-b078-a808cfb8a2e0.jsonl` — import tool research
