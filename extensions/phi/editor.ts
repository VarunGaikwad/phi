import { CustomEditor, keyText, type KeybindingsManager, type Theme } from "@earendil-works/pi-coding-agent";
import type { Component, EditorTheme, TUI, TuiMouseEvent, TuiMouseEventResult } from "@earendil-works/pi-tui";
import { between, compactNumber, fit, modeLabel, plainText, surface } from "./format.ts";
import type { PhiState } from "./state.ts";

/** Restyle the native editor, keeping its cursor, paste, history and autocomplete. */
export class PhiEditor extends CustomEditor {
  private gutter = 2;

  constructor(
    tui: TUI,
    editorTheme: EditorTheme,
    keybindings: KeybindingsManager,
    private phiState: PhiState,
    private getTheme: () => Theme,
  ) {
    super(tui, editorTheme, keybindings, { paddingX: 1 });
  }

  protected override renderTopBorder(width: number, hiddenLineCount: number): string {
    return fit(hiddenLineCount ? this.getTheme().fg("dim", ` ↑ ${hiddenLineCount} more`) : "", width);
  }

  protected override renderBottomBorder(width: number, hiddenLineCount: number): string {
    const theme = this.getTheme();
    const snap = this.phiState.snapshot;
    const mode = theme.fg("accent", modeLabel(snap.mode.name));
    const provider = width >= 76 && snap.provider ? ` · ${plainText(snap.provider)}` : "";
    const left = `${mode}${theme.fg("dim", ` · ${plainText(snap.model)}${provider}`)}`;
    const right = hiddenLineCount ? theme.fg("dim", `↓ ${hiddenLineCount} more`)
      : theme.fg(snap.working ? "accent" : "success", "● ") + theme.fg("muted", snap.working ? "Working" : "Ready");
    return fit(` ${between(left, right, Math.max(0, width - 2))} `, width);
  }

  override render(width: number): string[] {
    if (width <= 0) return [];
    this.gutter = width > 4 ? 2 : 0;
    const inner = width - this.gutter;
    const theme = this.getTheme();
    const rail = this.gutter ? ` ${theme.fg(this.getText().startsWith("!") ? "bashMode" : "accent", "│")}` : "";
    // Do not remove rows: native mouse coordinates and autocomplete begin at the
    // same Y positions. Only account for the two added columns in handleMouse.
    // Native wrapping needs room for a two-cell grapheme plus its padding.
    // Tiny terminals get a clipped view rather than a recursive wrap failure.
    return super.render(Math.max(4, inner)).map(line => rail + surface(theme, "customMessageBg", line, inner));
  }

  override handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    return super.handleMouse({ ...event, x: Math.max(0, event.x - this.gutter), width: Math.max(1, event.width - this.gutter) });
  }
}

export class PhiFooter implements Component {
  constructor(
    private state: PhiState,
    private getTheme: () => Theme,
    private getStatuses: () => ReadonlyMap<string, string>,
  ) {}

  invalidate(): void {}

  render(width: number): string[] {
    if (width <= 0) return [];
    const theme = this.getTheme();
    const snap = this.state.snapshot;
    const key = (action: Parameters<typeof keyText>[0], fallback: string) => keyText(action) || fallback;
    const hint = snap.working ? `${key("app.interrupt", "/hotkeys")} interrupt`
      : `${key("tui.input.submit", "/hotkeys")} send`;
    const extra = width >= 80 && !snap.working ? `  ${key("tui.input.newLine", "/hotkeys")} newline` : "";
    const context = snap.contextTokens == null ? "" : `${compactNumber(snap.contextTokens)}${snap.contextPercent == null ? "" : ` (${Math.round(snap.contextPercent)}%)`}  `;
    const line = between(theme.fg("dim", hint + extra), theme.fg("dim", `${context}/ commands`), Math.max(0, width - 3));
    const lines = [fit(`   ${line}`, width)];
    // Other extensions still own their status messages; don't silently hide them.
    const statuses = [...this.getStatuses()].filter(([name]) => name !== "phi").map(([, text]) => plainText(text));
    if (statuses.length) lines.push(fit(theme.fg("muted", `   ${statuses.join(" · ")}`), width));
    return lines;
  }
}
