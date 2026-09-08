import { VERSION, type Theme } from "@earendil-works/pi-coding-agent";
import { wrapTextWithAnsi, type Component, type TuiMouseEvent, type TuiMouseEventResult } from "@earendil-works/pi-tui";
import { between, fit, money, plainText, shortenHome, surface } from "./format.ts";
import type { ConnectionStatus, ModifiedFile, PhiState } from "./state.ts";

function connectionLine(theme: Theme, item: ConnectionStatus): string {
  const color = item.state === "ready" ? "success" : item.state === "starting" ? "warning"
    : item.state === "error" ? "error" : "dim";
  const mark = item.state === "ready" ? "•" : item.state === "starting" ? "◦" : item.state === "error" ? "×" : "·";
  return `${theme.fg(color, mark)} ${theme.fg("muted", plainText(item.name))} ${theme.fg("dim", plainText(item.detail || item.state))}`;
}

function fileLine(theme: Theme, file: ModifiedFile): string {
  const color = file.status === "D" ? "error" : file.status === "A" ? "success" : "warning";
  return `${theme.fg(color, file.status)} ${theme.fg("muted", plainText(file.path))}`;
}

/** Full-height sibling of Pi's native layout; never covers the transcript/editor. */
export class PhiSidebar implements Component {
  private scrollOffset = 0;
  private maxScroll = 0;

  constructor(private state: PhiState, private getTheme: () => Theme, private getHeight: () => number) {}

  invalidate(): void {}

  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    if (event.type !== "wheel") return undefined;
    const delta = Math.sign(event.wheelDelta ?? 0) * Math.max(1, Math.round(Math.abs(event.wheelDelta ?? 0)));
    this.scrollOffset = Math.max(0, Math.min(this.maxScroll, this.scrollOffset + delta));
    // Contain scrolling here, including at either end, instead of moving chat.
    return { handled: true, render: true };
  }

  render(width: number): string[] {
    if (width <= 0) return [];
    const height = Math.max(1, Math.floor(this.getHeight()));
    const inner = Math.max(1, width - 3);
    const theme = this.getTheme();
    const snap = this.state.snapshot;
    const lines: string[] = [""];
    const add = (line = "") => lines.push(line);
    const heading = (label: string) => add(theme.fg("text", label));
    const muted = (text: string) => theme.fg("muted", text);
    const dim = (text: string) => theme.fg("dim", text);
    const metric = (label: string, value: string) => add(between(dim(label), muted(value), inner));

    const task = wrapTextWithAnsi(plainText(snap.task), inner);
    for (const [index, line] of task.slice(0, 3).entries()) {
      add(muted(index === 2 && task.length > 3 ? fit(line, inner - 1).trimEnd() + "…" : line));
    }
    add(dim(snap.sessionId));
    add();

    heading("Context");
    add(muted(snap.contextTokens == null ? "Not measured yet" : `${snap.contextTokens.toLocaleString("en-US")} tokens`));
    add(dim(snap.contextPercent == null ? "Usage unavailable" : `${Math.round(snap.contextPercent)}% used`));
    add(dim(`${money(snap.cost)} estimated cost`));
    add();

    heading("Token Usage");
    metric("Input", snap.tokens.input.toLocaleString("en-US"));
    metric("Output", snap.tokens.output.toLocaleString("en-US"));
    metric("Cache read", snap.tokens.cacheRead.toLocaleString("en-US"));
    metric("Cache write", snap.tokens.cacheWrite.toLocaleString("en-US"));
    metric("Cache rate", snap.cachePercent == null ? "—" : `${snap.cachePercent.toFixed(1)}%`);
    metric("Cost (est.)", money(snap.cost));
    add();

    heading(`Models (${snap.models.length})`);
    if (!snap.models.length) add(dim("No model selected"));
    for (const model of snap.models) {
      const active = model.id === snap.modelId && model.provider === snap.provider;
      add(dim(plainText(model.provider)));
      add(`${theme.fg(active ? "accent" : "dim", active ? "›" : "·")} ${muted(plainText(model.name))}`);
      add(between(dim(`  ${model.turns} ${model.turns === 1 ? "turn" : "turns"}`), dim(money(model.cost)), inner));
    }
    if (snap.thinking) add(dim(`Effort · ${plainText(snap.thinking)}`));
    add();

    heading(`Modified Files${snap.files.length ? ` (${snap.files.length})` : ""}`);
    if (!snap.files.length) add(dim("· No changes this session"));
    else for (const file of snap.files) add(fileLine(theme, file));
    add();

    heading("LSP");
    if (!snap.lsps.length) add(dim("· Not connected"));
    else for (const lsp of snap.lsps) add(connectionLine(theme, lsp));
    add();

    heading("MCP");
    if (!snap.mcps.length) add(dim("· No servers configured"));
    else for (const mcp of snap.mcps) add(connectionLine(theme, mcp));

    const brand = between(theme.fg("muted", "φ PHI"), dim(`pi ${VERSION}`), inner);
    const project = plainText(shortenHome(snap.cwd) + (snap.branch ? `:${snap.branch}` : ""));
    const footer = height >= 8 ? ["", dim(project), brand, ""] : [brand];
    const capacity = Math.max(0, height - footer.length);
    const overflowing = lines.length > capacity;
    const bodyHeight = Math.max(0, capacity - (overflowing ? 1 : 0));
    this.maxScroll = Math.max(0, lines.length - bodyHeight);
    this.scrollOffset = Math.min(this.scrollOffset, this.maxScroll);
    const body = lines.slice(this.scrollOffset, this.scrollOffset + bodyHeight);
    while (body.length < bodyHeight) body.push("");
    if (overflowing && capacity > 0) {
      const up = this.scrollOffset > 0 ? "↑" : "";
      const down = this.scrollOffset < this.maxScroll ? "↓" : "";
      body.push(dim(`${up}${down} scroll for more`));
    }
    return [...body, ...footer].slice(0, height)
      .map(line => surface(theme, "customMessageBg", `  ${fit(line, inner)} `, width));
  }
}
