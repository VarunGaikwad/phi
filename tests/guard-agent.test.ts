import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm, symlink, link } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, posix } from "node:path";
import { Script } from "node:vm";
import { createHash } from "node:crypto";
import test from "node:test";
import { collectAgentRuntime, MAX_AGENT_PACKET_BYTES, readPinnedRuntimeFile, runtimeFile, validateRuntimePath } from "../guard-host/agent-runtime.ts";
import {
  AGENT_BOOTSTRAP, AGENT_CHECK_IDS, VERIFY_AGENT_EFFECTS, agentFixtureCommand, buildAgentPacket,
  createAgentFixtureArgs, inspectAgentFixture, inspectAgentResult, syntheticCanaryPaths,
} from "../guard-host/agent-spec.ts";
import { executeDockerInput, probeOfflineAgent, type DockerInputCommand } from "../guard-host/agent-probe.ts";
import { runOfflineAgentCli } from "../guard-host/probe-agent.ts";
import { DockerProbeError, PROBE_LABEL, TMPFS } from "../guard-host/docker-spec.ts";
import type { DockerCommand } from "../guard-host/docker-probe.ts";
import { COPY_PATHS, copyHash } from "../guard-host/synthetic-copy.ts";

const nonce = "a".repeat(32);
const imageId = "sha256:" + "b".repeat(64);
const id = "c".repeat(64);
const packet = Buffer.from("synthetic mock packet; never sent to a real runtime");
const result = { version: 1, nonce, checks: Object.fromEntries(AGENT_CHECK_IDS.map((key) => [key, true])) };
const engine = { OSType: "linux", OperatingSystem: "Docker Desktop", KernelVersion: "6.6.114.1-microsoft-standard-WSL2", ServerVersion: "29.4.3" };
function container(status: string) {
  return { Id: id, Image: imageId, Name: `/phi-phase0-${nonce}`, State: { Status: status, Running: status === "running", Pid: status === "running" ? 1234 : 0, OOMKilled: false, Error: "" },
    Config: { Image: imageId, Labels: { [PROBE_LABEL]: nonce }, User: "1000:1000", WorkingDir: "/workspace",
      Entrypoint: ["/usr/bin/env"], Cmd: agentFixtureCommand(nonce), Volumes: null, Healthcheck: { Test: ["NONE"] } },
    HostConfig: { Privileged: false, ReadonlyRootfs: true, CapDrop: ["ALL"], CapAdd: null, SecurityOpt: ["no-new-privileges=true"],
      NetworkMode: "none", IpcMode: "private", CgroupnsMode: "private", PidMode: "", UTSMode: "", UsernsMode: "", Runtime: "runc",
      Memory: 536870912, MemorySwap: 536870912, NanoCpus: 1e9, PidsLimit: 64, Init: true, AutoRemove: false, PublishAllPorts: false,
      RestartPolicy: { Name: "no" }, LogConfig: { Type: "none" }, Tmpfs: { ...TMPFS },
      Binds: null, VolumesFrom: null, Devices: [], DeviceRequests: null, DeviceCgroupRules: null, Links: null,
      ExtraHosts: null, PortBindings: {}, GroupAdd: null, Dns: [], DnsOptions: [], DnsSearch: [] },
    Mounts: [], NetworkSettings: { Networks: { none: {} } } };
}
function fake(options: { fail?: string; unsafe?: boolean; forged?: boolean; lingering?: boolean; uncertainCreate?: boolean;
  effects?: boolean; badStop?: boolean; guest?: unknown; cancel?: AbortController } = {}) {
  const calls: string[][] = [];
  let status = "created";
  let removed = false;
  const run: DockerCommand = async (args, signal) => {
    calls.push([...args]);
    const verb = args[0] === "info" ? "info" : args[1];
    if (verb === options.fail) throw new Error("FAKE_PRIVATE_ERROR");
    if (verb === "info") return JSON.stringify(engine);
    if (args[0] === "image") return JSON.stringify({ Id: imageId, Os: "linux", Config: { Volumes: null, OnBuild: null } });
    if (verb === "create") return id;
    if (verb === "inspect") {
      if (args.includes("{{json .State}}")) return JSON.stringify({ Status: options.badStop ? "running" : "exited", Running: false, Pid: 0, ExitCode: 137, OOMKilled: false, Error: "" });
      const info = container(status);
      if (options.unsafe) info.HostConfig.Privileged = true;
      if (options.forged && calls.some((call) => call[1] === "ls")) info.Config.Labels[PROBE_LABEL] = "forged";
      return JSON.stringify(info);
    }
    if (verb === "start") { status = "running"; return id; }
    if (verb === "exec") return JSON.stringify({ verified: options.effects !== false });
    if (verb === "kill") { status = "exited"; return id; }
    if (verb === "wait") return "137";
    if (verb === "ls") {
      assert.equal(signal, undefined, "cleanup is not cancelled with the run");
      return options.uncertainCreate || (removed && !options.lingering) ? "" : id;
    }
    if (verb === "rm") { removed = true; return id; }
    throw new Error("unexpected mock operation");
  };
  const transfer: DockerInputCommand = async (args, input) => {
    calls.push([...args]);
    assert.equal(input, packet);
    assert.ok(args.includes(copyHash(packet)));
    if (options.fail === "transfer") throw new Error("FAKE_PRIVATE_ERROR");
    options.cancel?.abort();
    return JSON.stringify(options.guest ?? result);
  };
  return { run, transfer, calls };
}

