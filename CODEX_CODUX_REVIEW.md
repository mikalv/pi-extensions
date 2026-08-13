# Comprehensive Technical Review: Codex & Codux

An architectural analysis and exploration of **OpenAI Codex CLI (`codex`)** and **Codux (`codux`)**, focusing on their hybrid Rust + TypeScript architectures, execution models, protocols, and applicability to the **Harness** ecosystem.

---

## Executive Summary

| Metric / Dimension | OpenAI Codex CLI (`codex`) | Codux (`codux`) |
| :--- | :--- | :--- |
| **Primary Language** | **Rust (100+ crates)** + TS shim | **Rust (crates)** + Flutter/Desktop apps |
| **Core Architecture** | Pure Rust native binary + npm distribution wrapper | Rust core engine + GPUI desktop / Flutter mobile apps |
| **TS & Rust Hybrid Model** | **TS-to-Rust Binary Delegate**: npm `codex.js` detects platform triple and spawns `codex` native binary | **FFI & JSON-RPC / Protocol**: `codux-protocol-ffi` (C ABI), `codux-remote-transport`, `codux-runtime-core` |
| **Build System** | **Bazel + Cargo + pnpm + nix** | **Cargo + Just + Flutter** |
| **Agent / Protocol** | App-Server protocol (JSON-RPC), MCP server integration, Sandboxing | Custom Rust protocol (`codux-protocol`), Live runtime sessions, Kilo agents/skills |

---

## Part 1: OpenAI Codex CLI (`codex`) Deep Dive

### 1. The Rust & TypeScript Hybrid Architecture

Despite having a `codex-cli` folder with TypeScript files, **Codex CLI is a pure Rust engine wrapped in an npm delivery mechanism**.

#### A. The TS Entry Point (`codex-cli/bin/codex.js`)
* **Role**: Lightweight platform launcher & process supervisor.
* **Mechanism**:
  1. Detects OS (`darwin`, `linux`, `win32`) and CPU architecture (`x64`, `arm64`).
  2. Maps platform to target triples (`x86_64-apple-darwin`, `aarch64-unknown-linux-musl`, etc.).
  3. Resolves optional platform-specific npm packages (`@openai/codex-darwin-arm64`, etc.) which ship pre-compiled Rust binaries in `vendor/<target>/bin/codex`.
  4. Asynchronously spawns the native Rust binary with `stdio: 'inherit'`.
  5. **Signal Forwarding**: Forwards `SIGINT`, `SIGTERM`, `SIGHUP` down to the Rust child process to ensure clean graceful shutdown without zombie processes.

#### B. The Rust Engine (`codex-rs`)
`codex-rs` is a large workspace consisting of over **100 modular Rust crates**:
* **`codex-core`**: Agent execution loop, prompt assembly (`gpt_5_2_prompt.md`, `gpt_5_1_prompt.md`), tool calling, context management, patch applying (`apply-patch`).
* **`codex-app-server` / `app-server-protocol`**: Headless server daemon providing JSON-RPC interfaces over Unix Domain Sockets (UDS), WebSockets, or stdio.
* **`codex-sandboxing` / `bwrap` / `linux-sandbox` / `windows-sandbox-rs`**: OS-level isolation (Bubblewrap on Linux, Seatbelt on macOS, Job Objects on Windows).
* **`codex-mcp` / `rmcp-client`**: Model Context Protocol client/server integration for tool discovery and execution.
* **`codex-tui`**: Terminal user interface implemented natively in Rust (using `ratatui` / `crossterm`).
* **`codex-exec-server`**: Remote and containerized execution server for untrusted code execution.

---

## Part 2: Codux (`codux`) Deep Dive

### 1. Architecture Overview
Codux describes itself as a **high-performance AI coding terminal** built with **Rust + GPUI**.
It unifies Codex, Claude Code, and 9+ AI coding CLIs with live agent status, token analytics, local memory, and credential-isolated SSH/DB access.

#### Core Crates (`crates/`):
* **`codux-runtime-core`**: Core runtime for managing AI agents and execution loops.
* **`codux-runtime-live`**: Live agent status monitoring and session lifecycle.
* **`codux-protocol` & `codux-protocol-ffi`**: Rust protocol definition + C-FFI export for cross-language integration (e.g. Flutter/Dart or WebAssembly).
* **`codux-remote-transport`**: Encrypted device linking for remote session takeover (mobile/desktop sync).
* **`codux-terminal-pty` / `codux-terminal-core`**: High-performance PTY terminal handling in Rust.
* **`codux-ai-sessions` / `codux-ai-history` / `codux-memory`**: Session persistence, historical analysis, and local LTM.

#### Applications (`apps/`):
* **`apps/desktop`**: Native desktop UI built with Rust and **GPUI** (Zed's UI framework).
* **`apps/agent`**: Standalone daemon for background/remote execution.
* **`apps/mobile`**: Cross-platform mobile app (Flutter/Dart) communicating via `codux-remote-transport` and `codux-protocol-ffi`.
* **`.kilo` directory**: Built-in agent configurations (`architect.md`, `code-reviewer.md`, `code-skeptic.md`, `frontend-specialist.md`) and skills (Prometheus, secrets management, ESQL, etc.).

---

## Part 3: Comparative Analysis & Key Takeaways for Harness

### 1. Hybrid Architecture Trade-offs
* **OpenAI Codex Pattern**:
  * **Pattern**: Native Rust core compiled to platform-specific binaries, distributed via `npm` packages with a thin JS wrapper.
  * **Advantage**: Fast execution, native sandboxing, zero Node.js runtime overhead during LLM loops/tool execution, trivial global install via `npm install -g @openai/codex`.
  * **Relevance to Harness**: Excellent blueprint for distributing compiled Rust/Elixir runtimes via npm/bun while keeping heavy execution in native binaries.

* **Codux Pattern**:
  * **Pattern**: Native Rust core with GPUI for desktop performance, FFI bindings (`codux-protocol-ffi`) for mobile (Flutter), and remote transport for cross-device control.
  * **Advantage**: Ultra-fast UI rendering (GPUI), cross-device sync (mobile controlling desktop sessions), local credential isolation.
  * **Relevance to Harness**: Provides patterns for multi-client (Desktop TUI/GUI + Mobile + Headless daemon) control plane interactions over unified transport protocols.

### 2. Protocol & Communication Model
* Both projects prioritize **headless server / daemon models** (`app-server` in Codex, `apps/agent` + `codux-remote-transport` in Codux).
* They use structured RPC over stdio/UDS/WebSockets to decouple the execution runtime from UI surfaces (TUI, GUI, Mobile).

---

## Conclusion & Recommendations for Harness

1. **Adopt Binary Packaging / Launcher Pattern**: Like `codex.js`, Harness can package native runtimes (Elixir releases or Rust binaries) into npm packages with cross-platform launcher scripts that forward signals cleanly (`SIGINT`, `SIGTERM`).
2. **Decouple Engine from UI**: Implement execution runtimes as headless JSON-RPC servers (UDS/stdio) so TUI, Web, or Elixir Control Planes can attach/detach seamlessly.
3. **Structured Agent Definitions**: Both tools rely on standard markdown/YAML frontmatter specifications for subagents and skills (`.kilo/agents` in Codux, `prompt_*.md` in Codex).
