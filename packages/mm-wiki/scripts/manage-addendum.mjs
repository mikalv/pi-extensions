import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const START = "<!-- @meeh/mm-wiki:safety-addendum:start -->";
const END = "<!-- @meeh/mm-wiki:safety-addendum:end -->";
const action = process.argv[2] ?? "status";
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(packageRoot, "extras", "APPEND_SYSTEM.md");
const agentDir = process.env.PI_AGENT_DIR?.trim()
  ? path.resolve(process.env.PI_AGENT_DIR.trim())
  : path.join(os.homedir(), ".pi", "agent");
const destination = path.join(agentDir, "APPEND_SYSTEM.md");

function normalize(value) {
  return value.replace(/\r\n/g, "\n");
}

async function readIfPresent(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
}

const payload = normalize(await fs.readFile(sourcePath, "utf8")).trim();
const current = normalize(await readIfPresent(destination));
const hasManagedBlock = current.includes(START) && current.includes(END);
const hasUnmanagedCopy = !hasManagedBlock && current.includes(payload);

if (action === "status") {
  const status = hasManagedBlock ? "installed (managed block)" : hasUnmanagedCopy ? "already present (unmanaged copy)" : "not installed";
  console.log(`Safety addendum: ${status}\n${destination}`);
} else if (action === "install") {
  if (hasManagedBlock || hasUnmanagedCopy) {
    console.log(`Safety addendum is already present; no changes made.\n${destination}`);
  } else {
    await fs.mkdir(agentDir, { recursive: true });
    const prefix = current.trimEnd();
    const next = `${prefix ? `${prefix}\n\n` : ""}${START}\n${payload}\n${END}\n`;
    await fs.writeFile(destination, next, { encoding: "utf8", mode: 0o600 });
    console.log(`Installed the optional safety addendum. Reload or restart Pi.\n${destination}`);
  }
} else if (action === "remove") {
  if (!hasManagedBlock) {
    const reason = hasUnmanagedCopy
      ? "The addendum exists without package markers; remove it manually to avoid deleting unrelated content."
      : "No managed safety addendum is installed.";
    console.log(`${reason}\n${destination}`);
  } else {
    const start = current.indexOf(START);
    const end = current.indexOf(END, start);
    if (end < 0) throw new Error("Managed addendum has a start marker but no end marker");
    const before = current.slice(0, start).trimEnd();
    const after = current.slice(end + END.length).trimStart();
    const remaining = [before, after].filter(Boolean).join("\n\n");
    await fs.writeFile(destination, remaining ? `${remaining}\n` : "", { encoding: "utf8", mode: 0o600 });
    console.log(`Removed the managed safety addendum. Reload or restart Pi.\n${destination}`);
  }
} else {
  console.error("Usage: node scripts/manage-addendum.mjs <status|install|remove>");
  process.exitCode = 2;
}
