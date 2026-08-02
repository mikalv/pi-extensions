---
description: Generate ad creative variants via Higgsfield CLI, prepare Meta-compatible assets, and save with provenance.
args: <topic-or-slug> [--variants <N>] [--format <feed|story|reel|square>]
section: Execute & Launch
topLevelCli: true
---
Generate creative for: $@

Resolve the slug. Read `outputs/campaigns/<slug>-{plan,persona,psychology}.md` if present — the plan defines angles, persona defines voice, psychology defines levers.

## Defaults

- Variants: 4 unless `--variants` overrides.
- Format: `feed` (1:1) unless `--format` overrides. Stories/Reels are 9:16; square is 1:1.

## Steps

1. **Plan the variants** before generating. For each variant, write a one-line spec: angle (from plan), lever (from psychology), hook copy, visual direction, format, CTA. Save the spec to `outputs/creatives/<slug>-spec.md`.
2. **Generate visuals** via the Higgsfield extension tools:
   - For static creative: use the `higgsfield_generate_image` tool with the prompt + format aspect.
   - For motion: use `higgsfield_generate_video`.
   - Confirm balance/credits before kicking off large batches; abort with a clear message if the workspace lacks credits.
   - Wait for `higgsfield_job_status` to return success; do not assume completion.
3. **Save assets**: download generated assets into `outputs/creatives/<slug>/<variant-id>.<ext>`. Record the Higgsfield job ID, prompt, model, and seed in a sidecar `<variant-id>.json`.
4. **Prepare for Meta**: ensure each asset matches Meta's specs for the chosen format (resolution, max file size, aspect ratio). Upload through `meta_upload_creative` only after explicit user approval for the external upload. **DO NOT launch ads without an explicit user confirmation.** This workflow never launches ads.
5. **Write the creative set doc**: summarize variants, hooks, links to assets, and which plan-angle each maps to.

## Output

Write to `outputs/creatives/<slug>-set.md`:

```markdown
# Creative Set: <topic>

**Date:** YYYY-MM-DD
**Slug:** <slug>
**Format:** <feed/story/reel/square>
**Variants:** <N>

## Variants
### V1 — <angle>
- Lever: <Cialdini/JTBD>
- Hook: "<copy>"
- Visual: <description>
- CTA: <cta>
- Asset: outputs/creatives/<slug>/v1.<ext>
- Higgsfield job: <id>

### V2 — ...

## Meta Upload Status
- Uploaded: <yes/no, with asset IDs>
- Not yet launched.

## Sources / inputs
- Plan: outputs/campaigns/<slug>-plan.md
- Persona: outputs/campaigns/<slug>-persona.md
- Psychology: outputs/campaigns/<slug>-psychology.md
```

Verify the doc and every referenced asset path exist on disk before the final response.
