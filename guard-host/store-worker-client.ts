// Internal native file-worker transport. No caller-selected executable/script/path API.
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { readFile } from "node:fs/promises";
import { win32 } from "node:path";
import { StoreFixtureError, requireStore } from "./store-format.ts";
export interface StoreMessage { version: 1; nonce: string; status: "locked" | "busy" | "committed" | "conflict" | "cut" | "failed" | "released"; data: string }
export function parseStoreMessage(text: string, nonce: string): StoreMessage {
  try {
    requireStore(Buffer.byteLength(text) <= 192 * 1024);
    const v = JSON.parse(text);
    requireStore(v && Object.keys(v).sort().join(",") === "data,nonce,status,version" && v.version === 1 && v.nonce === nonce
      && ["locked", "busy", "committed", "conflict", "cut", "failed", "released"].includes(v.status)
      && typeof v.data === "string" && v.data.length <= 175000);
    requireStore(v.status === "locked" || v.status === "committed" || v.data === "");
    requireStore(Buffer.from(v.data, "base64").toString("base64") === v.data);
    return v;
  } catch { throw new StoreFixtureError("STORE_WORKER_MESSAGE_INVALID"); }
}
export class StoreWorker {
  private messages: StoreMessage[] = [];
  private waiter?: { resolve: (v: StoreMessage) => void; reject: (e: Error) => void };
  private failure = false;
  private ended = false;
  private buffer = "";
  private outputBytes = 0;
  readonly done: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  constructor(private child: ChildProcessWithoutNullStreams, private nonce: string) {
    this.done = new Promise(resolve => child.once("close", (code, signal) => {
      this.ended = true; if (this.buffer.trim()) this.failure = true;
      this.waiter?.reject(new StoreFixtureError("STORE_WORKER_CLOSED")); this.waiter = undefined;
      resolve({ code, signal });
    }));
    const fail = () => {
      this.failure = true; this.waiter?.reject(new StoreFixtureError("STORE_WORKER_PROTOCOL_FAILED")); this.waiter = undefined;
      child.kill("SIGKILL");
    };
    child.on("error", fail); child.stdin.on("error", fail);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (text: string) => {
      this.outputBytes += Buffer.byteLength(text); this.buffer += text;
      if (this.outputBytes > 512 * 1024 || this.buffer.length > 192 * 1024) { fail(); return; }
      while (this.buffer.includes("\n")) {
        const end = this.buffer.indexOf("\n"); const line = this.buffer.slice(0, end).replace(/\r$/, ""); this.buffer = this.buffer.slice(end + 1);
        try {
          const v = parseStoreMessage(line, nonce);
          if (this.waiter) { const waiter = this.waiter; this.waiter = undefined; waiter.resolve(v); }
          else { requireStore(this.messages.length < 3); this.messages.push(v); }
        } catch { fail(); return; }
      }
    });
    child.stderr.on("data", (bytes: Buffer) => { this.outputBytes += bytes.length; if (this.outputBytes > 512 * 1024) fail(); });
  }
  alive(): boolean { return !this.failure && !this.ended && this.child.exitCode === null && this.child.signalCode === null; }
  async next(): Promise<StoreMessage> {
    requireStore(!this.failure, "STORE_WORKER_PROTOCOL_FAILED");
    const next = this.messages.shift(); if (next) return next;
    requireStore(!this.ended && !this.waiter, "STORE_WORKER_CLOSED");
    let timer: NodeJS.Timeout;
    try { return await new Promise<StoreMessage>((resolve, reject) => {
      timer = setTimeout(() => { this.waiter = undefined; reject(new StoreFixtureError("STORE_WORKER_TIMEOUT")); }, 10_000);
      this.waiter = { resolve, reject };
    }); } finally { clearTimeout(timer!); }
  }
  send(value: unknown): void {
    requireStore(this.alive(), "STORE_WORKER_CLOSED");
    const line = typeof value === "string" ? value : JSON.stringify(value);
    requireStore(line.length <= 70000 && !/[\r\n]/.test(line)); this.child.stdin.write(line + "\n");
  }
  private async waitClosed(): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
    let timer: NodeJS.Timeout;
    try { return await Promise.race([this.done, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new StoreFixtureError("STORE_WORKER_EXIT_UNCONFIRMED")), 5000);
    })]); } finally { clearTimeout(timer!); }
  }
  async release(): Promise<void> {
    this.send(`release:${this.nonce}`);
    requireStore((await this.next()).status === "released", "STORE_RELEASE_UNCONFIRMED");
    const exit = await this.waitClosed(); requireStore(exit.code === 0 && exit.signal === null, "STORE_RELEASE_UNCONFIRMED");
  }
  async finish(): Promise<{ code: number | null; signal: NodeJS.Signals | null }> { return this.waitClosed(); }
  async killForTest(): Promise<void> {
    requireStore(this.alive() && this.child.kill("SIGKILL"), "STORE_WORKER_KILL_UNCONFIRMED");
    const exit = await this.waitClosed(); requireStore(exit.signal === "SIGKILL" && exit.code === null, "STORE_WORKER_KILL_UNCONFIRMED");
  }
  async close(): Promise<void> {
    if (!this.ended) this.child.kill("SIGKILL"); // Only this retained disposable file worker.
    await this.waitClosed();
  }
}
export async function startStoreWorker(root: string, nonce: string): Promise<StoreWorker> {
  requireStore(process.platform === "win32" && /^[a-f0-9]{32}$/.test(nonce)
    && new RegExp(`^phi-store-${nonce}-[a-zA-Z0-9]+$`).test(win32.basename(root)), "STORE_WINDOWS_FIXTURE_REQUIRED");
  const systemRoot = process.env.SystemRoot ?? "";
  requireStore(/^[a-z]:\\Windows$/i.test(systemRoot), "STORE_SYSTEM_ROOT_UNCONFIRMED");
  const source = await readFile(new URL("./store-worker.ps1", import.meta.url), "utf8");
  const child = spawn(win32.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", source], { cwd: root, shell: false, windowsHide: true,
      env: { SystemRoot: systemRoot, WINDIR: systemRoot, OS: "Windows_NT", TEMP: root, TMP: root, PHI_STORE_NONCE: nonce },
      stdio: ["pipe", "pipe", "pipe"] });
  return new StoreWorker(child, nonce);
}
