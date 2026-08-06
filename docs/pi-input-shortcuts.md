# pi-input-shortcuts

Vim-style chord overlay providing keyboard shortcuts for Pi's input box, including stash/restore, undo/redo, clipboard operations, thinking level toggle, and tab insertion.

## Tools / commands / hooks provided

This package provides keyboard shortcuts and event listeners, but no slash commands or AI tools.

- **Shortcuts**:
  - `ALT+S`: Triggers the chord overlay. The overlay expects a secondary key:
    - `S`: Stash/Restore (save input to stash register, or restore it)
    - `U`: Undo (pop from undo buffer)
    - `R`: Redo (push current text forward, restore previous)
    - `Y`: Copy (copy input to system clipboard)
    - `D`: Cut (copy to clipboard, then clear input)
    - `T`: Toggle Thinking (cycles through: off → low → medium → high → xhigh → off)
    - `A → [0-9]`: Append from numbered register 0-9
    - `A → S`: Append from stash register
  - `ALT+I`: Insert a literal tab character into the input field.

- **Hooks**:
  - `session_shutdown`: Clears the undo/redo buffer and timers.
  - Intercepts raw terminal input via `ctx.ui.onTerminalInput` to populate the undo/redo snapshot buffer.

## Key files

- `src/index.ts`: The main entry point. Handles `pi.registerShortcut` for `ALT+S` and `ALT+I`, sets up the `onTerminalInput` listener for undo snapshots, and defines the action callbacks.
- `src/chord-overlay.ts`: Implements the `ChordOverlay` TUI component displayed when `ALT+S` is pressed, managing state transitions (idle → chord_root → chord_reg).
- `src/registers.ts`: Handles reading, writing, and atomic saving of the stash and numbered registers to disk.
- `src/undo-redo.ts`: Manages the in-memory ring buffer (up to 50 snapshots) for the undo/redo history.
- `src/clipboard.ts`: Cross-platform clipboard integration detecting and invoking `xclip`, `xsel`, `pbcopy/pbpaste`, or PowerShell tools.

## How it works

The package uses `pi.registerShortcut` to bind `ALT+S` to a custom TUI overlay rendered with `ctx.ui.custom({ overlay: true })`. Once the overlay is open, it captures the next keystroke to determine the specific action (like `U` for undo or `Y` for copy) and executes the corresponding callback, updating the editor text via `ctx.ui.setEditorText()`.

For the undo/redo functionality, the extension aggressively hooks into `ctx.ui.onTerminalInput()`. It observes keystrokes and debounces snapshots into an in-memory `UndoRedoBuffer`. Snapshots are taken on pauses (500ms), large keystroke counts (20), or time thresholds (3s).

Registers (stash and numbered) are persisted to disk to survive session restarts. The file write uses a `.tmp` file and `renameSync` to ensure the operation is atomic, preventing corruption if the process crashes during a write.

## Configuration

There are no configuration keys, environment variables, or `settings.json` entries for this package. The registry file location is hardcoded to `.pi/input-shortcuts/registers.json` relative to the current working directory.

## Dependencies

- `@earendil-works/pi-coding-agent`: Standard extension APIs (`ExtensionAPI`, `ExtensionContext`).
- `@earendil-works/pi-tui`: Required for UI overlays, terminal events, and keyboard constants (`Key`).
