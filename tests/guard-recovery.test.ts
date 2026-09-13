import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, lstat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";
import test from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { createFixtureArgs, fixtureCommand, PROBE_LABEL, TMPFS } from "../guard-host/docker-spec.ts";
import type { DockerCommand } from "../guard-host/docker-probe.ts";
import { checkHeartbeat, checkWorkerReady, createRecoveryArgs, heartbeatArgs, inspectRecovery, RECOVERY_CHECK_IDS, RECOVERY_NODE, recoveryCommand, recoveryJson, VERIFY_RECOVERY } from "../guard-host/recovery-spec.ts";
import { probeWorkerLoss } from "../guard-host/recovery-probe.ts";
import { manageRecoveryWorker, type RecoveryWorker } from "../guard-host/recovery-worker-client.ts";
import { runRecoveryCli } from "../guard-host/probe-recovery.ts";

const nonce = "a".repeat(32), id = "b".repeat(64), imageId = "sha256:" + "c".repeat(64);
const heartbeat = { version: 1, nonce, parentAdvanced: true, childAdvanced: true };
function container(status = "created") {
  return { Id: id, Image: imageId, Name: `/phi-phase0-${nonce}`,
    State: { Status: status, Running: status === "running", Pid: status === "running" ? 1234 : 0, OOMKilled: false, Error: "" },
    Config: { Image: imageId, Labels: { [PROBE_LABEL]: nonce }, User: "1000:1000", WorkingDir: "/workspace",
      Entrypoint: ["/usr/bin/env"], Cmd: recoveryCommand(nonce), Volumes: null, Healthcheck: { Test: ["NONE"] } },
    HostConfig: { Privileged: false, ReadonlyRootfs: true, CapDrop: ["ALL"], CapAdd: null, SecurityOpt: ["no-new-privileges=true"],
      NetworkMode: "none", IpcMode: "private", CgroupnsMode: "private", PidMode: "", UTSMode: "", UsernsMode: "", Runtime: "runc",
      Memory: 536870912, MemorySwap: 536870912, NanoCpus: 1e9, PidsLimit: 64, Init: true, AutoRemove: false, PublishAllPorts: false,
      RestartPolicy: { Name: "no" }, LogConfig: { Type: "none" }, Tmpfs: { ...TMPFS },
      Binds: null, VolumesFrom: null, Devices: [], DeviceRequests: null, DeviceCgroupRules: null, Links: null,
      ExtraHosts: null, PortBindings: {}, GroupAdd: null, Dns: [], DnsOptions: [], DnsSearch: [] },
    Mounts: [], NetworkSettings: { Networks: { none: {} } } };
}
function fake(options: { fail?: string; unsafe?: boolean; badHeartbeat?: number; badStop?: boolean; forged?: boolean;
  lingering?: boolean; missing?: boolean; ambiguous?: boolean; workerBad?: boolean; cancel?: AbortController } = {}) {
  const calls: string[][] = [];
  let status = "created", removed = false, beats = 0, healthy = true;
  let workerStarted = false, workerClosed = false;
  const run: DockerCommand = async (args, signal) => {
    calls.push([...args]);
    const verb = args[0] === "info" ? "info" : args[1];
    if (verb === options.fail) throw Error("SYNTHETIC_PRIVATE_ERROR");
    if (verb === "info") return JSON.stringify({ OSType: "linux", OperatingSystem: "Docker Desktop", KernelVersion: "microsoft-wsl2", ServerVersion: "29.4.3" });
    if (args[0] === "image") return JSON.stringify({ Id: imageId, Os: "linux", Config: { Volumes: null, OnBuild: null } });
    if (verb === "create") return id;
    if (verb === "inspect") {
      if (args.includes("{{json .State}}")) return JSON.stringify({ Status: "exited", Running: false, Pid: 0, ExitCode: 137, OOMKilled: options.badStop ?? false, Error: "" });
      const value = container(status);
      if (options.unsafe) value.HostConfig.Privileged = true;
      if (options.forged && calls.some(c => c[1] === "ls")) value.Config.Labels[PROBE_LABEL] = "forged";
      return JSON.stringify(value);
    }
    if (verb === "exec") { beats++; return JSON.stringify({ ...heartbeat, childAdvanced: options.badHeartbeat !== beats }); }
    if (verb === "kill") { assert.equal(healthy, false, "worker must have exited before host engine stop"); status = "exited"; return id; }
    if (verb === "wait") return "137";
    if (verb === "ls") {
      assert.equal(signal, undefined, "cleanup ignores main cancellation");
      if (options.missing || (removed && !options.lingering)) return "";
      return options.ambiguous ? `${id}\n${"d".repeat(64)}` : id;
    }
    if (verb === "rm") { removed = true; return id; }
    throw Error("Unexpected mock operation");
  };
  const startWorker = (): RecoveryWorker => {
    workerStarted = true; status = "running";
    return { ready: options.fail === "ready" ? Promise.reject(Error("SYNTHETIC_PRIVATE_ERROR")) : Promise.resolve(),
      healthy: () => !options.workerBad,
      killForTest: async () => { if (options.fail === "worker-kill") throw Error("SYNTHETIC_PRIVATE_ERROR"); healthy = false; options.cancel?.abort(); },
      close: async () => { workerClosed = true; if (options.fail === "worker-close") throw Error("SYNTHETIC_PRIVATE_ERROR"); },
    };
  };
  return { run, startWorker, calls, state: () => ({ workerStarted, workerClosed }) };
}

