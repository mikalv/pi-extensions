import type { RunRecord } from "../types.js";

/**
 * Format a complete inspectable transcript for a subagent run.
 */
export function formatPeekContent(run: RunRecord): string {
  const lines: string[] = [];

  lines.push("================================================================================");
  lines.push(` Subagent Run: ${run.agent} (${run.id})`);
  lines.push("================================================================================");
  lines.push(`Status:     ${run.status.toUpperCase()} (State: ${run.state})`);
  lines.push(`Runtime:    ${run.runtime}`);
  if (run.model) lines.push(`Model:      ${run.model}`);
  lines.push(`Depth:      ${run.depth}/10`);
  lines.push(`Turns:      ${run.turns} / ${run.turnBudget}`);
  lines.push(`Tokens:     ${run.tokens?.total ?? 0} total (in: ${run.tokens?.input ?? 0}, out: ${run.tokens?.output ?? 0})`);
  if (run.startedAt) {
    const started = new Date(run.startedAt).toISOString();
    const duration = run.durationMs ? `${(run.durationMs / 1000).toFixed(1)}s` : "running";
    lines.push(`Started:    ${started} (Duration: ${duration})`);
  }
  if (run.worktreePath) {
    lines.push(`Worktree:   ${run.worktreePath}`);
  }
  if (run.verdict) {
    lines.push(`Verdict:    ${run.verdict}`);
  }
  lines.push("");

  lines.push("--------------------------------------------------------------------------------");
  lines.push(" PROMPT");
  lines.push("--------------------------------------------------------------------------------");
  lines.push(run.prompt || "(no prompt provided)");
  lines.push("");

  if (run.toolCalls && run.toolCalls.length > 0) {
    lines.push("--------------------------------------------------------------------------------");
    lines.push(` TOOL CALLS (${run.toolCalls.length})`);
    lines.push("--------------------------------------------------------------------------------");
    for (let i = 0; i < run.toolCalls.length; i++) {
      const tc = run.toolCalls[i];
      const timeStr = tc.timestamp ? new Date(tc.timestamp).toLocaleTimeString() : "";
      lines.push(`[${i + 1}] [Tool Call: ${tc.tool}] ${timeStr}`);
      lines.push(`Args: ${JSON.stringify(tc.args, null, 2)}`);
      if (tc.result !== undefined) {
        const resStr =
          typeof tc.result === "string"
            ? tc.result
            : JSON.stringify(tc.result, null, 2);
        lines.push(`Result: ${resStr}`);
      }
      lines.push("");
    }
  }

  if (run.error) {
    lines.push("--------------------------------------------------------------------------------");
    lines.push(" ERROR");
    lines.push("--------------------------------------------------------------------------------");
    lines.push(run.error);
    lines.push("");
  }

  lines.push("--------------------------------------------------------------------------------");
  lines.push(" FINAL OUTPUT");
  lines.push("--------------------------------------------------------------------------------");
  lines.push(run.output || "(no output returned)");
  lines.push("================================================================================");

  return lines.join("\n");
}

/**
 * Open the peek modal dialog via Pi's UI context.
 */
export async function openPeekModal(
  run: RunRecord,
  ctx: { hasUI?: boolean; ui?: any }
): Promise<void> {
  const content = formatPeekContent(run);

  if (ctx.hasUI && ctx.ui?.editor) {
    await ctx.ui.editor(`Subagent Peek: ${run.agent} [${run.id}]`, content);
  } else if (ctx.hasUI && ctx.ui?.notify) {
    ctx.ui.notify(`Subagent ${run.agent} (${run.status}): ${run.output.slice(0, 100)}...`, "info");
  } else {
    // Plain stdout fallback
    process.stdout.write(`\n${content}\n`);
  }
}
