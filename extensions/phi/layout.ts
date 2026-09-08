import type { Theme } from "@earendil-works/pi-coding-agent";
import { HStack, isViewportTUI, type Component, type TUI, type ViewportTUI } from "@earendil-works/pi-tui";
import { PhiSidebar } from "./sidebar.ts";
import type { PhiState } from "./state.ts";

type TuiWithLayoutRoot = ViewportTUI & { layoutRoot?: Component };

export class PhiLayoutHost implements Component {
  private baseRoot?: Component;
  private splitRoot?: Component;
  private enabled = true;
  private installQueued = false;
  private disposed = false;

  constructor(private tui: TUI, private getTheme: () => Theme, private state: PhiState) {
    this.state.bindRender(() => this.tui.requestRender());
    this.ensureInstalled();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    this.tui.requestRender(true);
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.tui.requestRender(true);
  }

  render(_width: number): string[] {
    // A TUI mode switch replaces the renderer and restores Pi's root. Reinstall
    // after the current render instead of mutating the layout during traversal.
    if (!this.disposed && this.tui.mode === "fullscreen" && this.currentRoot() !== this.splitRoot && !this.installQueued) {
      this.installQueued = true;
      queueMicrotask(() => {
        this.installQueued = false;
        this.ensureInstalled();
      });
    }
    return [];
  }

  invalidate(): void {}

  dispose(): void {
    this.disposed = true;
    this.state.bindRender(undefined);
    if (!isViewportTUI(this.tui)) return;
    if (this.baseRoot && this.currentRoot() === this.splitRoot) {
      this.tui.setLayoutRoot(this.baseRoot);
    }
  }

  private currentRoot(): Component | undefined {
    if (!isViewportTUI(this.tui)) return undefined;
    // Pi 0.85 exposes setLayoutRoot but not a getter. Keep this compatibility
    // access isolated and fail harmlessly if the internal field changes.
    return Reflect.get(this.tui as TuiWithLayoutRoot, "layoutRoot") as Component | undefined;
  }

  private ensureInstalled(): void {
    if (this.disposed || !isViewportTUI(this.tui)) return;
    const current = this.currentRoot();
    if (current === this.splitRoot) return;
    if (!current || typeof current.render !== "function") return;

    // Refresh the captured root after a renderer/layout replacement.
    if (current !== this.baseRoot) {
      this.baseRoot = current;
      const sidebar = new PhiSidebar(this.state, this.getTheme, () => this.tui.terminal.rows);
      this.splitRoot = new HStack([
        { component: current, basis: 0, grow: 1, shrink: 1, minSize: 1 },
        {
          component: sidebar,
          basis: 24,
          grow: 0,
          shrink: 0,
          minSize: 24,
          maxSize: 24,
          visible: ({ width }) => this.enabled && width >= 96 && width < 132,
        },
        {
          component: sidebar,
          basis: 32,
          grow: 0,
          shrink: 0,
          minSize: 32,
          maxSize: 32,
          visible: ({ width }) => this.enabled && width >= 132,
        },
      ]);
    }
    this.tui.setLayoutRoot(this.splitRoot);
  }
}
