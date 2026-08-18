import type { WorkflowMeta } from "../types.js";

export interface ScriptValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  meta?: WorkflowMeta;
}

/**
 * Script linter and validator for JS workflow scripts.
 * Catches unawaited promises/IIFEs, illegal globals, and extracts metadata.
 */
export class ScriptLinter {
  /**
   * Validate and lint a workflow script.
   */
  public static validate(script: string): ScriptValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!script || typeof script !== "string" || !script.trim()) {
      return {
        valid: false,
        errors: ["Workflow script is empty or not a string"],
        warnings: [],
      };
    }

    const trimmed = script.trim();

    // 1. Basic JS syntax validation
    try {
      // Test compilation without executing
      new Function(
        "agent",
        "parallel",
        "pipeline",
        "phase",
        "state",
        "console",
        "sleep",
        "steer",
        "abort",
        `return (async () => {\n${trimmed}\n})();`
      );
    } catch (syntaxError: any) {
      errors.push(`Syntax error: ${syntaxError?.message || String(syntaxError)}`);
      return { valid: false, errors, warnings };
    }

    // 2. Detect unawaited IIFEs: (async () => { ... })() without await or return
    // Matches (async (...) => { ... })() or (async function(...) { ... })() not preceded by await or return
    const unawaitedIifeRegex =
      /(?<!(?:await|return)\s+)\(\s*async\s*(?:\([^)]*\)|[a-zA-Z_$][\w$]*|\(\))\s*=>\s*\{[\s\S]*?\}\s*\)\s*\(\s*\)/g;
    if (unawaitedIifeRegex.test(trimmed)) {
      warnings.push(
        "Detected unawaited async IIFE: `(async () => { ... })()`. Prefix with `await` to ensure proper execution ordering."
      );
    }

    // 3. Detect unawaited orchestration primitives: agent(...), parallel(...), pipeline(...)
    // Look for lines where agent/parallel/pipeline is called without await, return, const/let/var assignment with await, or Promise.all
    const lines = trimmed.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      // Skip commented lines
      if (line.startsWith("//") || line.startsWith("/*") || line.startsWith("*")) {
        continue;
      }

      // Check for unawaited top-level agent/parallel/pipeline calls
      // e.g. "agent('explorer', ...)" without "await" or "const x = await" or "return"
      const unawaitedCallRegex =
        /^(?:const\s+\w+\s*=\s*|let\s+\w+\s*=\s*|var\s+\w+\s*=\s*)?(agent|parallel|pipeline)\s*\(/;
      if (unawaitedCallRegex.test(line)) {
        if (!line.includes("await") && !line.startsWith("return")) {
          warnings.push(
            `Line ${i + 1}: Call to \`${line.match(unawaitedCallRegex)?.[1]}\` appears unawaited. Prefix with \`await\` to prevent unhandled background promises.`
          );
        }
      }
    }

    // 4. Detect dangerous or illegal operations
    const forbiddenPatterns: Array<{ regex: RegExp; message: string }> = [
      {
        regex: /\bprocess\.exit\s*\(/,
        message: "Forbidden call to `process.exit()`. Use return or throw instead.",
      },
      {
        regex: /\beval\s*\(/,
        message: "Forbidden call to `eval()`. Workflow scripts must not evaluate arbitrary dynamic strings.",
      },
      {
        regex: /\b(?:require\s*\(\s*['"]child_process['"]|import\s*\(\s*['"]child_process['"])/,
        message: "Direct access to `child_process` is not allowed. Use `agent()` to dispatch tasks.",
      },
      {
        regex: /\bprocess\.env\.[a-zA-Z0-9_]+\s*=/,
        message: "Direct mutation of `process.env` in workflow scripts is disallowed.",
      },
    ];

    for (const { regex, message } of forbiddenPatterns) {
      if (regex.test(trimmed)) {
        errors.push(message);
      }
    }

    // 5. Extract metadata if defined (e.g. const meta = { name: "...", phases: [...] })
    const meta = ScriptLinter.extractMeta(trimmed);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      meta,
    };
  }

  /**
   * Extract WorkflowMeta from script if present
   */
  public static extractMeta(script: string): WorkflowMeta | undefined {
    try {
      // Look for const meta = { ... } or var meta = { ... } or let meta = { ... }
      const metaMatch = script.match(
        /(?:const|let|var)\s+meta\s*=\s*(\{[\s\S]*?\});/
      );
      if (metaMatch && metaMatch[1]) {
        // Evaluate the meta object literal in isolated scope
        const parsed = new Function(`return (${metaMatch[1]});`)();
        if (parsed && typeof parsed === "object" && typeof parsed.name === "string") {
          return {
            name: parsed.name,
            description: typeof parsed.description === "string" ? parsed.description : undefined,
            phases: Array.isArray(parsed.phases) ? parsed.phases.map(String) : undefined,
          };
        }
      }
    } catch {
      // Ignore meta extraction errors if not strict JSON/JS object
    }

    return undefined;
  }
}

export function validateWorkflowScript(script: string): ScriptValidationResult {
  return ScriptLinter.validate(script);
}
