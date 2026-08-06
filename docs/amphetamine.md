# mm-amphetamine (Caffeinate)

Prevents macOS and Linux from sleeping while the pi agent is actively working.

## Tools / commands / hooks provided
- Subscribes to `agent_start` to spawn a platform-native sleep inhibitor process.
- Subscribes to `agent_end` and `session_shutdown` to kill the sleep inhibitor.
- Emits `pi-status:register` and `pi-status:update` events to show a coffee cup icon (☕) in the status bar while the inhibitor is active.
- Mutates TUI status directly via `ctx.ui.setStatus('caffeinate', ...)`.

## Key files
- `packages/amphetamine/src/index.ts` — The main and only entry point.

## How it works
On `agent_start`, the extension checks the operating system platform using `node:os`. 
If on macOS, it spawns `caffeinate -i -w <pid>` so that the system won't sleep, and if pi crashes, macOS auto-cleans it up based on the process ID watcher.
If on Linux, it spawns `systemd-inhibit --what=idle ... sleep infinity`.
The OS naturally deduplicates multiple sleep inhibition requests, so concurrent pi sessions will not cause overhead.
When `agent_end` or `session_shutdown` fires, the inhibitor process is killed.
While active, it registers a `caffeinate` status item showing a "☕" icon (using warning theme color) via `ctx.ui.setStatus` and emits status events for the `pi-status-hub`.

## Configuration
No configuration keys or environment variables are required. It operates automatically based on the host OS.

## Dependencies
- Node built-ins: `node:child_process` (spawn), `node:os` (platform).
- No external runtime dependencies.
- Peer dependencies: `@earendil-works/pi-coding-agent`.
