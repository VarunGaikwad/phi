import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { PhiState } from "./state.ts";

type JsonRpcMessage = { id?: number; method?: string; params?: unknown; result?: unknown; error?: { message?: string } };

class LspConnection {
  private process?: ChildProcessWithoutNullStreams;
  private buffer = Buffer.alloc(0);
  private nextId = 1;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  private openVersions = new Map<string, number>();
  diagnostics = new Map<string, unknown[]>();

  constructor(
    private command: string,
    private args: string[],
    private cwd: string,
    private onStatus: (state: "starting" | "ready" | "missing" | "error", detail?: string) => void,
    private onDiagnostics: (count: number) => void,
  ) {}

  async start(): Promise<void> {
    this.onStatus("starting");
    await new Promise<void>((resolveStart, rejectStart) => {
      const child = spawn(this.command, this.args, { cwd: this.cwd, stdio: "pipe", env: process.env });
      this.process = child;
      let settled = false;
      child.once("spawn", () => { settled = true; resolveStart(); });
      child.once("error", error => {
        this.process = undefined;
        this.onStatus((error as NodeJS.ErrnoException).code === "ENOENT" ? "missing" : "error", error.message);
        if (!settled) rejectStart(error);
      });
      child.on("exit", code => {
        this.rejectPending(new Error(`Language server exited (${code ?? "signal"})`));
        if (code !== 0) this.onStatus("error", `exit ${code ?? "signal"}`);
      });
      child.stdout.on("data", data => this.consume(data));
      child.stderr.on("data", () => {});
    });

    await this.request("initialize", {
      processId: process.pid,
      rootUri: pathToFileURL(this.cwd).href,
      capabilities: {
        textDocument: {
          hover: { contentFormat: ["markdown", "plaintext"] },
          definition: { linkSupport: true },
          references: {},
          documentSymbol: { hierarchicalDocumentSymbolSupport: true },
          publishDiagnostics: {},
        },
        workspace: { symbol: {} },
      },
      workspaceFolders: [{ uri: pathToFileURL(this.cwd).href, name: basename(this.cwd) }],
    }, 15_000);
    this.notify("initialized", {});
    this.onStatus("ready");
  }

  async ensureDocument(path: string): Promise<string> {
    const absolute = resolve(this.cwd, path.replace(/^@/, ""));
    const uri = pathToFileURL(absolute).href;
    const text = await readFile(absolute, "utf8");
    const previous = this.openVersions.get(uri);
    const version = (previous ?? 0) + 1;
    if (previous === undefined) {
      this.notify("textDocument/didOpen", { textDocument: { uri, languageId: languageId(absolute), version, text } });
    } else {
      this.notify("textDocument/didChange", { textDocument: { uri, version }, contentChanges: [{ text }] });
    }
    this.openVersions.set(uri, version);
    return uri;
  }

