// Controller-owned Phase 0 guest. NEVER run this on the host; no local fallback.
// Type-only pi imports are erased before transfer. SDK loads after guest checks.
import fs from "node:fs";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { networkInterfaces } from "node:os";
import net from "node:net";
import type { ProviderConfig } from "@earendil-works/pi-coding-agent";

const WORKSPACE = "/workspace";
const RUNTIME = "/home/node/runtime";
const CHECKS: Record<string, boolean> = {};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
function requireGuest(ok: unknown): asserts ok { if (!ok) throw new Error("AGENT_GUEST_CHECK_FAILED"); }
function hash(bytes: Buffer): string { return createHash("sha256").update(bytes).digest("hex"); }
function denied(path: string, write: boolean): boolean {
  try {
    if (write) fs.writeFileSync(path, "PHI_SYNTHETIC_WRITE_ATTEMPT");
    else fs.readFileSync(path); // Never emit bytes if containment fails.
    return false;
  } catch (error) {
    return ["ENOENT", "ENOTDIR", "EACCES", "EPERM", "EROFS"].includes((error as NodeJS.ErrnoException).code ?? "");
  }
}
async function networkDenied(host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port: 9 });
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(value);
    };
    // A timeout is inconclusive, not a passing network denial.
    const timer = setTimeout(() => finish(false), 1500);
    socket.once("connect", () => finish(false));
    socket.once("error", (error: NodeJS.ErrnoException) => finish(["ENETUNREACH", "EHOSTUNREACH", "EACCES", "EPERM"].includes(error.code ?? "")));
  });
}

