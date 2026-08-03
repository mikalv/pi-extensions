import { execSync } from "node:child_process";

export interface ClipboardResult {
  ok: boolean;
  text?: string;
  reason?: string;
}

type ClipboardTool = "xclip" | "xsel" | "pbcopy" | "clip" | "powershell" | null;

let cachedTool: ClipboardTool | undefined;

function detectClipboard(): ClipboardTool {
  if (cachedTool !== undefined) return cachedTool;

  const tools: Array<{ name: ClipboardTool; test: string }> = [
    { name: "xclip", test: "xclip -selection clipboard -o" },
    { name: "xsel", test: "xsel --clipboard --output" },
    { name: "pbcopy", test: "pbpaste" },
    { name: "clip", test: "echo test | clip" },
    { name: "powershell", test: "powershell -command Get-Clipboard" },
  ];

  for (const tool of tools) {
    try {
      execSync(tool.test, { stdio: "ignore", timeout: 2000 });
      cachedTool = tool.name;
      return cachedTool;
    } catch {
      // try next tool
    }
  }

  cachedTool = null;
  return null;
}

export function copyToClipboard(text: string): ClipboardResult {
  const tool = detectClipboard();
  if (!tool) return { ok: false, reason: "clipboard unavailable" };

  try {
    switch (tool) {
      case "xclip":
        execSync("xclip -selection clipboard", { input: text, timeout: 2000 });
        break;
      case "xsel":
        execSync("xsel --clipboard --input", { input: text, timeout: 2000 });
        break;
      case "pbcopy":
        execSync("pbcopy", { input: text, timeout: 2000 });
        break;
      case "clip":
        execSync("clip", { input: text, timeout: 2000 });
        break;
      case "powershell":
        execSync(`powershell -command "Set-Clipboard -Value '${text.replace(/'/g, "''")}'"`, { timeout: 2000 });
        break;
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "clipboard write failed" };
  }
}
