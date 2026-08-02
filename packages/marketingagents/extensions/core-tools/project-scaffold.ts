export function buildProjectAgentsTemplate(): string {
	return `# MarketingAgents Workspace Guide

This file is read automatically at startup. Keep durable workspace rules here; keep startup-specific facts in the canonical context artifact.

## Startup Overview
- Product:
- Campaign slug:
- Stage: idea | validation | pre-launch | early traction | growth
- Primary business goal:
- Current marketing objective:

## Canonical Context
- Context path: \`outputs/campaigns/<slug>-context.md\`
- Read the context before research, strategy, planning, creative, distribution, tracking, or reporting.
- Keep facts, user assertions, sourced evidence, and hypotheses visibly separate.

## Funnel and Measurement
- Acquisition entry points:
- Activation event:
- Conversion event:
- Retention signal:
- Revenue event:
- Raw data sources and owners:

## Capacity and Constraints
- Team and owners:
- Time available:
- Confirmed budget bounds:
- Prohibited claims / regulatory constraints:
- Brand voice constraints:

## Human Approval Boundaries
- Require explicit approval before publishing or sending externally, contacting people, uploading assets, spending or moving budget, changing live campaigns, changing price, or modifying production/account settings.
- Record the scope and bounds of any delegated authority.

## Artifact Conventions
- Context, research, diagnosis, personas, strategy, and plans: \`outputs/campaigns/\`
- Creative specs and assets: \`outputs/creatives/\`
- Tracking, weekly reviews, and final reports: \`outputs/reports/\`
- Raw metric snapshots and loop state: \`outputs/reports/.notes/\`
- Long-running workflow state: \`outputs/.plans/\`
- Session notes: \`notes/session-logs/\`

## Task Ledger
- Track concrete tasks with owner, status, dependency, output path, and definition of done.
- Use \`todo\`, \`in_progress\`, \`done\`, \`blocked\`, or \`superseded\`.
- Do not silently skip, merge, or overwrite work.

## Verification and Honesty
- Every quantitative claim must trace to a URL, raw artifact, research artifact, or tool output.
- Do not say \`verified\`, \`confirmed\`, \`checked\`, or \`launched\` unless the check ran and its evidence path is recorded.
- Missing data remains \`unknown\`, \`blocked\`, \`unverified\`, or \`inferred\`; never manufacture continuity.
- Prefer the smallest useful test that can reduce the current uncertainty.

## Current Status
- Readiness gates:
- Binding constraint:
- Active bet:
- Latest learning:
- Next action:

## Session Logging
- Use \`/log\` after meaningful work to write a durable note under \`notes/session-logs/\`.
`;
}

export function buildSessionLogsReadme(): string {
	return `# Session Logs

Use \`/log\` to write one durable note per meaningful MarketingAgents session.

Include:
- what changed
- evidence and artifacts created
- decisions and approval state
- failures or blocked checks
- current learning
- next action
`;
}
