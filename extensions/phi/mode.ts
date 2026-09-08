import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

export type PhiMode = "create" | "plan" | "review";

export type PhiModeDetails = {
  name: PhiMode;
  label: string;
  description: string;
};

type ModeChangeListener = (ctx: ExtensionContext, mode: PhiModeDetails) => void;

const MODES: PhiModeDetails[] = [
  { name: "create", label: "φ create", description: "Full coding mode" },
  { name: "plan", label: "φ plan", description: "Read-only planning mode" },
  { name: "review", label: "φ review", description: "Read-only review mode" },
];

const READ_ONLY_DISABLED_TOOLS = new Set(["edit", "write"]);

export type PhiModeController = {
  getMode(): PhiModeDetails;
  setMode(ctx: ExtensionContext, mode: PhiMode): void;
  cycleMode(ctx: ExtensionContext): void;
  classifyTool(name: string, readOnly: boolean): void;
  onChange(listener: ModeChangeListener): void;
};

export function registerPhiMode(pi: ExtensionAPI): PhiModeController {
  let phiMode: PhiMode = "create";
  let toolsBeforeReadOnly: string[] | undefined;
  const listeners: ModeChangeListener[] = [];
  const readOnlyBlockedTools = new Set(READ_ONLY_DISABLED_TOOLS);

  const activeMode = () => MODES.find(mode => mode.name === phiMode)!;

  const applyModeTools = () => {
    if (phiMode === "create") {
      if (toolsBeforeReadOnly) pi.setActiveTools(toolsBeforeReadOnly);
      toolsBeforeReadOnly = undefined;
      return;
    }

    if (!toolsBeforeReadOnly) toolsBeforeReadOnly = pi.getActiveTools();
    pi.setActiveTools(toolsBeforeReadOnly.filter(tool => !READ_ONLY_DISABLED_TOOLS.has(tool)));
  };

  const notifyChange = (ctx: ExtensionContext) => {
    const mode = activeMode();
    for (const listener of listeners) listener(ctx, mode);
  };

  const setMode = (ctx: ExtensionContext, mode: PhiMode) => {
    phiMode = mode;
    applyModeTools();
    notifyChange(ctx);
    ctx.ui.notify(`${activeMode().label}: ${activeMode().description}`, "info");
  };

  const cycleMode = (ctx: ExtensionContext) => {
    const index = MODES.findIndex(mode => mode.name === phiMode);
    setMode(ctx, MODES[(index + 1) % MODES.length].name);
  };

  pi.registerCommand("phi-mode", {
    description: "Cycle Phi agent mode (create, plan, review)",
    handler: async (args, ctx) => {
      const requested = args.trim().toLowerCase() as PhiMode;
      if (requested && MODES.some(mode => mode.name === requested)) {
        setMode(ctx, requested);
      } else {
        cycleMode(ctx);
      }
    },
  });

  pi.registerShortcut("ctrl+alt+m", {
    description: "Cycle Phi agent mode",
    handler: async (ctx) => cycleMode(ctx),
  });

  pi.on("before_agent_start", async () => {
    if (phiMode === "create") return;

    return {
      message: {
        customType: "phi-mode-context",
        content: phiMode === "plan"
          ? `[PHI PLAN MODE]
You are in read-only planning mode. Explore the codebase, reason carefully, and produce a clear implementation plan. Do not edit files or write new files.`
          : `[PHI REVIEW MODE]
You are in read-only review mode. Inspect the current work, look for bugs and risks, and provide concise review findings. Do not edit files or write new files.`,
        display: false,
      },
    };
  });

  pi.on("tool_call", async (event) => {
    if (phiMode === "create") return;
    if (!readOnlyBlockedTools.has(event.toolName)) return;

    return {
      block: true,
      reason: `${activeMode().label} is read-only. Press Ctrl+Alt+M or run /phi-mode create to enable editing.`,
    };
  });

  return {
    getMode: activeMode,
    setMode,
    cycleMode,
    classifyTool(name, readOnly) {
      if (readOnly) readOnlyBlockedTools.delete(name);
      else readOnlyBlockedTools.add(name);
      if (toolsBeforeReadOnly && !toolsBeforeReadOnly.includes(name)) toolsBeforeReadOnly.push(name);
      if (phiMode !== "create" && !readOnly) {
        pi.setActiveTools(pi.getActiveTools().filter(tool => tool !== name));
      }
    },
    onChange(listener) {
      listeners.push(listener);
    },
  };
}
