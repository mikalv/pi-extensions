import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { registerHiggsfieldTools } from "./ads-tools/higgsfield.js";
import { registerMetaTools } from "./ads-tools/meta.js";

export default function adsTools(pi: ExtensionAPI): void {
	registerHiggsfieldTools(pi);
	registerMetaTools(pi);
}
