# pi-copy-code

Copy fenced code blocks from the latest Pi assistant message.

## Tools / commands / hooks provided
- **/copy-code**: A slash command that extracts and copies fenced code blocks from the latest assistant message. If the message contains multiple code blocks, it prompts the user to select one from a list. If passed an argument (e.g. `/copy-code 2`), it directly copies the block at that 1-based index.

## Key files
- `src/index.ts`: The extension entry point. Registers the `/copy-code` command.
- `src/copy-code.ts`: Implements the core command logic (retrieving the latest message, handling arguments, user selection via `ui.select`, clipboard writing, and UI notifications).
- `src/code-blocks.ts`: Provides a robust Markdown code block extractor (`extractCodeBlocks`) that parses opening and closing fences (using backticks or tildes).

## How it works
The extension registers a slash command `/copy-code`. When executed, the handler retrieves the session branch from `ctx.sessionManager` and scans backwards to find the last message with the `assistant` role.

The text content of the assistant message is then parsed using `extractCodeBlocks` to identify all fenced Markdown code blocks. 
- If there are no blocks, it shows a warning notification.
- If there is exactly one block (or an index is explicitly passed), it copies the block's text to the OS clipboard directly via `copyToClipboard` and triggers a success notification.
- If there are multiple blocks and no explicit index is provided, the extension opens an interactive UI prompt (`ctx.ui.select`), listing the blocks (with their language and a truncated one-line preview of their content) for the user to select from.

## Configuration
This package currently requires no special configuration keys or environment variables. It works out of the box when registered as a pi extension.

## Dependencies
- `@earendil-works/pi-coding-agent`: Provides the ExtensionAPI (commands, UI context, session access, and clipboard utility `copyToClipboard`).