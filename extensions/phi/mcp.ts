import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { PhiModeController } from "./mode.ts";
import type { ConnectionStatus, PhiState } from "./state.ts";

type StdioConfig = { command: string; args?: string[]; env?: Record<string, string>; cwd?: string; disabled?: boolean };
type HttpConfig = { url: string; headers?: Record<string, string>; disabled?: boolean };
type ServerConfig = StdioConfig | HttpConfig;
type McpConfig = { mcpServers?: Record<string, ServerConfig> };
type ActiveServer = { name: string; client: Client; transport: Transport; tools: number };

async function readConfig(path: string): Promise<McpConfig> {
  try { return JSON.parse(await readFile(path, "utf8")) as McpConfig; } catch { return {}; }
}

function safeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "tool";
}

function resultContent(result: { content?: unknown[]; isError?: boolean }): Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> {
  const content = result.content ?? [];
  const mapped: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> = [];
  for (const item of content) {
    if (typeof item !== "object" || item === null) continue;
    const block = item as Record<string, unknown>;
    if (block.type === "text" && typeof block.text === "string") mapped.push({ type: "text", text: block.text });
    else if (block.type === "image" && typeof block.data === "string" && typeof block.mimeType === "string") {
      mapped.push({ type: "image", data: block.data, mimeType: block.mimeType });
    } else mapped.push({ type: "text", text: JSON.stringify(block, null, 2) });
  }
  if (mapped.length === 0) mapped.push({ type: "text", text: result.isError ? "MCP tool failed" : "MCP tool completed" });
  return mapped;
}

export class McpManager {
  private servers: ActiveServer[] = [];
  private statuses = new Map<string, ConnectionStatus>();

  constructor(
    private pi: ExtensionAPI,
    private cwd: string,
    private trusted: boolean,
    private state: PhiState,
    private modes: PhiModeController,
  ) {}

  async start(): Promise<void> {
    const agentDir = process.env.PI_CODING_AGENT_DIR || join(process.env.HOME || "", ".pi", "agent");
    const globalConfig = await readConfig(join(agentDir, "mcp.json"));
    const projectConfig = this.trusted ? await readConfig(join(this.cwd, ".pi", "mcp.json")) : {};
    const configs = { ...(globalConfig.mcpServers ?? {}), ...(projectConfig.mcpServers ?? {}) };
    await Promise.all(Object.entries(configs).filter(([, config]) => !config.disabled).map(([name, config]) => this.connect(name, config)));
  }

  async stop(): Promise<void> {
    const servers = this.servers.splice(0);
    await Promise.allSettled(servers.map(server => server.client.close()));
  }

  private setStatus(status: ConnectionStatus): void {
    this.statuses.set(status.name, status);
    this.state.update({ mcps: [...this.statuses.values()].sort((a, b) => a.name.localeCompare(b.name)) });
  }

  private async connect(name: string, config: ServerConfig): Promise<void> {
    this.setStatus({ name, state: "starting" });
    let transport: Transport;
    let client: Client | undefined;
    try {
      if ("command" in config) {
        transport = new StdioClientTransport({
          command: config.command,
          args: config.args ?? [],
          cwd: config.cwd ? resolve(this.cwd, config.cwd) : this.cwd,
          env: { ...process.env, ...(config.env ?? {}) } as Record<string, string>,
          stderr: "pipe",
        });
      } else {
        transport = new StreamableHTTPClientTransport(new URL(config.url), {
          requestInit: { headers: config.headers },
        });
      }
      client = new Client({ name: "phi", version: "0.1.0" }, { capabilities: {} });
      await client.connect(transport, { timeout: 15_000 });
      const listed = await client.listTools(undefined, { timeout: 15_000 });
      this.servers.push({ name, client, transport, tools: listed.tools.length });
      for (const tool of listed.tools) this.registerTool(name, client, tool);
      this.setStatus({ name, state: "ready", detail: String(listed.tools.length) });
    } catch (error) {
      await client?.close().catch(() => {});
      const message = error instanceof Error ? error.message : String(error);
      this.setStatus({ name, state: message.includes("ENOENT") ? "missing" : "error", detail: message.slice(0, 24) });
    }
  }

  private registerTool(serverName: string, client: Client, tool: { name: string; description?: string; inputSchema: Record<string, unknown>; annotations?: { readOnlyHint?: boolean } }): void {
    const registeredName = `mcp__${safeName(serverName)}__${safeName(tool.name)}`;
    const readOnly = tool.annotations?.readOnlyHint === true;
    const remoteName = tool.name;
    this.pi.registerTool({
      name: registeredName,
      label: `${serverName}: ${tool.name}`,
      description: `${tool.description || `MCP tool ${tool.name}`} [${readOnly ? "read-only" : "may modify state"}]`,
      parameters: Type.Unsafe(tool.inputSchema),
      async execute(_toolCallId, params, signal) {
        const result = await client.callTool(
          { name: remoteName, arguments: params as Record<string, unknown> },
          undefined,
          { signal, timeout: 60_000 },
        );
        const normalized = result as unknown as { content?: unknown[]; isError?: boolean };
        if (normalized.isError) {
          throw new Error(resultContent(normalized).filter(block => block.type === "text").map(block => block.text).join("\n"));
        }
        return { content: resultContent(normalized), details: { server: serverName, tool: remoteName } };
      },
    });
    this.modes.classifyTool(registeredName, readOnly);
  }
}