test("offline fixture shares all primitive restrictions and independently checks its exact command", () => {
  new Script(AGENT_BOOTSTRAP);
  new Script(VERIFY_AGENT_EFFECTS);
  const args = createAgentFixtureArgs(imageId, nonce);
  for (const flag of ["--network=none", "--read-only", "--pull=never", "--cap-drop=ALL", "--user=1000:1000", "--no-healthcheck"]) assert.ok(args.includes(flag));
  for (const flag of ["--mount", "--volume", "--env-file", "--privileged", "--publish"]) assert.ok(!args.includes(flag));
  assert.equal(inspectAgentFixture(container("created"), nonce, imageId), id);
  assert.equal(inspectAgentFixture(container("running"), nonce, imageId, "running"), id);
  assert.throws(() => inspectAgentFixture(container("running"), nonce, imageId), DockerProbeError);
  const incomplete = container("running");
  Reflect.deleteProperty(incomplete.State, "Running");
  assert.throws(() => inspectAgentFixture(incomplete, nonce, imageId, "running"), DockerProbeError);
  const wrong = container("created");
  wrong.Config.Cmd = ["node", "unapproved.js"];
  assert.throws(() => inspectAgentFixture(wrong, nonce, imageId), DockerProbeError);
});

test("all 17 guest checks and current nonce are required, with no extra fields", () => {
  inspectAgentResult(result, nonce);
  for (const value of [{ ...result, nonce: "stale" }, { ...result, checks: { ...result.checks, agentLoop: false } },
    { ...result, checks: { ...result.checks, extra: true } }, { ...result, privateData: "FAKE_PRIVATE" }, null]) {
    assert.throws(() => inspectAgentResult(value, nonce), DockerProbeError);
  }
});

test("mock success requires effects, engine stop, source verification and removal; still Locked", async () => {
  const mock = fake();
  let verified = false;
  const report = await probeOfflineAgent(mock.run, mock.transfer, packet, nonce, async () => { verified = true; });
  assert.equal(report.probe, "passed");
  assert.equal(report.cleanup, "removed");
  assert.equal(report.canLaunch, false);
  assert.equal(report.protection, "not-active");
  assert.equal(report.state, "locked");
  assert.equal(report.gateway, "deferred");
  assert.equal(report.checks.length, 20);
  assert.equal(verified, true);
  assert.deepEqual(mock.calls.find((call) => call[1] === "kill"), ["container", "kill", "--signal=KILL", id]);
  assert.ok(mock.calls.every((call) => !call.includes("pull") && !call.includes("prune") && !call.includes("cp")));
  assert.equal(mock.calls.at(-1)?.[1], "ls");
});

test("engine and image failure do not create, start, transfer or remove anything", async () => {
  for (const fail of ["info", "inspect"]) {
    const mock = fake({ fail });
    const report = await probeOfflineAgent(mock.run, mock.transfer, packet, nonce, async () => {});
    assert.equal(report.probe, "blocked");
    assert.equal(report.cleanup, "not-needed");
    assert.ok(!mock.calls.some((call) => ["create", "start", "exec", "rm"].includes(call[1])));
    assert.doesNotMatch(JSON.stringify(report), /FAKE_PRIVATE/);
  }
});

