# Pi Permission System: Configuration and Project Permissions

`pi-permission-system` provides granular security gating, policy enforcement, and permission prompts for tool calls, bash commands, file system access, and subagent escalations in Pi.

---

## 1. Global Configuration

Location:
`~/.pi/agent/extensions/pi-permission-system/config.json`

### Recommended baseline configuration:

```json
{
  "doublePressToConfirm": false,
  "permission": {
    "*": "ask",
    "AskUserQuestion": "allow",
    "ask_user_question": "allow",
    "memory_recall": "allow",
    "memory_remember": "allow",
    "memory_sessions": "allow",
    "memory_assess": "allow",
    "wiki_index": "allow",
    "wiki_recall": "allow",
    "read_agent_memory": "allow",
    "save_agent_memory": "allow",
    "inspect_run": "allow"
  }
}
```

---

## 2. Interactive TUI Prompt & Menu Options

When an operation requires approval (`ask`), an interactive prompt appears with the following choices:

- **`y` (Yes)**: Approve this invocation once.
- **`s` (Yes, for this session)**: Approve for the rest of the current session (kept in memory, cleared on exit).
- **`p` (Yes, always in this project)**: Approve permanently for the current workspace. Automatically creates or updates `<project>/.pi/extensions/pi-permission-system/config.json` with an `allow` rule for that surface or pattern.
- **`n` (No)**: Deny the request.
- **`r` (No, provide reason)**: Deny and provide structured feedback to the agent explaining why.

---

## 3. Why `AskUserQuestion` is Always Allowed

When an agent calls `AskUserQuestion`, its intent is to present an interactive UI question to the operator.
- **Without allow rule**: The permission system intercepts the call with a permission prompt: *"Allow agent to ask a question?"* before displaying the actual question.
- **With `"AskUserQuestion": "allow"`**: The interactive question dialog opens directly and smoothly.

---

## 4. Memory and Subagent Tools (Always Allowed)

The following tools are safe, local-only read/write operations against the LTM and agent control plane:

- **Memory & Wiki**: `memory_recall`, `memory_remember`, `memory_sessions`, `memory_assess`, `wiki_index`, `wiki_recall`.
- **Subagent Memory**: `read_agent_memory`, `save_agent_memory`.
- **Observability**: `inspect_run`.

Pre-approving these prevents agents from blocking on routine background context lookups.

---

## 5. Single-Press Confirmation (`doublePressToConfirm: false`)

- **Default Pi Behavior**: Required pressing hotkeys twice (e.g. `y` then `y` again to confirm).
- **Set to `false`**: A single keystroke (`y`, `s`, `p`, or `n`) commits the decision immediately.

---

## 6. Granular Pattern and Path Rules

Rules can be scoped down to specific paths, commands, or tools:

```json
{
  "permission": {
    "read": {
      "*": "allow",
      "*.env*": "deny",
      "~/.ssh/*": "deny"
    },
    "bash": {
      "git status": "allow",
      "git diff": "allow",
      "bun test *": "allow",
      "*": "ask"
    }
  }
}
```

Rules are evaluated top-to-bottom per surface (last matching rule takes precedence).
