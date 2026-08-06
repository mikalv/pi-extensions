# @cnife/pi-execute-python

**Execute Python code in a persistent kernel with streaming output and dependency management.**

## Tools / commands / hooks provided
- **Tools**: `executePython` (Executes python code in a persistent kernel, with support for auto-installing packages).
- **Events**: Listens to the `session_shutdown` event to gracefully clean up the running Python kernel subprocess.

## Key files
- `extensions/execute-python.ts`: The entry file. Registers the `executePython` tool, defines tool execution logic, formats real-time TUI updates (`renderCall` and `renderResult`), and handles kernel cleanup on session shutdown.
- `kernel.ts`: The core state machine and lifecycle manager for the Python subprocess. Implements the NDJSON-over-stdio protocol to communicate with the subprocess and manages fingerprint-based restarts (accumulating dependencies).
- `runner.py`: The internal Python script executed within the persistent `uv run` subprocess. It runs the provided code snippets and streams back execution state, stdout/stderr, and variables via NDJSON.

## How it works
The extension registers an `executePython` tool that provides a persistent Python kernel. Instead of running Python anew for each command, a single `uv run`-driven background subprocess is spawned per session. This allows Python variables, imports, and installed packages to survive across multiple tool calls without losing context.

The extension relies on an NDJSON protocol over `stdio` to communicate with `runner.py`, receiving real-time `stdout`, `stderr`, and variable updates, which are streamed back to the user via the agent's UI (`onUpdate`). 

The kernel uses an "accumulation model" for dependencies. When the tool is called with a `packages` array, it checks if the dependencies are already present. If new packages are requested, the extension automatically restarts the kernel with a union of the existing and new dependencies. Passing `reset: true` clears the accumulated state and restarts the kernel fresh.

## Configuration
There are no global settings in `settings.json` or specific environment variables. Execution behaviors are controlled via the `executePython` tool parameters:
- `python_version` (e.g., `'3.12'`)
- `python_executable` (e.g., `'/usr/bin/python3.12'`)
- `packages` (array of pip requirements)
- `timeout`
- `reset` (boolean)

## Dependencies
- **System**: Requires `uv` to be installed on the host machine to handle Python environments and package installation.
- **Peer dependencies**: `@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`, `@earendil-works/pi-tui`.
