# Cursor Runtime

## Purpose
The `cursor-runtime` package implements a specialized runtime, bridge, and session layer for integrating Pi with the Cursor IDE's backend agent services (`cursor-agent`). It provides full integration with Cursor's ConnectRPC API and manages authentication via OAuth, agent state, tool execution mapping between Pi and Cursor, and model configuration caching.

## Tools / commands / hooks provided
This package primarily operates in the background as a provider integration.
- **Provider Registration:** Registers a custom provider named `"cursor"` that exposes Cursor models and uses the `cursor-agent` API.
- **Hooks Listened To:**
  - `before_agent_start`, `agent_start`: Captures the current ExtensionContext.
  - `model_select`: Triggers an update of cached models if the selected model uses the `"cursor"` provider.
  - `session_start`, `session_switch`, `session_tree`: Manages branch-level state restoration and cleans up inactive session memories.
  - `tool_execution_end`: Bridged to intercept and resolve Pi tool execution results back to Cursor's agent execution loop via `resolveToolResult()`.
- **Background Processes:** Automatically fetches and caches available Cursor models in the background.

## Key files
- `src/index.ts`: The main entry point. Sets up the authentication layer, registers the `"cursor"` provider with Pi, initializes the state store, and listens to Pi lifecycle events to bridge session management and tool execution.
- `src/provider/stream.ts`: Implements the `streamCursorAgent` function, replacing Pi's default text generation stream with an asynchronous interaction loop over Cursor's streaming protocol.
- `src/api/ai-service.ts` / `src/api/agent-service.ts`: ConnectRPC wrappers for communicating with Cursor's AI and agent backend services.
- `src/bridge/cursor-to-pi/tool-bridge.ts`: Handles bridging Cursor-side tool executions into Pi-side tool results (the executor mappings live in `src/bridge/cursor-to-pi/executors/`).
- `src/bridge/pi-context/`: Contains logic to map Pi's context trees, rules, and system prompts into Cursor's `selected_context_pb` and `mcp_pb` protobuf formats.
- `src/lib/agent-store/`: Implements a persistent, disk-backed KV store used by Cursor agents for state tracking.

## How it works
When the `"cursor"` provider is active, the standard generation loop in Pi is bypassed. Instead, `streamCursorAgent` establishes a bidirectional stream with Cursor's `agentService`. 

It constructs the initial request by translating Pi's context and messages into Cursor's protobuf request format. Once the stream begins, Cursor's backend yields state updates (like step transitions and tool invocations). The extension implements an `AgentClient` (via `src/vendor/agent-client`) to manage this state machine.

When the Cursor agent requests a tool execution (such as reading a file or running a shell command), the local bridge maps the Cursor tool request into a Pi tool request. The runtime leverages Pi's `tool_execution_end` event to capture the result of the Pi tool and resolves the pending Cursor tool promise, thus feeding the output back into the Cursor agent's interaction loop until completion.

## Configuration
- **API and Auth Environment Variables:** (managed in `src/lib/env.ts`)
  - `CURSOR_API_URL`: Base URL for Cursor services.
  - `CURSOR_CLIENT_VERSION`: The client version string spoofed to the server.
  - `CURSOR_WEBSITE_URL`: URL used for OAuth flows.
- **OAuth:** Uses Pi's built-in OAuth flow configuration (`provider.oauth`) for handling login, token refresh, and token extraction.

## Dependencies
- **ConnectRPC / Protobuf:** 
  - `@bufbuild/protobuf`
  - `@connectrpc/connect`
  - `@connectrpc/connect-node`
- **Other utilities:** `yaml`
- **Peer Dependencies:** `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`
