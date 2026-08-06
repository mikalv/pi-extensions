# Raw Paste (@tmustier/pi-raw-paste)

One-shot raw paste support for Pi that intercepts bracketed paste sequences to keep large clipboard content fully editable in the editor (without condensing or adding paste markers).

## Tools / Commands / Hooks Provided
- **Slash Commands**: `/paste` (Arms raw paste for the next paste operation)
- **Hooks Listened**: `session_start` (Replaces the default TUI editor component with `RawPasteEditor`)

## Key Files
- `index.ts`: Main entry point containing the `RawPasteEditor` class and extension factory.

## How it works
On `session_start`, the extension uses `ctx.ui.setEditorComponent` to override the standard Pi editor with a custom `RawPasteEditor` (which extends `CustomEditor`). 

By default, raw pasting is unarmed. When the user executes the `/paste` slash command, the editor is "armed" and the user is notified. Once armed, `RawPasteEditor` intercepts terminal input looking for standard bracketed paste escape sequences: `\x1b[200~` (start) and `\x1b[201~` (end). It buffers the incoming string data until the end sequence is reached, then normalizes line endings (`\r\n` and `\r` to `\n`), and flushes the entire block as raw characters into the editor. If unarmed, or outside a paste block, input is passed through to the base `CustomEditor` class.

This allows large pastes to remain editable and fully expanded in the input field.

## Configuration
No configuration required.

## Dependencies
- Peer dependencies: `@earendil-works/pi-coding-agent`
