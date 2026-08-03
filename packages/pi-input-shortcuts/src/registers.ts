import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { RegisterData } from "./types.ts";
import { REGISTERS_FILE } from "./types.ts";

const EMPTY_DATA: RegisterData = {
  stash: "",
  registers: ["", "", "", "", "", "", "", "", "", ""],
};

export class RegisterStore {
  private data: RegisterData | null = null;
  private filePath: string;
  private loaded = false;

  constructor(baseDir?: string) {
    this.filePath = baseDir ? join(baseDir, REGISTERS_FILE) : REGISTERS_FILE;
  }

  getStash(): string {
    this.ensureLoaded();
    return this.data!.stash;
  }

  setStash(text: string): void {
    this.ensureLoaded();
    this.data!.stash = text;
    this.save();
  }

  getRegister(index: number): string {
    if (index < 0 || index > 9) return "";
    this.ensureLoaded();
    return this.data!.registers[index] ?? "";
  }

  setRegister(index: number, text: string): void {
    if (index < 0 || index > 9) return;
    this.ensureLoaded();
    this.data!.registers[index] = text;
    this.save();
  }

  private ensureLoaded(): void {
    if (this.loaded) return;
    this.loaded = true;

    try {
      if (existsSync(this.filePath)) {
        const raw = readFileSync(this.filePath, "utf-8");
        const parsed = JSON.parse(raw) as Partial<RegisterData>;
        this.data = {
          stash: typeof parsed.stash === "string" ? parsed.stash : "",
          registers: Array.isArray(parsed.registers) && parsed.registers.length === 10
            ? parsed.registers.map((r) => (typeof r === "string" ? r : ""))
            : [...EMPTY_DATA.registers],
        };
      } else {
        this.data = { ...EMPTY_DATA, registers: [...EMPTY_DATA.registers] };
      }
    } catch {
      this.data = { ...EMPTY_DATA, registers: [...EMPTY_DATA.registers] };
    }
  }

  private save(): void {
    try {
      const dir = dirname(this.filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      const tmpPath = this.filePath + ".tmp";
      writeFileSync(tmpPath, JSON.stringify(this.data, null, 2), "utf-8");
      renameSync(tmpPath, this.filePath);
    } catch {
      // best effort
    }
  }
}
