// Controller-owned Phase 0 guest. NEVER run this on the host; no local fallback.
// Type-only pi imports are erased before transfer. SDK loads after guest checks.
import fs from "node:fs";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { networkInterfaces } from "node:os";
import net from "node:net";
import type { AgentSession, CreateAgentSessionRuntimeFactory, ExtensionAPI, ProviderConfig } from "@earendil-works/pi-coding-agent";

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
  } finally { session.dispose(); }
  await lifecycle(input);
  requireGuest(Object.values(CHECKS).every(Boolean));
  process.stdout.write(JSON.stringify({ version: 1, nonce: input.nonce, checks: CHECKS }) + "\n");
}

/** Fixed SDK lifecycle experiment, still inside the same admitted guest. */
async function lifecycle(input: { nonce: string; deniedPaths: string[] }): Promise<void> {
  const { createAgentSessionRuntime, createAgentSessionServices, createAgentSessionFromServices,
    ModelRuntime, SessionManager, SettingsManager } = await import("@earendil-works/pi-coding-agent");
  const agentDir = "/home/node/.pi/agent";
  const sessionDir = "/home/node/.pi/sessions/lifecycle";
  const tools = ["read", "write", "fixture_wait", "fixture_throw"];
  const events: string[] = [];
  const errors: string[] = [];
  let latestApi: ExtensionAPI;
  let cancelTransition = false;
  let failShutdown = false;
  let waitingTool = false;
  let toolAborted = false;
  let waitingStream = false;
  let streamAborted = false;
  let calls = 0;
  let sequence: Array<{ name: string; arguments: Record<string, unknown> }> = [];
  let position = 0;
  let holdStream = false;
  let contextsClean = true;
  const scope = () => process.cwd() === WORKSPACE && process.getuid?.() === 1000
    && denied("/phi-phase0-lifecycle-write", true)
    && input.deniedPaths.every((path) => denied(path, false) && denied(path, true))
    && [".env", ".git", ".pi", "AGENTS.md", "SYSTEM.md", "node_modules"].every((path) => !fs.existsSync(`${WORKSPACE}/${path}`));
  const trace = (event: string) => { requireGuest(events.length < 64); events.push(event); };
  const waitUntil = async (ready: () => boolean) => {
    for (let i = 0; i < 100 && !ready(); i++) await sleep(10);
    requireGuest(ready()); // A deadline is failure, never evidence of cancellation.
  };
  const waitForAbort = (signal: AbortSignal | undefined, ready: () => void) => new Promise<void>((resolve, reject) => {
    requireGuest(signal && !signal.aborted);
    const finish = () => { clearTimeout(timer); signal.removeEventListener("abort", finish); resolve(); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", finish); reject(Error("LIFECYCLE_ABORT_TIMEOUT")); }, 2000);
    signal.addEventListener("abort", finish, { once: true });
    ready();
  });
  const streamSimple: NonNullable<ProviderConfig["streamSimple"]> = (model, context, options) => {
    calls++;
    contextsClean &&= !/SYNTHETIC_SECRET_NOT_A_CREDENTIAL|SYNTHETIC_UNAPPROVED|SYNTHETIC_STARTUP_MUST_NOT_RUN|PHI_QUEUED_MUST_NOT_RUN/.test(JSON.stringify(context));
    requireGuest(position <= sequence.length && !options?.signal?.aborted && calls <= 40);
    const call = sequence[position++];
    const message = { role: "assistant" as const, api: model.api, provider: model.provider, model: model.id,
      content: call ? [{ type: "toolCall" as const, id: `lifecycle-${calls}`, ...call }]
        : [{ type: "text" as const, text: "PHI_LIFECYCLE_OK" }],
      stopReason: call ? "toolUse" as const : "stop" as const, timestamp: Date.now(),
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
    return { async *[Symbol.asyncIterator]() {
      yield { type: "start", partial: message };
      if (holdStream) {
        await waitForAbort(options?.signal, () => { waitingStream = true; });
        streamAborted = options?.signal?.aborted === true;
        yield { type: "error", reason: "aborted", error: { ...message, content: [], stopReason: "aborted", errorMessage: "PHI_STREAM_ABORTED" } };
      } else yield { type: "done", reason: message.stopReason, message };
    }, result: async () => message } as unknown as ReturnType<NonNullable<ProviderConfig["streamSimple"]>>;
  };
  const factory: CreateAgentSessionRuntimeFactory = async ({ cwd, sessionManager, sessionStartEvent }) => {
    // Saved cwd is not authority to admit anything. No alternate workspace in this fixture.
    requireGuest(cwd === WORKSPACE && sessionManager.getCwd() === WORKSPACE);
    const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false },
      defaultProjectTrust: "never", enableInstallTelemetry: false, shellPath: "/bin/bash",
      images: { blockImages: true, autoResize: false }, packages: [], extensions: [], skills: [], prompts: [], themes: [] });
    const modelRuntime = await ModelRuntime.create({
      credentials: { read: async () => undefined, list: async () => [],
        modify: async () => { throw Error("LIFECYCLE_CREDENTIAL_WRITE_DENIED"); },
        delete: async () => { throw Error("LIFECYCLE_CREDENTIAL_WRITE_DENIED"); } },
      modelsPath: null, refreshOnCreate: false, allowModelNetwork: false,
    });
    const services = await createAgentSessionServices({ cwd, agentDir, settingsManager, modelRuntime,
      resourceLoaderOptions: { noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
        systemPrompt: "Run only the controller-owned offline synthetic lifecycle fixture.", appendSystemPrompt: [],
        extensionFactories: [{ name: "phi-lifecycle", factory: (pi) => {
          latestApi = pi;
          // Register on every rebuild/reload: reload resets stream registrations.
          pi.registerProvider("phi-lifecycle", { name: "PHI offline lifecycle", baseUrl: "http://offline.invalid",
            api: "phi-lifecycle", apiKey: "SYNTHETIC_NOT_A_CREDENTIAL", streamSimple,
            models: [{ id: "fixture", name: "Fixture", reasoning: false, input: ["text"], contextWindow: 128000, maxTokens: 1024,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }] });
          pi.on("session_start", (event, ctx) => {
            requireGuest(ctx.cwd === WORKSPACE && !ctx.hasUI && ctx.mode === "json" && scope());
            trace(`start:${event.reason}`);
          });
          pi.on("session_shutdown", (event) => {
            trace(`shutdown:${event.reason}`);
            if (failShutdown) { requireGuest(scope()); throw Error("PHI_EXPECTED_SHUTDOWN_FAILURE"); }
          });
          pi.on("session_before_switch", (event) => { trace(`before:${event.reason}`); return { cancel: cancelTransition }; });
          pi.on("session_before_fork", (event) => { trace(`before:fork:${event.position}`); return { cancel: cancelTransition }; });
          pi.on("session_before_tree", () => { trace("before:tree"); return { cancel: cancelTransition }; });
          pi.on("session_tree", () => { trace("tree"); });
          pi.on("tool_call", (event) => {
            if (event.toolName === "write" && event.input.path === "hook-must-not-write.txt") throw Error("PHI_EXPECTED_HOOK_FAILURE");
          });
          pi.registerTool({ name: "fixture_throw", label: "Fixed failure", description: "Synthetic extension failure",
            parameters: { type: "object", properties: {}, additionalProperties: false },
            execute: async () => { requireGuest(scope()); fs.writeFileSync("/workspace/throw-before.txt", "PHI_THROW_BEFORE"); throw Error("PHI_EXPECTED_TOOL_FAILURE"); } });
          pi.registerTool({ name: "fixture_wait", label: "Fixed cancellation", description: "Wait for fixture cancellation",
            parameters: { type: "object", properties: {}, additionalProperties: false },
            execute: async (_id, _args, signal) => {
              fs.writeFileSync("/workspace/cancel-before.txt", "PHI_CANCEL_BEFORE");
              await waitForAbort(signal, () => { waitingTool = true; });
              toolAborted = signal?.aborted === true;
              fs.writeFileSync("/workspace/cancel-observed.txt", "PHI_CANCEL_OBSERVED");
              throw Error("PHI_EXPECTED_TOOL_ABORT");
            } });
        } }] } });
    requireGuest(services.diagnostics.length === 0);
    const model = modelRuntime.getModel("phi-lifecycle", "fixture");
    requireGuest(model);
    const result = await createAgentSessionFromServices({ services, sessionManager, sessionStartEvent, model, thinkingLevel: "off", tools });
    requireGuest(!result.modelFallbackMessage);
    return { ...result, services, diagnostics: services.diagnostics };
  };
  const runtime = await createAgentSessionRuntime(factory, { cwd: WORKSPACE, agentDir, sessionManager: SessionManager.create(WORKSPACE, sessionDir) });
  const bind = async (session: AgentSession) => session.bindExtensions({ mode: "json", onError: (error) => { errors.push(error.event ?? "unknown"); } });
  runtime.setRebindSession(bind);
  const resourcesSafe = () => {
    const loader = runtime.services.resourceLoader;
    return scope() && runtime.cwd === WORKSPACE && runtime.session.sessionManager.getCwd() === WORKSPACE
      && runtime.session.sessionFile?.startsWith(`${sessionDir}/`) === true
      && runtime.session.getActiveToolNames().sort().join(",") === [...tools].sort().join(",")
      && runtime.session.model?.provider === "phi-lifecycle" && runtime.session.model.id === "fixture"
      && loader.getExtensions().errors.length === 0 && loader.getExtensions().extensions.length === 1
      && loader.getSkills().skills.length === 0 && loader.getPrompts().prompts.length === 0
      && loader.getThemes().themes.length === 0 && loader.getAgentsFiles().agentsFiles.length === 0;
  };
  const prompt = async (text: string, next: typeof sequence = []) => {
    sequence = next; position = 0;
    await runtime.session.prompt(text, { expandPromptTemplates: false });
    requireGuest(runtime.session.isIdle && runtime.session.getLastAssistantText() === "PHI_LIFECYCLE_OK"
      && position === sequence.length + 1 && resourcesSafe());
  };
  const stale = (api: ExtensionAPI) => {
    try { api.appendEntry("phi-stale-must-not-append", {}); return false; } catch { return true; }
  };
  let disposed = false;
  try {
    await bind(runtime.session);
    await prompt("PHI_SESSION_ORIGINAL");
    const originalFile = runtime.session.sessionFile!;
    const originalId = runtime.session.sessionId;
    const originalMessages = JSON.stringify(runtime.session.messages);
    const originalUser = runtime.session.getUserMessagesForForking()[0].entryId;
    const originalLeaf = runtime.session.sessionManager.getLeafId()!;
    cancelTransition = true;
    const beforeCancelled = runtime.session;
    const baselineCalls = calls;
    requireGuest((await runtime.newSession()).cancelled && (await runtime.switchSession(originalFile)).cancelled
      && (await runtime.fork(originalUser)).cancelled && (await runtime.fork(originalLeaf, { position: "at" })).cancelled
      && (await runtime.session.navigateTree(originalUser, { summarize: false })).cancelled);
    CHECKS.transitionCancellation = runtime.session === beforeCancelled && calls === baselineCalls
      && runtime.session.sessionId === originalId && JSON.stringify(runtime.session.messages) === originalMessages
      && events.filter((event) => event.startsWith("shutdown:")).length === 0;
    cancelTransition = false;
    const oldApi = latestApi!;
    requireGuest(!(await runtime.newSession()).cancelled);
    CHECKS.sessionNew = runtime.session.sessionId !== originalId && runtime.session.messages.length === 0 && stale(oldApi) && resourcesSafe();
    await prompt("PHI_SESSION_NEW");
    requireGuest(!(await runtime.switchSession(originalFile)).cancelled);
    CHECKS.sessionResume = runtime.session.sessionId === originalId && JSON.stringify(runtime.session.messages) === originalMessages && resourcesSafe();
    const fork = await runtime.fork(originalUser);
    CHECKS.sessionFork = !fork.cancelled && fork.selectedText === "PHI_SESSION_ORIGINAL"
      && runtime.session.sessionId !== originalId && runtime.session.messages.length === 0 && resourcesSafe();
    await prompt("PHI_SESSION_FORK");
    const forkFile = runtime.session.sessionFile!;
    const forkLeaf = runtime.session.sessionManager.getLeafId()!;
    const forkMessages = JSON.stringify(runtime.session.messages);
    requireGuest(!(await runtime.fork(forkLeaf, { position: "at" })).cancelled);
    CHECKS.sessionClone = runtime.session.sessionFile !== forkFile && JSON.stringify(runtime.session.messages) === forkMessages
      && runtime.session.sessionManager.getHeader()?.parentSession === forkFile && resourcesSafe();
    const cloneFile = runtime.session.sessionFile!;
    await prompt("PHI_BRANCH_DISCARDED");
    const tree = await runtime.session.navigateTree(forkLeaf, { summarize: false });
    CHECKS.sessionTree = !tree.cancelled && runtime.session.sessionFile === cloneFile
      && JSON.stringify(runtime.session.messages) === forkMessages && resourcesSafe();
    await prompt("PHI_BRANCH_REPLACEMENT");
    const reloadApi = latestApi!;
    await runtime.session.reload();
    requireGuest(stale(reloadApi));
    await prompt("PHI_RELOAD_WORK", [{ name: "write", arguments: { path: "reload-work.txt", content: "PHI_RELOAD_WORK" } }]);
    CHECKS.sessionReloadWork = fs.readFileSync("/workspace/reload-work.txt", "utf8") === "PHI_RELOAD_WORK" && resourcesSafe();
    holdStream = true; sequence = []; position = 0;
    const streamPrompt = runtime.session.prompt("PHI_CANCEL_STREAM", { expandPromptTemplates: false });
    void streamPrompt.catch(() => {}); // Avoid unhandled rejection while waiting for the positive control.
    await waitUntil(() => waitingStream);
    requireGuest(runtime.session.isStreaming);
    await runtime.session.abort();
    await streamPrompt;
    const aborted = runtime.session.messages.at(-1);
    CHECKS.streamCancellation = streamAborted && runtime.session.isIdle && aborted?.role === "assistant" && aborted.stopReason === "aborted";
    holdStream = false;
    sequence = [{ name: "fixture_wait", arguments: {} }, { name: "write", arguments: { path: "cancel-must-not-write.txt", content: "BAD" } }]; position = 0;
    const toolPrompt = runtime.session.prompt("PHI_CANCEL_TOOL", { expandPromptTemplates: false });
    void toolPrompt.catch(() => {});
    await waitUntil(() => waitingTool);
    await runtime.session.steer("PHI_QUEUED_MUST_NOT_RUN_STEER");
    await runtime.session.followUp("PHI_QUEUED_MUST_NOT_RUN_FOLLOWUP");
    requireGuest(Number(runtime.session.pendingMessageCount) === 2);
    // SDK abort is not queue revocation. Explicitly discard both queues first.
    const cleared = runtime.session.clearQueue();
    const callsBeforeAbort = calls;
    await runtime.session.abort();
    await toolPrompt;
    CHECKS.toolCancellation = toolAborted && position === 1 && calls === callsBeforeAbort && runtime.session.isIdle
      && runtime.session.messages.some((message) => message.role === "toolResult" && message.toolName === "fixture_wait" && message.isError)
      && !fs.existsSync("/workspace/cancel-must-not-write.txt");
    CHECKS.queuedCancellation = cleared.steering.join() === "PHI_QUEUED_MUST_NOT_RUN_STEER"
      && cleared.followUp.join() === "PHI_QUEUED_MUST_NOT_RUN_FOLLOWUP" && runtime.session.pendingMessageCount === 0;
    await prompt("PHI_AFTER_CANCEL", [{ name: "write", arguments: { path: "after-cancel.txt", content: "PHI_AFTER_CANCEL" } }]);
    await prompt("PHI_EXTENSION_FAILURES", [{ name: "fixture_throw", arguments: {} },
      { name: "write", arguments: { path: "hook-must-not-write.txt", content: "BAD" } }, { name: "read", arguments: { path: "README.md" } }]);
    const results = runtime.session.messages.filter((message) => message.role === "toolResult");
    CHECKS.extensionToolFailure = results.some((message) => message.toolName === "fixture_throw" && message.isError
      && JSON.stringify(message.content).includes("PHI_EXPECTED_TOOL_FAILURE")) && fs.existsSync("/workspace/throw-before.txt");
    CHECKS.extensionHookFailure = results.some((message) => message.toolName === "write" && message.isError
      && JSON.stringify(message.content).includes("PHI_EXPECTED_HOOK_FAILURE"))
      && !fs.existsSync("/workspace/hook-must-not-write.txt") && results.at(-1)?.toolName === "read" && !results.at(-1)?.isError;
    CHECKS.lifecycleScope = resourcesSafe() && contextsClean;
    failShutdown = true;
    await runtime.dispose(); disposed = true;
    CHECKS.shutdownFailureContained = errors.join() === "session_shutdown" && scope() && stale(latestApi!);
    CHECKS.lifecycleEventOrder = events.join(",") === ["start:startup", "before:new", "before:resume", "before:fork:before", "before:fork:at", "before:tree",
      "before:new", "shutdown:new", "start:new", "before:resume", "shutdown:resume", "start:resume",
      "before:fork:before", "shutdown:fork", "start:fork", "before:fork:at", "shutdown:fork", "start:fork", "before:tree", "tree",
      "shutdown:reload", "start:reload", "shutdown:quit"].join(",");
    requireGuest(Object.values(CHECKS).every(Boolean));
    fs.writeFileSync("/workspace/lifecycle.json", JSON.stringify({ version: 1, nonce: input.nonce, events }), { flag: "wx" });
  } finally { if (!disposed) await runtime.dispose(); }
}

// Failure details may contain context/paths. Return a generic failure only.
main().catch(() => { process.stdout.write('{"error":"AGENT_GUEST_FAILED"}\n'); process.exitCode = 1; });
