# pi-prism — Prism search for Pi

Pi tools and `/prism` command for [Prism](https://github.com/mikalv/prism): hybrid full-text, vector, and graph search (Elasticsearch replacement).

Default server: `http://127.0.0.1:3080`

Long-term memory semantics (remember/recall) live in [`mm-memory`](../mm-memory); this package is transport only.

## Install

Loaded automatically when this repository is installed as the parent Pi package. For a temporary session:

```bash
pi -e ./packages/pi-prism
```

## Config

Config file: `~/.pi/agent/pi-prism.json` (profiles + active profile).

```json
{
  "activeProfile": "local",
  "profiles": {
    "local": {
      "baseUrl": "http://127.0.0.1:3080",
      "defaultCollection": "code",
      "timeoutMs": 30000
    },
    "remote": {
      "baseUrl": "https://prism.example.com",
      "apiKey": "optional-token",
      "defaultCollection": "ltm-memories",
      "timeoutMs": 30000
    }
  }
}
```

Legacy flat files (`baseUrl` / `apiKey` at the top level) are migrated into the `local` profile on read.

### Precedence

1. Environment (`PRISM_URL`, `PRISM_API_KEY`, …)
2. Active profile in `~/.pi/agent/pi-prism.json`
3. Defaults (`http://127.0.0.1:3080`, profile `local`)

| Variable | Purpose |
| --- | --- |
| `PRISM_URL` / `PRISM_BASE_URL` | Server base URL |
| `PRISM_COLLECTION` | Default collection |
| `PRISM_TIMEOUT_MS` | Request timeout |
| `PRISM_API_KEY` | Bearer token when auth is enabled |

Saving writes the file atomically with mode `0600` when an API key is present.

### Interactive / CLI config

```bash
/prism config                          # TUI menu (or show summary)
/prism config set url https://prism.example.com
/prism config set apiKey <token>
/prism config set collection ltm-memories
/prism config use remote
/prism config profile upsert staging
/prism config test
/prism config clear apiKey
```

Remote example:

```bash
/prism config set url https://prism.home.example
/prism config set apiKey "$PRISM_TOKEN"
/prism config use remote
/prism status
```

## Commands

| Command | Description |
| --- | --- |
| `/prism` / `/prism status` | Active profile, URL, collection, health |
| `/prism collections` | List collections |
| `/prism config …` | Show/edit profiles |
| `/prism help` | Short help |

## Tools

| Tool | Description |
| --- | --- |
| `prism_health` | Health + server info |
| `prism_collections` | List collections |
| `prism_search` | Collection search (or `all_collections`) |
| `prism_get` | Fetch document by id |
| `prism_index` | Index documents |
| `prism_graph_stats` | Graph node/edge counts |
| `prism_graph_bfs` | BFS traversal |
| `prism_graph_path` | Shortest path |
| `prism_graph_edges` | Outgoing edges from a node |

## License

MIT
