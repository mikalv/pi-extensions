import { readFile, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
    type ExtensionCategoryId,
    type ExtensionItem,
    deriveExtensionId,
} from "./types.js";

/**
 * Patterns for categorizing extensions based on path or name.
 */
const CATEGORY_PATTERNS: Array<{
    category: ExtensionCategoryId;
    patterns: RegExp[];
}> = [
    {
        category: "memory",
        patterns: [
            /mm-memory/i,
            /mm-observational-memory/i,
            /observational-memory/i,
            /mm-wiki/i,
            /context-control/i,
            /prune-context/i,
            /pi-prism/i,
            /pi-context/i,
            /context-memory/i,
        ],
    },
    {
        category: "agents",
        patterns: [
            /pi-agent-core/i,
            /pi-agent-memory/i,
            /pi-task-notifications/i,
            /agent-guidance/i,
            /agent-loop-reflection/i,
            /pi-superagents/i,
            /pi-subagent/i,
            /coordinator/i,
        ],
    },
    {
        category: "tools",
        patterns: [
            /execute-python/i,
            /clipboard/i,
            /copymsgs/i,
            /shortcuts-help/i,
            /scheduler/i,
            /pi-adhd-tasks/i,
            /pi-worktree/i,
            /auto-retry/i,
            /code-actions/i,
            /pi-input-shortcuts/i,
            /pi-plan-mode/i,
            /pi-review/i,
            /pi-rtk/i,
            /pi-grill-me/i,
            /pi-background-tasks/i,
            /mm-adhd/i,
            /mm-btw/i,
            /mm-elixir/i,
            /mm-qq/i,
            /mm-lazy/i,
            /ask-user-question/i,
        ],
    },
    {
        category: "ui",
        patterns: [
            /pi-atelier/i,
            /powerline-footer/i,
            /tab-status/i,
            /files-widget/i,
            /claude-spinner/i,
            /amphetamine/i,
            /pi-status-hub/i,
            /pi-image-drop/i,
            /mm-usage-center/i,
            /usage-center/i,
            /theme-switcher/i,
        ],
    },
    {
        category: "diagnostics",
        patterns: [
            /pi-model-restriction/i,
            /token-rate/i,
            /session-recap/i,
            /pi-auth-extension/i,
            /provider-retry-proxy/i,
            /cursor-runtime/i,
            /auto-naming-session/i,
            /execution-time/i,
            /pi-backoffice-reporter/i,
            /notify/i,
            /system-prompt/i,
        ],
    },
];

/**
 * Human-readable friendly display names for known extensions
 */
const KNOWN_NAMES: Record<string, string> = {
    "pi-agent-core": "Agent Core",
    "pi-agent-memory": "Agent Memory",
    "pi-task-notifications": "Task Notifications",
    "mm-memory": "Prism Memory (LTM)",
    "mm-observational-memory": "Observational Memory",
    "mm-wiki": "Topic Wiki",
    "context-control": "Context Control",
    "prune-context": "Prune Context",
    "pi-prism": "Prism Bridge",
    "execute-python": "Execute Python",
    clipboard: "Clipboard (OSC 52)",
    copymsgs: "Copy Messages",
    "shortcuts-help": "Shortcuts Help",
    scheduler: "Cron & Scheduler",
    "pi-adhd-tasks": "ADHD Tasks",
    "pi-worktree": "Git Worktree Manager",
    "auto-retry": "Auto-Retry Provider",
    "code-actions": "Code Actions",
    "pi-input-shortcuts": "Input Shortcuts (Alt+S)",
    "pi-plan-mode": "Plan Mode",
    "pi-review": "Code Review Workflow",
    "pi-rtk": "RTK Shell Rewriter",
    "pi-grill-me": "Grill-Me Adversarial Mode",
    "pi-background-tasks": "Background Tasks",
    "pi-atelier": "Atelier Sidebar & Hub",
    "powerline-footer": "Powerline Footer",
    "tab-status": "Tab Status Indicator",
    "files-widget": "Files Widget",
    "claude-spinner": "Claude Spinner",
    amphetamine: "Amphetamine Sleep Inhibitor",
    "pi-status-hub": "Status Hub",
    "pi-image-drop": "Image Drop & Decode",
    "mm-usage-center": "Usage Center & Heatmap",
    "pi-model-restriction": "Model Restriction Gate",
    "token-rate": "Live Token Rate & Speed",
    "session-recap": "Session Recap",
    "pi-auth-extension": "Auth & Token Management",
    "provider-retry-proxy": "Provider Retry Proxy",
    "cursor-runtime": "Cursor Connect Runtime",
    "auto-naming-session": "Auto-Naming Session",
    "execution-time": "Execution Timer",
    "pi-backoffice-reporter": "Backoffice Reporter",
    notify: "Desktop Notifications",
    "system-prompt": "System Prompt Inspector",
};

