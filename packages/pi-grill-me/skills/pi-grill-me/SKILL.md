# pi-grill-me

Use this when the user wants to stress-test a plan, be interviewed about a design, walk through assumptions one-by-one, or save structured planning Q&A into a reusable Markdown artifact.

## When to use it

Trigger this when the user says things like:
- "grill this plan"
- "challenge this design"
- "interview me about this approach"
- "ask me one question at a time"
- "stress test this implementation plan"
- "save the design questions and answers"

## What it does

`/grill-me` starts a deterministic design interview.

The workflow should:
- ask exactly one question at a time
- provide a recommended answer for each question
- explore the codebase directly when a question can be answered from code
- record each resolved or open turn with `grill_record_turn`
- save the final result with `grill_save_results`

## Operational rules

- Do not ask multiple bundled questions in one turn.
- Prefer concrete dependency-unblocking questions over broad abstract ones.
- If codebase evidence can answer the question, inspect the code first.
- Use `decisionStatus` carefully:
  - `resolved` when the answer is settled
  - `open` when the decision is still pending
  - `needs-codebase-check` when the next step is repository inspection
- When the user asks to stop, save, summarize, or wrap up, use `grill_save_results`.

## Output

Default saved file:
- `GRILL-ME.md`

Persistent working state:
- `.pi/grill-me/state.json`
