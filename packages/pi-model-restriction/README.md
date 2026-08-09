# pi-model-restriction

Enforces project-level model and provider restrictions in `pi` via a local `.restricted.json` configuration file.

## Features

- **Project Governance**: Restrict allowed models and providers on a per-repository basis.
- **Auto Switch**: Automatically switches active session model to an allowed model if a disallowed model is active.
- **Event Interception**: Re-evaluates restrictions on `session_start`, `before_agent_start`, and `model_select` (Ctrl+P / `/model`).

## `.restricted.json` Specification

Place a `.restricted.json` file in the root of your project directory (`cwd`):

```json
{
  "allowedModels": [
    "vllm-local/qwen3.6-27b-awq",
    "gemma4-local/qwen3.6-27b-aeon-uncensored"
  ],
  "allowedProviders": [
    "vllm-local"
  ],
  "defaultModel": "vllm-local/qwen3.6-27b-awq",
  "reason": "This project contains sensitive code and must run strictly on local vLLM models.",
  "enforce": true
}
```

### Fields

- `allowedModels` *(optional string[])*: Exact `provider/modelId` or `modelId` strings allowed.
- `allowedProviders` *(optional string[])*: Provider slugs allowed (e.g. `vllm-local`, `ollama`).
- `defaultModel` *(optional string)*: Model reference (`provider/modelId`) to automatically switch to if a disallowed model is selected.
- `reason` *(optional string)*: Custom explanation message displayed in TUI notifications when restrictions are enforced.
- `enforce` *(optional boolean)*: Set to `false` to temporarily bypass enforcement without deleting the file.
