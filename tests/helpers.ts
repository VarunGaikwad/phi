import { fileURLToPath } from "node:url";
import { SessionManager, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { loadThemeFromPath } from "../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js";
import { KeybindingsManager } from "../node_modules/@earendil-works/pi-coding-agent/dist/core/keybindings.js";
import type { EditorTheme, TUI } from "@earendil-works/pi-tui";
import { PhiEditor } from "../extensions/phi/editor.ts";
import { PhiState } from "../extensions/phi/state.ts";

export const theme = loadThemeFromPath(fileURLToPath(new URL("../themes/phi.json", import.meta.url)), "truecolor");
export const mode = { name: "create", label: "φ create", description: "Full coding mode" } as const;

export function fixture() {
  const session = SessionManager.inMemory("/workspace/phi");
  const ctx = {
    sessionManager: session,
    cwd: "/workspace/phi",
    model: { id: "model-a", name: "Model A", provider: "test-provider", contextWindow: 200_000 },
    thinkingLevel: "high",
    getContextUsage: () => ({ tokens: 13_101, contextWindow: 200_000, percent: 6.5505 }),
    isIdle: () => true,
  } as unknown as ExtensionContext;
  const state = new PhiState(ctx, mode);
  return { ctx, state, session };
}

export function editorFixture() {
  const data = fixture();
  const tui = { terminal: { rows: 42, columns: 132 }, requestRender() {} } as unknown as TUI;
  const editorTheme: EditorTheme = {
    borderColor: text => theme.fg("border", text),
    selectList: {
      selectedPrefix: text => theme.fg("accent", text),
      selectedText: text => theme.fg("accent", text),
      description: text => theme.fg("muted", text),
      scrollInfo: text => theme.fg("dim", text),
      noMatch: text => theme.fg("warning", text),
    },
  };
  const editor = new PhiEditor(tui, editorTheme, new KeybindingsManager(), data.state, () => theme);
  editor.focused = true;
  return { ...data, tui, editor, editorTheme };
}

export function usage(input = 10, output = 5, cacheRead = 30, cacheWrite = 10, cost = 0.1) {
  return { input, output, cacheRead, cacheWrite, totalTokens: input + output + cacheRead + cacheWrite,
    cost: { input: cost, output: 0, cacheRead: 0, cacheWrite: 0, total: cost } };
}

export function assistant(model = "model-a") {
  return { role: "assistant", content: [{ type: "text", text: "Ready." }], model, provider: "test-provider",
    api: "openai-responses", timestamp: Date.now(), stopReason: "stop", usage: usage() } satisfies Parameters<SessionManager["appendMessage"]>[0];
}
