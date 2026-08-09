import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

export interface RestrictedConfig {
  allowedModels?: string[]; // e.g. ["vllm-local/qwen3.6-27b-awq", "zai/glm-5.2"]
  allowedProviders?: string[]; // e.g. ["vllm-local", "gemma4-local"]
  defaultModel?: string; // model to force-switch to if active is disallowed
  reason?: string;
  enforce?: boolean;
}

const CONFIG_FILENAME = ".restricted.json";

function loadRestrictedConfig(cwd: string): RestrictedConfig | null {
  const configPath = join(cwd, CONFIG_FILENAME);
  if (!existsSync(configPath)) return null;

  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw) as RestrictedConfig;
    if (parsed.enforce === false) return null;
    return parsed;
  } catch (error) {
    console.error(`[pi-model-restriction] Failed to parse ${CONFIG_FILENAME}:`, error);
    return null;
  }
}

function matchesModel(model: unknown, allowedModels?: string[], allowedProviders?: string[]): boolean {
  if (!model || typeof model !== "object") return false;
  const m = model as { provider?: string; id?: string };
  const fullRef = `${m.provider ?? ""}/${m.id ?? ""}`;

  if (allowedModels && allowedModels.length > 0) {
    if (allowedModels.includes(fullRef) || (m.id && allowedModels.includes(m.id))) {
      return true;
    }
  }

  if (allowedProviders && allowedProviders.length > 0) {
    if (m.provider && allowedProviders.includes(m.provider)) {
      return true;
    }
  }

  // If neither constraint list is populated, consider it allowed
  if ((!allowedModels || allowedModels.length === 0) && (!allowedProviders || allowedProviders.length === 0)) {
    return true;
  }

  return false;
}

function parseModelRef(ref: string): { provider: string; id: string } | null {
  const parts = ref.split("/");
  if (parts.length >= 2) {
    return { provider: parts[0]!, id: parts.slice(1).join("/") };
  }
  return null;
}

export default function piModelRestriction(pi: ExtensionAPI) {
  async function enforceRestriction(ctx: ExtensionContext, source: string) {
    const config = loadRestrictedConfig(ctx.cwd);
    if (!config) return;

    if (matchesModel(ctx.model, config.allowedModels, config.allowedProviders)) {
      return;
    }

    const reason = config.reason ?? `Project restrictions enforced by ${CONFIG_FILENAME}`;
    const allowedDesc = [
      config.allowedModels?.length ? `models: [${config.allowedModels.join(", ")}]` : "",
      config.allowedProviders?.length ? `providers: [${config.allowedProviders.join(", ")}]` : "",
    ].filter(Boolean).join("; ");

    if (ctx.hasUI && ctx.ui) {
      ctx.ui.notify(`[Restricted] Disallowed model in ${source}. Allowed ${allowedDesc}. ${reason}`, "warning");
    }

    // Try to switch model to defaultModel or first allowedModel
    const targetRef = config.defaultModel ?? config.allowedModels?.[0];
    if (targetRef) {
      const parsed = parseModelRef(targetRef);
      if (parsed) {
        const found = ctx.modelRegistry.find(parsed.provider, parsed.id);
        if (found) {
          try {
            await pi.setModel(found);
            if (ctx.hasUI && ctx.ui) {
              ctx.ui.notify(`[Restricted] Automatically switched session model to "${targetRef}"`, "info");
            }
            return;
          } catch (err) {
            console.error("[pi-model-restriction] Failed to switch model:", err);
          }
        }
      }
    }

    if (ctx.hasUI && ctx.ui) {
      ctx.ui.notify(`[Restricted] Warning: Current model is disallowed, and no valid fallback model could be applied.`, "error");
    }
  }

  pi.on("session_start", async (_event, ctx) => {
    await enforceRestriction(ctx, "session start");
  });

  pi.on("before_agent_start", async (_event, ctx) => {
    await enforceRestriction(ctx, "agent start");
  });

  pi.on("model_select", async (_event, ctx) => {
    await enforceRestriction(ctx, "model select");
  });
}
