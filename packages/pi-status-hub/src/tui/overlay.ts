import type { Component } from "@earendil-works/pi-tui";
import { truncateToWidth } from "@earendil-works/pi-tui";
import type { StatusRegistry } from "../registry.ts";
import { renderGroupData } from "./renderers.ts";

function freshness(updatedAt: number): string {
  if (!updatedAt) return "never";
  const delta = Math.max(0, Date.now() - updatedAt);
  const seconds = Math.floor(delta / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

export class StatusOverlay implements Component {
  private activeTab = 0;
  private unsubscribe?: () => void;
  onClose?: () => void;
  requestRender?: () => void;

  constructor(private registry: StatusRegistry, private refresh: () => Promise<void>) {
    this.unsubscribe = this.registry.subscribeAll(() => this.requestRender?.());
  }

  destroy(): void {
    this.unsubscribe?.();
  }

  handleInput(data: string): void {
    const groups = this.registry.getGroups();
    if (data === "\x1b[C" || data === "l") this.activeTab = (this.activeTab + 1) % groups.length;
    else if (data === "\x1b[D" || data === "h") this.activeTab = (this.activeTab - 1 + groups.length) % groups.length;
    else if (data === "r" || data === "R") void this.refresh();
    else if (data === "q" || data === "\x1b") {
      this.destroy();
      this.onClose?.();
    }
  }

  render(width: number): string[] {
    const groups = this.registry.getGroups();
    if (groups.length === 0) return ["Status Hub", "", "No groups registered."];
    const group = groups[this.activeTab]!;
    const data = this.registry.getCachedData(group.id);
    const inner = Math.max(20, width - 4);
    const tabText = groups.map((g, i) => {
      const summary = this.registry.getCachedData(g.id)?.summary;
      return i === this.activeTab ? `[${g.name}]` : summary ? `${g.name}` : `${g.name}?`;
    }).join(" · ");
    const header = ` Status Hub · ${group.name}`;
    const subheader = ` ${data?.source || "unknown source"} · ${freshness(this.registry.getUpdatedAt(group.id))}`;
    const lines = [
      `┌${"─".repeat(inner)}┐`,
      `│${truncateToWidth(header, inner, "").padEnd(inner)}│`,
      `│${truncateToWidth(subheader, inner, "").padEnd(inner)}│`,
      `├${"─".repeat(inner)}┤`,
      `│${truncateToWidth(tabText, inner, "").padEnd(inner)}│`,
      `├${"─".repeat(inner)}┤`,
    ];
    for (const line of renderGroupData(group.id, data).slice(0, 13)) {
      lines.push(`│${truncateToWidth(line, inner, "").padEnd(inner)}│`);
    }
    while (lines.length < 20) lines.push(`│${" ".repeat(inner)}│`);
    lines.push(`├${"─".repeat(inner)}┤`);
    lines.push(`│${truncateToWidth("h/l switch · r refresh · q close", inner, "").padEnd(inner)}│`);
    lines.push(`└${"─".repeat(inner)}┘`);
    return lines;
  }
}
