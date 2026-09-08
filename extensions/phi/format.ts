import { homedir } from "node:os";
import { sep } from "node:path";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

/** Metadata is plain text, never terminal control sequences from paths or prompts. */
export function plainText(text: string): string {
  return stripTerminalSequences(text).replace(/[\x00-\x1f\x7f-\x9f]/g, " ").replace(/\s+/g, " ").trim();
}

export function fit(text: string, width: number): string {
  return width <= 0 ? "" : truncateToWidth(text, width, "…", true);
}

/** Keep the right-hand value visible even when a label or model name is long. */
export function between(left: string, right: string, width: number): string {
  if (width <= 0) return "";
  const rightWidth = visibleWidth(right);
  if (rightWidth >= width) return fit(right, width);
  const start = fit(left, width - rightWidth - 1);
  return start + " ".repeat(Math.max(1, width - visibleWidth(start) - rightWidth)) + right;
}

export function compactNumber(value: number): string {
  if (value < 1_000) return String(value);
  if (value < 1_000_000) return `${(value / 1_000).toFixed(value < 10_000 ? 1 : 0)}k`;
  return `${(value / 1_000_000).toFixed(1)}M`;
}

export function money(value: number): string {
  return `$${value.toFixed(value > 0 && value < 0.01 ? 6 : 2)}`;
}

export function shortenHome(path: string): string {
  const home = homedir();
  return path === home ? "~" : path.startsWith(home + sep) ? `~${path.slice(home.length)}` : path;
}

/** Paint every cell, reapplying the surface after a cursor/ANSI reset. */
export function surface(theme: Theme, color: Parameters<Theme["getBgAnsi"]>[0], line: string, width: number): string {
  const bg = theme.getBgAnsi(color);
  return bg + fit(line, width).replace(/\x1b\[(?:0|49)?m/g, reset => reset + bg) + "\x1b[49m";
}

export function modeLabel(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}
