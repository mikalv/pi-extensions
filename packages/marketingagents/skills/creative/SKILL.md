---
name: creative
description: Generate ad creative variants via Higgsfield CLI and prepare Meta-compatible assets. Each variant maps to a plan angle and a psychology lever.
---

# Creative Production

Use the `/creative` command to generate visual + motion ad assets and prepare them for Meta.

## When to use

- After `/plan` and `/psychology` so variants are tied to angles and levers.
- When the user asks for ad creatives, hero images, reels, or feed posts.

## Pattern

1. Plan the variants first — write a one-line spec per variant (angle, lever, hook, visual, format, CTA). Save to `outputs/creatives/<slug>-spec.md`.
2. Generate via Higgsfield extension tools:
   - `higgsfield_generate_image` for static.
   - `higgsfield_generate_video` for motion.
   - Confirm balance/credits with `higgsfield_balance` before large batches.
   - Wait for `higgsfield_job_status` to confirm success.
3. Save assets to `outputs/creatives/<slug>/<variant-id>.<ext>` with sidecar JSON metadata.
4. Match Meta specs (resolution, file size, aspect ratio) for the chosen format.
5. Optional: upload via Meta extension tools (`meta_upload_creative`). Do NOT launch ads without explicit user confirmation.
6. Write set doc to `outputs/creatives/<slug>-set.md`.

## Defaults

- 4 variants unless `--variants` overrides.
- `feed` (1:1) format unless `--format` overrides.

## Tools

- `creative-director` subagent orchestrates Higgsfield + Meta tools.
- Higgsfield extension tools (image/video gen).
- Meta extension tools (creative upload).
