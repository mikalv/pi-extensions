import {
  Container,
  Key,
  matchesKey,
  Text,
  type Focusable,
  type TUI,
  type KeybindingsManager,
} from "@earendil-works/pi-tui";
import type { ChordState } from "./types.ts";

interface ThemeLike {
  fg(color: string, text: string): string;
}

export interface ChordCallbacks {
  onStash: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onAppendRegister: (index: number) => void;
  onAppendStash: () => void;
  onCopy: () => void;
  onCut: () => void;
  onToggleThinking: () => void;
}

const ROOT_ACTIONS: Array<{ key: string; label: string }> = [
  { key: "S", label: "Stash / Restore" },
  { key: "U", label: "Undo" },
  { key: "R", label: "Redo" },
  { key: "A", label: "Append from register" },
  { key: "Y", label: "Copy to clipboard" },
  { key: "D", label: "Cut to clipboard" },
  { key: "T", label: "Toggle thinking" },
];

function buildRegisterActions(): Array<{ key: string; label: string }> {
  const actions: Array<{ key: string; label: string }> = [];
  for (let i = 0; i <= 9; i++) actions.push({ key: String(i), label: `Register ${i}` });
  actions.push({ key: "S", label: "Stash register" });
  return actions;
}

export class ChordOverlay extends Container implements Focusable {
  private _focused = true;
  private state: ChordState = "chord_root";
  private actionLines: Text[] = [];
  private tui: TUI;
  private theme: ThemeLike;
  private done: () => void;
  private callbacks: ChordCallbacks;

  get focused(): boolean {
    return this._focused;
  }

  set focused(value: boolean) {
    this._focused = value;
  }

  constructor(
    tui: TUI,
    theme: ThemeLike,
    _keybindings: KeybindingsManager,
    done: () => void,
    callbacks: ChordCallbacks,
  ) {
    super();
    this.tui = tui;
    this.theme = theme;
    this.done = done;
    this.callbacks = callbacks;
    this.renderRootMenu();
  }

  private renderRootMenu(): void {
    this.state = "chord_root";
    this.actionLines = ROOT_ACTIONS.map((a) => new Text(`  ${this.theme.fg("accent", `[${a.key}]`)} ${a.label}`, 1, 0));
    this.tui.requestRender();
  }

  private renderRegisterMenu(): void {
    this.state = "chord_reg";
    this.actionLines = buildRegisterActions().map((a) => new Text(`  ${this.theme.fg("accent", `[${a.key}]`)} ${a.label}`, 1, 0));
    this.tui.requestRender();
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape)) {
      this.done();
      return;
    }

    const key = data.toLowerCase();
    if (this.state === "chord_root") this.handleRootKey(key);
    else this.handleRegKey(key);
  }

  private handleRootKey(key: string): void {
    switch (key) {
      case "s": return this.closeThenExecute(() => this.callbacks.onStash());
      case "u": return this.closeThenExecute(() => this.callbacks.onUndo());
      case "r": return this.closeThenExecute(() => this.callbacks.onRedo());
      case "a": return this.renderRegisterMenu();
      case "y": return this.closeThenExecute(() => this.callbacks.onCopy());
      case "d": return this.closeThenExecute(() => this.callbacks.onCut());
      case "t": return this.closeThenExecute(() => this.callbacks.onToggleThinking());
      default:
        this.done();
    }
  }

  private handleRegKey(key: string): void {
    if (key === "s") return this.closeThenExecute(() => this.callbacks.onAppendStash());
    if (/^[0-9]$/.test(key)) return this.closeThenExecute(() => this.callbacks.onAppendRegister(parseInt(key, 10)));
    this.done();
  }

  private closeThenExecute(action: () => void): void {
    this.done();
    setTimeout(action, 0);
  }

  dispose(): void {}

  render(width: number): string[] {
    const dialogWidth = Math.min(40, Math.max(28, width));
    const innerWidth = dialogWidth - 2;
    const lines: string[] = [];
    lines.push(this.theme.fg("borderMuted", `┌${"─".repeat(innerWidth)}┐`));
    const title = this.state === "chord_root" ? "Input Shortcuts" : "Append from register";
    lines.push(`${this.theme.fg("borderMuted", "│")}${this.theme.fg("accent", title.padEnd(innerWidth))}${this.theme.fg("borderMuted", "│")}`);
    lines.push(this.theme.fg("borderMuted", `├${"─".repeat(innerWidth)}┤`));
    for (const line of this.actionLines) {
      const rendered = line.render(innerWidth)[0] ?? "";
      lines.push(`${this.theme.fg("borderMuted", "│")}${rendered.padEnd(innerWidth)}${this.theme.fg("borderMuted", "│")}`);
    }
    lines.push(this.theme.fg("borderMuted", `└${"─".repeat(innerWidth)}┘`));
    return lines;
  }
}