/**
 * Human-readable descriptions for known extensions
 */
const KNOWN_DESCRIPTIONS: Record<string, string> = {
    "pi-agent-core":
        "Unified subagent control-plane with multi-runtime runners, JS worker workflows, and TUI overlays",
    "pi-agent-memory":
        "Scoped persistent agent memory across user, project, and local workspaces",
    "pi-task-notifications":
        "Structured run results emitting <task-notification> XML and JSONL history",
    "mm-memory":
        "Prism Long-Term Memory (LTM) search, remember, and deterministic forget",
    "mm-observational-memory":
        "Background cognitive loop tracking observations, reflections, and session ledgers",
    "mm-wiki": "Curated cross-session topical wiki filesystem",
    "context-control":
        "Interactive TUI navigator for selecting and disabling project context files",
    "prune-context": "Token-saving history compactor and message pruner",
    "pi-prism": "Direct Prism API client and collection manager",
    "execute-python": "Safe sandboxed in-process Python execution tools",
    clipboard: "Universal OSC 52 clipboard copy and native OS clipboard bridge",
    copymsgs: "Command /copymsgs for copying turns to clipboard",
    "shortcuts-help":
        "Popup cheat sheet for Alt+S chords and navigation shortcuts",
    scheduler: "Background task scheduler with cron syntax and session alarms",
    "pi-adhd-tasks": "Fast todo and project task tracking with fs.watch reload",
    "pi-worktree": "Isolated git worktree dispatching for parallel agent runs",
    "auto-retry":
        "Automatic triangular exponential backoff on 429/502/503 errors",
    "code-actions": "Visual code action menu for inline refactoring",
    "pi-input-shortcuts":
        "Modal key chord sequences for fast editor navigation",
    "pi-plan-mode": "Structured plan drafting and execution framework",
    "pi-review": "Multi-turn adversarial code review pipeline",
    "pi-rtk": "Shell command token-saving wrapper",
    "pi-grill-me": "Interactive adversarial interrogation mode",
    "pi-background-tasks": "Long-running async background task supervisor",
    "pi-atelier":
        "Full-featured sidebar controller, status hub, and workspace dashboard",
    "powerline-footer":
        "Modern powerline status line with Git branch, model, and tokens",
    "tab-status": "Terminal tab title synchronization with current agent state",
    "files-widget": "Inline visual active files widget above editor",
    "claude-spinner":
        "Smooth animated Braille and dots spinner during thinking",
    amphetamine: "Prevents system sleep during active agent executions",
    "pi-status-hub": "Aggregated status overview of all background agents",
    "pi-image-drop": "Drag-and-drop image decoder and OCR pre-processor",
    "mm-usage-center":
        "Interactive usage dashboard with GitHub-style contribution heatmap",
    "pi-model-restriction":
        "Hard provider restriction policy for sensitive data projects",
    "token-rate": "Live tokens/second speed and latency meter",
    "session-recap": "Compact summary generator of conversation milestones",
    "pi-auth-extension": "Credential vault and token authentication manager",
    "provider-retry-proxy": "Shared local proxy server on 127.0.0.1:7878",
    "cursor-runtime": "Cursor Connect protocol client and agent runtime",
    "auto-naming-session": "AI-powered session auto-titling on initial turns",
    "execution-time": "High-precision execution timer per tool invocation",
    "pi-backoffice-reporter":
        "Telemetry reporter for central backoffice monitoring",
    notify: "Native macOS and system notification sender",
    "system-prompt":
        "View, copy, and inspect the dynamically assembled system prompt",
};

/**
 * Categorize an extension path into one of the 6 standard categories.
 */
export function categorizeExtension(filePath: string): ExtensionCategoryId {
    const normalized = filePath.replace(/\\/g, "/");
    const id = deriveExtensionId(filePath);

    for (const { category, patterns } of CATEGORY_PATTERNS) {
        for (const pat of patterns) {
            if (pat.test(normalized) || pat.test(id)) {
                return category;
            }
        }
    }

    return "other";
}

/**
 * Alias for categorizeExtension matching test contract.
 */
export const matchExtensionToCategory = categorizeExtension;

/**
 * Derive a clean, human-readable display name for an extension path.
 */
export function deriveExtensionName(filePath: string): string {
    const id = deriveExtensionId(filePath);
    if (KNOWN_NAMES[id]) {
        return KNOWN_NAMES[id];
    }

    // Fallback: title-case the slug (e.g. "my-cool-tool" -> "My Cool Tool")
    return id
        .split(/[-_]/)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
}

