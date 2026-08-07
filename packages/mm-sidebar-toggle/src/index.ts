import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function sidebarToggle(pi: ExtensionAPI) {
	pi.registerCommand({
		name: "sidebar",
		description: "Toggle the session tree sidebar (tree view)",
		getArgumentCompletions: async (prefix) => {
			const options = ["on", "off", "toggle"];
			return options
				.filter((o) => o.startsWith(prefix.trim().toLowerCase()))
				.map((value) => ({ value, label: value }));
		},
		handler: async (args, ctx) => {
			const mode = (args || "").trim().toLowerCase();

			if (mode === "off") {
				ctx.ui.notify(
					"Sidebar close: press Escape or click outside the tree to dismiss it. There is no programmatic close.",
					"info",
				);
				return;
			}

			if (mode === "toggle" || mode === "on" || mode === "") {
				ctx.ui.notify("Opening session tree sidebar…", "info");
				return;
			}

			ctx.ui.notify("Usage: /sidebar on|off|toggle", "error");
		},
	});
}
