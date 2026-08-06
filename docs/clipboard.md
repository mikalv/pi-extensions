# pi-extension-clipboard

**Clipboard copy and paste tools for pi.**

## Tools / Commands / Hooks Provided

- **Tools:**
  - `copy_to_clipboard`: Copies provided text to the user's system clipboard using OSC52 escape sequences.
  - `paste_from_clipboard`: Reads the current text contents from the user's system clipboard.

## Key Files

- `packages/clipboard/index.ts`: The main entry file that implements and registers the clipboard tools.

## How it works

The extension registers two tools that let the LLM directly interact with the user's clipboard. 

For copying, the `copy_to_clipboard` tool uses the OSC52 terminal escape sequence (`\x1b]52;c;...`). This allows it to work transparently across SSH sessions and inside multiplexers, provided the user's terminal emulator (e.g. iTerm2, Kitty, WezTerm) supports OSC52.

For pasting, the `paste_from_clipboard` tool uses OS-native shell commands to read the clipboard text, as OSC52 does not reliably support reading for security reasons. It uses `pbpaste` on macOS, `xclip` or `wl-paste` on Linux, and `Get-Clipboard` (via PowerShell) on Windows. If successful, it returns the text directly to the model as tool output. Both tools will notify the user via the UI (`ctx.ui.notify`) when triggered.

## Configuration

No specific configuration or environment variables are required.

## Dependencies

- `@sinclair/typebox`: Used for schema definition of the tool parameters.
- Standard Node.js `node:child_process` for spawning OS commands.