test("unsafe pre-start inspection prevents every guest execution, but cleans up owned resource", async () => {
  const mock = fake({ unsafe: true });
  const report = await probeOfflineAgent(mock.run, mock.transfer, packet, nonce, async () => {});
  assert.equal(report.probe, "failed");
  assert.equal(report.cleanup, "removed");
  assert.ok(!mock.calls.some((call) => ["start", "exec"].includes(call[1])));
});

test("guest errors, incomplete effects and unconfirmed stop never pass, and always verify host", async () => {
  for (const options of [{ fail: "transfer" }, { guest: { ...result, checks: {} } }, { effects: false }, { badStop: true }, { fail: "kill" }]) {
    const mock = fake(options);
    let verified = false;
    const report = await probeOfflineAgent(mock.run, mock.transfer, packet, nonce, async () => { verified = true; });
    assert.equal(report.probe, "failed");
    assert.equal(report.cleanup, "removed");
    assert.equal(verified, true);
    assert.doesNotMatch(JSON.stringify(report), /FAKE_PRIVATE/);
  }
});

test("host-canary mutation fails even when every guest and engine check claims success", async () => {
  const mock = fake();
  const report = await probeOfflineAgent(mock.run, mock.transfer, packet, nonce, async () => { throw Error("FAKE_PRIVATE"); });
  assert.equal(report.probe, "failed");
  assert.equal(report.rule, "AGENT_HOST_FIXTURES_CHANGED");
  assert.equal(report.cleanup, "removed");
});

test("uncertain create and forged/failed/lingering removal stay unconfirmed", async () => {
  for (const options of [{ fail: "create", uncertainCreate: true }, { forged: true }, { fail: "rm" }, { lingering: true }]) {
    const mock = fake(options);
    const report = await probeOfflineAgent(mock.run, mock.transfer, packet, nonce, async () => {});
    assert.equal(report.probe, "failed");
    assert.equal(report.cleanup, "unconfirmed");
    if (options.forged) assert.ok(!mock.calls.some((call) => call[1] === "rm"));
  }
});

test("cancellation prevents later work but not ownership-checked cleanup", async () => {
  const cancel = new AbortController();
  const mock = fake({ cancel });
  const report = await probeOfflineAgent(mock.run, mock.transfer, packet, nonce, async () => {}, cancel.signal);
  assert.equal(report.probe, "failed");
  assert.equal(report.rule, "DOCKER_PROBE_CANCELLED");
  assert.equal(report.cleanup, "removed");
  const untouched = fake();
  assert.equal((await probeOfflineAgent(untouched.run, untouched.transfer, packet, nonce, async () => {}, cancel.signal)).probe, "blocked");
  assert.deepEqual(untouched.calls, []);
});

test("synthetic Windows canary mappings are data, not drive mounts or arbitrary path arguments", () => {
  assert.deepEqual(syntheticCanaryPaths("C:\\synthetic\\denied.txt"), ["/mnt/c/synthetic/denied.txt", "/run/desktop/mnt/host/c/synthetic/denied.txt", "/host_mnt/c/synthetic/denied.txt"]);
  for (const path of ["C:denied.txt", "\\\\server\\share\\denied.txt", "C:\\synthetic\\..\\denied.txt", "C:\\synthetic\\other.txt"]) assert.throws(() => syntheticCanaryPaths(path));
  for (const path of ["../private", "/root", "node_modules/../auth.json", "node_modules/x:ads", "node_modules//x", "C:\\private"]) assert.throws(() => validateRuntimePath(path));
});

