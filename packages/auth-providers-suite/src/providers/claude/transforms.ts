import {
  buildClaudeBillingHeaderValue,
  getClaudeCliVersion,
  getClaudeEntrypoint,
} from "./headers.ts";

const BILLING_PREFIX = "x-anthropic-billing-header";
const CLAUDE_CODE_IDENTITY = "You are Claude Code, Anthropic's official CLI for Claude.";

type SystemEntry = { type?: string; text?: string } & Record<string, unknown>;

interface AnthropicPayload {
  model?: unknown;
  system?: unknown;
  messages?: unknown;
}

function isClaudeModel(model: unknown): model is string {
  return typeof model === "string" && model.toLowerCase().includes("claude");
}

function entryText(entry: unknown): string {
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object") {
    const text = (entry as { text?: unknown }).text;
    if (typeof text === "string") return text;
  }
  return "";
}

export function shouldInjectClaudeCompatibilityHeaders(modelId: string | undefined): boolean {
  return typeof modelId === "string" && modelId.toLowerCase().includes("claude");
}

export function injectClaudeBillingHeader(payload: unknown): AnthropicPayload | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const p = payload as AnthropicPayload;
  if (!isClaudeModel(p.model) || !Array.isArray(p.messages)) return undefined;

  const system: SystemEntry[] = Array.isArray(p.system) ? (p.system as SystemEntry[]) : [];
  if (!system.some((entry) => entryText(entry).startsWith(CLAUDE_CODE_IDENTITY))) return undefined;
  if (system.some((entry) => entryText(entry).startsWith(BILLING_PREFIX))) return undefined;

  const messages = p.messages as Array<{ role?: string; content?: string | Array<{ type?: string; text?: string }> }>;
  const billingHeader = buildClaudeBillingHeaderValue(messages, getClaudeCliVersion(), getClaudeEntrypoint());
  p.system = [{ type: "text", text: billingHeader }, ...system];

  const keptSystem: SystemEntry[] = [];
  const movedTexts: string[] = [];
  for (const entry of p.system as SystemEntry[]) {
    const text = entryText(entry);
    if (text.startsWith(BILLING_PREFIX) || text.startsWith(CLAUDE_CODE_IDENTITY)) keptSystem.push(entry);
    else if (text.length > 0) movedTexts.push(text);
  }

  if (movedTexts.length > 0) {
    const firstUser = messages.find((message) => message.role === "user");
    if (firstUser) {
      p.system = keptSystem;
      const prefix = movedTexts.join("\n\n");
      const content = firstUser.content;
      if (typeof content === "string") firstUser.content = `${prefix}\n\n${content}`;
      else if (Array.isArray(content)) content.unshift({ type: "text", text: prefix });
    }
  }

  return p;
}