/**
 * Derive a description for an extension path.
 */
export function deriveExtensionDescription(filePath: string): string {
    const id = deriveExtensionId(filePath);
    if (KNOWN_DESCRIPTIONS[id]) {
        return KNOWN_DESCRIPTIONS[id];
    }
    return `Extension module loaded from ${filePath}`;
}

export interface LoadCatalogOptions {
    packageJsonPath?: string;
    extensionsList?: string[];
    activeExtensions?: string[];
    /** Path to the pi-extensions repo that owns the catalog. */
    repoPath?: string;
    /** Project directory being configured; searched last. */
    cwd?: string;
}

/** How far up the directory tree to look for a catalog package.json. */
const MAX_UPWARD_DEPTH = 8;

/**
 * Read `pi.extensions` from a package.json, or undefined when it declares none.
 */
async function readExtensionPaths(
    packageJsonPath: string,
): Promise<string[] | undefined> {
    try {
        const content = await readFile(packageJsonPath, "utf-8");
        const pkg = JSON.parse(content);
        if (!Array.isArray(pkg?.pi?.extensions)) return undefined;
        const paths = pkg.pi.extensions.filter(
            (p: unknown): p is string => typeof p === "string",
        );
        return paths.length > 0 ? paths : undefined;
    } catch {
        return undefined;
    }
}

async function isRepoRoot(dir: string): Promise<boolean> {
    try {
        await stat(join(dir, ".git"));
        return true;
    } catch {
        return false;
    }
}

/**
 * Walk up from a directory collecting package.json files that declare
 * extensions, stopping at the repository root.
 *
 * The outermost match wins: an individual package declares only itself, while
 * the repo root aggregates the whole catalog.
 */
async function findCatalogUpwards(
    startDir: string,
): Promise<string[] | undefined> {
    let dir = resolve(startDir);
    let outermost: string[] | undefined;

    for (let depth = 0; depth < MAX_UPWARD_DEPTH; depth++) {
        const paths = await readExtensionPaths(join(dir, "package.json"));
        if (paths) outermost = paths;
        if (await isRepoRoot(dir)) break;
        const parent = dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }

    return outermost;
}

/**
 * Locate the extension catalog.
 *
 * The catalog is declared by the pi-extensions repo, which is normally not the
 * project being configured, so the project cwd alone cannot find it.
 */
async function resolveCatalogPaths(
    options: LoadCatalogOptions,
): Promise<string[] | undefined> {
    const explicit: string[] = [];
    if (options.packageJsonPath) explicit.push(options.packageJsonPath);
    if (options.repoPath) explicit.push(join(options.repoPath, "package.json"));
    const envRepo = process.env.PI_EXTENSIONS_PATH?.trim();
    if (envRepo) explicit.push(join(envRepo, "package.json"));

    for (const candidate of explicit) {
        const paths = await readExtensionPaths(candidate);
        if (paths) return paths;
    }

    // This module ships inside the pi-extensions repo, so walking up from its
    // own location finds the catalog whatever the project cwd happens to be.
    try {
        const fromModule = await findCatalogUpwards(
            dirname(fileURLToPath(import.meta.url)),
        );
        if (fromModule) return fromModule;
    } catch {
        // import.meta.url unavailable (e.g. bundled to CJS)
    }

    return findCatalogUpwards(options.cwd ?? process.cwd());
}

/**
 * Load and categorize the full extension catalog.
 */
export async function loadExtensionCatalog(
    options: LoadCatalogOptions = {},
): Promise<ExtensionItem[]> {
    let rawPaths: string[] = [];

    if (options.extensionsList && options.extensionsList.length > 0) {
        rawPaths = [...options.extensionsList];
    } else {
        rawPaths = (await resolveCatalogPaths(options)) ?? [];
    }

    const activeSet = new Set(
        (options.activeExtensions || []).map((p) =>
            p.replace(/\\/g, "/").replace(/^\.\//, ""),
        ),
    );

    const items: ExtensionItem[] = [];

    for (const rawPath of rawPaths) {
        const normalized = rawPath.replace(/\\/g, "/").replace(/^\.\//, "");
        const id = deriveExtensionId(rawPath);
        const category = categorizeExtension(rawPath);
        const name = deriveExtensionName(rawPath);
        const description = deriveExtensionDescription(rawPath);
        const isDefault = activeSet.has(normalized) || activeSet.has(rawPath);

        items.push({
            id,
            name,
            path: rawPath,
            category,
            description,
            isDefault,
            source: "local",
        });
    }

    return items;
}
