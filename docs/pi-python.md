# pi-python

**Purpose:** Run Python commands and scripts directly from within pi.

## Tools, Commands, and Hooks

- **Tool:** `hyperpi_python` — Allows the agent to run Python code inline or execute a Python file, returning the trimmed output (stdout and stderr).
- **Command:** `/hyper-python <inline python code>` — Quick interactive runner for users to execute short Python snippets from the TUI input and see results via a UI notification.

## Key Files

- `index.ts`: The main entry point that re-exports the extension.
- `extensions/index.ts`: Core implementation, registering the `hyperpi_python` tool and `/hyper-python` slash command.
- `package.json`: Configures the extension entry point via `pi.extensions`.

## How it works

The package exposes Python execution capabilities to both the agent and the user. The `hyperpi_python` tool accepts an execution mode (`run` or `eval`), raw `code`, or a `file` path. 

When executing inline code in `run` mode, it uses `python3 -c <code>`. When evaluating complex scripts or handling the `eval` mode without a given file, it generates a temporary `.py` file in the system temp directory, writes the code there, and executes it via `pi.exec()`.

Both the tool and the slash command capture stdout and stderr, combining them and safely trimming the result using `@hyperprior/pi-shared`'s `trimOutput` utility to prevent massive logs from overwhelming the agent's context.

## Configuration

There are no global `settings.json` keys or environment variables required. The tool accepts optional parameters per invocation:
- `python`: The Python executable to use (defaults to `python3`).
- `timeout`: Execution timeout in milliseconds (defaults to 30,000ms).

## Dependencies

- **Runtime Dependency:** `@hyperprior/pi-shared` (used for output trimming).
- **Peer Dependencies:** `@mariozechner/pi-coding-agent`, `@mariozechner/pi-ai`, `@sinclair/typebox`. *(Note: Uses the `@mariozechner` scoped forks of pi).*
- Relies on Node.js built-ins (`node:fs`, `node:crypto`, `node:path`, `node:os`).
