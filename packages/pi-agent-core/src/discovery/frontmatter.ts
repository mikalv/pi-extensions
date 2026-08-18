import {
  type AgentDefinition,
  type AgentSource,
  type RuntimeType,
  type ThinkingLevel,
  type ModelTier,
  validateAgentDefinition,
} from "../types.js";

export interface ParsedFrontmatter {
  frontmatter: Record<string, unknown>;
  body: string;
}

/**
 * Normalizes runtime strings from aliases to standard RuntimeType
 */
export function normalizeRuntime(raw?: unknown): RuntimeType {
  if (typeof raw !== "string" || !raw.trim()) {
    return "pi-inprocess";
  }
  const normalized = raw.trim().toLowerCase();
  switch (normalized) {
    case "pi":
    case "pi-inprocess":
    case "inprocess":
    case "in-process":
    case "direct":
      return "pi-inprocess";
    case "subprocess":
    case "pi-subprocess":
    case "fork":
      return "pi-subprocess";
    case "claude":
    case "claude-cli":
    case "claude-agent":
      return "claude";
    case "codex":
    case "codex-cli":
      return "codex";
    default:
      return "pi-inprocess";
  }
}

/**
 * Normalizes thinking level strings or booleans
 */
export function normalizeThinking(raw?: unknown): ThinkingLevel | boolean | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") {
    const s = raw.trim().toLowerCase();
    if (s === "true") return true;
    if (s === "false") return false;
    if (
      ["off", "minimal", "low", "medium", "high", "xhigh", "max"].includes(s)
    ) {
      return s as ThinkingLevel;
    }
  }
  return undefined;
}

/**
 * Normalizes tool names list from array, CSV string, or block list
 */
export function normalizeTools(raw?: unknown): string[] | undefined {
  if (!raw) return undefined;
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    // Check if it's bracketed JSON / YAML list: [read, grep]
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      const inner = trimmed.slice(1, -1);
      return inner
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    }
    return trimmed
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return undefined;
}

/**
 * Robust zero-dependency YAML frontmatter parser
 */
export function parseFrontmatter(content: string): ParsedFrontmatter {
  const normalized = content.replace(/\r\n/g, "\n");
  const trimmedStart = normalized.trimStart();

  if (!trimmedStart.startsWith("---")) {
    return { frontmatter: {}, body: normalized };
  }

  // Find closing --- delimiter after first line
  const startIdx = normalized.indexOf("---");
  const endIdx = normalized.indexOf("\n---", startIdx + 3);
  if (endIdx === -1) {
    return { frontmatter: {}, body: normalized };
  }

  const frontmatterRaw = normalized.slice(startIdx + 3, endIdx);
  const body = normalized.slice(endIdx + 4).trim();

  const lines = frontmatterRaw.split("\n");
  const frontmatter: Record<string, unknown> = {};

  let currentKey: string | null = null;
  let currentList: string[] | null = null;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    // Remove comments unless quoted
    let line = rawLine;
    const hashIndex = line.indexOf("#");
    if (hashIndex !== -1) {
      // Check if hash is inside quotes
      const beforeHash = line.slice(0, hashIndex);
      const singleQuotes = (beforeHash.match(/'/g) || []).length;
      const doubleQuotes = (beforeHash.match(/"/g) || []).length;
      if (singleQuotes % 2 === 0 && doubleQuotes % 2 === 0) {
        line = beforeHash;
      }
    }

    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check for block list item (e.g. "  - item" or "- item")
    if (trimmed.startsWith("-") && currentKey) {
      const itemVal = trimmed.slice(1).trim().replace(/^["']|["']$/g, "");
      if (!currentList) {
        currentList = [];
        frontmatter[currentKey] = currentList;
      }
      currentList.push(itemVal);
      continue;
    }

    // Key-value pair (e.g. "name: reviewer" or "tools: [read, grep]")
    const colonIndex = line.indexOf(":");
    if (colonIndex !== -1) {
      const key = line.slice(0, colonIndex).trim();
      const valStr = line.slice(colonIndex + 1).trim();

      if (!key) continue;
      currentKey = key;
      currentList = null;

      if (!valStr) {
        // Value might follow in block list or nested lines
        frontmatter[key] = undefined;
        continue;
      }

      // Check if bracketed array: [a, b, "c"]
      if (valStr.startsWith("[") && valStr.endsWith("]")) {
        const inner = valStr.slice(1, -1).trim();
        if (inner.length === 0) {
          frontmatter[key] = [];
        } else {
          frontmatter[key] = inner
            .split(",")
            .map((item) => item.trim().replace(/^["']|["']$/g, ""))
            .filter(Boolean);
        }
        continue;
      }

      // String unquoting
      let val: unknown = valStr;
      if (
        (valStr.startsWith('"') && valStr.endsWith('"')) ||
        (valStr.startsWith("'") && valStr.endsWith("'"))
      ) {
        val = valStr.slice(1, -1);
      } else if (valStr.toLowerCase() === "true") {
        val = true;
      } else if (valStr.toLowerCase() === "false") {
        val = false;
      } else if (/^-?\d+(\.\d+)?$/.test(valStr)) {
        val = Number(valStr);
      } else if (
        (key === "tools" || key === "skills") &&
        valStr.includes(",")
      ) {
        // Comma separated list
        val = valStr
          .split(",")
          .map((s) => s.trim().replace(/^["']|["']$/g, ""))
          .filter(Boolean);
      }

      frontmatter[key] = val;
    }
  }

  return { frontmatter, body };
}

/**
 * Parses markdown content into a validated AgentDefinition
 */
export function parseAgentMarkdown(
  content: string,
  filePath?: string,
  source: AgentSource = "bundled"
): { agent?: AgentDefinition; errors: string[] } {
  const { frontmatter, body } = parseFrontmatter(content);

  const rawName =
    typeof frontmatter.name === "string" ? frontmatter.name.trim() : "";
  const rawDesc =
    typeof frontmatter.description === "string"
      ? frontmatter.description.trim()
      : "";

  const runtime = normalizeRuntime(frontmatter.runtime);
  const thinking = normalizeThinking(frontmatter.thinking);
  const tools = normalizeTools(frontmatter.tools);
  const skills = normalizeTools(frontmatter.skills);

  const rawCandidate: Record<string, unknown> = {
    name: rawName,
    description: rawDesc,
    runtime,
    model: typeof frontmatter.model === "string" ? frontmatter.model : undefined,
    thinking,
    tools,
    skills,
    worktree: Boolean(frontmatter.worktree),
    turnBudget:
      typeof frontmatter.turnBudget === "number"
        ? frontmatter.turnBudget
        : undefined,
    timeout:
      typeof frontmatter.timeout === "number"
        ? frontmatter.timeout
        : undefined,
    tier: typeof frontmatter.tier === "string" ? (frontmatter.tier as ModelTier) : undefined,
    source,
    path: filePath,
    systemPrompt: body || undefined,
    prompt: body || undefined,
  };

  const validation = validateAgentDefinition(rawCandidate);
  if (!validation.valid || !validation.agent) {
    return { errors: validation.errors };
  }

  return { agent: validation.agent, errors: [] };
}
