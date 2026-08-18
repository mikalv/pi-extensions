import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { AgentDefinition, AgentSource } from "../types.js";
import { parseAgentMarkdown } from "./frontmatter.js";

/**
 * Built-in standard agent definitions (fallback starter seeds)
 */
export const BUNDLED_STARTER_AGENTS: AgentDefinition[] = [
  {
    name: "explorer",
    description: "Fast read-only exploration and search agent for discovering code, structure, and references",
    runtime: "pi-inprocess",
    thinking: "low",
    tools: ["read", "grep", "find", "ls"],
    source: "bundled",
    systemPrompt: "You are an exploration subagent. Find and summarize codebase structures, definitions, and references without modifying files.",
    prompt: "You are an exploration subagent. Find and summarize codebase structures, definitions, and references without modifying files.",
  },
  {
    name: "planner",
    description: "Architectural design, system modeling, and task breakdown specialist",
    runtime: "pi-inprocess",
    thinking: "high",
    tools: ["read", "grep", "find", "ls"],
    source: "bundled",
    systemPrompt: "You are a software architect and planning subagent. Create thorough, actionable, bite-sized implementation plans with TDD steps.",
    prompt: "You are a software architect and planning subagent. Create thorough, actionable, bite-sized implementation plans with TDD steps.",
  },
  {
    name: "reviewer",
    description: "Code review specialist focusing on correctness, regressions, security, and edge-case handling",
    runtime: "pi-inprocess",
    thinking: "xhigh",
    tools: ["read", "grep", "find", "ls"],
    source: "bundled",
    systemPrompt: "You are a zero-trust code reviewer. Verify changes against actual file diffs, test evidence, and safety boundaries.",
    prompt: "You are a zero-trust code reviewer. Verify changes against actual file diffs, test evidence, and safety boundaries.",
  },
  {
    name: "verifier",
    description: "Adversarial verification specialist executing tests and providing strict PASS/FAIL/PARTIAL verdicts",
    runtime: "pi-subprocess",
    thinking: "high",
    tools: ["read", "grep", "find", "ls", "bash"],
    source: "bundled",
    systemPrompt: "You are an adversarial verification specialist. Run builds, tests, and static checks. Conclude with VERDICT: PASS | FAIL | PARTIAL.",
    prompt: "You are an adversarial verification specialist. Run builds, tests, and static checks. Conclude with VERDICT: PASS | FAIL | PARTIAL.",
  },
  {
    name: "worker",
    description: "Focused single-writer implementation subagent executing assigned tasks with narrow, verified edits",
    runtime: "pi-inprocess",
    thinking: "medium",
    tools: ["read", "edit", "write", "grep", "find", "ls", "bash"],
    source: "bundled",
    systemPrompt: "You are an implementation subagent. Make minimal, correct changes following existing patterns and verify them.",
    prompt: "You are an implementation subagent. Make minimal, correct changes following existing patterns and verify them.",
  },
  {
    name: "debugger",
    description: "Root-cause diagnosis, bug reproduction, and failure analysis specialist",
    runtime: "pi-subprocess",
    thinking: "high",
    tools: ["read", "grep", "find", "ls", "bash"],
    source: "bundled",
    systemPrompt: "You are a debugging subagent. Isolate root causes, reproduce failures, and identify minimal corrective actions.",
    prompt: "You are a debugging subagent. Isolate root causes, reproduce failures, and identify minimal corrective actions.",
  },
  {
    name: "researcher",
    description: "Documentation, external dependency, and API research specialist",
    runtime: "pi-inprocess",
    thinking: "medium",
    tools: ["read", "grep", "find"],
    source: "bundled",
    systemPrompt: "You are a research subagent. Synthesize technical documentation, architecture decisions, and external interfaces.",
    prompt: "You are a research subagent. Synthesize technical documentation, architecture decisions, and external interfaces.",
  },
  {
    name: "sp-brainstorm",
    description: "Superpowers collaborative brainstorming specialist for requirements and architectural design",
    runtime: "pi-inprocess",
    thinking: "high",
    tools: ["read", "grep", "find"],
    source: "bundled",
    systemPrompt: "You are the Superpowers brainstorming agent. Explore requirements, edge cases, and design choices iteratively.",
    prompt: "You are the Superpowers brainstorming agent. Explore requirements, edge cases, and design choices iteratively.",
  },
  {
    name: "sp-plan",
    description: "Superpowers plan authoring specialist creating bite-sized TDD implementation plans",
    runtime: "pi-inprocess",
    thinking: "high",
    tools: ["read", "grep", "find", "write"],
    source: "bundled",
    systemPrompt: "You are the Superpowers planning agent. Author detailed, verified implementation plans with checkbox steps.",
    prompt: "You are the Superpowers planning agent. Author detailed, verified implementation plans with checkbox steps.",
  },
  {
    name: "sp-implement",
    description: "Superpowers implementation agent executing plans with git worktree isolation and test-first discipline",
    runtime: "pi-subprocess",
    worktree: true,
    thinking: "medium",
    tools: ["read", "edit", "write", "grep", "find", "ls", "bash"],
    source: "bundled",
    systemPrompt: "You are the Superpowers implementation subagent. Execute plan tasks methodically with TDD and verification.",
    prompt: "You are the Superpowers implementation subagent. Execute plan tasks methodically with TDD and verification.",
  },
];

