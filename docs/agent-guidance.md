# agent-guidance

**Title and purpose:** Loads provider-specific context files (e.g., `CLAUDE.md`, `CODEX.md`, `GEMINI.md`) based on the current model provider, supplementing Pi Core's standard `AGENTS.md` context loading.

## Tools / commands / hooks provided
- **Hooks:** Subscribes to the `before_agent_start` event.

## Key files
- `agent-guidance.ts` (Main entry point)
- `package.json`

## How it works
The extension listens to the `before_agent_start` event to inject provider-specific context into the AI's system prompt. It identifies the active model's provider and ID, then searches for matching guidance files (`CLAUDE.md`, `CODEX.md`, `GEMINI.md`, etc.).

It searches in the global agent directory (`~/.pi/agent`) and traverses up from the current working directory (`cwd`) to the file system root. To avoid redundantly passing the same information to the model, it implements deduplication logic: it skips loading files that Pi Core already loads implicitly (like a fallback `CLAUDE.md` or `AGENTS.md`) and skips files that have identical content to `AGENTS.md`. The loaded contents are ultimately appended to the system prompt.

## Configuration
It optionally reads from `~/.pi/agent/agent-guidance.json`. The configuration allows overriding the file targets:
- `providers`: Record mapping a provider name to an array of file names (e.g., `{"anthropic": ["CLAUDE.md"]}`).
- `models`: Record mapping a model glob pattern to an array of file names. Model-specific configurations take precedence over provider-level configurations.

## Dependencies
- `@earendil-works/pi-coding-agent` (Peer dependency)
- Standard Node.js `fs` and `path` modules.