test("recovery uses identical primitive restrictions, fixed Node scripts and exact running configuration", () => {
  new Script(RECOVERY_NODE); new Script(VERIFY_RECOVERY);
  assert.deepEqual(createRecoveryArgs(imageId, nonce).slice(0, -recoveryCommand(nonce).length), createFixtureArgs(imageId, nonce).slice(0, -fixtureCommand(nonce).length));
  assert.equal(inspectRecovery(container(), nonce, imageId, "created"), id);
  assert.equal(inspectRecovery(container("running"), nonce, imageId, "running"), id);
  const incomplete = container("running"); incomplete.State.Pid = 0;
  assert.throws(() => inspectRecovery(incomplete, nonce, imageId, "running"));
  assert.deepEqual(heartbeatArgs(id, nonce).slice(0, 5), ["container", "exec", "--workdir=/workspace", id, "/usr/bin/env"]);
  assert.throws(() => heartbeatArgs("--privileged", nonce));
});

test("worker IPC and heartbeat require exact schema, nonce, ID and actual advancing decisions", () => {
  checkWorkerReady({ version: 1, nonce, id }, nonce, id); checkHeartbeat(heartbeat, nonce);
  for (const value of [null, {}, { version: 1, nonce: "stale", id }, { version: 1, nonce, id, pid: 1 }]) assert.throws(() => checkWorkerReady(value, nonce, id));
  for (const value of [null, { ...heartbeat, parentAdvanced: false }, { ...heartbeat, childAdvanced: false }, { ...heartbeat, extra: true }]) assert.throws(() => checkHeartbeat(value, nonce));
  assert.throws(() => recoveryJson("x")); assert.throws(() => recoveryJson(" ".repeat(128 * 1024 + 1)));
});

test("mock worker loss observes surviving guest then independently stops/removes; never authorizes launch", async () => {
  const mock = fake(); const report = await probeWorkerLoss(mock.run, mock.startWorker, nonce);
  assert.equal(report.probe, "passed"); assert.equal(report.cleanup, "removed"); assert.equal(report.workerCleanup, "exited");
  assert.deepEqual(report.checks, [...RECOVERY_CHECK_IDS]);
  assert.equal(report.coverage, "worker-loss-only"); assert.equal(report.gateway, "deferred");
  assert.equal(report.state, "locked"); assert.equal(report.protection, "not-active"); assert.equal(report.canLaunch, false);
  assert.equal(mock.state().workerClosed, true);
  assert.ok(mock.calls.every(c => !c.includes("pull") && !c.includes("prune") && !c.includes("restart")));
});

test("engine/image or unsafe configuration cannot start a worker", async () => {
  for (const options of [{ fail: "info" }, { fail: "inspect" }, { unsafe: true }]) {
    const mock = fake(options); const report = await probeWorkerLoss(mock.run, mock.startWorker, nonce);
    assert.notEqual(report.probe, "passed"); assert.equal(mock.state().workerStarted, false);
    if (options.unsafe) assert.equal(report.cleanup, "removed");
  }
});

test("worker failures, non-advancing pre/post-loss heartbeat and unconfirmed engine stop fail and clean up", async () => {
  for (const options of [{ fail: "ready" }, { workerBad: true }, { fail: "worker-kill" }, { badHeartbeat: 1 }, { badHeartbeat: 2 }, { badStop: true }, { fail: "kill" }]) {
    const mock = fake(options); const report = await probeWorkerLoss(mock.run, mock.startWorker, nonce);
    assert.equal(report.probe, "failed"); assert.equal(report.cleanup, "removed"); assert.equal(report.workerCleanup, "exited");
    assert.doesNotMatch(JSON.stringify(report), /SYNTHETIC_PRIVATE/);
  }
});

test("cleanup rejects uncertain create, forged/ambiguous identity, lingering resource and unconfirmed worker exit", async () => {
  for (const options of [{ fail: "create", missing: true }, { forged: true }, { ambiguous: true }, { lingering: true }, { fail: "rm" }, { fail: "worker-close" }]) {
    const mock = fake(options); const report = await probeWorkerLoss(mock.run, mock.startWorker, nonce);
    assert.equal(report.probe, "failed");
    assert.ok(report.cleanup === "unconfirmed" || report.workerCleanup === "unconfirmed");
    if (options.forged || options.ambiguous) assert.ok(!mock.calls.some(c => c[1] === "rm"));
  }
});