export interface DiscoverAgentsOptions {
  cwd?: string;
  homeDir?: string;
  includeGlobal?: boolean;
  customDirs?: string[];
  bundledDir?: string;
}

/**
 * Recursively scans directory for .md agent files
 */
async function scanDirForMarkdownFiles(
  dirPath: string,
  recursive = false
): Promise<string[]> {
  try {
    const stat = await fs.stat(dirPath);
    if (!stat.isDirectory()) return [];
  } catch {
    return [];
  }

  const results: string[] = [];
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory() && recursive) {
        const subFiles = await scanDirForMarkdownFiles(fullPath, true);
        results.push(...subFiles);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        results.push(fullPath);
      }
    }
  } catch {
    // Ignore unreadable dirs
  }
  return results;
}

/**
 * Loads agents from a given directory and marks their source
 */
async function loadAgentsFromDir(
  dirPath: string,
  source: AgentSource,
  recursive = false
): Promise<AgentDefinition[]> {
  const files = await scanDirForMarkdownFiles(dirPath, recursive);
  const agents: AgentDefinition[] = [];

  for (const filePath of files) {
    try {
      const content = await fs.readFile(filePath, "utf8");
      const { agent, errors } = parseAgentMarkdown(content, filePath, source);
      if (agent && errors.length === 0) {
        agents.push(agent);
      }
    } catch {
      // Ignore read errors
    }
  }

  return agents;
}

/**
 * Universal agent discovery across bundled, Claude, global Pi, and project scopes
 * Precedence: customDirs > project > user > claude > bundled
 */
export async function discoverAgents(
  opts: DiscoverAgentsOptions = {}
): Promise<Map<string, AgentDefinition>> {
  const cwd = opts.cwd ?? process.cwd();
  const homeDir = opts.homeDir ?? os.homedir();
  const includeGlobal = opts.includeGlobal ?? true;

  const agentMap = new Map<string, AgentDefinition>();

  // 1. Bundled Starter Agents (lowest base precedence)
  for (const bundled of BUNDLED_STARTER_AGENTS) {
    agentMap.set(bundled.name, { ...bundled });
  }

  // 1b. If custom bundledDir is provided, load it
  if (opts.bundledDir) {
    const bundledFiles = await loadAgentsFromDir(opts.bundledDir, "bundled", false);
    for (const agent of bundledFiles) {
      agentMap.set(agent.name, agent);
    }
  }

  // 2. Claude Code agents: ~/.claude/agents/**/*.md (recursive)
  if (includeGlobal) {
    const claudeAgentsDir = path.join(homeDir, ".claude", "agents");
    const claudeAgents = await loadAgentsFromDir(claudeAgentsDir, "claude", true);
    for (const agent of claudeAgents) {
      agentMap.set(agent.name, agent);
    }
  }

  // 3. User Global Pi agents: ~/.pi/agent/agents/*.md and ~/.pi/agents/*.md
  if (includeGlobal) {
    const piAgentAgentsDir = path.join(homeDir, ".pi", "agent", "agents");
    const piAgentsDir = path.join(homeDir, ".pi", "agents");

    const userAgents1 = await loadAgentsFromDir(piAgentAgentsDir, "user", false);
    for (const agent of userAgents1) {
      agentMap.set(agent.name, agent);
    }

    const userAgents2 = await loadAgentsFromDir(piAgentsDir, "user", false);
    for (const agent of userAgents2) {
      agentMap.set(agent.name, agent);
    }
  }

  // 4. Project Agents: <cwd>/.pi/agents/*.md and <cwd>/.pi/agent/agents/*.md
  if (cwd) {
    const projAgentsDir = path.join(cwd, ".pi", "agents");
    const projAgentAgentsDir = path.join(cwd, ".pi", "agent", "agents");

    const projAgents1 = await loadAgentsFromDir(projAgentsDir, "project", false);
    for (const agent of projAgents1) {
      agentMap.set(agent.name, agent);
    }

    const projAgents2 = await loadAgentsFromDir(projAgentAgentsDir, "project", false);
    for (const agent of projAgents2) {
      agentMap.set(agent.name, agent);
    }
  }

  // 5. Custom directories (highest precedence)
  if (opts.customDirs && opts.customDirs.length > 0) {
    for (const customDir of opts.customDirs) {
      const customAgents = await loadAgentsFromDir(customDir, "user", false);
      for (const agent of customAgents) {
        agentMap.set(agent.name, agent);
      }
    }
  }

  return agentMap;
}

/**
 * Retrieves a single agent definition by name
 */
export async function getAgent(
  name: string,
  opts: DiscoverAgentsOptions = {}
): Promise<AgentDefinition | undefined> {
  const agents = await discoverAgents(opts);
  return agents.get(name);
}

/**
 * Lists all discovered agents as a sorted array
 */
export async function listAgents(
  opts: DiscoverAgentsOptions = {}
): Promise<AgentDefinition[]> {
  const agents = await discoverAgents(opts);
  return Array.from(agents.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}
