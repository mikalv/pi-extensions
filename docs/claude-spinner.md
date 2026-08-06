# Claude Spinner
Provides Claude-style spinner frames for Pi's working indicator.

## Tools / commands / hooks provided
- Hooks: Listens to the `session_start` event to override the default UI working indicator.

## Key files
- `index.ts`: The main entry file and only module containing the extension logic.

## How it works
This extension overrides Pi's default working indicator with a custom set of Claude-style spinner frames (`"·", "✻", "✽", "✶", "✳", "✢"`). 

When a session starts (`session_start` event), it checks if the context has a UI (`ctx.hasUI`). If it does, it calls `ui.setWorkingIndicator()`, passing the spinner frames (styled with the theme's `accent` color) and a 120ms interval.

## Configuration
No configuration required.

## Dependencies
No notable runtime or peer dependencies beyond `@earendil-works/pi-coding-agent`.
