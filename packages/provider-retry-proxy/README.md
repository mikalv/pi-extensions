# Provider Retry Proxy

An [OMP](https://omp.sh)/[Pi](https://pi.dev) extension that runs a local HTTP retry proxy for LLM provider requests, with configurable per-provider triangular backoff and infinite retry support.

Designed for scenarios where model provider resources are scarce and frequently return `503`/`429`/`529` errors — the proxy aggressively retries with a short, capped delay to seize the provider's available capacity window.

## How it works

```
OMP agent ──→ 127.0.0.1:7878/<provider>/<path> ──→ Retry Proxy ──→ upstream provider API
                    │
                    ├─ Transparent passthrough (SSE streaming, headers, body)
                    ├─ Triangular backoff retry on 429/502/503/504/529
                    ├─ Network error retry (ETIMEDOUT, ECONNRESET, terminated, ...)
                    ├─ Permanent error exclusion (daily/monthly quota, billing, context-length)
                    └─ Infinite retry mode (maxAttempts: -1, 30-min elapsed guard)
```

The proxy runs **in-process** within one OMP session, shared by all concurrent sessions:

- Multiple concurrent OMP sessions share the same proxy instance (first session to start owns it).
- When the owning session exits, other sessions detect the proxy is gone via `turn_start` and restart it in-process — no timing gap.
- A 2s background health probe also catches proxy death while a session is idle.
- No external runtime dependency; the proxy lives inside the OMP process.

## Triangular backoff

The delay formula (ported from [GCMP](https://github.com/VicBilibily/GCMP), MIT):

```
delay = min(initialDelayMs * triangular(n), maxDelayMs)
where triangular(n) = n * (n + 1) / 2
```

With `initialDelayMs: 20, maxDelayMs: 50`:

| Attempt | Calculation | Delay |
|---------|-------------|-------|
| 1 | 20 * 1 | 20ms |
| 2 | 20 * 3 = 60 -> cap | 50ms |
| 3 | 20 * 6 = 120 -> cap | 50ms |
| 4+ | -> cap | 50ms |

From the 2nd retry onward, the delay is a constant 50ms — fast enough to seize a capacity window without hammering.

## Error classification

The proxy retries the following error types:

| Category | Signals |
|----------|---------|
| Rate limit | HTTP 429/529, `rate_limit_exceeded`, `too_many_requests`, `quota_exceeded`, `resource_exhausted`, `throttled` |
| Server error | HTTP 502/503/504, `EngineInternalError`, "service unavailable", "system is busy" |
| Network error | `terminated`, `ETIMEDOUT`, `ECONNRESET`, `ECONNREFUSED`, `fetch failed`, `socket hang up`, `EOF` |

**Permanent errors are excluded** even if they carry a 429 status code:

- Daily/monthly quota exhaustion ("per day", "daily quota")
- Billing/plan issues ("billing", "upgrade your plan")
- Context length exceeded ("context length", "prompt too long")

## Installation

### Via `omp plugin link` (local development)

```bash
cd /path/to/provider_retry_proxy
bun build src/index.ts --outdir dist --target bun
bun build src/proxy.ts --outdir dist --target bun
omp plugin link .
```

### Via npm (when published)

```bash
pi install npm:provider-retry-proxy
```

## Configuration

### 1. Proxy config — `~/.omp/agent/retry-proxy.json`

Copy `retry-proxy.example.jsonc` to `~/.omp/agent/retry-proxy.json` and fill in your provider's upstream URL:

```bash
cp retry-proxy.example.jsonc ~/.omp/agent/retry-proxy.json
```

### 2. OMP models config — `~/.omp/agent/models.yml`

Change the provider's `baseUrl` to point at the proxy, prefixing the path with the provider key:

```yaml
providers:
  xfyun-anthropic:
    baseUrl: http://127.0.0.1:7878/xfyun   # was: https://your-provider-host/path
    # ... all other fields unchanged
```

### 3. OMP retry config — `~/.omp/agent/config.yml`

Keep OMP's built-in retry enabled as a fallback for mid-stream disconnects (the proxy can only retry before streaming begins):

```yaml
retry:
  enabled: true       # Fallback for stream-mid-disconnect errors
  maxRetries: 3       # Proxy handles most 503s; OMP only catches stream breaks
  baseDelayMs: 1000   # Stream-break retry needs full re-send, slower is fine
  maxDelayMs: 0       # Disable OMP's hard-fail cap (0 = no cap)
```

## How retry layers interact

```
Request flow:
  OMP -> Proxy (fast retry: 50ms, handles 503/429/529/network)
           | (2xx Response obtained)
        Upstream (SSE streaming begins)
           | (if stream breaks mid-way)
        OMP retry (slow fallback: 1s, re-sends full conversation)
```

| Error scenario | Handled by | Why |
|----------------|-----------|-----|
| Provider returns 503/429/529 | Proxy (50ms) | Fast retry before OMP even sees an error |
| Network timeout / connection refused | Proxy (50ms) | Same |
| 200 OK, then SSE stream breaks | OMP retry (1s) | Proxy cannot retry mid-stream without duplicating tokens |
| Daily/monthly quota exhausted | Neither | Permanent error, classified and excluded from retry |

## Standalone usage

The proxy can run independently without OMP:

```bash
RETRY_PROXY_CONFIG=~/.omp/agent/retry-proxy.json bun run dist/proxy.js
```

## Acknowledgements

The retry classification logic (`retryClassifier.ts`) and triangular backoff retry manager (`retryManager.ts`) are ported from **[GCMP](https://github.com/VicBilibily/GCMP)** by [VicBilibily](https://github.com/VicBilibily), licensed under the MIT License. See the file headers and `LICENSE` file for the full MIT notice.

## License

MIT
