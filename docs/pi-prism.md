# pi-prism

**Purpose:** Pi tools for Prism — hybrid full-text, vector, and graph search.

## Tools / commands / hooks provided

**Commands:**
- `/prism status` — profile and server health
- `/prism collections` — list collections on the server
- `/prism config` — show and edit remote profiles, with subcommands (`show`, `test`, `use`, `set url`, `set apiKey`, `set collection`, `set timeout`, `clear apiKey`, `profile upsert`)
- `/prism help` — show help

**Tools:**
- `prism_health`: Check Prism server health and basic server info at the configured base URL.
- `prism_collections`: List Prism collections available on the configured server.
- `prism_search`: Hybrid full-text/vector search in a Prism collection. Supports `merge_strategy`, `text_weight`, and `vector_weight`.
- `prism_get`: Get a single document by ID from a Prism collection.
- `prism_index`: Index one or more documents into a Prism collection.
- `prism_graph_stats`: Get node and edge counts for a Prism collection graph backend.
- `prism_graph_bfs`: Breadth-first traversal from a start node in a Prism graph collection.
- `prism_graph_path`: Find the shortest path between two nodes in a Prism graph collection.
- `prism_graph_edges`: List outgoing edges from a Prism graph node.

## Key files
- `src/index.ts` / `src/prism.ts`: Extension entry point, registers the `/prism` slash command and all `prism_*` tools.
- `src/config.ts`: Configuration loader and manager. Saves profiles and the active profile setting in `~/.pi/agent/pi-prism.json`. Parses interactive commands.
- `src/client.ts`: `PrismClient`, the HTTP client to interact with the Prism API endpoints.

## How it works
The extension registers tools and commands that proxy requests to a Prism search engine backend. It uses `PrismClient` to execute HTTP calls (`GET`, `POST`) against the configured Prism API endpoints (e.g., `/collections/:name/search`, `/collections/:name/graph/bfs`).

Configuration allows managing multiple profiles (e.g., `local` vs `remote`). The `/prism config` command provides an interactive UI in the TUI to switch profiles, test connections, and update connection details like `baseUrl`, `apiKey`, and `defaultCollection`. Environment variables can seamlessly override the active profile's settings on startup.

## Configuration
Configuration is saved in `~/.pi/agent/pi-prism.json` containing an `activeProfile` and a `profiles` object.
Each profile supports:
- `baseUrl`: The URL of the Prism server (default: `http://127.0.0.1:3080`).
- `timeoutMs`: HTTP request timeout (default: `30000`).
- `defaultCollection`: Collection to query if one isn't explicitly provided.
- `apiKey`: Optional authorization token.

**Environment Variable Overrides:**
- `PRISM_URL` or `PRISM_BASE_URL`
- `PRISM_COLLECTION`
- `PRISM_API_KEY`
- `PRISM_TIMEOUT_MS`

## Dependencies
- `typebox`: Used for validating tool parameters.
- No other notable runtime dependencies beyond core Pi packages (`@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`).
