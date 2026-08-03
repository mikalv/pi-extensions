import type { TextSnapshot } from "./types.ts";
import { MAX_UNDO_SNAPSHOTS, UNDO_DEBOUNCE_MS } from "./types.ts";

export interface UndoRedoResult {
  text: string;
  ok: boolean;
  reason?: string;
}

export class UndoRedoBuffer {
  private undoStack: TextSnapshot[] = [];
  private redoStack: TextSnapshot[] = [];
  private lastSnapshotAt = 0;

  snapshot(text: string): void {
    const now = Date.now();
    if (now - this.lastSnapshotAt < UNDO_DEBOUNCE_MS) return;

    this.undoStack.push({ text, timestamp: now });
    if (this.undoStack.length > MAX_UNDO_SNAPSHOTS) {
      this.undoStack.shift();
    }
    this.redoStack = [];
    this.lastSnapshotAt = now;
  }

  undo(currentText: string): UndoRedoResult {
    if (this.undoStack.length === 0) {
      return { text: currentText, ok: false, reason: "nothing to undo" };
    }

    const snapshot = this.undoStack.pop()!;
    this.redoStack.push({ text: currentText, timestamp: Date.now() });
    return { text: snapshot.text, ok: true };
  }

  redo(currentText: string): UndoRedoResult {
    if (this.redoStack.length === 0) {
      return { text: currentText, ok: false, reason: "nothing to redo" };
    }

    const snapshot = this.redoStack.pop()!;
    this.undoStack.push({ text: currentText, timestamp: Date.now() });
    return { text: snapshot.text, ok: true };
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.lastSnapshotAt = 0;
  }
}
