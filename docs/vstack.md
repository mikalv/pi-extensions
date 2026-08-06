# vstack

Cross-harness package manager for AI coding tools. Author skills, agents, and hooks once and install them into Claude Code, Cursor, OpenCode, Codex, or Pi from one CLI.

## Tools / commands / hooks provided
- **CLI Commands**:
  - `vstack add <repo>`: Interactive TUI installer for fetching skills/agents from a source repository.
  - `vstack refresh`: Re-applies project configuration and updates generated files.
  - `vstack apply`: Installs optional non-agent packages (extras) like themes (e.g., Ghostty/VSCodium themes).
  - Also includes `verify`, `report`, `update`, `update_pi`, `list`, `remove`, `check`.
- **TUI Features**: Native Rust interface (Ratatui) for browsing, installing, applying theme extras, and managing packages.

## Key files
- `packages/vstack/cli/Cargo.toml`: Package configuration for the Rust CLI.
- `packages/vstack/cli/src/main.rs`: Entry point for the CLI.
- `packages/vstack/cli/src/commands/`: Implementation of CLI subcommands (add, refresh, apply, etc.).
- `packages/vstack/cli/src/tui/`: Ratatui-based TUI implementation (install flow, summary, multiselect, etc.).
- `packages/vstack/cli/src/harness/`: Harness adapters for writing config files correctly across different tools (Claude, Cursor, OpenCode, Codex, Pi).
- `packages/vstack/vstack.settings.toml`: Source repo configuration file layout definition.

## How it works
`vstack` uses a source repository as a package registry. It scans for agents (`agents/`), skills (`skills/`), hooks (`hooks/`), Pi extensions (`pi-extensions/`), and extras (`extras/`). When a user runs `vstack add`, the CLI pulls these artifacts, launches an interactive TUI to let the user select what to install, and translates those packages into the specific format required by the target AI harness (e.g., writing `.claude/agents/*.md` for Claude Code or `pi.extensions` for Pi).

Configuration is highly persistent and overrideable. Users maintain a `vstack.toml` at their project root containing frontmatter overrides (`[agent-frontmatter.<harness>]`), skill assignments, and custom instructions. When running `vstack refresh`, the tool reapplies these overrides without overwriting the user's manual edits inside the source configurations. It supports features like skill dependencies (installing them together) and allows switching between different AI toolsets seamlessly. 

For Pi specifically, it can natively link Pi extensions, ensuring `dependencies` are installed cleanly via npm directly in the Pi scope, and supports native hooks (pre-commit, lint, etc.).

## Configuration
- `vstack.toml` (Project Configuration):
  - `project-skills-dir`: Directory for project-specific skills.
  - `[agent-skills]`: Map of agents to the skills they require.
  - `[agent-launch-instructions]` / `[agent-additional-instructions]`: Prepended and appended instructions for agents.
  - `[skill-instructions]`: Specific prompt blocks added to a skill's `SKILL.md`.
  - `[agent-frontmatter.<harness>]`: Harness-specific overrides (e.g., `model`, `deny-tools`, `mode`, `allowed-subagents`, `color`).

## Dependencies
This is a Rust binary package compiled with Cargo.
- **Runtime**: None (distributed as a compiled binary).
- **Build/Rust Dependencies** (from `Cargo.toml`):
  - `ratatui` / `crossterm` (Terminal UI)
  - `clap` (CLI argument parsing)
  - `serde`, `serde_yaml`, `serde_json`, `toml` (Configuration parsing)
  - `regex-lite` (Lightweight text manipulation)
  - `walkdir`, `zip`, `dirs` (File system operations)
  - `anyhow`, `thiserror` (Error handling)