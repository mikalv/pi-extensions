import {
  type Component,
  matchesKey,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";
import {
  CATEGORY_METADATA,
  EXTENSION_CATEGORIES,
  type ExtensionCategoryId,
  type ExtensionItem,
  type PresetProfile,
} from "../types.js";
import { listPresets, resolvePresetExtensions } from "../presets.js";

export interface SetupDialogOptions {
  items: ExtensionItem[];
  activeExtensions?: string[];
  presets?: PresetProfile[];
  theme?: any;
  cwd?: string;
  onSave?: (
    selectedExtensions: string[],
    options?: { autoReload?: boolean },
  ) => Promise<void> | void;
  onCancel?: () => void;
  onRenderRequest?: () => void;
  title?: string;
  pageSize?: number;
}

export type CategoryTab = ExtensionCategoryId | "all";

export class SetupDialogComponent implements Component {
  private readonly items: ExtensionItem[];
  private readonly presets: PresetProfile[];
  private readonly theme: any;
  private readonly cwd: string;
  private readonly title: string;
  private readonly pageSize: number;
  private readonly onSave?: (
    selectedExtensions: string[],
    options?: { autoReload?: boolean },
  ) => Promise<void> | void;
  private readonly onCancel?: () => void;
  private readonly onRenderRequest?: () => void;

  private selectedExtensions: Set<string>;
  private selectedCategory: CategoryTab = "all";
  private searchQuery = "";
  private isSearchFocused = false;
  private focusedIndex = 0;
  private statusMessage?: string;
  private autoReload = true;

  constructor(options: SetupDialogOptions) {
    this.items = [...options.items];
    this.presets = options.presets ?? listPresets();
    this.theme = options.theme ?? {};
    this.cwd = options.cwd ?? process.cwd();
    this.title = options.title ?? "Pi Project Setup: Extension Selector";
    this.pageSize = options.pageSize ?? 10;
    this.onSave = options.onSave;
    this.onCancel = options.onCancel;
    this.onRenderRequest = options.onRenderRequest;

    if (options.activeExtensions !== undefined) {
      this.selectedExtensions = new Set(options.activeExtensions);
    } else {
      // Default to items marked isDefault
      const defaultPaths = this.items
        .filter((item) => item.isDefault)
        .map((item) => item.path);
      this.selectedExtensions = new Set(defaultPaths);
    }
  }

  // State Inspection & Manipulation APIs
  public getItems(): ExtensionItem[] {
    return [...this.items];
  }

  public getSelectedExtensions(): string[] {
    return Array.from(this.selectedExtensions);
  }

  public setSelectedExtensions(paths: string[]): void {
    this.selectedExtensions = new Set(paths);
    this.requestRender();
  }

  public isExtensionSelected(path: string): boolean {
    return this.selectedExtensions.has(path);
  }

  public toggleExtension(path: string): boolean {
    if (this.selectedExtensions.has(path)) {
      this.selectedExtensions.delete(path);
      this.requestRender();
      return false;
    } else {
      this.selectedExtensions.add(path);
      this.requestRender();
      return true;
    }
  }

  public getSelectedCategory(): CategoryTab {
    return this.selectedCategory;
  }

  public setCategory(category: CategoryTab): void {
    this.selectedCategory = category;
    this.clampFocusedIndex();
    this.requestRender();
  }

  public getSearchQuery(): string {
    return this.searchQuery;
  }

  public setSearchQuery(query: string): void {
    this.searchQuery = query;
    this.clampFocusedIndex();
    this.requestRender();
  }

  public isSearchMode(): boolean {
    return this.isSearchFocused;
  }

  public getFocusedIndex(): number {
    return this.focusedIndex;
  }

  public setFocusedIndex(index: number): void {
    this.focusedIndex = index;
    this.clampFocusedIndex();
    this.requestRender();
  }

  public getFocusedItem(): ExtensionItem | undefined {
    const filtered = this.getFilteredItems();
    return filtered[this.focusedIndex];
  }

  public getStatusMessage(): string | undefined {
    return this.statusMessage;
  }

  public setStatusMessage(msg?: string): void {
    this.statusMessage = msg;
    this.requestRender();
  }

  public getCategoryCounts(): Record<CategoryTab, number> {
    const counts: Record<CategoryTab, number> = {
      all: this.items.length,
      memory: 0,
      agents: 0,
      tools: 0,
      ui: 0,
      diagnostics: 0,
      other: 0,
    };

    for (const item of this.items) {
      if (counts[item.category] !== undefined) {
        counts[item.category]++;
      } else {
        counts.other++;
      }
    }

    return counts;
  }

  public getFilteredItems(): ExtensionItem[] {
    const query = this.searchQuery.trim().toLowerCase();

    return this.items.filter((item) => {
      // Category filter
      if (
        this.selectedCategory !== "all" &&
        item.category !== this.selectedCategory
      ) {
        return false;
      }

      // Search filter
      if (query.length > 0) {
        const matchName = item.name.toLowerCase().includes(query);
        const matchPath = item.path.toLowerCase().includes(query);
        const matchDesc = item.description.toLowerCase().includes(query);
        const matchCat = item.category.toLowerCase().includes(query);
        const matchTags =
          item.tags?.some((t) => t.toLowerCase().includes(query)) ?? false;

        if (
          !matchName &&
          !matchPath &&
          !matchDesc &&
          !matchCat &&
          !matchTags
        ) {
          return false;
        }
      }

      return true;
    });
  }

  public selectAllFiltered(): void {
    const filtered = this.getFilteredItems();
    for (const item of filtered) {
      this.selectedExtensions.add(item.path);
    }
    this.setStatusMessage(`Selected ${filtered.length} extensions`);
    this.requestRender();
  }

  public deselectAllFiltered(): void {
    const filtered = this.getFilteredItems();
    for (const item of filtered) {
      this.selectedExtensions.delete(item.path);
    }
    this.setStatusMessage(`Deselected ${filtered.length} extensions`);
    this.requestRender();
  }

  public toggleAllFiltered(): void {
    const filtered = this.getFilteredItems();
    if (filtered.length === 0) return;

    const allSelected = filtered.every((i) =>
      this.selectedExtensions.has(i.path),
    );
    if (allSelected) {
      this.deselectAllFiltered();
    } else {
      this.selectAllFiltered();
    }
  }

  public applyPreset(presetId: string): boolean {
    const allPaths = this.items.map((i) => i.path);
    const resolved = resolvePresetExtensions(
      presetId,
      allPaths,
      this.presets,
    );

    if (resolved.length === 0 && presetId !== "empty") {
      return false;
    }

    this.selectedExtensions = new Set(resolved);
    const presetObj = this.presets.find((p) => p.id === presetId);
    const name = presetObj?.name ?? presetId;
    this.setStatusMessage(`Preset '${name}' applied (${resolved.length} enabled)`);
    this.requestRender();
    return true;
  }

  // Component Keyboard Input Handling
  public handleInput(data: string): void {
    if (this.isSearchFocused) {
      this.handleSearchInput(data);
    } else {
      this.handleNormalInput(data);
    }
  }

  private handleSearchInput(data: string): void {
    if (matchesKey(data, "escape")) {
      this.isSearchFocused = false;
      this.requestRender();
      return;
    }

    if (matchesKey(data, "enter") || matchesKey(data, "return")) {
      this.isSearchFocused = false;
      this.requestRender();
      return;
    }

    if (matchesKey(data, "backspace") || data === "\x7f" || data === "\x08") {
      if (this.searchQuery.length > 0) {
        this.searchQuery = this.searchQuery.slice(0, -1);
        this.clampFocusedIndex();
        this.requestRender();
      }
      return;
    }

    if (matchesKey(data, "up") || matchesKey(data, "down")) {
      this.isSearchFocused = false;
      this.handleNormalInput(data);
      return;
    }

    // Printable characters
    if (data.length === 1 && data.charCodeAt(0) >= 32) {
      this.searchQuery += data;
      this.clampFocusedIndex();
      this.requestRender();
    }
  }

  private handleNormalInput(data: string): void {
    // Navigation
    if (matchesKey(data, "up") || data === "k") {
      this.navigate(-1);
      return;
    }

    if (matchesKey(data, "down") || data === "j") {
      this.navigate(1);
      return;
    }

    if (matchesKey(data, "pageup")) {
      this.navigate(-this.pageSize);
      return;
    }

    if (matchesKey(data, "pagedown")) {
      this.navigate(this.pageSize);
      return;
    }

    if (matchesKey(data, "home") || data === "\x1b[H") {
      this.focusedIndex = 0;
      this.requestRender();
      return;
    }

    if (matchesKey(data, "end") || data === "\x1b[F" || data === "G") {
      const filtered = this.getFilteredItems();
      this.focusedIndex = Math.max(0, filtered.length - 1);
      this.requestRender();
      return;
    }

    // Selection
    if (matchesKey(data, "space") || data === " ") {
      const focused = this.getFocusedItem();
      if (focused) {
        this.toggleExtension(focused.path);
      }
      return;
    }

    if (data === "a" || matchesKey(data, "ctrl+a")) {
      this.toggleAllFiltered();
      return;
    }

    // Preset shortcuts 1-5
    if (data >= "1" && data <= "5") {
      const presetIds = ["minimal", "web", "backend", "offline", "all"];
      const index = Number.parseInt(data, 10) - 1;
      if (presetIds[index]) {
        this.applyPreset(presetIds[index]);
      }
      return;
    }

    // Category cycling
    if (matchesKey(data, "shift+tab") || data === "\x1b[Z") {
      this.cycleCategory(-1);
      return;
    }

    if (matchesKey(data, "tab") || data === "\t") {
      this.cycleCategory(1);
      return;
    }

    // Search activation
    if (data === "/") {
      this.isSearchFocused = true;
      this.requestRender();
      return;
    }

    if (data === "c" && this.searchQuery.length > 0) {
      this.searchQuery = "";
      this.clampFocusedIndex();
      this.requestRender();
      return;
    }

    // Save & Actions
    if (
      data === "s" ||
      matchesKey(data, "enter") ||
      matchesKey(data, "return")
    ) {
      if (this.onSave) {
        void Promise.resolve(
          this.onSave(Array.from(this.selectedExtensions), {
            autoReload: this.autoReload,
          }),
        );
      }
      return;
    }

    // Cancel
    if (
      data === "q" ||
      matchesKey(data, "escape") ||
      matchesKey(data, "ctrl+c")
    ) {
      if (this.onCancel) {
        this.onCancel();
      }
      return;
    }
  }

  private navigate(delta: number): void {
    const filtered = this.getFilteredItems();
    if (filtered.length === 0) {
      this.focusedIndex = 0;
      return;
    }

    this.focusedIndex = Math.max(
      0,
      Math.min(filtered.length - 1, this.focusedIndex + delta),
    );
    this.requestRender();
  }

  private cycleCategory(direction: 1 | -1): void {
    const allCategories: CategoryTab[] = [
      "all",
      ...EXTENSION_CATEGORIES,
    ];
    const currentIndex = allCategories.indexOf(this.selectedCategory);
    let nextIndex = (currentIndex + direction) % allCategories.length;
    if (nextIndex < 0) nextIndex = allCategories.length - 1;

    this.selectedCategory = allCategories[nextIndex];
    this.clampFocusedIndex();
    this.requestRender();
  }

  private clampFocusedIndex(): void {
    const filtered = this.getFilteredItems();
    if (filtered.length === 0) {
      this.focusedIndex = 0;
    } else if (this.focusedIndex >= filtered.length) {
      this.focusedIndex = filtered.length - 1;
    } else if (this.focusedIndex < 0) {
      this.focusedIndex = 0;
    }
  }

  private requestRender(): void {
    if (this.onRenderRequest) {
      this.onRenderRequest();
    }
  }

  // Component Render Method
  public render(width: number): string[] {
    const targetWidth = Math.max(40, width || 80);
    const lines: string[] = [];
    const counts = this.getCategoryCounts();
    const filtered = this.getFilteredItems();

    // 1. Header Frame
    const projectDirName = this.cwd.split("/").pop() || this.cwd;
    lines.push(
      this.style(
        "bold",
        `╭─── ${this.title} ───╮`,
      ),
    );
    lines.push(
      ` Project: ${this.style("accent", projectDirName)} (${this.style("dim", this.cwd)})`,
    );
    lines.push(
      ` Enabled: ${this.style("success", `${this.selectedExtensions.size} of ${this.items.length}`)} extensions active`,
    );
    lines.push(this.style("dim", "─".repeat(Math.min(targetWidth, 76))));

    // 2. Category Tabs Bar
    const tabs: string[] = [];
    const categories: Array<{ id: CategoryTab; label: string; icon: string }> = [
      { id: "all", label: "All", icon: "●" },
      { id: "memory", label: "Memory", icon: "🧠" },
      { id: "agents", label: "Agents", icon: "🤖" },
      { id: "tools", label: "Tools", icon: "⚡" },
      { id: "ui", label: "UI", icon: "🎨" },
      { id: "diagnostics", label: "Diagnostics", icon: "🛠️" },
      { id: "other", label: "Other", icon: "📦" },
    ];

    for (const cat of categories) {
      const count = counts[cat.id] ?? 0;
      const isSelected = this.selectedCategory === cat.id;
      if (isSelected) {
        tabs.push(
          this.style(
            "accent",
            this.style("bold", `[${cat.icon} ${cat.label} (${count})]`),
          ),
        );
      } else {
        tabs.push(this.style("dim", ` ${cat.label} (${count}) `));
      }
    }
    lines.push(` Tabs: ${tabs.join(" ")}`);

    // 3. Search Bar
    if (this.isSearchFocused) {
      lines.push(
        ` Search: ${this.style("accent", `[ ${this.searchQuery}█ ]`)} ${this.style("dim", "(type to filter • esc/enter to lock)")}`,
      );
    } else if (this.searchQuery.length > 0) {
      lines.push(
        ` Search: "${this.searchQuery}" ${this.style("dim", "(/ to edit • c to clear)")}`,
      );
    } else {
      lines.push(
        this.style("dim", " Search: (press / to filter extensions)"),
      );
    }
    lines.push(this.style("dim", "─".repeat(Math.min(targetWidth, 76))));

    // 4. Extension Rows Viewport
    if (filtered.length === 0) {
      lines.push("");
      lines.push(
        `  ${this.style("warning", "⚠ No extensions match the current category or filter.")}`,
      );
      lines.push("");
    } else {
      // Calculate viewport window
      const windowSize = Math.max(5, Math.min(this.pageSize, 14));
      const halfWindow = Math.floor(windowSize / 2);
      let startIndex = Math.max(0, this.focusedIndex - halfWindow);
      if (startIndex + windowSize > filtered.length) {
        startIndex = Math.max(0, filtered.length - windowSize);
      }
      const endIndex = Math.min(filtered.length, startIndex + windowSize);

      for (let i = startIndex; i < endIndex; i++) {
        const item = filtered[i];
        const isFocused = i === this.focusedIndex;
        const isChecked = this.selectedExtensions.has(item.path);

        const cursor = isFocused ? this.style("accent", "›") : " ";
        const checkStr = isChecked
          ? this.style("success", "[x]")
          : this.style("dim", "[ ]");
        const icon = CATEGORY_METADATA[item.category]?.icon ?? "📦";
        const nameStr = isFocused
          ? this.style("bold", item.name)
          : item.name;
        const descStr = this.style("dim", `— ${item.description}`);

        const row = `${cursor} ${checkStr} ${icon} ${nameStr} ${descStr}`;
        lines.push(truncateToWidth(row, targetWidth));
      }

      if (filtered.length > windowSize) {
        lines.push(
          this.style(
            "dim",
            `  (showing ${startIndex + 1}–${endIndex} of ${filtered.length} matching extensions)`,
          ),
        );
      }
    }

    lines.push(this.style("dim", "─".repeat(Math.min(targetWidth, 76))));

    // 5. Presets Bar
    const presetLabels: string[] = [
      "[1] Minimal",
      "[2] Web",
      "[3] Backend",
      "[4] Offline",
      "[5] All",
    ];
    lines.push(
      ` Presets: ${this.style("accent", presetLabels.join("  "))}`,
    );

    // 6. Status Feedback (if set)
    if (this.statusMessage) {
      lines.push(
        ` Notice:  ${this.style("success", `✓ ${this.statusMessage}`)}`,
      );
    }

    // 7. Footer Shortcuts Help
    const footerText =
      targetWidth >= 90
        ? " [Space] Toggle • [1-5] Preset • [a] All • [Tab] Tab • [/] Search • [Enter] Save • [Esc] Cancel"
        : " [Space] Toggle • [1-5] Preset • [Enter] Save • [Esc] Cancel";

    lines.push(this.style("dim", footerText));

    return lines.map((l) => truncateToWidth(l, targetWidth));
  }

  private style(
    kind: "accent" | "dim" | "success" | "error" | "warning" | "bold",
    text: string,
  ): string {
    if (this.theme && typeof this.theme[kind] === "function") {
      return this.theme[kind](text);
    }
    if (this.theme && typeof this.theme.fg === "function") {
      return this.theme.fg(kind, text);
    }
    return text;
  }
}

/**
 * Open the interactive project setup dialog via Pi's UI context.
 */
export async function openSetupDialog(
  ctx: { hasUI?: boolean; ui?: any; cwd?: string },
  options: SetupDialogOptions,
): Promise<string[] | null> {
  if (!ctx.hasUI || !ctx.ui?.custom) {
    return null;
  }

  return await ctx.ui.custom<string[] | null>(
    (
      tui: any,
      theme: any,
      _keybindings: any,
      done: (val: string[] | null) => void,
    ) => {
      return new SetupDialogComponent({
        ...options,
        theme,
        cwd: options.cwd ?? ctx.cwd ?? process.cwd(),
        onRenderRequest: () => tui?.requestRender?.(),
        onSave: async (selected, saveOpts) => {
          if (options.onSave) {
            await options.onSave(selected, saveOpts);
          }
          done(selected);
        },
        onCancel: () => {
          if (options.onCancel) {
            options.onCancel();
          }
          done(null);
        },
      });
    },
    {
      overlay: true,
      overlayOptions: {
        width: "95%",
        height: "90%",
        anchor: "center",
        margin: 0,
      },
    },
  );
}

