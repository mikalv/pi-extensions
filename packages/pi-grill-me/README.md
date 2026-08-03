# pi-grill-me

Structured design-interview extension for Pi.

## What it does

`pi-grill-me` helps Pi run a deterministic question-by-question design review for a proposed plan, capture each decision, and save the result as Markdown.

It is useful when a plan is still fuzzy and you want the agent to aggressively surface unresolved assumptions, tradeoffs, risks, and dependencies before implementation starts.

## Features

- `/grill-me <plan>` command to start a grill session
- persistent state in `.pi/grill-me/state.json`
- `grill_record_turn` tool for one-question-at-a-time capture
- `grill_save_results` tool for exporting the session to Markdown
- default Markdown output file: `GRILL-ME.md`
- safe output-path guard that refuses writes outside the project directory

## Command

```text
/grill-me <plan>
```

If no plan is provided, the extension creates a placeholder and prompts the agent to ask for one.

## Tools

### `grill_record_turn`
Records one interview turn:
- question
- recommended answer
- user answer
- decision status
- notes

### `grill_save_results`
Saves the current grill session to Markdown.

Optional fields:
- `path`
- `summary`
- `agreedDecisions`
- `openRisks`
- `nextDecisionNeeded`

## Output structure

Saved Markdown includes:
- Plan
- Shared Understanding
- Questions and Answers
- Agreed Decisions
- Open Risks
- Next Decision Needed

## Typical use

1. Run `/grill-me <plan>`
2. Let the agent ask exactly one question at a time
3. Capture each answer with `grill_record_turn`
4. Save with `grill_save_results`

## Package entry

This package registers:

```json
{
  "pi": {
    "extensions": ["./src/index.ts"]
  }
}
```
