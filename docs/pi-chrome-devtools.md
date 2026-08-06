# pi-chrome-devtools

**Purpose**: Pi extension that exposes Chrome DevTools Protocol (CDP) tools for inspecting and controlling Chrome tabs.

## Tools / Commands / Hooks

**Tools provided:**
- `chrome_devtools_list_pages`: List Chrome tabs/pages from a running Chrome DevTools Protocol endpoint.
- `chrome_devtools_select_page`: Select the active Chrome page for later CDP tool calls.
- `chrome_devtools_navigate`: Navigate a Chrome page to a URL, creating a page first if none is available.
- `chrome_devtools_evaluate`: Evaluate JavaScript in a Chrome page.
- `chrome_devtools_screenshot`: Capture a PNG screenshot from a Chrome page (supports full page capture).

**Commands provided:**
- `/chrome-devtools`: Open Chrome DevTools help and tool controls. Subcommands include `menu`, `help`, `quickstart`, `status`, `tools`, `enable`, and `disable`.

**Hooks:**
- Listens to `session_start` to load Chrome DevTools settings, apply enabled tools, and show any configuration notices.
- Listens to `session_shutdown` to shut down managed browser instances and clean up state.

## Key Files
- `src/index.ts`: Extension entry point, re-exports from `chrome-devtools.ts`.
- `src/chrome-devtools.ts`: Registers tools and slash command, handles session start/shutdown hooks and the TUI menu.
- `src/tools.ts`: Tool implementations using CDP for listing, navigating, evaluating, and screenshotting.
- `src/cdp-client.ts`: The raw WebSocket CDP client implementation and page discovery utilities.
- `src/browser-manager.ts` (implied from imports): Handles launching and managing a local Chrome instance if one isn't running.
- `src/settings.ts`: Handles reading/writing the `pi-chrome-devtools.json` settings file to remember enabled tools.

## How it works
The extension connects to a Chrome instance running with `--remote-debugging-port`. By default, it manages a local browser instance (auto-launching it if needed). When tools are invoked, the extension uses a raw WebSocket CDP client (`src/cdp-client.ts`) to communicate with the browser, sending commands like `Page.navigate`, `Runtime.evaluate`, and `Page.captureScreenshot`. 

Users can toggle which CDP tools are available to the agent via the `/chrome-devtools` command. This configuration is persisted in the agent directory as `pi-chrome-devtools.json`. A selected page state (`state.activePageId`) is kept in memory so tools like evaluate and screenshot can operate on the same tab without specifying the page ID every time.

## Configuration
- `PI_CHROME_DEVTOOLS_HOST`: Explicit host for CDP connection (default: `127.0.0.1`).
- `PI_CHROME_DEVTOOLS_PORT`: Explicit port for CDP connection (default: `9222`).
- `PI_CHROME_DEVTOOLS_AUTO_LAUNCH`: Set to `"0"` to disable auto-launching a managed browser.
- `PI_CHROME_DEVTOOLS_BROWSER`: Explicit path to a browser executable to use for auto-launch.
- **Settings file**: Persists tool selection state in `~/.pi/agent/pi-chrome-devtools.json` (or legacy `pi-chrome-devtools-settings.json`).

## Dependencies
- `@narumitw/pi-tui-kit`: Used for rendering the interactive TUI menu for `/chrome-devtools`.
- `typebox`: Used for defining tool parameter schemas.
