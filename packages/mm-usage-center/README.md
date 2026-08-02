# mm-usage-center

Unified observability package for Pi.

## Goal

`mm-usage-center` is the consolidation point for these projects:

- `insp2/pi-usage`
- `insp2/pi-usage-bars`
- `insp2/pi-usage-alerts`
- `insp2/pi-zai-usage`
- `inspirations/pi-codex-usage`
- `inspirations/pi-token-usage`
- `insp2/pi-github-copilot-usage`
- `insp2/pi-local-token-costs`
- `insp2/pi-stats-ext`
- `insp2/pi-metrics`
- `insp2/pi-tool-stats`
- `insp2/pi-tool-duration`
- `insp2/pi-insights`

Long-term scope:

- live quota
- footer bars
- alerts
- cost tracking
- per-provider usage
- session/tool analytics

## Current state in this repo

This cut now provides:

- `/usage-center` interactive dashboard in TUI mode
- `/usage-center dashboard` explicit dashboard open
- `/usage-center live` for provider-native quota fetches
- offline analytics powered by the existing `packages/usage-extension` engine
- top providers and top tools summary
- footer status with live current-provider quota when available
- widget fallback above the editor in non-TUI UI modes

## Commands

- `/usage-center` — open the interactive dashboard
- `/usage-center dashboard` — same as above
- `/usage-center live` — show live provider quotas
- `/usage-center graph [period] [metric] [group] [mode]`
- `/usage-center export [table|graph|insights] [period]`
- `/usage-center hide` — hide the widget fallback
- `/usage-center status` — refresh footer status only

### Dashboard keys

- `tab` / `shift-tab` or `↑` / `↓` — switch section
- `←` / `→` or `[` / `]` — switch period
- `m` — cycle graph metric
- `g` — cycle graph grouping
- `c` — toggle cumulative graph mode
- `r` — refresh
- `e` — export current view
- `q` / `esc` — close dashboard

## Notes

This is still an incremental merge.

Already started:

- vendored the legacy analytics modules into `src/legacy/`
- wired offline analytics to the vendored `usage-data` engine
- added provider-native live quota adapters for:
  - OpenAI Codex
  - Anthropic OAuth
  - GitHub Copilot
  - OpenRouter

Not done yet:

- alert thresholds / notifications
- richer drill-downs and filters inside the dashboard
- deeper provider-specific extras from `pi-usage-bars`, `pi-usage-alerts`, `pi-local-token-costs`, `pi-insights`, and related projects
