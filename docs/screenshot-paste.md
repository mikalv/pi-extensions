# screenshot-paste
**pi-web plugin that captures pasted screenshots into a local folder (`.pi-web/paste/`) and provides a workspace gallery, lightbox viewer, and inline chat previews.**

## Tools / commands / hooks provided
- **Command Palette Command:** `workspace:screenshot-paste` ("Paste Gallery: Browse Screenshot") which focuses the Paste panel.
- **Workspace Panel:** `paste` (Screenshot Paste gallery) which displays the images saved in `.pi-web/paste/` and provides a "Clean Gallery" button to clear the directory.
- **Workspace Label (hidden):** `paste-runtime-tracker` which quietly tracks the active workspace/machine runtime.
- **Hooks & Listeners:** 
  - Global `paste` event listener to intercept image pastes.
  - DOM `MutationObserver` on chat nodes to inject inline `<img>` thumbnails when a user message references a `.pi-web/paste/...` file.

## Key files
- `pi-web-plugin.js`: The main plugin entry point and single implementation file. Handles the `piWeb.plugins` registration, React-like UI rendering via `html`/`svg` tagged templates, file operations through `context.files`, DOM observation, and image resizing logic.

## How it works
This extension runs as a UI plugin inside `pi-web` rather than a standard Node.js `pi` extension. When a user pastes an image, the plugin intercepts the global `paste` event. It allows `pi-web`'s native `prompt-editor` to handle the actual attachment pipeline (so native thumbnails and delivery dropdowns remain intact), while in parallel resizing/compressing the image to JPEG and saving it to `.pi-web/paste/<timestamp>.jpg` using the `pi-web` federated `context.files` API.

The plugin provides a workspace panel that reads this directory and renders a gallery of past screenshots. Clicking a gallery item opens a full-screen lightbox viewer. The plugin also actively ensures that `.pi-web/paste/` is added to the project's `.gitignore` to avoid committing temporary screenshots.

Additionally, a DOM observer (`chatObserver`) watches the chat stream for `.pi-web/paste/` text references inside `pi-user-message` nodes. Because `pi-web` natively renders folder-mode attachment references as plain text in the ChatView, this plugin automatically injects inline `<img>` preview thumbnails under the text so users can visually see the screenshots they referenced.

## Configuration
There are no explicit config keys or settings.json entries. The plugin behaves automatically based on paste actions and manages its own storage dir at `.pi-web/paste/`.

## Dependencies
- Runs in `pi-web` (uses the `piWeb.plugins` API).
- Relies on `context.files` (federated files API: `readFile`, `writeFile`, `deleteFile`).
- Natively uses DOM APIs (Canvas for image resizing, MutationObserver for chat modification).
