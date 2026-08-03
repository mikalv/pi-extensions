import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Key } from "@earendil-works/pi-tui";
import { RegisterStore } from "./registers.ts";
import { UndoRedoBuffer } from "./undo-redo.ts";
import { ChordOverlay, type ChordCallbacks } from "./chord-overlay.ts";
import { copyToClipboard } from "./clipboard.ts";
import { THINKING_CYCLE } from "./types.ts";

const STATUS_KEY = "pi-input-shortcuts";
const STATUS_SUCCESS_MS = 2000;
const STATUS_ERROR_MS = 3000;

function showStatus(ctx: ExtensionContext, text: string, ms: number): void {
  ctx.ui.setStatus(STATUS_KEY, text);
  setTimeout(() => {
    try { ctx.ui.setStatus(STATUS_KEY, undefined); } catch {}
  }, ms);
}

function showSuccess(ctx: ExtensionContext, text: string): void {
  showStatus(ctx, text, STATUS_SUCCESS_MS);
}

function showError(ctx: ExtensionContext, text: string): void {
  showStatus(ctx, text, STATUS_ERROR_MS);
}

export default function inputShortcutsExtension(pi: ExtensionAPI): void {
  const registers = new RegisterStore();
  const undoRedo = new UndoRedoBuffer();

  let ui: ExtensionContext["ui"] | null = null;
  let inputListenerRegistered = false;
  let suppressInputListener = false;

  let pendingSnapshot: string | null = null;
  let keystrokeCount = 0;
  let lastSnapshotAt = 0;
  let snapshotTimer: ReturnType<typeof setTimeout> | null = null;

  const SNAPSHOT_PAUSE_MS = 500;
  const SNAPSHOT_COUNT_THRESHOLD = 20;
  const SNAPSHOT_TIME_MS = 3000;

  function commitSnapshot(): void {
    if (pendingSnapshot !== null) undoRedo.snapshot(pendingSnapshot);
    pendingSnapshot = null;
    keystrokeCount = 0;
    lastSnapshotAt = Date.now();
    if (snapshotTimer) {
      clearTimeout(snapshotTimer);
      snapshotTimer = null;
    }
  }

  function setupInputListener(): void {
    if (inputListenerRegistered || !ui) return;
    inputListenerRegistered = true;

    ui.onTerminalInput((data: string) => {
      if (!ui || suppressInputListener) return;
      const isEditKey = data.length === 1 || data === "\x7f" || data === "\x1b[3~" || data === "\r" || data === "\n";
      if (!isEditKey) return;

      const textBefore = ui.getEditorText();
      if (pendingSnapshot === null) {
        pendingSnapshot = textBefore;
        lastSnapshotAt = Date.now();
      }

      keystrokeCount++;
      if (keystrokeCount >= SNAPSHOT_COUNT_THRESHOLD) commitSnapshot();
      if (pendingSnapshot !== null && Date.now() - lastSnapshotAt >= SNAPSHOT_TIME_MS) commitSnapshot();

      if (snapshotTimer) clearTimeout(snapshotTimer);
      snapshotTimer = setTimeout(() => {
        if (pendingSnapshot !== null) commitSnapshot();
      }, SNAPSHOT_PAUSE_MS);
    });
  }

  function doStash(ctx: ExtensionContext): void {
    const text = ctx.ui.getEditorText();
    if (text.length > 0) {
      undoRedo.snapshot(text);
      registers.setStash(text);
      ctx.ui.setEditorText("");
      showSuccess(ctx, "✓ stash saved");
      return;
    }

    const stash = registers.getStash();
    if (stash.length === 0) {
      showError(ctx, "stash empty");
      return;
    }
    undoRedo.snapshot("");
    ctx.ui.setEditorText(stash);
    showSuccess(ctx, "✓ stash restored");
  }

  function doUndo(ctx: ExtensionContext): void {
    suppressInputListener = true;
    const result = undoRedo.undo(ctx.ui.getEditorText());
    if (result.ok) {
      ctx.ui.setEditorText(result.text);
      showSuccess(ctx, "✓ undo");
    } else {
      showError(ctx, "nothing to undo");
    }
    suppressInputListener = false;
  }

  function doRedo(ctx: ExtensionContext): void {
    suppressInputListener = true;
    const result = undoRedo.redo(ctx.ui.getEditorText());
    if (result.ok) {
      ctx.ui.setEditorText(result.text);
      showSuccess(ctx, "✓ redo");
    } else {
      showError(ctx, "nothing to redo");
    }
    suppressInputListener = false;
  }

  function doAppendRegister(ctx: ExtensionContext, index: number): void {
    const regText = registers.getRegister(index);
    if (!regText) {
      showError(ctx, `register ${index} empty`);
      return;
    }
    const current = ctx.ui.getEditorText();
    undoRedo.snapshot(current);
    ctx.ui.setEditorText(current + regText);
    showSuccess(ctx, `✓ register ${index} appended`);
  }

  function doAppendStash(ctx: ExtensionContext): void {
    const stashText = registers.getStash();
    if (!stashText) {
      showError(ctx, "stash empty");
      return;
    }
    const current = ctx.ui.getEditorText();
    undoRedo.snapshot(current);
    ctx.ui.setEditorText(current + stashText);
    showSuccess(ctx, "✓ stash appended");
  }

  function doCopy(ctx: ExtensionContext): void {
    const text = ctx.ui.getEditorText();
    if (!text) {
      showError(ctx, "nothing to copy");
      return;
    }
    const result = copyToClipboard(text);
    if (result.ok) showSuccess(ctx, "✓ copied");
    else showError(ctx, result.reason ?? "clipboard unavailable");
  }

  function doCut(ctx: ExtensionContext): void {
    const text = ctx.ui.getEditorText();
    if (!text) {
      showError(ctx, "nothing to cut");
      return;
    }
    const result = copyToClipboard(text);
    if (!result.ok) {
      showError(ctx, result.reason ?? "clipboard unavailable");
      return;
    }
    undoRedo.snapshot(text);
    ctx.ui.setEditorText("");
    showSuccess(ctx, "✓ cut");
  }

  function doToggleThinking(): void {
    const current = pi.getThinkingLevel();
    const idx = THINKING_CYCLE.indexOf(current as any);
    const next = THINKING_CYCLE[idx >= 0 ? (idx + 1) % THINKING_CYCLE.length : 0];
    pi.setThinkingLevel(next as any);
  }

  pi.registerShortcut(Key.alt("s"), {
    description: "Input shortcuts — stash, undo, redo, copy, cut, toggle thinking",
    handler: async (ctx: ExtensionContext) => {
      if (!ctx.hasUI) return;
      if (!ui) {
        ui = ctx.ui;
        setupInputListener();
      }

      suppressInputListener = true;
      if (snapshotTimer) {
        clearTimeout(snapshotTimer);
        snapshotTimer = null;
      }
      pendingSnapshot = null;
      keystrokeCount = 0;

      void ctx.ui.custom<void>(
        async (tui, theme, keybindings, done) => {
          const wrappedDone = () => {
            suppressInputListener = false;
            done();
          };

          const callbacks: ChordCallbacks = {
            onStash: () => doStash(ctx),
            onUndo: () => doUndo(ctx),
            onRedo: () => doRedo(ctx),
            onAppendRegister: (index) => doAppendRegister(ctx, index),
            onAppendStash: () => doAppendStash(ctx),
            onCopy: () => doCopy(ctx),
            onCut: () => doCut(ctx),
            onToggleThinking: () => doToggleThinking(),
          };

          return new ChordOverlay(tui, theme, keybindings, wrappedDone, callbacks);
        },
        {
          overlay: true,
          overlayOptions: {
            width: 42,
            maxHeight: 20,
            anchor: "top-center",
            margin: { top: 2, left: 2, right: 2 },
          },
        },
      );
    },
  });

  pi.registerShortcut(Key.alt("i"), {
    description: "Insert tab character into input",
    handler: async (ctx: ExtensionContext) => {
      if (!ctx.hasUI) return;
      const text = ctx.ui.getEditorText();
      ctx.ui.setEditorText(text + "\t");
    },
  });

  pi.on("session_shutdown", async () => {
    if (snapshotTimer) {
      clearTimeout(snapshotTimer);
      snapshotTimer = null;
    }
    pendingSnapshot = null;
    keystrokeCount = 0;
    lastSnapshotAt = 0;
    undoRedo.clear();
  });
}
