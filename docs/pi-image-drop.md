# Pi Image Drop

Pi extension for staging browser images and attaching them to the next message.

## Tools / commands / hooks provided
- **Commands**: 
  - `/image-drop` - Opens the Image Drop menu in TUI mode to adjust limit settings or spawn a dropzone server.
- **Events/Hooks**: 
  - `session_start`: Starts the Image Drop local HTTP server and initializes the reservation batch if configured.
  - `session_shutdown`: Gracefully shuts down the local server and cleans up resources.
  - `input`: Intercepts user terminal input. If images are staged in the dropzone, it merges them with the user text and forwards the message to the model.
  - `before_agent_start`: Marks preflight execution to track reservation boundaries.
  - `message_start`: Inspects user messages for image content matching the active reservation.
  - `agent_settled`: Recovers orphaned image reservations if a queued message wasn't delivered.
- **UI**: Integrates with Pi's widget system (under the `image-drop` key) to show the staging status (e.g., "X images ready").

## Key files
- `src/image-drop.ts`: The extension entry file initializing the runtime.
- `src/runtime.ts`: The main `ImageDropRuntime` state machine tying together the Pi event lifecycle, input interception, and image reservation recovery.
- `src/server.ts`: `ImageDropServer`, a local HTTP server handling secure bootstrap tokens, serving the React web interface, and exposing API endpoints for image uploads.
- `src/batch.ts`: `BatchStore`, which manages the queue of staged images, processing states, byte-size limits, and history.
- `src/images.ts`: `ImageProcessor`, handling the actual image resizing and format conversion using `sharp` and related decoding libraries.
- `src/menu.ts`: The interactive TUI menu logic for configuring limits.
- `src/settings.ts`: Schema and logic for reading configuration from `~/.pi/agent/image-drop.json`.

## How it works
`pi-image-drop` sets up a staging pipeline between a web browser and the Pi conversational CLI. Upon session start, it launches a secure, ephemeral local web server running a React-based "dropzone" application. It issues a one-time bootstrap link to authenticate a browser session. 

Users can drag and drop images into this browser window. The images are uploaded to the local server, processed, resized according to configured dimensions and quality limits, and placed into a staging `BatchStore`. 

In the Pi terminal, the `ImageDropRuntime` listens to the `input` event. When a user submits a prompt, the runtime checks if any images are staged. If so, it intercepts the prompt, packages it alongside the staged image contents, and submits the combined payload to the AI model. It carefully tracks the delivery through `message_start` and `agent_settled` hooks; if the model run aborts or fails to accept the message, the images are automatically recovered back to the staging area so they are not lost.

## Configuration
Configuration is stored in `~/.pi/agent/image-drop.json`. Available keys:
- `startOnSessionStart` (boolean): Whether to automatically start the server when a session begins (default: `false`).
- `port` (number): Port for the local server, `0` for random (default: `0`).
- `maxImagesPerMessage` (number): Maximum number of images allowed per prompt (default: `10`).
- `maxSizePerMessageBytes` (number): Total cumulative byte limit for all images in one prompt (default: 10MB).
- `maxSizePerImageBytes` (number): Individual byte limit per image (default: 5MB).
- `resizeMaxDimension` (number): Maximum width or height an image will be resized to (default: `1024`).
- `jpegQuality` (number): JPEG compression quality for resized images (default: `80`).
- `openLink` (boolean): Whether to automatically open the dropzone link in the default browser (default: `true`).

## Dependencies
- `@narumitw/pi-tui-kit`: TUI components for the limit configuration menu.
- `sharp`, `bmp-js`, `heic-decode`: Libraries for reading, decoding, resizing, and converting images to web/AI-compatible formats.
- `react`, `react-dom`, `@radix-ui/*`: Frontend libraries used for building the browser dropzone UI.
