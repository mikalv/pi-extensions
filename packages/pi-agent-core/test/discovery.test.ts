import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  parseFrontmatter,
  parseAgentMarkdown,
} from "../src/discovery/frontmatter.js";
import {
  discoverAgents,
  getAgent,
  listAgents,
  BUNDLED_STARTER_AGENTS,
} from "../src/discovery/agent-loader.js";
import type { AgentDefinition } from "../src/types.js";

describe("Universal Agent Discovery", () => {
  describe("Frontmatter Parsing (`parseFrontmatter`)", () => {
    it("parses basic YAML frontmatter and extracts body", () => {
      const raw = `---
name: my-agent
description: A helpful agent
runtime: pi-inprocess
model: zai/glm-5.2
thinking: high
---
# Prompt Header
You are an expert system.`;

      const result = parseFrontmatter(raw);
      expect(result.frontmatter.name).toBe("my-agent");
      expect(result.frontmatter.description).toBe("A helpful agent");
      expect(result.frontmatter.runtime).toBe("pi-inprocess");
      expect(result.frontmatter.model).toBe("zai/glm-5.2");
      expect(result.frontmatter.thinking).toBe("high");
      expect(result.body).toBe("# Prompt Header\nYou are an expert system.");
    });

    it("handles quoted strings, numbers, and boolean values", () => {
      const raw = `---
name: "quoted-name"
description: 'Single quoted description'
turnBudget: 25
timeout: 120000
worktree: true
thinking: false
---
Body text here.`;

      const result = parseFrontmatter(raw);
      expect(result.frontmatter.name).toBe("quoted-name");
      expect(result.frontmatter.description).toBe("Single quoted description");
      expect(result.frontmatter.turnBudget).toBe(25);
      expect(result.frontmatter.timeout).toBe(120000);
      expect(result.frontmatter.worktree).toBe(true);
      expect(result.frontmatter.thinking).toBe(false);
      expect(result.body).toBe("Body text here.");
    });

    it("handles flow array syntax (e.g. tools: [read, grep, find])", () => {
      const raw = `---
name: tool-agent
description: Uses tools
tools: [read, grep, "find", 'bash']
skills: [brainstorming, writing-plans]
---
Prompt`;

      const result = parseFrontmatter(raw);
      expect(result.frontmatter.tools).toEqual(["read", "grep", "find", "bash"]);
      expect(result.frontmatter.skills).toEqual(["brainstorming", "writing-plans"]);
    });

    it("handles block sequence syntax (e.g. tools: \\n  - read\\n  - grep)", () => {
      const raw = `---
name: block-agent
description: Uses block lists
tools:
  - read
  - grep
  - find
skills:
  - tdd
  - verification
---
Prompt`;

      const result = parseFrontmatter(raw);
      expect(result.frontmatter.tools).toEqual(["read", "grep", "find"]);
      expect(result.frontmatter.skills).toEqual(["tdd", "verification"]);
    });

    it("handles comma-separated string for tools and skills", () => {
      const raw = `---
name: csv-agent
description: Uses comma separated tools
tools: read, grep, find, ls, bash
skills: brainstorming, executing-plans
---
Prompt`;

      const result = parseFrontmatter(raw);
      expect(result.frontmatter.tools).toEqual([
        "read",
        "grep",
        "find",
        "ls",
        "bash",
      ]);
      expect(result.frontmatter.skills).toEqual([
        "brainstorming",
        "executing-plans",
      ]);
    });

    it("ignores comments and strips inline comments", () => {
      const raw = `---
# Top level comment
name: comment-agent # inline comment
description: Tests comments # another comment
thinking: xhigh # thinking level
---
Prompt`;

      const result = parseFrontmatter(raw);
      expect(result.frontmatter.name).toBe("comment-agent");
      expect(result.frontmatter.description).toBe("Tests comments");
      expect(result.frontmatter.thinking).toBe("xhigh");
    });

    it("gracefully returns full content when frontmatter is missing or unclosed", () => {
      const noFm = "This is a document with no frontmatter.";
      const res1 = parseFrontmatter(noFm);
      expect(res1.frontmatter).toEqual({});
      expect(res1.body).toBe(noFm);

      const unclosed = "---\nname: broken\nmissing closing delimiter";
      const res2 = parseFrontmatter(unclosed);
      expect(res2.frontmatter).toEqual({});
      expect(res2.body).toBe(unclosed);
    });
  });

  describe("Agent Markdown Parser (`parseAgentMarkdown`)", () => {
    it("parses valid agent markdown into validated AgentDefinition", () => {
      const markdown = `---
name: code-reviewer
description: Expert code reviewer
runtime: pi-subprocess
model: vllm-local/qwen3.6-27b-awq
thinking: high
tools: [read, grep, find]
worktree: true
turnBudget: 15
---
You are a senior reviewer. Inspect the code carefully.`;

      const { agent, errors } = parseAgentMarkdown(
        markdown,
        "/path/to/code-reviewer.md",
        "project"
      );

      expect(errors).toHaveLength(0);
      expect(agent).toBeDefined();
      expect(agent?.name).toBe("code-reviewer");
      expect(agent?.description).toBe("Expert code reviewer");
      expect(agent?.runtime).toBe("pi-subprocess");
      expect(agent?.model).toBe("vllm-local/qwen3.6-27b-awq");
      expect(agent?.thinking).toBe("high");
      expect(agent?.tools).toEqual(["read", "grep", "find"]);
      expect(agent?.worktree).toBe(true);
      expect(agent?.turnBudget).toBe(15);
      expect(agent?.source).toBe("project");
      expect(agent?.path).toBe("/path/to/code-reviewer.md");
      expect(agent?.systemPrompt).toBe(
        "You are a senior reviewer. Inspect the code carefully."
      );
      expect(agent?.prompt).toBe(
        "You are a senior reviewer. Inspect the code carefully."
      );
    });

    it("normalizes runtime synonyms (pi -> pi-inprocess, subprocess -> pi-subprocess, etc.)", () => {
      const mk1 = `---
name: agent-1
description: Test
runtime: pi
---
Prompt`;
      const { agent: a1 } = parseAgentMarkdown(mk1);
      expect(a1?.runtime).toBe("pi-inprocess");

      const mk2 = `---
name: agent-2
description: Test
runtime: subprocess
---
Prompt`;
      const { agent: a2 } = parseAgentMarkdown(mk2);
      expect(a2?.runtime).toBe("pi-subprocess");

      const mk3 = `---
name: agent-3
description: Test
runtime: claude-cli
---
Prompt`;
      const { agent: a3 } = parseAgentMarkdown(mk3);
      expect(a3?.runtime).toBe("claude");
    });

    it("returns errors when agent name or description is missing or invalid", () => {
      const invalid = `---
runtime: pi-inprocess
---
No name or description.`;

      const { agent, errors } = parseAgentMarkdown(invalid);
      expect(agent).toBeUndefined();
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe("Multi-Source Agent Discovery (`discoverAgents`)", () => {
    let tempDir: string;
    let projectDir: string;
    let userHomeDir: string;

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pi-agent-discovery-test-"));
      projectDir = path.join(tempDir, "project");
      userHomeDir = path.join(tempDir, "home");

      await fs.mkdir(projectDir, { recursive: true });
      await fs.mkdir(userHomeDir, { recursive: true });
    });

    afterEach(async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    });

    it("includes bundled starter agents by default", async () => {
      const agents = await discoverAgents({
        cwd: projectDir,
        homeDir: userHomeDir,
      });

      expect(agents.size).toBeGreaterThan(0);
      expect(agents.has("explorer")).toBe(true);
      expect(agents.has("planner")).toBe(true);
      expect(agents.has("reviewer")).toBe(true);
      expect(agents.has("verifier")).toBe(true);
      expect(agents.has("worker")).toBe(true);

      const explorer = agents.get("explorer");
      expect(explorer?.source).toBe("bundled");
    });

    it("discovers global Pi agents (~/.pi/agent/agents/*.md and ~/.pi/agents/*.md)", async () => {
      const globalPiAgentsDir = path.join(userHomeDir, ".pi", "agent", "agents");
      await fs.mkdir(globalPiAgentsDir, { recursive: true });

      await fs.writeFile(
        path.join(globalPiAgentsDir, "custom-global.md"),
        `---
name: custom-global
description: Global pi agent
runtime: pi-inprocess
thinking: medium
---
Global prompt`
      );

      const agents = await discoverAgents({
        cwd: projectDir,
        homeDir: userHomeDir,
      });

      expect(agents.has("custom-global")).toBe(true);
      const agent = agents.get("custom-global");
      expect(agent?.source).toBe("user");
      expect(agent?.description).toBe("Global pi agent");
      expect(agent?.thinking).toBe("medium");
    });

    it("discovers Claude Code agents (~/.claude/agents/**/*.md) recursively", async () => {
      const claudeSubDir = path.join(
        userHomeDir,
        ".claude",
        "agents",
        "sub-agents",
        "engineering"
      );
      await fs.mkdir(claudeSubDir, { recursive: true });

      await fs.writeFile(
        path.join(claudeSubDir, "claude-architect.md"),
        `---
name: claude-architect
description: Claude system architect
runtime: claude
tools: [read, grep, glob]
---
Claude architect prompt`
      );

      const agents = await discoverAgents({
        cwd: projectDir,
        homeDir: userHomeDir,
      });

      expect(agents.has("claude-architect")).toBe(true);
      const agent = agents.get("claude-architect");
      expect(agent?.source).toBe("claude");
      expect(agent?.runtime).toBe("claude");
      expect(agent?.description).toBe("Claude system architect");
    });

    it("discovers project agents in <cwd>/.pi/agents/*.md", async () => {
      const projectAgentsDir = path.join(projectDir, ".pi", "agents");
      await fs.mkdir(projectAgentsDir, { recursive: true });

      await fs.writeFile(
        path.join(projectAgentsDir, "project-tester.md"),
        `---
name: project-tester
description: Project specific tester
runtime: pi-subprocess
tools: [bash, read]
---
Project prompt`
      );

      const agents = await discoverAgents({
        cwd: projectDir,
        homeDir: userHomeDir,
      });

      expect(agents.has("project-tester")).toBe(true);
      const agent = agents.get("project-tester");
      expect(agent?.source).toBe("project");
      expect(agent?.runtime).toBe("pi-subprocess");
    });

    it("enforces precedence: project > user > claude > bundled", async () => {
      // 1. Define 'reviewer' in claude
      const claudeDir = path.join(userHomeDir, ".claude", "agents");
      await fs.mkdir(claudeDir, { recursive: true });
      await fs.writeFile(
        path.join(claudeDir, "reviewer.md"),
        `---
name: reviewer
description: Claude version of reviewer
runtime: claude
---
Claude prompt`
      );

      let agents = await discoverAgents({
        cwd: projectDir,
        homeDir: userHomeDir,
      });
      // Claude overrides bundled
      expect(agents.get("reviewer")?.source).toBe("claude");
      expect(agents.get("reviewer")?.description).toBe("Claude version of reviewer");

      // 2. Define 'reviewer' in user global pi
      const userPiDir = path.join(userHomeDir, ".pi", "agent", "agents");
      await fs.mkdir(userPiDir, { recursive: true });
      await fs.writeFile(
        path.join(userPiDir, "reviewer.md"),
        `---
name: reviewer
description: User global pi reviewer
runtime: pi-subprocess
---
User global prompt`
      );

      agents = await discoverAgents({
        cwd: projectDir,
        homeDir: userHomeDir,
      });
      // User global overrides claude
      expect(agents.get("reviewer")?.source).toBe("user");
      expect(agents.get("reviewer")?.description).toBe("User global pi reviewer");

      // 3. Define 'reviewer' in project .pi/agents
      const projDir = path.join(projectDir, ".pi", "agents");
      await fs.mkdir(projDir, { recursive: true });
      await fs.writeFile(
        path.join(projDir, "reviewer.md"),
        `---
name: reviewer
description: Project override reviewer
runtime: pi-inprocess
---
Project prompt`
      );

      agents = await discoverAgents({
        cwd: projectDir,
        homeDir: userHomeDir,
      });
      // Project overrides user global
      expect(agents.get("reviewer")?.source).toBe("project");
      expect(agents.get("reviewer")?.description).toBe("Project override reviewer");
    });

    it("supports customDirs option and includeGlobal: false flag", async () => {
      const customDir = path.join(tempDir, "custom-agents");
      await fs.mkdir(customDir, { recursive: true });
      await fs.writeFile(
        path.join(customDir, "custom-seed.md"),
        `---
name: custom-seed
description: Custom directory agent
---
Custom prompt`
      );

      const agents = await discoverAgents({
        cwd: projectDir,
        homeDir: userHomeDir,
        customDirs: [customDir],
        includeGlobal: false,
      });

      expect(agents.has("custom-seed")).toBe(true);
      expect(agents.has("explorer")).toBe(true); // bundled still present
    });

    it("getAgent returns single agent or undefined if not found", async () => {
      const agent = await getAgent("explorer", {
        cwd: projectDir,
        homeDir: userHomeDir,
      });
      expect(agent).toBeDefined();
      expect(agent?.name).toBe("explorer");

      const notFound = await getAgent("nonexistent-agent-xyz", {
        cwd: projectDir,
        homeDir: userHomeDir,
      });
      expect(notFound).toBeUndefined();
    });

    it("listAgents returns a sorted array of agent definitions", async () => {
      const list = await listAgents({
        cwd: projectDir,
        homeDir: userHomeDir,
      });

      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBeGreaterThan(0);
      const names = list.map((a) => a.name);
      const sorted = [...names].sort((a, b) => a.localeCompare(b));
      expect(names).toEqual(sorted);
    });
  });
});
