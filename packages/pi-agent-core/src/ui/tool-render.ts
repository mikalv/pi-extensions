/**
 * Interactive TUI rendering for subagent tool calls and results.
 *
 * Implements renderCall and renderResult for Pi TUI inspection:
 * - Collapsed mode: Compact single-line / multi-line summary with status icon, agent, duration, tokens
 * - Expanded mode: Full interactive container with Markdown output, tool calls, errors, and metadata
 */

import { getMarkdownTheme } from "@earendil-works/pi-coding-agent";
import { Container, Markdown, Spacer, Text, type Component } from "@earendil-works/pi-tui";
import type { RunRecord, ToolCallRecord } from "../types.js";

export interface ToolRenderTheme {
  fg: (color: string, text: string) => string;
  bold: (text: string) => string;
}

export interface SubagentToolCallArgs {
  agent?: string;
  prompt?: string;
  runtime?: string;
  model?: string;
  thinking?: string | boolean;
  tools?: string[];
  depth?: number;
}

export interface SubagentToolResultDetails {
  success?: boolean;
  runId?: string;
  agent?: string;
  status?: string;
  turns?: number;
  tokens?: {
    input?: number;
    output?: number;
    total?: number;
  };
  toolCalls?: ToolCallRecord[];
  verdict?: string;
  durationMs?: number;
  error?: string;
}

/**
 * Format duration helper
 */
function formatDuration(ms?: number): string {
  if (!ms || ms <= 0) return "0s";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const remainingSecs = seconds % 60;
  return `${mins}m ${remainingSecs}s`;
}

/**
 * Format tokens helper
 */
function formatTokens(total?: number): string {
  if (!total || total <= 0) return "0 tokens";
  if (total >= 1_000_000) return `${(total / 1_000_000).toFixed(1)}M tokens`;
  if (total >= 1_000) return `${(total / 1_000).toFixed(1)}k tokens`;
  return `${total} tokens`;
}

/**
 * Render the subagent tool call preview in Pi TUI.
 */
export function renderSubagentToolCall(
  args: SubagentToolCallArgs,
  theme: ToolRenderTheme,
  context: { expanded: boolean } = { expanded: false }
): Component {
  const agentName = args.agent || "subagent";
  const runtimeTag = args.runtime ? ` [${args.runtime}]` : "";
  const depthTag = typeof args.depth === "number" && args.depth > 0 ? ` (depth ${args.depth})` : "";
  
  let header = `${theme.fg("toolTitle", theme.bold("subagent"))} ${theme.fg("accent", agentName)}${theme.fg("muted", runtimeTag + depthTag)}`;

  const prompt = (args.prompt || "").trim();
  if (!context.expanded) {
    const preview = prompt.length > 70 ? prompt.slice(0, 67) + "..." : prompt;
    return new Text(`${header}\n  ${theme.fg("dim", preview)}`, 0, 0);
  }

  const container = new Container();
  container.addChild(new Text(header, 0, 0));
  container.addChild(new Spacer(1));
  container.addChild(new Text(theme.fg("muted", "Prompt:"), 0, 0));
  container.addChild(new Text(theme.fg("dim", prompt), 0, 0));

  if (args.tools && args.tools.length > 0) {
    container.addChild(new Spacer(1));
    container.addChild(new Text(theme.fg("muted", `Tools: ${args.tools.join(", ")}`), 0, 0));
  }

  return container;
}

/**
 * Render the subagent tool result in Pi TUI with full inspection support.
 */
export function renderSubagentToolResult(
  result: { content?: Array<{ type?: string; text?: string }>; details?: any },
  { expanded }: { expanded: boolean },
  theme: ToolRenderTheme
): Component {
  const details = (result.details || {}) as SubagentToolResultDetails;
  const isError = details.success === false || details.status === "failed" || details.status === "aborted";
  const icon = isError ? theme.fg("error", "✗") : theme.fg("success", "✓");
  const agent = details.agent || "subagent";
  const status = details.status || (isError ? "failed" : "completed");
  const duration = formatDuration(details.durationMs);
  const tokenStr = formatTokens(details.tokens?.total);
  const turns = details.turns ? `${details.turns} turns` : "1 turn";

  // Extract raw text output
  const rawText = result.content?.[0]?.text || "";
  // Strip the <task-notification> XML block from the user-visible preview if present
  const cleanOutput = rawText.replace(/<task-notification[\s\S]*?<\/task-notification>/g, "").trim();

  if (expanded) {
    const container = new Container();
    const mdTheme = getMarkdownTheme();

    let header = `${icon} ${theme.fg("toolTitle", theme.bold(agent))} · ${theme.fg("accent", status)}`;
    if (details.runId) {
      header += theme.fg("muted", ` (${details.runId})`);
    }
    container.addChild(new Text(header, 0, 0));

    if (details.verdict) {
      const verdictColor = details.verdict === "PASS" ? "success" : details.verdict === "FAIL" ? "error" : "warning";
      container.addChild(new Text(theme.fg("muted", "Verdict: ") + theme.fg(verdictColor, theme.bold(details.verdict)), 0, 0));
    }

    if (details.error) {
      container.addChild(new Spacer(1));
      container.addChild(new Text(theme.fg("error", `Error: ${details.error}`), 0, 0));
    }

    // Render tool calls if any
    if (details.toolCalls && details.toolCalls.length > 0) {
      container.addChild(new Spacer(1));
      container.addChild(new Text(theme.fg("muted", `Tool Calls (${details.toolCalls.length}):`), 0, 0));
      for (const tc of details.toolCalls) {
        container.addChild(new Text(`  ${theme.fg("accent", "→")} ${theme.fg("toolTitle", tc.tool)}`, 0, 0));
      }
    }

    // Render Output with Markdown
    if (cleanOutput) {
      container.addChild(new Spacer(1));
      container.addChild(new Text(theme.fg("muted", "Output:"), 0, 0));
      container.addChild(new Markdown(cleanOutput, 0, 0, mdTheme));
    } else if (!details.error) {
      container.addChild(new Spacer(1));
      container.addChild(new Text(theme.fg("muted", "(no output)"), 0, 0));
    }

    // Stats footer
    container.addChild(new Spacer(1));
    const statsLine = `${theme.fg("dim", `${turns} · ${tokenStr} · ${duration}`)}`;
    container.addChild(new Text(statsLine, 0, 0));

    return container;
  }

  // Collapsed Mode (Compact)
  let text = `${icon} ${theme.fg("toolTitle", theme.bold(agent))} · ${status} ${theme.fg("dim", `(${turns} · ${tokenStr} · ${duration})`)}`;
  if (details.error) {
    text += `\n  ${theme.fg("error", `Error: ${details.error}`)}`;
  } else if (cleanOutput) {
    const firstLine = cleanOutput.split("\n")[0] || "";
    const preview = firstLine.length > 70 ? firstLine.slice(0, 67) + "..." : firstLine;
    text += `\n  ${theme.fg("dim", preview)}`;
  }

  return new Text(text, 0, 0);
}
