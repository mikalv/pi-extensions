# kb

AI-orchestrated task board. Like Trello, but your tasks get automatically specified, executed, and delivered by AI — powered by `pi`.

## Tools / commands / hooks provided

- **Pi Tools:** `kb_task_create`, `kb_task_list`, `kb_task_show`, `kb_task_attach`, `kb_task_pause`, `kb_task_unpause`
- **Pi Slash Commands:** `/kb [port]` (start dashboard/engine), `/kb stop`, `/kb status`
- **CLI Commands:** `kb dashboard`, `kb task create`, `kb task list`, `kb task show`, `kb task move`, `kb task merge`

## Key files

- `packages/kb/packages/cli/src/extension.ts` — Entry point for the Pi extension.
- `packages/kb/packages/cli/src/bin.ts` — CLI entry point.
- `packages/kb/packages/core/src/store.ts` — File-based task storage logic.
- `packages/kb/packages/engine/src/index.ts` — AI engine orchestration (Triage, Scheduler, Executor).
- `packages/kb/packages/dashboard/src/server.ts` — Express server and SSE logic for the kanban board.

## How it works

The system is a local workspace monorepo that combines task management with AI automation. Tasks are persisted to the filesystem in `.kb/tasks/<ID>/`, containing `task.json` (metadata), `PROMPT.md` (specification), and an `attachments/` folder.

Running `/kb` or `kb dashboard` starts a real-time web UI on `localhost:4040` (synced via Server-Sent Events) alongside the background AI Engine. The AI Engine operates through three parallel components:
1. **TriageProcessor:** Watches the `triage` column. It spawns a pi agent to read the project context and convert rough ideas into a full `PROMPT.md` specification, moving the task to `todo`.
2. **Scheduler:** Resolves dependency graphs, enforces concurrency limits (default: 2), groups overlapping files to prevent merge conflicts, and promotes tasks to `in-progress`.
3. **TaskExecutor:** Watches `in-progress` tasks. It creates a temporary Git worktree for the task, spawns a scoped pi agent session to implement the changes without disrupting the main working tree, and moves the task to `in-review` when done.

## Configuration

- **State File:** `.kb/config.json` stores board configuration and the ID sequence counter.
- **Environment Variables:** `KB_CLIENT_DIR` can be used to override the compiled dashboard asset path for the standalone binary. Uses `~/.pi/agent/auth.json` (or `ANTHROPIC_API_KEY`) for AI authentication.
- **Dashboard Port:** Configurable via `/kb <port>` or `kb dashboard --port <port>` (default 4040).

## Dependencies

- **Peer dependencies:** `@mariozechner/pi-coding-agent`, `@mariozechner/pi-ai`, `@sinclair/typebox`
- **Runtime:** `express` and `multer` for the local dashboard server.
- **Internal:** `@kb/core`, `@kb/dashboard`, `@kb/engine` monorepo workspace packages.
