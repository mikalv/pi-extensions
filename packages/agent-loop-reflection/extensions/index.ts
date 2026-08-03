import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  type ExtensionAPI,
  type ExtensionContext,
  getAgentDir,
} from "@earendil-works/pi-coding-agent";

// ──── Config ────────────────────────────────────────────────────

export type AgentLoopReflectionConfig = {
  reminderTurnsInterval: number;
  reminderText: string;
};

const DEFAULT_REMINDER_TEXT = [
  "Pause before continuing and do an agent-loop reflection:",
  "",
  "1. Return to the user's original goal: does what you're doing still serve that goal directly?",
  "2. Check current evidence and direction: what is verified, what is still a guess, and is the next step still the smallest useful action?",
  "3. Decide whether you are stuck, uncertain, or possibly off track: if so, call `advisor` for guidance before continuing.",
  "",
  "If everything is still clear, state your reasoning in one or two sentences, then continue.",
].join("\n");

const DEFAULT_CONFIG: AgentLoopReflectionConfig = {
  reminderTurnsInterval: 10,
  reminderText: DEFAULT_REMINDER_TEXT,
};

const CONFIG_PATH = join(getAgentDir(), "cnife-agent-loop-reflection.json");
const STATUS_KEY = "agent-loop-reflection";

function warnConfig(message: string): void {
  console.warn(`[agent-loop-reflection] ${message}`);
}

function saveDefaultConfig(path: string): void {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`, "utf-8");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function loadConfig(): AgentLoopReflectionConfig | null {
  if (!existsSync(CONFIG_PATH)) {
    try {
      saveDefaultConfig(CONFIG_PATH);
    } catch {
      warnConfig("Failed to create default config file");
      return null;
    }
    return { ...DEFAULT_CONFIG };
  }

  let raw: string;
  try {
    raw = readFileSync(CONFIG_PATH, "utf-8");
  } catch {
    warnConfig("Failed to read config file, using defaults");
    return { ...DEFAULT_CONFIG };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    warnConfig("Invalid JSON in config file, using defaults");
    return { ...DEFAULT_CONFIG };
  }

  if (!isRecord(parsed)) {
    warnConfig("Config is not an object, using defaults");
    return { ...DEFAULT_CONFIG };
  }

  if (
    parsed.reminderTurnsInterval !== undefined &&
    !isPositiveInteger(parsed.reminderTurnsInterval)
  ) {
    warnConfig(
      "reminderTurnsInterval must be a positive integer, using defaults",
    );
    return { ...DEFAULT_CONFIG };
  }

  if (
    parsed.reminderText !== undefined &&
    (typeof parsed.reminderText !== "string" ||
      parsed.reminderText.trim().length === 0)
  ) {
    warnConfig("reminderText must be a non-empty string, using defaults");
    return { ...DEFAULT_CONFIG };
  }

  return {
    reminderTurnsInterval:
      parsed.reminderTurnsInterval !== undefined
        ? (parsed.reminderTurnsInterval as number)
        : DEFAULT_CONFIG.reminderTurnsInterval,
    reminderText:
      parsed.reminderText !== undefined
        ? (parsed.reminderText as string)
        : DEFAULT_CONFIG.reminderText,
  };
}

// ──── State ────────────────────────────────────────────────────

// Single countdown: how many more assistant turns before the next reminder.
let turnsUntilNextReminder = 0;

function setConfigErrorStatus(ctx: ExtensionContext): void {
  ctx.ui.setStatus(
    STATUS_KEY,
    ctx.ui.theme.fg("error", "agent-loop-reflection config error"),
  );
}

// ──── Entry Point ──────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  const config = loadConfig();
  if (!config) {
    pi.on("session_start", (_event, ctx) => {
      setConfigErrorStatus(ctx);
    });
    return;
  }

  turnsUntilNextReminder = config.reminderTurnsInterval;

  pi.on("session_start", () => {
    turnsUntilNextReminder = config.reminderTurnsInterval;
  });
  pi.on("session_tree", () => {
    turnsUntilNextReminder = config.reminderTurnsInterval;
  });
  pi.on("session_compact", () => {
    turnsUntilNextReminder = config.reminderTurnsInterval;
  });
  pi.on("agent_start", () => {
    turnsUntilNextReminder = config.reminderTurnsInterval;
  });
  pi.on("agent_end", () => {
    turnsUntilNextReminder = config.reminderTurnsInterval;
  });

  pi.on("input", (event) => {
    if (event.source === "extension") return;
    turnsUntilNextReminder = config.reminderTurnsInterval;
  });

  pi.on("turn_end", (event) => {
    if (event.message.role !== "assistant") return;

    turnsUntilNextReminder--;

    if (event.message.stopReason !== "toolUse") return;
    if (turnsUntilNextReminder > 0) return;

    pi.sendUserMessage(config.reminderText, { deliverAs: "steer" });
    turnsUntilNextReminder = config.reminderTurnsInterval + 1;
  });
}
