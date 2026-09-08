import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { PhiEditor, PhiFooter } from "./editor.ts";
import { SessionFileTracker } from "./files.ts";
import { PhiLayoutHost } from "./layout.ts";
import { TypeScriptLspManager } from "./lsp.ts";
import { McpManager } from "./mcp.ts";
import type { PhiModeController } from "./mode.ts";
import { PhiState } from "./state.ts";

function setStatus(ctx: ExtensionContext, state: PhiState): void {
  const snap = state.snapshot;
  ctx.ui.setStatus("phi", ctx.ui.theme.fg(snap.working ? "warning" : "accent", snap.mode.label));
}

export function registerPhiTui(pi: ExtensionAPI, modeController: PhiModeController): void {
  let state: PhiState | undefined;
  let layout: PhiLayoutHost | undefined;
  let files: SessionFileTracker | undefined;
  let lsp: TypeScriptLspManager | undefined;
  let mcp: McpManager | undefined;

  // A display-only transformation: Pi stores and sends the original message,
  // while Markdown renders it with the reference's slim blue quote rail.
  pi.registerMarkdownTransformer((markdown, context) => {
    if (context.messageType !== "user") return markdown;
    return markdown.split("\n").map(line => `> ${line}`).join("\n");
  });

  const toggleSidebar = (ctx: ExtensionContext) => {
    if (!layout) {
      ctx.ui.notify("PHI sidebar is only available after TUI startup", "warning");
      return;
    }
    const enabled = layout.toggle();
    ctx.ui.notify(`PHI sidebar ${enabled ? "shown" : "hidden"}`, "info");
  };

  pi.registerCommand("phi-sidebar", {
    description: "Toggle the PHI fullscreen sidebar",
    handler: async (_args, ctx) => toggleSidebar(ctx),
  });

  pi.registerShortcut("ctrl+alt+b", {
    description: "Toggle the PHI sidebar",
    handler: async ctx => toggleSidebar(ctx),
  });

  modeController.onChange((ctx, mode) => {
    state?.update({ mode });
    if (state) setStatus(ctx, state);
  });

  pi.on("session_start", async (_event, ctx) => {
    if (ctx.mode !== "tui") return;

    const phiTheme = ctx.ui.getTheme("phi");
    if (phiTheme) ctx.ui.setTheme(phiTheme);

    const sessionState = new PhiState(ctx, modeController.getMode());
    state = sessionState;
    ctx.ui.setHeader(tui => {
      layout = new PhiLayoutHost(tui, () => ctx.ui.theme, sessionState);
      if (tui.mode !== "fullscreen") {
        ctx.ui.notify("Use /settings → TUI mode → fullscreen for the PHI sidebar", "info");
      }
      return layout;
    });
    ctx.ui.setEditorComponent((tui, theme, keybindings) =>
      new PhiEditor(tui, theme, keybindings, sessionState, () => ctx.ui.theme));
    ctx.ui.setFooter((tui, _theme, footerData) => {
      const updateBranch = () => sessionState.update({ branch: footerData.getGitBranch() ?? undefined });
      updateBranch();
      const unsubscribe = footerData.onBranchChange(() => { updateBranch(); tui.requestRender(); });
      const footer = new PhiFooter(sessionState, () => ctx.ui.theme, () => footerData.getExtensionStatuses());
      return Object.assign(footer, { dispose: unsubscribe });
    });
    // Working state lives in the editor's model row, not in a separate loader.
    // Pi's compaction/retry UI is left untouched.
    ctx.ui.setWorkingVisible(false);
    ctx.ui.setTitle(`PHI — ${ctx.cwd.split(/[\\/]/).pop() || ctx.cwd}`);
    setStatus(ctx, state);

    if (ctx.ui.theme.name !== "phi") {
      ctx.ui.notify("PHI theme could not be loaded; run /reload after checking package resources", "warning");
    }
    files = new SessionFileTracker(pi, ctx.cwd, state);
    lsp = new TypeScriptLspManager(pi, ctx.cwd, state);
    mcp = new McpManager(pi, ctx.cwd, ctx.isProjectTrusted(), state, modeController);
    void files.initialize().then(() => files?.refresh());
    void lsp.start();
    void mcp.start();
  });

  pi.on("input", async (event, ctx) => {
    state?.setTask(ctx.sessionManager.getSessionName() || event.text);
  });

  pi.on("agent_start", async (_event, ctx) => {
    state?.update({ working: true });
    if (state) setStatus(ctx, state);
  });

  pi.on("agent_settled", async (_event, ctx) => {
    state?.update({ working: false });
    state?.refreshContext(ctx);
    if (state) setStatus(ctx, state);
    void files?.refresh();
  });

  pi.on("model_select", async (_event, ctx) => state?.refreshContext(ctx));
  pi.on("thinking_level_select", async (_event, ctx) => state?.refreshContext(ctx));
  pi.on("message_end", async (_event, ctx) => state?.refreshContext(ctx));
  pi.on("session_tree", async (_event, ctx) => state?.refreshContext(ctx));
  pi.on("session_compact", async (_event, ctx) => state?.refreshContext(ctx));

  pi.on("tool_call", async event => {
    if (event.toolName !== "edit" && event.toolName !== "write") return;
    const input = event.input as { path?: string; file_path?: string };
    await files?.notePath(input.path ?? input.file_path);
  });

  pi.on("tool_execution_end", async event => {
    if (["edit", "write", "bash"].includes(event.toolName)) await files?.refresh();
  });

  pi.on("session_info_changed", async (_event, ctx) => state?.refreshContext(ctx));

  pi.on("session_shutdown", async (_event, ctx) => {
    files?.dispose();
    layout?.dispose();
    if (ctx.mode === "tui") {
      ctx.ui.setWorkingVisible(true);
      ctx.ui.setStatus("phi", undefined);
    }
    await Promise.allSettled([lsp?.stop(), mcp?.stop()].filter(Boolean) as Promise<void>[]);
    files = undefined;
    layout = undefined;
    lsp = undefined;
    mcp = undefined;
    state = undefined;
  });
}
