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
  autoContinueEnabled: boolean;
  maxConsecutiveAutoContinues: number;
  autoContinuePrompt: string;
};

const DEFAULT_REMINDER_TEXT = [
  "Pause and do a quick agent loop check-in:",
  "",
  "1. Go back to the user's original goal — is what you're doing right now still directly serving that goal?",
  "2. Check your current evidence and direction — what has been verified, what is just a guess, and is the next step still the smallest effective action?",
  "3. Judge whether you're stuck, uncertain, or possibly off track — if so, seek advice before continuing.",
  "",
  "CRITICAL FOR CONTINUITY: If everything is clear, state your assessment in 1-2 sentences AND IMMEDIATELY invoke your next planned tool call in the same turn so execution continues without interruption.",
].join("\n");

const DEFAULT_AUTO_CONTINUE_PROMPT =
  "Continue with your planned action and invoke the next tool call.";

const DEFAULT_CONFIG: AgentLoopReflectionConfig = {
  reminderTurnsInterval: 10,
  reminderText: DEFAULT_REMINDER_TEXT,
  autoContinueEnabled: true,
  maxConsecutiveAutoContinues: 2,
  autoContinuePrompt: DEFAULT_AUTO_CONTINUE_PROMPT,
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
      typeof parsed.reminderTurnsInterval === "number" &&
      parsed.reminderTurnsInterval > 0
        ? parsed.reminderTurnsInterval
        : DEFAULT_CONFIG.reminderTurnsInterval,
    reminderText:
      typeof parsed.reminderText === "string" &&
      parsed.reminderText.trim().length > 0
        ? parsed.reminderText
        : DEFAULT_CONFIG.reminderText,
    autoContinueEnabled:
      typeof parsed.autoContinueEnabled === "boolean"
        ? parsed.autoContinueEnabled
        : DEFAULT_CONFIG.autoContinueEnabled,
    maxConsecutiveAutoContinues:
      typeof parsed.maxConsecutiveAutoContinues === "number" &&
      parsed.maxConsecutiveAutoContinues > 0
        ? parsed.maxConsecutiveAutoContinues
        : DEFAULT_CONFIG.maxConsecutiveAutoContinues,
    autoContinuePrompt:
      typeof parsed.autoContinuePrompt === "string" &&
      parsed.autoContinuePrompt.trim().length > 0
        ? parsed.autoContinuePrompt
        : DEFAULT_CONFIG.autoContinuePrompt,
  };
}

// ──── Continuation Heuristics ───────────────────────────────────

/**
 * Common patterns indicating the model planned to continue or stated an assessment,
 * rather than asking the user a direct question or ending the whole task.
 */
const CONTINUATION_PATTERNS = [
  /\bassessment\b/i,
  /\bvurdering\b/i,
  /\bnext step\b/i,
  /\bneste steg\b/i,
  /\bproceeding\b/i,
  /\bcontinuing\b/i,
  /\bfortsetter\b/i,
  /\bnå skal jeg\b/i,
  /\bjeg skal nå\b/i,
  /\bwill now\b/i,
  /\blet me\b/i,
  /\bplan\b/i,
];

/**
 * Checks if the text looks like an incomplete stopping point that intended to continue.
 */
function shouldAutoContinue(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  // If text ends with a direct question or asks the user, do not auto-continue
  if (
    trimmed.endsWith("?") ||
    /\b(hva tenker du|hva ønsker du|vil du at|skal vi|do you want|should I|please confirm|what do you think)\b/i.test(
      trimmed,
    )
  ) {
    return false;
  }

  // Check if any continuation keyword matches
  return CONTINUATION_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function extractTextFromMessage(message: unknown): string {
  if (!message || typeof message !== "object") return "";
  const msg = message as Record<string, unknown>;
  if (typeof msg.content === "string") return msg.content;
  if (Array.isArray(msg.content)) {
    return msg.content
      .filter((p: unknown) => typeof p === "object" && p !== null && (p as any).type === "text")
      .map((p: any) => p.text || "")
      .join("\n");
  }
  return "";
}

// ──── State ────────────────────────────────────────────────────

// Single countdown: how many more assistant turns before the next reminder.
let turnsUntilNextReminder = 0;
let consecutiveAutoContinues = 0;
let reminderPendingFollowup = false;

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

  const resetState = () => {
    turnsUntilNextReminder = config.reminderTurnsInterval;
    consecutiveAutoContinues = 0;
    reminderPendingFollowup = false;
  };

  resetState();

  pi.on("session_start", resetState);
  pi.on("session_tree", resetState);
  pi.on("session_compact", resetState);
  pi.on("agent_start", () => {
    // Keep countdown on agent_start unless fresh user input
  });

  pi.on("input", (event) => {
    if (event.source === "extension") return;
    // Human user typed a message, reset loop counters
    resetState();
  });

  pi.on("turn_end", (event) => {
    if (event.message.role !== "assistant") return;

    turnsUntilNextReminder--;

    // If turn ended with toolUse, agent is naturally continuing
    if (event.message.stopReason === "toolUse") {
      consecutiveAutoContinues = 0;
      reminderPendingFollowup = false;
      if (turnsUntilNextReminder <= 0) {
        pi.sendUserMessage(config.reminderText, { deliverAs: "steer" });
        turnsUntilNextReminder = config.reminderTurnsInterval + 1;
        reminderPendingFollowup = true;
      }
      return;
    }

    // Model ended turn with normal stop / no toolUse.
    // Check if it stopped right after receiving a reminder or stated continuation intent
    if (config.autoContinueEnabled && (reminderPendingFollowup || turnsUntilNextReminder <= 0)) {
      const text = extractTextFromMessage(event.message);

      if (
        consecutiveAutoContinues < config.maxConsecutiveAutoContinues &&
        (reminderPendingFollowup || shouldAutoContinue(text))
      ) {
        consecutiveAutoContinues++;
        reminderPendingFollowup = false;
        turnsUntilNextReminder = config.reminderTurnsInterval;

        // Auto-continue the loop without human intervention
        void pi.sendUserMessage(config.autoContinuePrompt, {
          deliverAs: "followUp",
        });
      }
    }
  });

  pi.on("agent_end", (event: any) => {
    if (!config.autoContinueEnabled) return;
    if (consecutiveAutoContinues >= config.maxConsecutiveAutoContinues) return;

    // If agent ended immediately after a reminder without tool use
    if (reminderPendingFollowup) {
      const lastMsg = Array.isArray(event.messages)
        ? event.messages[event.messages.length - 1]
        : null;
      const text = extractTextFromMessage(lastMsg);

      if (shouldAutoContinue(text)) {
        consecutiveAutoContinues++;
        reminderPendingFollowup = false;
        turnsUntilNextReminder = config.reminderTurnsInterval;

        void pi.sendUserMessage(config.autoContinuePrompt, {
          deliverAs: "followUp",
        });
      }
    }
  });
}
