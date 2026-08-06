# Provider Retry Proxy

**Purpose**: Configurable HTTP retry proxy for LLM providers with triangular backoff, infinite retry, and per-provider overrides. It acts as a local proxy server that intercepts LLM API requests and automatically retries them on network errors, rate limits (429/529), or temporary server errors (502/503/504), while immediately failing on permanent errors (e.g., quota exceeded).

## Tools / commands / hooks provided
- **Hooks**: 
  - `session_start`: Ensures the local proxy server is running.
  - `before_provider_request`: Checks health and spins up the proxy server if it is not already running.
  - `session_shutdown`: Stops the proxy server if this session spawned it.

## Key files
- `src/index.ts` (Entry point): Sets up the Pi extension hooks (`session_start`, `before_provider_request`, `session_shutdown`) and manages the lifecycle of the proxy server.
- `src/proxy.ts`: Contains the local HTTP proxy server implementation, request handling/forwarding, and JSON config reloading.
- `src/retryManager.ts`: Implements the exponential/triangular backoff logic and handles the retry execution loop.
- `src/retryClassifier.ts`: Contains heuristics and pattern matching to classify HTTP errors as network, server, rate limit, or permanent (e.g., quota, billing).

## How it works
The extension registers itself to Pi's lifecycle events. When a session starts or right before a provider request is made, it ensures a local Node.js HTTP server is running (usually on `127.0.0.1:7878`). 

When AI requests are configured to point to this proxy, the proxy intercepts the request, looks up the target upstream URL from its configuration, and forwards it. If a network error, a 5xx server error, or a 429/529 rate limit error is encountered, the `RetryManager` intercepts the failure. It uses a backoff delay strategy to retry the request up to the configured `maxAttempts` (or infinitely if set to `-1`). 

The `retryClassifier` actively scans error messages and codes for permanent failure signals (like "monthly quota", "billing", "context length"). If a permanent error is detected, the retry loop aborts immediately to prevent wasting time and API calls. The proxy server is gracefully shut down when the Pi session ends, provided it was the one that spawned it.

## Configuration
Configuration is loaded from a JSON file. The extension looks for the config file in the following order:
1. Environment variable `RETRY_PROXY_CONFIG`
2. `~/.omp/agent/retry-proxy.json`
3. `./retry-proxy.json` (current working directory)

**Example JSON structure**:
```json
{
  "listen": {
    "host": "127.0.0.1",
    "port": 7878
  },
  "targets": {
    "openai": {
      "upstream": "https://api.openai.com",
      "retry": {
        "enabled": true,
        "maxAttempts": 5,
        "initialDelayMs": 1000,
        "maxDelayMs": 10000
      }
    }
  }
}
```

## Dependencies
- **Runtime dependencies**: None (uses native Node.js/Bun modules like `http`, `fs`, `path`).
- **Peer dependencies**: `@earendil-works/pi-coding-agent` (for extension hooks).