  request(method: string, params: unknown, timeoutMs = 10_000): Promise<unknown> {
    if (!this.process || this.process.killed) return Promise.reject(new Error("TypeScript language server is not available"));
    const id = this.nextId++;
    return new Promise((resolveRequest, rejectRequest) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rejectRequest(new Error(`LSP request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: value => { clearTimeout(timer); resolveRequest(value); },
        reject: error => { clearTimeout(timer); rejectRequest(error); },
      });
      this.send({ jsonrpc: "2.0", id, method, params });
    });
  }

  notify(method: string, params: unknown): void {
    this.send({ jsonrpc: "2.0", method, params });
  }

  async stop(): Promise<void> {
    if (!this.process) return;
    try { await this.request("shutdown", null, 2_000); } catch {}
    this.notify("exit", null);
    this.process.kill();
    this.process = undefined;
    this.rejectPending(new Error("Language server stopped"));
  }

  private send(message: unknown): void {
    if (!this.process?.stdin.writable) return;
    const body = JSON.stringify(message);
    this.process.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
  }

  private consume(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (true) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) return;
      const match = this.buffer.subarray(0, headerEnd).toString().match(/Content-Length:\s*(\d+)/i);
      if (!match) { this.buffer = this.buffer.subarray(headerEnd + 4); continue; }
      const length = Number(match[1]);
      const bodyStart = headerEnd + 4;
      if (this.buffer.length < bodyStart + length) return;
      const body = this.buffer.subarray(bodyStart, bodyStart + length).toString();
      this.buffer = this.buffer.subarray(bodyStart + length);
      try { this.handle(JSON.parse(body) as JsonRpcMessage); } catch {}
    }
  }

  private handle(message: JsonRpcMessage): void {
    if (message.id !== undefined && message.method) {
      const params = message.params as { items?: unknown[] } | undefined;
      const result = message.method === "workspace/configuration"
        ? (params?.items ?? []).map(() => null)
        : message.method === "workspace/workspaceFolders"
          ? [{ uri: pathToFileURL(this.cwd).href, name: basename(this.cwd) }]
          : null;
      this.send({ jsonrpc: "2.0", id: message.id, result });
      return;
    }
    if (message.id !== undefined && !message.method) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message || "LSP error"));
      else pending.resolve(message.result);
      return;
    }
    if (message.method === "textDocument/publishDiagnostics") {
      const params = message.params as { uri?: string; diagnostics?: unknown[] };
      if (params.uri) this.diagnostics.set(params.uri, params.diagnostics ?? []);
      this.onDiagnostics([...this.diagnostics.values()].reduce((sum, items) => sum + items.length, 0));
    }
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}

function languageId(path: string): string {
  const ext = extname(path).toLowerCase();
  return ext === ".tsx" ? "typescriptreact" : ext === ".jsx" ? "javascriptreact" : ext === ".js" || ext === ".mjs" || ext === ".cjs" ? "javascript" : "typescript";
}

export class TypeScriptLspManager {
  private connection?: LspConnection;
  private status: "starting" | "ready" | "missing" | "error" = "starting";
  private toolsRegistered = false;

  constructor(private pi: ExtensionAPI, private cwd: string, private state: PhiState) {}

  async start(): Promise<void> {
    const relevant = await Promise.all(["package.json", "tsconfig.json", "jsconfig.json"].map(path => access(resolve(this.cwd, path)).then(() => true).catch(() => false)));
    if (!relevant.some(Boolean)) return;
    const command = process.env.PHI_TYPESCRIPT_LSP || "typescript-language-server";
    this.connection = new LspConnection(
      command,
      ["--stdio"],
      this.cwd,
      (status, detail) => {
        this.status = status;
        this.state.update({ lsps: [{ name: "TypeScript", state: status, detail: status === "missing" ? "missing" : detail }] });
      },
      count => this.state.update({
        lsps: [{ name: "TypeScript", state: "ready", detail: count > 0 ? `${count} issues` : "ready" }],
      }),
    );
    try {
      await this.connection.start();
      this.registerTools();
    } catch {}
  }

  registerTools(): void {
    if (this.toolsRegistered) return;
    this.toolsRegistered = true;
    const manager = this;
    const position = Type.Object({
      path: Type.String({ description: "TypeScript or JavaScript file path" }),
      line: Type.Integer({ minimum: 1, description: "1-based line" }),
      column: Type.Integer({ minimum: 1, description: "1-based column" }),
    });
    const positional = [
      ["lsp_hover", "LSP Hover", "Get TypeScript hover/type information", "textDocument/hover"],
      ["lsp_definition", "LSP Definition", "Find a TypeScript symbol definition", "textDocument/definition"],
      ["lsp_references", "LSP References", "Find TypeScript symbol references", "textDocument/references"],
    ] as const;
    for (const [name, label, description, method] of positional) {
      this.pi.registerTool({
        name, label, description, parameters: position,
        async execute(_id, params) {
          if (!manager.connection || manager.status !== "ready") throw new Error("TypeScript language server is not ready");
          const uri = await manager.connection.ensureDocument(params.path);
          const extra = method === "textDocument/references" ? { context: { includeDeclaration: true } } : {};
          const result = await manager.connection.request(method, { textDocument: { uri }, position: { line: params.line - 1, character: params.column - 1 }, ...extra });
          return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }], details: { result } };
        },
      });
    }
    this.pi.registerTool({
      name: "lsp_symbols", label: "LSP Symbols", description: "List symbols in a TypeScript or JavaScript file",
      parameters: Type.Object({ path: Type.String() }),
      async execute(_id, params) {
        if (!manager.connection || manager.status !== "ready") throw new Error("TypeScript language server is not ready");
        const uri = await manager.connection.ensureDocument(params.path);
        const result = await manager.connection.request("textDocument/documentSymbol", { textDocument: { uri } });
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }], details: { result } };
      },
    });
    this.pi.registerTool({
      name: "lsp_diagnostics", label: "LSP Diagnostics", description: "Get cached TypeScript diagnostics for a file",
      parameters: Type.Object({ path: Type.String() }),
      async execute(_id, params) {
        if (!manager.connection || manager.status !== "ready") throw new Error("TypeScript language server is not ready");
        const uri = await manager.connection.ensureDocument(params.path);
        await new Promise(resolveWait => setTimeout(resolveWait, 250));
        const result = manager.connection.diagnostics.get(uri) ?? [];
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }], details: { result } };
      },
    });
  }

  async stop(): Promise<void> { await this.connection?.stop(); }
}
