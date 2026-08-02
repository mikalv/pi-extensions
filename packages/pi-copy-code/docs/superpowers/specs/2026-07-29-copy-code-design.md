# Pi Copy Code Extension Design

## Purpose

Provide a standalone Pi extension that copies fenced code blocks from the latest assistant message without modifying Pi core. The extension targets users who operate Pi on a connected local computer while troubleshooting another computer and need to transfer generated commands or code quickly.

Markdown math rendering is explicitly outside this version's scope because the required upstream Markdown extension API is not available in the current stable Pi release.

## Project and Distribution

The extension lives in the standalone `pi-copy-code` repository and does not fork Pi.

During development it is loaded directly:

```bash
pi -e /absolute/path/to/pi-copy-code/src/index.ts
```

After publishing to GitHub, it can be installed as one Pi package with Pi's `git:` package source syntax. The exact installation URL will be documented after the repository owner is selected.

The package manifest exposes a single extension entry point.

## User Interface

The extension registers:

```text
/copy-code [number]
```

Behavior without an argument:

- If the latest assistant message contains no fenced code blocks, show a warning notification.
- If it contains one fenced code block, copy it immediately.
- If it contains multiple fenced code blocks, open a selection list.

Behavior with a one-based numeric argument:

- Copy that block immediately.
- Reject non-integer, zero, negative, or out-of-range values with a concise error containing the valid range.

Each selection label contains:

1. One-based block number.
2. Language or `plain` when no language is declared.
3. A whitespace-normalized preview of the first non-empty content line.

The preview is truncated for display only. Clipboard content remains unchanged.

After a successful copy, display a notification identifying the block number and language.

## Assistant Message Selection

The command reads the active session branch through `ctx.sessionManager` and walks backward to the latest assistant message entry. Only text content blocks in that message are considered, in source order.

The extension does not scan older assistant messages when the latest assistant message has no code. This prevents silently copying stale output.

Thinking blocks, tool calls, tool results, custom messages, and user messages are ignored.

## Fence Extraction

A dependency-free parser extracts fenced code blocks from assistant text.

Supported opening fences:

- Backticks or tildes.
- At least three identical fence characters.
- Up to three leading spaces.
- Optional info string; its first whitespace-delimited token is used as the language label.

A closing fence must:

- Use the same character as its opening fence.
- Contain at least as many fence characters.
- Contain only optional whitespace after the fence.

The parser preserves content characters and internal line endings while removing:

- Opening fence.
- Closing fence.
- Info string.
- The structural line break immediately after the opening fence.
- The structural line break immediately before a closing fence.

Removing the final structural line break prevents a pasted one-line shell command from being submitted automatically. Other leading and trailing whitespace inside the block is preserved.

An unclosed final fence is returned as a code block through the end of the message. Its final line ending, if present in the source, is preserved because no closing-fence boundary exists. This allows copying partial model output after truncation or interruption.

Fence-like sequences inside a block do not close it unless they satisfy the closing-fence rules.

When an assistant message contains multiple text content parts, each part is parsed separately. A fence cannot begin in one content part and close in another.

## Components

### Extension entry point

Registers `/copy-code`, reads the latest assistant message, invokes extraction, validates arguments, opens the selector when needed, and copies the selected content using Pi's exported `copyToClipboard()` helper.

### Fence parser

A pure module with no Pi or terminal dependencies. It returns records containing:

- `code`
- `language`
- `info`
- source order metadata needed for numbering

### Display formatter

Builds stable selector labels from parser output without altering clipboard content.

## Error Handling

- No assistant message: `No assistant message to copy from.`
- No fenced code blocks: `The latest assistant message has no fenced code blocks.`
- Invalid argument: explain that the argument must be a one-based block number.
- Out-of-range number: report the available range.
- Empty block: allow copying an empty string and report success; the user's explicit selection is authoritative.
- Clipboard failure: catch the error and show its message through Pi's error notification UI.
- Selector cancellation: exit without notification or clipboard changes.

The extension must not throw uncaught command-handler errors for expected user input.

## Compatibility and Security

- Uses only documented Pi extension APIs and exported helpers.
- Does not mutate session entries or model context.
- Does not execute copied code.
- Does not access the network.
- Does not read project files.
- Clipboard behavior, including OSC 52 fallback in remote sessions, is delegated to Pi.
- Terminal-specific functionality is limited to Pi's provided selector and notification APIs.

## Testing

Unit tests cover:

- No fences.
- One backtick fence with language.
- Multiple fences in source order.
- Tilde fences.
- Longer opening and closing fences.
- Fence-like content that must not close a block.
- Up to three leading spaces.
- Unclosed final fence.
- Empty fenced block.
- Language and info-string extraction.
- Preview normalization and truncation.
- Numeric argument validation.
- Latest-assistant-message selection and exclusion of older/user/tool content.

Command-level tests use mocked Pi contexts to verify:

- Single block copies immediately.
- Multiple blocks invoke selection.
- Numeric selection bypasses the selector.
- Cancellation does not copy.
- Clipboard and user-input failures become notifications.

## Acceptance Criteria

1. Loading the extension adds `/copy-code` without changing Pi core.
2. A single block from the latest assistant message can be copied with one command.
3. Multiple blocks can be selected by readable labels or copied directly by number.
4. Copied text contains code only, without Markdown fences or language labels.
5. Partial unclosed blocks remain copyable.
6. Expected errors are shown clearly and do not terminate Pi.
7. Automated tests pass without network access or model API credentials.