test("runtime pins reject changed bytes, links and unexpected lengths without executing code", async () => {
  const root = await mkdtemp(join(tmpdir(), "phi-runtime-test-"));
  try {
    const bytes = Buffer.from("throw new Error('MUST_NOT_RUN')");
    const entry = { source: "runtime.js", path: "runtime.js", bytes: bytes.length, sha256: copyHash(bytes) };
    await writeFile(join(root, entry.source), bytes);
    assert.deepEqual(await readPinnedRuntimeFile(root, entry), bytes);
    await assert.rejects(readPinnedRuntimeFile(root, { ...entry, sha256: "0".repeat(64) }), { rule: "AGENT_RUNTIME_PIN_MISMATCH" });
    await assert.rejects(readPinnedRuntimeFile(root, { ...entry, bytes: bytes.length + 1 }), { rule: "AGENT_RUNTIME_FILE_DENIED" });
    await link(join(root, entry.source), join(root, "hardlink.js"));
    await assert.rejects(readPinnedRuntimeFile(root, entry), { rule: "AGENT_RUNTIME_FILE_DENIED" });
    await mkdir(join(root, "directory"));
    await symlink(join(root, "directory"), join(root, "linked"), process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(readPinnedRuntimeFile(join(root, "linked"), entry), { rule: "AGENT_RUNTIME_LINK_DENIED" });
  } finally { await rm(root, { recursive: true, force: true }); }
});

function syntheticPacket() {
  const runtime = Array.from({ length: 382 }, (_, index) => runtimeFile(`node_modules/fixture/file-${index}.js`, Buffer.from("// synthetic")));
  runtime.push(runtimeFile("fixture.mjs", Buffer.from("throw Error('MUST_NOT_IMPORT')")));
  const snapshot = { version: 1, kind: "phi-synthetic-snapshot", files: COPY_PATHS.map((path) => runtimeFile(path, Buffer.from("synthetic"))) };
  return buildAgentPacket(runtime, snapshot, nonce, syntheticCanaryPaths("C:\\synthetic\\denied.txt"));
}

test("complete transfer packet is bounded, hash checked, and rejects duplicate/traversal/malformed entries", () => {
  const valid = JSON.parse(syntheticPacket().toString());
  assert.ok(buildAgentPacket(valid.runtime, valid.snapshot, nonce, valid.deniedPaths).length < MAX_AGENT_PACKET_BYTES);
  for (const mutate of [
    (p: typeof valid) => { p.runtime[0].path = "../escape"; },
    (p: typeof valid) => { p.runtime[0].path = p.runtime[1].path; },
    (p: typeof valid) => { p.runtime[0].base64 = "bad"; },
    (p: typeof valid) => { p.runtime[0].bytes = 99999999; },
    (p: typeof valid) => { p.snapshot.files[0].path = ".env"; },
  ]) {
    const changed = structuredClone(valid); mutate(changed);
    assert.throws(() => buildAgentPacket(changed.runtime, changed.snapshot, nonce, changed.deniedPaths), Error);
  }
});

// Execute only our bootstrap against an in-memory filesystem and blocked imports.
// This is parser/materializer unit coverage, NOT a real pi/Docker launch.
async function bootstrap(input: Buffer, expectedHash = copyHash(input)) {
  const writes = new Map<string, Buffer>();
  const fs = {
    readdirSync: () => [], existsSync: () => false, mkdirSync: () => {},
    writeFileSync: (path: string, data: Buffer | string, options: { flag: string }) => {
      assert.equal(options.flag, "wx"); assert.ok(!writes.has(path)); writes.set(path, Buffer.from(data));
    },
  };
  let output = "";
  const script = new Script(AGENT_BOOTSTRAP, { importModuleDynamically: async () => { throw Error("IMPORT_BLOCKED_FOR_UNIT_TEST"); } });
  await script.runInNewContext({ Buffer, Set, setTimeout, clearTimeout,
    require: (name: string) => {
      if (name === "node:fs") return fs;
      if (name === "node:crypto") return { createHash };
      if (name === "node:path") return posix;
      throw Error("unexpected unit-test import");
    }, process: { platform: "linux", getuid: () => 1000, cwd: () => "/workspace", argv: ["node", expectedHash, nonce],
      stdin: { async *[Symbol.asyncIterator]() { yield input; } }, stdout: { write: (text: string) => { output += text; } },
      exit: () => { throw Error("UNIT_TEST_TIMEOUT"); } },
  });
  return { writes, output };
}

test("bootstrap validates everything before writes, materializes only copy/runtime, and cannot import pi in tests", async () => {
  const input = syntheticPacket();
  const valid = await bootstrap(input);
  assert.equal(valid.writes.size, 387); // 383 runtime + 3 project + fixed input metadata.
  assert.equal(valid.writes.get("/workspace/README.md")?.toString(), "synthetic");
  assert.ok([...valid.writes.keys()].every((path) => path.startsWith("/home/node/runtime/") || path.startsWith("/workspace/")));
  assert.match(valid.output, /AGENT_BOOTSTRAP_FAILED/, "dynamic imports deliberately blocked");
  assert.equal((await bootstrap(input, "0".repeat(64))).writes.size, 0);
  for (const field of ["runtime", "snapshot"]) {
    const changed = JSON.parse(input.toString());
    (field === "runtime" ? changed.runtime : changed.snapshot.files).at(-1).path = "../escape";
    assert.equal((await bootstrap(Buffer.from(JSON.stringify(changed)))).writes.size, 0);
  }
  const extra = { ...JSON.parse(input.toString()), unknown: true };
  assert.equal((await bootstrap(Buffer.from(JSON.stringify(extra)))).writes.size, 0);
  assert.equal((await bootstrap(Buffer.alloc(MAX_AGENT_PACKET_BYTES + 1))).writes.size, 0);
});

test("installed runtime pin inventory can be collected as bytes; guest module is syntax-checked only", async () => {
  const files = await collectAgentRuntime();
  assert.equal(files.length, 383);
  assert.ok(files.reduce((total, file) => total + file.bytes, 0) < 12 * 1024 * 1024);
  assert.ok(!files.some((file) => /(?:^|\/)(?:\.env|auth\.json|\.npmrc|\.git|\.node|esbuild)(?:\/|$)/.test(file.path)));
  const metadata = JSON.parse(Buffer.from(files.find((file) => file.path === "node_modules/@earendil-works/pi-coding-agent/package.json")!.base64, "base64").toString());
  assert.equal(metadata.version, "0.85.1");
  assert.equal(metadata.exports["."], "./dist/bundle/index.js");
  assert.equal(metadata.scripts, undefined);
  const guest = Buffer.from(files.find((file) => file.path === "fixture.mjs")!.base64, "base64");
  const run = executeDockerInput(process.execPath, [], tmpdir(), process.platform === "win32" ? { SystemRoot: process.env.SystemRoot } : {});
  assert.equal(await run(["--input-type=module", "--check"], guest), "");
});

test("stdin transfer uses direct argv, bounded input/output, cancellation, and private error messages", async () => {
  const run = executeDockerInput(process.execPath, [], tmpdir(), process.platform === "win32" ? { SystemRoot: process.env.SystemRoot } : {});
  const data = Buffer.from("'quoted' & shell ; $HOME \"data\"");
  assert.equal(await run(["-e", "process.stdin.pipe(process.stdout)"], data), data.toString());
  await assert.rejects(run(["-e", "process.stderr.write('FAKE_PRIVATE');process.exit(1)"], data), { rule: "DOCKER_COMMAND_FAILED" });
  await assert.rejects(run(["-e", "process.stdout.write('x'.repeat(256*1024))"], data), { rule: "DOCKER_COMMAND_FAILED" });
  await assert.rejects(run([], Buffer.alloc(MAX_AGENT_PACKET_BYTES + 1)), { rule: "AGENT_PACKET_TOO_LARGE" });
  const cancel = new AbortController();
  const timer = setTimeout(() => cancel.abort(), 50);
  try { await assert.rejects(run(["-e", "setInterval(()=>{},1000)"], data, cancel.signal), { rule: "DOCKER_PROBE_CANCELLED" }); }
  finally { clearTimeout(timer); }
});

test("CLI requires explicit consent, accepts no workspace/provider flags, and never falls back on Linux", async () => {
  let text = "";
  const io = { out: (value: string) => { text += value; }, error: (value: string) => { text += value; } };
  assert.equal(await runOfflineAgentCli(["--help"], io), 0);
  assert.match(text, /NOT Guard acceptance/);
  assert.ok(text.startsWith(`Usage: ${process.platform === "win32" ? "npm.cmd" : "npm"} run guard:probe-agent`));
  for (const args of [[], ["--confirm"], ["--docker", "C:\\synthetic\\docker.exe"], ["--confirm", "--workspace", "FAKE_PRIVATE"]]) {
    text = ""; assert.equal(await runOfflineAgentCli(args, io), 64); assert.doesNotMatch(text, /FAKE_PRIVATE/);
  }
  if (process.platform !== "win32") {
    text = "";
    assert.equal(await runOfflineAgentCli(["--docker", "C:\\synthetic\\docker.exe", "--confirm", "--json"], io), 2);
    assert.equal(JSON.parse(text).rule, "DOCKER_WINDOWS_HOST_REQUIRED");
    assert.doesNotMatch(text, /synthetic/);
  }
});
