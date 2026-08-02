import { rmSync } from "node:fs";
import { resolve } from "node:path";

const appRoot = resolve(import.meta.dirname, "..");
const releaseDir = resolve(appRoot, "dist", "release");

rmSync(releaseDir, { recursive: true, force: true });
console.log("[marketingagents] removed dist/release before npm pack/publish");
