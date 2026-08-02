import { createHash } from "node:crypto";

const BILLING_SALT = "59cf53e54c78";
export const CLAUDE_CODE_VERSION = "2.1.160";
export const CLAUDE_CODE_ENTRYPOINT = "sdk-cli";

export interface ClaudeHeaderProfile {
  userAgent: string;
  billingHeader?: string;
}

interface ClaudeMessage {
  role?: string;
  content?: string | Array<{ type?: string; text?: string }>;
}

export function getClaudeCliVersion(): string {
  return process.env.ANTHROPIC_CLI_VERSION ?? CLAUDE_CODE_VERSION;
}

export function getClaudeEntrypoint(): string {
  return process.env.CLAUDE_CODE_ENTRYPOINT ?? CLAUDE_CODE_ENTRYPOINT;
}

export function buildClaudeUserAgent(): string {
  return process.env.ANTHROPIC_USER_AGENT ?? `claude-cli/${getClaudeCliVersion()} (external, ${getClaudeEntrypoint()})`;
}

export function extractFirstClaudeUserMessageText(messages: ClaudeMessage[]): string {
  const userMsg = messages.find((message) => message.role === "user");
  if (!userMsg) return "";
  const content = userMsg.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const textBlock = content.find((block) => block.type === "text");
    if (textBlock?.text) return textBlock.text;
  }
  return "";
}

export function computeClaudeCch(messageText: string): string {
  return createHash("sha256").update(messageText).digest("hex").slice(0, 5);
}

export function computeClaudeVersionSuffix(messageText: string, version: string): string {
  const sampled = [4, 7, 20].map((i) => (i < messageText.length ? messageText[i] : "0")).join("");
  return createHash("sha256").update(`${BILLING_SALT}${sampled}${version}`).digest("hex").slice(0, 3);
}

export function buildClaudeBillingHeaderValue(
  messages: ClaudeMessage[],
  version: string = getClaudeCliVersion(),
  entrypoint: string = getClaudeEntrypoint(),
): string {
  const text = extractFirstClaudeUserMessageText(messages);
  const suffix = computeClaudeVersionSuffix(text, version);
  const cch = computeClaudeCch(text);
  return `x-anthropic-billing-header: cc_version=${version}.${suffix}; cc_entrypoint=${entrypoint}; cch=${cch};`;
}

export function buildClaudeHeaderProfile(messages?: ClaudeMessage[]): ClaudeHeaderProfile {
  return {
    userAgent: buildClaudeUserAgent(),
    ...(messages ? { billingHeader: buildClaudeBillingHeaderValue(messages) } : {}),
  };
}