async function main(): Promise<void> {
  requireGuest(process.platform === "linux" && process.getuid?.() === 1000 && process.getgid?.() === 1000
    && process.cwd() === WORKSPACE && process.execPath === "/usr/local/bin/node"
    && Number(process.versions.node.split(".")[0]) === 24);
  const status = fs.readFileSync("/proc/self/status", "utf8");
  requireGuest(/^NoNewPrivs:\s+1$/m.test(status) && /^CapEff:\s+0+$/m.test(status));
  CHECKS.cleanEnvironment = Object.keys(process.env).sort().join(",") ===
    "HOME,PATH,PI_CODING_AGENT_DIR,PI_CODING_AGENT_SESSION_DIR,PI_OFFLINE,PI_PACKAGE_DIR,PI_TELEMETRY,TMPDIR"
    && process.env.HOME === "/home/node" && process.env.PI_OFFLINE === "1" && process.env.PI_TELEMETRY === "0";
  requireGuest(CHECKS.cleanEnvironment);
  const input = JSON.parse(fs.readFileSync(`${RUNTIME}/input.json`, "utf8")) as {
    nonce: string; deniedPaths: string[]; files: Array<{ path: string; sha256: string }>;
  };
  requireGuest(/^[a-f0-9]{32}$/.test(input.nonce) && input.deniedPaths.length === 3);
  CHECKS.snapshotMatch = input.files.every((file) => hash(fs.readFileSync(`${WORKSPACE}/${file.path}`)) === file.sha256)
    && fs.readdirSync(WORKSPACE).sort().join(",") === "README.md,package.json,src";
  requireGuest(CHECKS.snapshotMatch);
  // All pi code, resource loading, tools and descendants are now in the guest.
  const { VERSION, createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager } =
    await import("@earendil-works/pi-coding-agent");
  CHECKS.sdkVersion = VERSION === "0.85.1";
  const settings = SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false },
    defaultProjectTrust: "never", enableInstallTelemetry: false, shellPath: "/bin/bash",
    images: { blockImages: true, autoResize: false }, packages: [], extensions: [], skills: [], prompts: [], themes: [] });
  const modelRuntime = await ModelRuntime.create({
    credentials: { read: async () => undefined, list: async () => [],
      modify: async () => { throw new Error("AGENT_CREDENTIAL_WRITE_DENIED"); },
      delete: async () => { throw new Error("AGENT_CREDENTIAL_WRITE_DENIED"); } },
    modelsPath: null, refreshOnCreate: false, allowModelNetwork: false,
  });
  const tools = ["read", "edit", "write", "bash", "fixture_attack"];
  const childScript = "const fs=require('node:fs');let denied=false;try{fs.writeFileSync('/phi-phase0-child-write','synthetic')}catch(e){denied=['EROFS','EACCES','EPERM'].includes(e.code)};fs.writeFileSync('/workspace/child.txt','PHI_CHILD_OK');if(!denied||process.getuid()!==1000)process.exit(1);process.stdout.write('PHI_CHILD_OK');";
  const calls = [
    { name: "read", arguments: { path: "README.md" } },
    { name: "edit", arguments: { path: "src/index.js", edits: [{ oldText: "synthetic fixture", newText: "edited fixture" }] } },
    { name: "write", arguments: { path: "result.txt", content: "PHI_WRITE_OK\n" } },
    { name: "bash", arguments: { command: `/usr/local/bin/node -e '${childScript}'`, timeout: 3 } },
    { name: "fixture_attack", arguments: {} },
  ];
  // Escape only our literal script, never model- or user-supplied shell text.
  calls[3].arguments.command = `/usr/local/bin/node -e '${childScript.replaceAll("'", "'\\''")}'`;
  let turn = 0;
  let contextsClean = true;
  const streamSimple: NonNullable<ProviderConfig["streamSimple"]> = (model, context, options) => {
    contextsClean &&= !/SYNTHETIC_SECRET_NOT_A_CREDENTIAL|SYNTHETIC_UNAPPROVED|SYNTHETIC_STARTUP_MUST_NOT_RUN/.test(JSON.stringify(context));
    requireGuest(turn <= calls.length && !options?.signal?.aborted);
    const call = calls[turn++];
    const content = call ? [{ type: "toolCall" as const, id: `fixture-${turn}`, ...call }]
      : [{ type: "text" as const, text: "OFFLINE_FIXTURE_COMPLETE" }];
    const message = { role: "assistant" as const, api: model.api, provider: model.provider, model: model.id, content,
      stopReason: call ? "toolUse" as const : "stop" as const, timestamp: Date.now(),
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
    // A finite in-memory event source, not an HTTP provider or gateway simulation.
    return { async *[Symbol.asyncIterator]() {
      yield { type: "start", partial: message };
      yield { type: "done", reason: message.stopReason, message };
    }, result: async () => message } as unknown as ReturnType<NonNullable<ProviderConfig["streamSimple"]>>;
  };
  modelRuntime.registerProvider("phi-offline-fixture", { name: "PHI deterministic offline fixture",
    baseUrl: "http://offline.invalid", api: "phi-offline-fixture", apiKey: "SYNTHETIC_NOT_A_CREDENTIAL", streamSimple,
    models: [{ id: "fixture", name: "Fixture", reasoning: false, input: ["text"], contextWindow: 128000, maxTokens: 1024,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }] });
  let starts = 0;
  let shutdowns = 0;
  let extensionErrors = 0;
  const loader = new DefaultResourceLoader({ cwd: WORKSPACE, agentDir: "/home/node/.pi/agent", settingsManager: settings,
    noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
    systemPrompt: "Run only the controller-owned offline synthetic fixture.", appendSystemPrompt: [],
    extensionFactories: [{ name: "phi-offline-fixture", factory: (pi) => {
      pi.on("session_start", () => { starts++; });
      pi.on("session_shutdown", () => { shutdowns++; });
      pi.registerTool({ name: "fixture_attack", label: "Synthetic containment test", description: "Fixed guest checks only",
        parameters: { type: "object", properties: {}, additionalProperties: false },
        execute: async () => {
          CHECKS.extensionDirect = process.getuid?.() === 1000 && denied("/phi-phase0-extension-write", true);
          CHECKS.deniedReads = [...input.deniedPaths, "/workspace/.env", "/workspace/.git/objects/history", "/workspace/.pi/agent/auth.json"]
            .every((path) => denied(path, false));
          CHECKS.deniedWrites = input.deniedPaths.every((path) => denied(path, true));
          CHECKS.noHostBridges = ["/var/run/docker.sock", "/run/docker.sock", "/mnt/c", "/mnt/wsl", "/run/host", "/run/desktop", "/proc/sys/fs/binfmt_misc/WSLInterop"]
            .every((path) => !fs.existsSync(path));
          CHECKS.networkInterfaces = Object.entries(networkInterfaces()).every(([name, entries]) => name === "lo" && entries?.every((entry) => entry.internal));
          // Documentation-only TEST-NET addresses, never personal/LAN/cloud services.
          CHECKS.networkProbes = (await Promise.all([networkDenied("192.0.2.1"), networkDenied("2001:db8::1")])).every(Boolean);
          const script = "const fs=require('node:fs');process.on('SIGTERM',()=>{});let n=0;setInterval(()=>fs.writeFileSync('/workspace/detached.json',JSON.stringify({pid:process.pid,tick:++n})),100);";
          const child = spawn(process.execPath, ["-e", script], { detached: true, stdio: "ignore", env: process.env });
          child.on("error", () => { extensionErrors++; });
          child.unref();
          for (let i = 0; i < 20 && !fs.existsSync("/workspace/detached.json"); i++) await sleep(100);
          CHECKS.detachedChild = fs.existsSync("/workspace/detached.json");
          requireGuest(Object.values(CHECKS).every(Boolean));
          return { content: [{ type: "text", text: "PHI_EXTENSION_OK" }], details: {} };
        } });
    } }] });
  await loader.reload();
  const resourcesEmpty = () => loader.getExtensions().errors.length === 0 && loader.getExtensions().extensions.length === 1
    && loader.getSkills().skills.length === 0 && loader.getPrompts().prompts.length === 0
    && loader.getThemes().themes.length === 0 && loader.getAgentsFiles().agentsFiles.length === 0;
  CHECKS.resourcesExplicit = resourcesEmpty();
  const model = modelRuntime.getModel("phi-offline-fixture", "fixture");
  requireGuest(model); // No fallback to an unintended provider/model.
  const { session } = await createAgentSession({ cwd: WORKSPACE, agentDir: "/home/node/.pi/agent", modelRuntime,
    model, thinkingLevel: "off", tools,
    resourceLoader: loader, settingsManager: settings, sessionManager: SessionManager.inMemory(WORKSPACE) });
  try {
    await session.bindExtensions({ mode: "json", onError: () => { extensionErrors++; } });
    await session.prompt("Execute the fixed synthetic checks.", { expandPromptTemplates: false });
    const results = session.messages.filter((message) => message.role === "toolResult");
    const succeeded = (name: string) => results.some((message) => message.toolName === name && !message.isError);
    CHECKS.builtInRead = succeeded("read") && results.some((message) => message.toolName === "read" && JSON.stringify(message.content).includes("Approved fixture data only."));
    CHECKS.builtInEdit = succeeded("edit") && fs.readFileSync("/workspace/src/index.js", "utf8").includes("edited fixture");
    CHECKS.builtInWrite = succeeded("write") && fs.readFileSync("/workspace/result.txt", "utf8") === "PHI_WRITE_OK\n";
    CHECKS.shellChild = succeeded("bash") && fs.readFileSync("/workspace/child.txt", "utf8") === "PHI_CHILD_OK";
    const last = session.messages.at(-1);
    CHECKS.agentLoop = results.length === calls.length && results.every((message) => !message.isError)
      && turn === calls.length + 1 && contextsClean && !session.isStreaming && session.sessionFile === undefined
      && last?.role === "assistant" && last.stopReason === "stop" && session.getLastAssistantText() === "OFFLINE_FIXTURE_COMPLETE";
    await session.reload();
    CHECKS.sessionLifecycle = starts === 2 && shutdowns === 1 && extensionErrors === 0 && resourcesEmpty()
      && session.getActiveToolNames().sort().join(",") === [...tools].sort().join(",");
    requireGuest(Object.values(CHECKS).every(Boolean));
    process.stdout.write(JSON.stringify({ version: 1, nonce: input.nonce, checks: CHECKS }) + "\n");
  } finally { session.dispose(); }
}

// Failure details may contain context/paths. Return a generic failure only.
main().catch(() => { process.stdout.write('{"error":"AGENT_GUEST_FAILED"}\n'); process.exitCode = 1; });
