export interface TextSnapshot {
  text: string;
  timestamp: number;
}

export interface RegisterData {
  stash: string;
  registers: string[];
}

export type ChordState = "idle" | "chord_root" | "chord_reg";

export const UNDO_DEBOUNCE_MS = 500;
export const MAX_UNDO_SNAPSHOTS = 50;
export const REGISTERS_FILE = ".pi/input-shortcuts/registers.json";
export const THINKING_CYCLE = ["off", "low", "medium", "high", "xhigh"] as const;
