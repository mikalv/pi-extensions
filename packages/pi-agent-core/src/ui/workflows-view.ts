import type { WorkflowResult } from "../types.js";

function getStatusIcon(status: string): string {
  switch (status) {
    case "completed":
      return "✓";
    case "running":
      return "⠋";
    case "failed":
      return "✗";
    case "aborted":
      return "⊘";
    case "pending":
    default:
      return "○";
  }
}

/**
 * Format a list of workflow execution trees.
 */
export function formatWorkflowsView(workflows: WorkflowResult[]): string {
  if (workflows.length === 0) {
    return "No active or recorded workflow executions.";
  }

  const lines: string[] = [];

  lines.push("================================================================================");
  lines.push(" WORKFLOW ORCHESTRATION ENGINE");
  lines.push("================================================================================");
  lines.push("");

  for (let i = 0; i < workflows.length; i++) {
    const wf = workflows[i];
    const icon = getStatusIcon(wf.status);
    const duration = wf.durationMs ? `${(wf.durationMs / 1000).toFixed(1)}s` : "running";

    lines.push(`[${i + 1}] Workflow: ${wf.name} (${wf.id})`);
    lines.push(`    Status:   ${icon} ${wf.status.toUpperCase()} (${duration})`);
    if (wf.error) {
      lines.push(`    Error:    ${wf.error}`);
    }

    if (wf.phases && wf.phases.length > 0) {
      lines.push("    Phases:");
      for (let p = 0; p < wf.phases.length; p++) {
        const phase = wf.phases[p];
        const pIcon = getStatusIcon(phase.status);
        const pDuration = phase.durationMs ? ` (${(phase.durationMs / 1000).toFixed(1)}s)` : "";
        lines.push(`      Phase ${p + 1}: ${phase.name} [${pIcon} ${phase.status}${pDuration}]`);
      }
    }

    if (wf.runs && wf.runs.length > 0) {
      lines.push(`    Child Subagent Runs (${wf.runs.length}):`);
      for (const run of wf.runs) {
        const rIcon = getStatusIcon(run.status);
        const tokens = run.tokens?.total ? ` · ${run.tokens.total} tokens` : "";
        lines.push(`      - ${rIcon} [${run.agent}] ${run.prompt.slice(0, 50)}...${tokens}`);
      }
    }

    lines.push("--------------------------------------------------------------------------------");
  }

  return lines.join("\n");
}

/**
 * Open the workflows modal view via Pi UI context.
 */
export async function openWorkflowsView(
  workflows: WorkflowResult[],
  ctx: { hasUI?: boolean; ui?: any }
): Promise<void> {
  const content = formatWorkflowsView(workflows);

  if (ctx.hasUI && ctx.ui?.editor) {
    await ctx.ui.editor("Workflows & Pipelines", content);
  } else if (ctx.hasUI && ctx.ui?.notify) {
    ctx.ui.notify(`Workflows: ${workflows.length} recorded`, "info");
  } else {
    process.stdout.write(`\n${content}\n`);
  }
}
