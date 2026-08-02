import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DEFAULT_CONFIG = {
  enabled: true,
  title: "Pi",
  sound: "Glass",
  max_message_length: 180,
  ignore_nested_pi: true,
  events: {
    session_start: false,
    agent_start: false,
    agent_settled: true,
    tool_error: false,
    user_question: true,
    model_select: false,
    message_end: false,
    session_shutdown: false,
    thinking_level_select: false,
    session_compact: false,
  },
};

type Config = typeof DEFAULT_CONFIG;

const GLOBAL_DIR = join(homedir(), ".pi", "agent");
const EXTENSIONS_DIR = join(GLOBAL_DIR, "extensions");
const CONFIG_DIR = join(EXTENSIONS_DIR, "pi-macos-notify");
const CONFIG_PATH = join(CONFIG_DIR, "macos-notify.toml");
const DEFAULT_CONFIG_TOML = `enabled = true
title = "Pi"
sound = "Glass" # set "" for silent
max_message_length = 180
ignore_nested_pi = true # suppress when this Pi was launched by another Pi bash tool

[events]
session_start = false
agent_start = false
agent_settled = true
tool_error = false
user_question = true
model_select = false
message_end = false # payload text, off by default
session_shutdown = false
thinking_level_select = false
session_compact = false
`;

function ensureDefaultConfig() {
  mkdirSync(CONFIG_DIR, { recursive: true });
  if (!existsSync(CONFIG_PATH)) writeFileSync(CONFIG_PATH, DEFAULT_CONFIG_TOML);
}

function parseValue(raw: string): string | boolean | number {
  const value = raw.trim();
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^\d+$/.test(value)) return Number(value);
  return value.replace(/^"|"$/g, "");
}

function applyConfig(config: Config, path: string) {
  let section: "root" | "events" = "root";
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const clean = line.replace(/\s+#.*$/, "").trim();
    if (!clean) continue;
    if (clean === "[events]") {
      section = "events";
      continue;
    }
    const match = clean.match(/^(\w+)\s*=\s*(.+)$/);
    if (!match) continue;
    const [, key, raw] = match;
    const value = parseValue(raw);
    if (section === "events" && key in config.events && typeof value === "boolean") {
      config.events[key as keyof Config["events"]] = value;
    } else if (section === "root" && key in config && key !== "events") {
      (config as any)[key] = value;
    }
  }
}

function loadConfig(ctx?: ExtensionContext): Config {
  ensureDefaultConfig();
  const config = structuredClone(DEFAULT_CONFIG);
  const paths = [
    CONFIG_PATH,
    ctx?.isProjectTrusted() ? join(ctx.cwd, ".pi", "macos-notify.toml") : undefined,
    process.env.PI_MACOS_NOTIFY_CONFIG,
  ].filter(Boolean) as string[];

  for (const path of paths) if (existsSync(path)) applyConfig(config, path);
  return config;
}

function textFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => {
      const text = (block as { text?: unknown }).text;
      return typeof text === "string" ? text : "";
    })
    .filter(Boolean)
    .join("\n");
}

function truncate(text: string, max: number) {
  return max > 0 && text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function questionText(input: unknown): string {
  const value = input as { question?: unknown; context?: unknown };
  return [value.context, value.question].filter((v) => typeof v === "string" && v.trim()).join("\n") || "Waiting for your answer";
}

export function isPermissionPrompt(input: unknown): boolean {
  return /permissions?.*required|required.*permissions?/i.test(questionText(input));
}

function isNestedPi() {
  return Boolean(process.env.PI_SESSION_ID || process.env.PI_SESSION_FILE);
}

function notify(config: Config, subtitle: string, message: string, ctx?: ExtensionContext, level: "info" | "error" = "info") {
  if (!config.enabled || (config.ignore_nested_pi && isNestedPi())) return;
  const body = truncate(message, config.max_message_length);
  if (process.platform !== "darwin") {
    ctx?.ui.notify(`${subtitle}: ${body}`, level);
    return;
  }
  const q = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const sound = config.sound ? ` sound name "${q(config.sound)}"` : "";
  execFile("osascript", [
    "-e",
    `display notification "${q(body)}" with title "${q(config.title)}" subtitle "${q(subtitle)}"${sound}`,
  ]);
}

export default function (pi: ExtensionAPI) {
  const send = (
    ctx: ExtensionContext,
    event: keyof Config["events"],
    subtitle: string,
    message: string,
    level: "info" | "error" = "info",
  ) => {
    const config = loadConfig(ctx);
    if (config.events[event]) notify(config, subtitle, message, ctx, level);
  };

  pi.on("session_start", (event, ctx) => {
    send(ctx, "session_start", "Session", `Started (${event.reason})`);
  });

  pi.on("session_shutdown", (event, ctx) => {
    send(ctx, "session_shutdown", "Session", `Ended (${event.reason})`);
  });

  pi.on("session_compact", (event, ctx) => {
    send(ctx, "session_compact", "Session", `Compacted (${event.reason})`);
  });

  pi.on("agent_start", (_event, ctx) => {
    send(ctx, "agent_start", "Agent", "Started working");
  });

  pi.on("agent_settled", (_event, ctx) => {
    send(ctx, "agent_settled", "Agent", "Finished");
  });

  pi.on("tool_execution_start", (event, ctx) => {
    if (["ask_question", "ask_user", "question"].includes(event.toolName) && !isPermissionPrompt(event.args)) {
      send(ctx, "user_question", "Needs input", questionText(event.args));
    }
  });

  pi.on("tool_execution_end", (event, ctx) => {
    if (!event.isError) return;
    const detail = textFromContent((event.result as any)?.content);
    send(ctx, "tool_error", "Tool error", detail ? `${event.toolName}: ${detail}` : event.toolName, "error");
  });

  pi.on("model_select", (event, ctx) => {
    send(ctx, "model_select", "Model", `${event.model.provider}/${event.model.id}`);
  });

  pi.on("thinking_level_select", (event, ctx) => {
    send(ctx, "thinking_level_select", "Thinking", event.level);
  });

  pi.on("message_end", (event, ctx) => {
    const message = event.message as any;
    const text = textFromContent(message.content);
    if (text) send(ctx, "message_end", `Message: ${message.role}`, text);
  });

  pi.registerCommand("notify-test", {
    description: "Send a test macOS notification",
    handler: async (_args, ctx) => notify(loadConfig(ctx), "Test", "Pi notifications are working", ctx),
  });
}
