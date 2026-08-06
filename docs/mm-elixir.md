# mm-elixir

**Title/purpose:**
`mm-elixir` (often referred to as `pi-elixir`) is the pi extension for BEAM-native, verifiable Elixir development. It provides an isolated BEAM control plane along with explicit project, application, and attached-runtime evaluation modes. This allows the AI agent to inspect runtime state, make syntax-aware Elixir edits, and verify changes via actual project checks.

**Tools / commands / hooks provided:**
- **Tools:**
  - `elixir_eval`: Trusted code evaluation in `project` (default), `application`, attached `runtime`, or isolated `bridge` mode. Stateful by default, supporting IEx-like cells.
  - `elixir_ast_search`: Performs ExAST structural searches over Elixir code instead of plain regex.
  - `elixir_ast_replace`: Performs ExAST structural rewrites with dry-run diffing.
- **Commands:**
  - `/elixir:status`: Displays bridge and runtime connection status.
  - `/elixir:doctor`: Provides full diagnostics for setup issues.
  - `/elixir:restart`: Restarts the bridge process.
  - `/elixir:dogfood`: Switches the installation to the local checkout.
- **Hooks/Concepts:**
  - Supports sidecar snapshots for stateful evaluations.
  - Registers model-facing tools.
  - Integration with BEAM sessions, UI events, and UI rendering hooks.

**Key files:**
- `packages/extension/src/index.ts`: The main entry point for the pi extension which integrates the commands, tools, and BEAM interactions.
- `packages/extension/src/tools/eval.ts`: Contains the implementation for the `elixir_eval` tool.
- `packages/extension/src/tools/ast.ts`: Implements `elixir_ast_search` and `elixir_ast_replace`.
- `packages/extension/src/renderers/`: Contains logic for rendering AST, eval results, and other BEAM output contexts into pi's UI format.
- `packages/bridge/lib/pi.ex` (and the `packages/bridge/` tree): The Elixir backend providing the control bridge (evaluating code, bridging Pi features).

**How it works:**
The extension runs a bundled embedded standard I/O (stdio) control bridge from `packages/bridge` in an isolated VM to avoid polluting the target project's namespace. Through this connection, `mm-elixir` provides three core tools. It defaults to evaluating Elixir code with `elixir_eval` in a persistent VM preserving state (bindings, aliases) like an IEx session, storing snapshots as sidecars (`.term` files) next to the conversation logs rather than bloating the main JSONL transcript.

For code querying and manipulation, instead of string operations, `mm-elixir` exposes `elixir_ast_search` and `elixir_ast_replace` that execute ExAST operations on the Elixir side. This gives agents a structural, valid Elixir AST understanding of the codebase.

The model tools call into pi's internal routing, invoking the connected Elixir node which handles execution safely (either directly in a sandbox or via application startup) and returns structured payload results. These results are then mapped into rich representations by the `renderers/` directory.

**Configuration:**
Several environmental escape hatches control features:
- `PI_ELIXIR_STATEFUL_EVAL` (default `1`): Toggle stateful evaluation.
- `PI_ELIXIR_EVAL_SIDECAR` (default `1`): Toggle evaluation sidecar snapshots.
- `PI_ELIXIR_LLM` (default `1`): Toggle BEAM LLM capabilities.
- `PI_ELIXIR_SESSION` (default `1`): Toggle BEAM sessions, widgets, and control.
- `PI_MCP_URL`: Optional manually exposed HTTP MCP endpoint URL.
- `PI_DISABLE_EMBEDDED`: Disables embedded stdio fallback.
- `PI_ELIXIR_NODE`: Specify an attached distributed runtime node.

**Dependencies:**
- `@earendil-works/pi-coding-agent` (peer dependency)
- Standard Node built-ins for spawned processes.
- For the bridge backend: Elixir and Mix are required to run the `pi_bridge` processes. (Often tested with dependencies from Hex, including `ex_ast`).