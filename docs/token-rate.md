# token-rate

**Real-time token rate tracker for Pi**

Displays tokens/sec in a styled widget while the model is generating a response. It uses text deltas from assistant messages to count tokens dynamically and calculates current rate, average rate, total tokens, and elapsed time. At the end of a message, it shows final statistics including the total session tokens. 

## Tools / Commands / Hooks Provided

- **Slash Commands**:
  - `/toggle-token-rate`: Toggles the visibility of the token rate widget on and off.
- **Keyboard Shortcuts**:
  - `ctrl+shift+t`: Toggles the token rate widget visibility.
- **Events Listened To**:
  - `message_start`: Resets the streaming tracker and active state for the assistant's message.
  - `message_update`: Captures `text_delta` from `assistantMessageEvent` to calculate real-time rates and update the widget.
  - `message_end`: Finalizes the calculations, updates the session's total token count, and updates the widget with final stats.
  - `session_start`: Resets the session-level totals and widget visibility based on configuration.
  - `session_shutdown`: Clears the widget and deactivates streaming tracking.

## Key Files

- `package.json`: Defines the Pi extension metadata (`@juancrg90/token-rate`).
- `src/index.ts`: The main entry point. Sets up the configuration loader, constructs the TUI components using Pi's officially supported `DynamicBorder`, `Container`, and `Text` primitives, and wires up the Pi extension hooks for updating the rate logic and user interface.

## How it works

The extension intercepts assistant text generation in real time using the `message_update` hook by listening specifically to `text_delta` events from the `assistantMessageEvent`. It calculates an estimated token count based on standard assumptions (4 characters = 1 token) or leverages the model-provided usage statistics when available. 

By tracking time deltas between events, it maintains an instantly updated "Current" token rate alongside the "Average" rate. During the generation phase, the widget actively refreshes through the `ctx.ui.setWidget` method utilizing a factory pattern. This factory method dynamically passes the application theme configuration to officially supported TUI components (`DynamicBorder`, `Container`, `Text`), ensuring that the widget seamlessly respects the active TUI theme.

When the assistant concludes its generation (`message_end`), the extension aggregates the final values and folds them into a session-wide total. Both the real-time feedback and final metrics offer insight into generation latency and costs without adding clutter to the main conversation flow.

## Configuration

Configuration is loaded from `~/.pi/agent/token-rate.json` if available.

- `widgetVisible` (boolean): Sets whether the widget is shown by default. (Defaults to `true`).

## Dependencies

- **Peer Dependencies**:
  - `@earendil-works/pi-coding-agent`
  - `@earendil-works/pi-tui`
