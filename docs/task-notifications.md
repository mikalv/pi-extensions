# Task Notifications (`pi-task-notifications`)

The `pi-task-notifications` package implements a structured result protocol for subagent runs. It maps the results, statuses, and usage statistics of delegated tasks into a standardized format. It is a direct port of the Claude Code `coordinatorMode.ts` `<task-notification>` XML concept.

## What it does

When operating in a multi-agent environment, coordinator agents need to parse the results of child subagents reliably, and developers need to audit the cost and performance of the cluster. This package provides:
1. **XML Protocol Formatting:** Transforms subagent results into `<task-notification>` XML blocks, ensuring reliable parsing by coordinator LLMs.
2. **Audit Logging:** Writes JSONL audit records for every run, making historical cluster activity queryable and replayable.

## Tools & APIs

### The `inspect_run` tool
Exposed to the agent, this tool allows for self-reflection and coordinator oversight of recent subagent activity.
- **Parameters:**
  - `limit` (integer, optional): Maximum runs to return (defaults to 10).
  - `xml` (boolean, optional): If true, returns `<task-notification>` XML blocks. Otherwise, returns a human-readable summary.
  - `session_id` (string, optional): Specific session to inspect. Defaults to the current session.

### Internal APIs (TypeScript)
For integration with task runners (like Fleet):
- `toRunRecord(runId, singleResult, startedAt)`: Maps raw runner output to a normalized `RunRecord`.
- `appendRunAudit(record)`: Appends the `RunRecord` to the JSONL audit log.
- `formatTaskNotification(record)`: Formats the `RunRecord` into the XML protocol.
- `readRecentRuns(limit, sessionId)`: Parses the JSONL audit log and returns recent runs.

## Path Conventions

Audit logs are stored on a per-session basis to group related multi-agent activity.

- **Location:** `~/.pi/agent/subagent-history/<sessionId>.jsonl`
- **Session ID:** Resolved via the `PI_SESSION_ID` or `PI_SESSION_FILE` environment variables. If neither is available, falls back to `pid-<process.pid>`.

## Usage Example

### Programmatic Integration
When a subagent completes a task, the runner logs the execution:
```typescript
import { toRunRecord, appendRunAudit } from "pi-task-notifications";

const record = toRunRecord("run-123", fleetResult, startTime);
appendRunAudit(record);
```

### Coordinator Agent querying `inspect_run`
A coordinator agent needing to review what its child workers just accomplished can call:
```json
{
  "limit": 2,
  "xml": true
}
```

**Output:**
```xml
<task-notification>
  <task-id>run-123</task-id>
  <status>completed</status>
  <summary>Agent "worker" completed</summary>
  <agent>worker</agent>
  <model>claude-3-5-sonnet-20241022</model>
  <stop_reason>end_turn</stop_reason>
  <result>The database schema has been migrated successfully.</result>
  <usage>
    <total_tokens>1542</total_tokens>
    <input_tokens>1024</input_tokens>
    <output_tokens>518</output_tokens>
    <cost_usd>0.010530</cost_usd>
    <tool_uses>3</tool_uses>
    <turns>4</turns>
    <duration_ms>12500</duration_ms>
  </usage>
</task-notification>
```

## Multi-Agent Cluster Observability

This package is a core pillar for **Cluster Observability**:
- **For the LLM (Coordinator):** The XML formatting guarantees that a parent agent can safely consume the exact status, failure reasons, and textual results of parallel asynchronous workers without context pollution or hallucination.
- **For the Human / System:** The JSONL audit log (`appendRunAudit`) serves as a durable ledger of cluster costs. Developers can track `costUsd`, `totalTokens`, and `durationMs` across hundreds of parallel agent invocations, answering questions like *"How much did that massive parallel refactoring cost?"* or *"Which subagent type is timing out the most?"*