test("cancellation stops new experiment work but not worker/container cleanup", async () => {
  const cancel = new AbortController(); const mock = fake({ cancel });
  const report = await probeWorkerLoss(mock.run, mock.startWorker, nonce, cancel.signal);
  assert.equal(report.rule, "DOCKER_PROBE_CANCELLED"); assert.equal(report.probe, "failed");
  assert.equal(report.cleanup, "removed"); assert.equal(report.workerCleanup, "exited");
  const untouched = fake(); await probeWorkerLoss(untouched.run, untouched.startWorker, nonce, cancel.signal);
  assert.deepEqual(untouched.calls, []);
});

const cleanEnv = process.platform === "win32" ? { SystemRoot: process.env.SystemRoot } : {};
function syntheticWorker(script: string, cwd = tmpdir(), signal?: AbortSignal, timeout?: number) {
  const child = spawn(process.execPath, ["-e", script], { cwd, env: cleanEnv, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe", "ipc"] });
  return manageRecoveryWorker(child, nonce, id, signal, timeout);
}
const READY = `process.send(${JSON.stringify({ version: 1, nonce, id })});`;
test("real disposable host worker is force-killed and reaped without cooperative exit hooks", async () => {
  const root = await mkdtemp(join(tmpdir(), "phi-worker-test-"));
  const worker = syntheticWorker(`process.on('exit',()=>require('node:fs').writeFileSync('exit-hook.txt','MUST_NOT_RUN'));${READY}setInterval(()=>{},1000);`, root);
  try {
    await worker.ready; assert.equal(worker.healthy(), true); await worker.killForTest();
    assert.equal(worker.healthy(), false);
    await assert.rejects(lstat(join(root, "exit-hook.txt")), { code: "ENOENT" });
  } finally { await worker.close(); await rm(root, { recursive: true, force: true }); }
});

test("real worker early exit, malformed IPC, oversized output, readiness timeout and cancellation cannot pass", async () => {
  const cancel = new AbortController(); cancel.abort();
  for (const [script, signal, timeout] of [
    ["process.exit(0)", undefined, undefined],
    ["process.send({private:'SYNTHETIC_PRIVATE_ERROR'});setInterval(()=>{},1000)", undefined, undefined],
    ["process.stdout.write('x'.repeat(256*1024));setInterval(()=>{},1000)", undefined, undefined],
    ["setInterval(()=>{},1000)", undefined, 30],
    ["setInterval(()=>{},1000)", cancel.signal, undefined],
  ] as const) {
    const worker = syntheticWorker(script, tmpdir(), signal, timeout);
    try { await assert.rejects(worker.ready, error => { assert.doesNotMatch(String(error), /SYNTHETIC_PRIVATE/); return true; }); assert.equal(worker.healthy(), false); }
    finally { await worker.close(); }
  }
});

test("duplicate checkpoint invalidates readiness and a spawn failure has confirmed no worker", async () => {
  const worker = syntheticWorker(`${READY}setTimeout(()=>{${READY}},10);setInterval(()=>{},1000)`);
  try { await worker.ready; await sleep(100); assert.equal(worker.healthy(), false); await assert.rejects(worker.killForTest()); }
  finally { await worker.close(); }
  const root = await mkdtemp(join(tmpdir(), "phi-missing-worker-test-"));
  const child = spawn(join(root, "missing-executable"), [], { env: cleanEnv, shell: false });
  const missing = manageRecoveryWorker(child, nonce, id);
  try { await assert.rejects(missing.ready); }
  finally { await missing.close(); await rm(root, { recursive: true, force: true }); }
});

test("internal worker refuses direct invocation without supervisor IPC before Docker operations", async () => {
  const path = fileURLToPath(new URL("../guard-host/recovery-worker.ts", import.meta.url));
  const child = spawn(process.execPath, ["--experimental-transform-types", path], { cwd: tmpdir(), env: cleanEnv, shell: false, windowsHide: true, stdio: "ignore" });
  const code = await new Promise<number | null>((resolve, reject) => { child.on("error", reject); child.on("exit", resolve); });
  assert.equal(code, 1);
});

test("recovery CLI requires consent and accepts no target PID, workspace, engine control or image overrides", async () => {
  let text = ""; const io = { out: (s: string) => { text += s; }, error: (s: string) => { text += s; } };
  assert.equal(await runRecoveryCli(["--help"], io), 0); assert.match(text, /surviving supervisor/);
  for (const args of [[], ["--confirm"], ["--docker", "C:\\synthetic\\docker.exe"], ["--confirm", "--pid", "123"], ["--confirm", "--workspace", "SYNTHETIC_PRIVATE"]]) {
    text = ""; assert.equal(await runRecoveryCli(args, io), 64); assert.doesNotMatch(text, /SYNTHETIC_PRIVATE/);
  }
  if (process.platform !== "win32") {
    text = ""; assert.equal(await runRecoveryCli(["--docker", "C:\\synthetic\\docker.exe", "--confirm", "--json"], io), 2);
    assert.equal(JSON.parse(text).rule, "DOCKER_WINDOWS_HOST_REQUIRED");
  }
});
