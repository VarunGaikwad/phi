import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { PhiModeDetails } from "./mode.ts";
import { plainText } from "./format.ts";

export type ConnectionStatus = {
  name: string;
  state: "starting" | "ready" | "missing" | "error";
  detail?: string;
};

export type ModifiedFile = {
  path: string;
  status: "M" | "A" | "D" | "R" | "?";
};

export type PhiTokenUsage = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
};

export type PhiModelUsage = {
  id: string;
  provider: string;
  name: string;
  turns: number;
  cost: number;
};

export type PhiSnapshot = {
  task: string;
  sessionId: string;
  cwd: string;
  branch?: string;
  model: string;
  modelId?: string;
  provider?: string;
  thinking?: string;
  contextTokens?: number | null;
  contextWindow?: number;
  contextPercent?: number | null;
  cost: number;
  tokens: PhiTokenUsage;
  cachePercent: number | null;
  models: PhiModelUsage[];
  working: boolean;
  mode: PhiModeDetails;
  files: ModifiedFile[];
  lsps: ConnectionStatus[];
  mcps: ConnectionStatus[];
};

function textFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((item): item is { type: "text"; text: string } =>
      typeof item === "object" && item !== null && (item as { type?: string }).type === "text" &&
      typeof (item as { text?: unknown }).text === "string")
    .map(item => item.text)
    .join(" ");
}

function latestTask(ctx: ExtensionContext): string {
  const name = ctx.sessionManager.getSessionName();
  if (name) return plainText(name);
  const entries = [...ctx.sessionManager.getBranch()].reverse();
  for (const entry of entries) {
    if (entry.type === "message" && entry.message.role === "user") {
      const text = plainText(textFromContent(entry.message.content));
      if (text) return text;
    }
  }
  return "Ready for your next task";
}

/** Active-branch totals, including nested tool calls and summary generation. */
function sessionUsage(ctx: ExtensionContext): Pick<PhiSnapshot, "tokens" | "cost" | "cachePercent" | "models"> {
  const tokens: PhiTokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const models = new Map<string, PhiModelUsage>();
  let cost = 0;
  for (const entry of ctx.sessionManager.getBranch()) {
    const message = entry.type === "message" ? entry.message : undefined;
    const usage = message?.role === "assistant" || message?.role === "toolResult" ? message.usage
      : entry.type === "compaction" || entry.type === "branch_summary" ? entry.usage : undefined;
    if (usage) {
      tokens.input += usage.input ?? 0;
      tokens.output += usage.output ?? 0;
      tokens.cacheRead += usage.cacheRead ?? 0;
      tokens.cacheWrite += usage.cacheWrite ?? 0;
      cost += usage.cost?.total ?? 0;
    }
    // Tools and summaries do not identify their nested model, so don't attribute
    // that spend to the selected model. It still appears in the totals above.
    if (message?.role === "assistant") {
      const key = `${message.provider}/${message.model}`;
      const model = models.get(key) ?? {
        id: message.model,
        provider: message.provider,
        name: message.model === ctx.model?.id && message.provider === ctx.model?.provider
          ? ctx.model.name : message.model,
        turns: 0,
        cost: 0,
      };
      model.turns++;
      model.cost += usage?.cost?.total ?? 0;
      models.set(key, model);
    }
  }
  if (ctx.model) {
    const key = `${ctx.model.provider}/${ctx.model.id}`;
    if (!models.has(key)) {
      models.set(key, { id: ctx.model.id, provider: ctx.model.provider, name: ctx.model.name, turns: 0, cost: 0 });
    }
  }
  const promptTokens = tokens.input + tokens.cacheRead + tokens.cacheWrite;
  return { tokens, cost, cachePercent: promptTokens ? 100 * tokens.cacheRead / promptTokens : null, models: [...models.values()] };
}

export class PhiState {
  snapshot: PhiSnapshot;
  private requestRender?: () => void;

  constructor(ctx: ExtensionContext, mode: PhiModeDetails) {
    const usage = ctx.getContextUsage();
    this.snapshot = {
      task: latestTask(ctx),
      sessionId: ctx.sessionManager.getSessionId(),
      cwd: ctx.cwd,
      model: ctx.model?.name || ctx.model?.id || "No model",
      modelId: ctx.model?.id,
      provider: ctx.model?.provider,
      thinking: ctx.thinkingLevel,
      contextTokens: usage?.tokens,
      contextWindow: usage?.contextWindow ?? ctx.model?.contextWindow,
      contextPercent: usage?.percent,
      ...sessionUsage(ctx),
      working: !ctx.isIdle(),
      mode,
      files: [],
      lsps: [],
      mcps: [],
    };
  }

  bindRender(requestRender: (() => void) | undefined): void {
    this.requestRender = requestRender;
  }

  update(patch: Partial<PhiSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.requestRender?.();
  }

  refreshContext(ctx: ExtensionContext): void {
    const usage = ctx.getContextUsage();
    this.update({
      task: latestTask(ctx),
      model: ctx.model?.name || ctx.model?.id || "No model",
      modelId: ctx.model?.id,
      provider: ctx.model?.provider,
      thinking: ctx.thinkingLevel,
      contextTokens: usage?.tokens,
      contextWindow: usage?.contextWindow ?? ctx.model?.contextWindow,
      contextPercent: usage?.percent,
      ...sessionUsage(ctx),
    });
  }

  setTask(task: string): void {
    const clean = plainText(task);
    if (clean) this.update({ task: clean });
  }
}
