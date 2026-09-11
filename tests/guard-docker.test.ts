import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { Script } from "node:vm";
import test from "node:test";
import {
  CHECK_IDS, DOCKER_ENDPOINT, DockerProbeError, LOCAL_NODE_IMAGE, NODE_FIXTURE, PROBE_LABEL, TMPFS,
  createFixtureArgs, fixtureCommand, inspectEngine, inspectFixture, inspectFixtureResult, inspectImage,
} from "../guard-host/docker-spec.ts";
import { executeDocker, probeDocker, type DockerCommand } from "../guard-host/docker-probe.ts";
import { dockerClientEnvironment, parseProbeArguments, runDockerProbeCli, validateDockerPath } from "../guard-host/probe-docker.ts";

const nonce = "a".repeat(32);
const imageId = "sha256:" + "b".repeat(64);
const containerId = "c".repeat(64);
const engine = { OSType: "linux", OperatingSystem: "Docker Desktop", KernelVersion: "6.6.87.2-microsoft-standard-WSL2", ServerVersion: "28.1.0" };
const image = { Id: imageId, Os: "linux", Config: { Volumes: null, OnBuild: null } };
const guest = { version: 1, nonce, checks: Object.fromEntries(CHECK_IDS.map((id) => [id, true])) };

// Synthetic inspection fixture. A Linux unit test cannot validate actual Windows/Docker semantics.
function container() {
  return {
    Id: containerId, Image: imageId, Name: `/phi-phase0-${nonce}`,
    State: { Status: "created" },
    Config: { Labels: { [PROBE_LABEL]: nonce }, Image: imageId, User: "1000:1000", WorkingDir: "/workspace",
      Entrypoint: ["/usr/bin/env"], Cmd: fixtureCommand(nonce), Volumes: null, Healthcheck: { Test: ["NONE"] } },
    HostConfig: {
      Privileged: false, ReadonlyRootfs: true, CapDrop: ["ALL"], CapAdd: null, SecurityOpt: ["no-new-privileges=true"],
      NetworkMode: "none", IpcMode: "private", CgroupnsMode: "private", PidMode: "", UTSMode: "", UsernsMode: "", Runtime: "runc",
      Memory: 536870912, MemorySwap: 536870912, NanoCpus: 1e9, PidsLimit: 64, Init: true, AutoRemove: false, PublishAllPorts: false,
      RestartPolicy: { Name: "no" }, LogConfig: { Type: "none" }, Tmpfs: { ...TMPFS },
      Binds: null, Mounts: null, VolumesFrom: null, Devices: [], DeviceRequests: null, DeviceCgroupRules: null,
      Links: null, ExtraHosts: null, PortBindings: {}, GroupAdd: null, Dns: [], DnsOptions: [], DnsSearch: [], Sysctls: null,
    },
    Mounts: [], NetworkSettings: { Networks: { none: {} } },
  };
}

test("fixture syntax and creation flags are fixed, non-root, networkless and mount-free", () => {
  new Script(NODE_FIXTURE);
  const args = createFixtureArgs(imageId, nonce);
  for (const flag of ["--pull=never", "--network=none", "--read-only", "--user=1000:1000", "--cap-drop=ALL", "--init", "--no-healthcheck"]) assert.ok(args.includes(flag));
  for (const flag of ["--privileged", "--volume", "--mount", "--publish", "--use-api-socket", "--env-file"]) assert.ok(!args.includes(flag));
  assert.ok(args.includes(imageId));
  assert.ok(!args.includes(LOCAL_NODE_IMAGE));
  assert.ok(!args.includes("--env"), "no host env values are forwarded implicitly");
  assert.equal(DOCKER_ENDPOINT, "npipe:////./pipe/docker_engine");
});

test("names and image IDs cannot be options, commands or mutable image tags", () => {
  for (const id of ["node:24", "--privileged", "sha256:" + "x".repeat(64)]) assert.throws(() => createFixtureArgs(id, nonce), DockerProbeError);
  for (const id of ["../name", "--name=other", "a".repeat(64)]) assert.throws(() => createFixtureArgs(imageId, id), DockerProbeError);
});

test("only local Linux images without persistent volumes or on-build hooks are eligible", () => {
  assert.equal(inspectImage(image), imageId);
  for (const value of [null, { ...image, Os: "windows" }, { ...image, Id: "node:24" },
    { ...image, Config: { Volumes: { "/secret": {} }, OnBuild: null } }, { ...image, Config: { Volumes: null, OnBuild: ["RUN evil"] } }]) {
    assert.throws(() => inspectImage(value), DockerProbeError);
  }
});

test("Docker Desktop Linux and WSL2 evidence is required; installed CLI alone is insufficient", () => {
  assert.deepEqual(inspectEngine(engine), { serverVersion: "28.1.0", wsl2KernelObserved: true });
  for (const value of [null, { ...engine, OSType: "windows" }, { ...engine, OperatingSystem: "remote engine" },
    { ...engine, KernelVersion: "custom-unverified" }, { ...engine, ServerVersion: "FAKE_PRIVATE_TEXT\x1b" }]) {
    assert.throws(() => inspectEngine(value), DockerProbeError);
  }
});

test("matching created container independently validates before start", () => {
  assert.equal(inspectFixture(container(), nonce, imageId), containerId);
});

test("documented Docker omitempty fields may be absent, but nonempty values remain denied", () => {
  const value = container();
  Reflect.deleteProperty(value.HostConfig, "Mounts");
  Reflect.deleteProperty(value.HostConfig, "Sysctls");
  assert.equal(inspectFixture(value, nonce, imageId), containerId);
  Object.assign(value.HostConfig, { Annotations: { "unverified.runtime.setting": "on" } });
  assert.throws(() => inspectFixture(value, nonce, imageId), DockerProbeError);
});

test("unsafe or unknown engine settings reject start, even if create arguments were correct", () => {
  const mutations: Array<(value: Record<string, any>) => void> = [
    (v) => { v.HostConfig.Privileged = true; }, (v) => { v.HostConfig.ReadonlyRootfs = false; },
    (v) => { v.HostConfig.NetworkMode = "host"; }, (v) => { v.HostConfig.PidMode = "host"; },
    (v) => { v.HostConfig.IpcMode = "host"; }, (v) => { v.HostConfig.CapAdd = ["SYS_ADMIN"]; },
    (v) => { v.HostConfig.SecurityOpt = ["seccomp=unconfined"]; }, (v) => { v.HostConfig.PidsLimit = -1; },
    (v) => { v.HostConfig.Binds = ["C:/synthetic-private:/workspace"]; },
    (v) => { v.HostConfig.PortBindings = { "80/tcp": [{ HostPort: "8000" }] }; },
    (v) => { v.Mounts = [{ Type: "bind", Source: "/synthetic-private", Destination: "/extra" }]; },
    (v) => { delete v.HostConfig.Binds; }, (v) => { v.HostConfig.Tmpfs["/workspace"] = "rw"; },
    (v) => { v.NetworkSettings.Networks.extra = {}; }, (v) => { v.Config.User = "0"; },
    (v) => { v.Config.Cmd = ["arbitrary script"]; }, (v) => { v.State.Status = "running"; },
    (v) => { v.Config.Labels[PROBE_LABEL] = "forged"; }, (v) => { v.Image = "other"; },
  ];
  for (const mutate of mutations) {
    const value = container();
    mutate(value);
    assert.throws(() => inspectFixture(value, nonce, imageId), DockerProbeError);
  }
});

test("guest output must match all fixed checks and the current nonce; no reported/partial success", () => {
  inspectFixtureResult(guest, nonce);
  for (const value of [null, { ...guest, nonce: "stale" }, { ...guest, version: 2 },
    { ...guest, checks: {} }, { ...guest, checks: { ...guest.checks, nonRoot: false } },
    { ...guest, checks: { ...guest.checks, cleanEnvironment: "true" } }, { ...guest, checks: { ...guest.checks, extra: true } }]) {
    assert.throws(() => inspectFixtureResult(value, nonce), DockerProbeError);
  }
});

function fakeDocker(options: { fail?: string; unsafe?: boolean; forgedCleanup?: boolean; ambiguousCleanup?: boolean; missingAfterCreateFailure?: boolean; lingering?: boolean; cancel?: AbortController } = {}) {
  const calls: string[][] = [];
  let removed = false;
  const run: DockerCommand = async (args, signal) => {
    calls.push([...args]);
    const verb = args[0] === "info" ? "info" : args[1];
    if (verb === options.fail) throw new Error("FAKE_PRIVATE_COMMAND_OR_ERROR");
    if (verb === "info") return JSON.stringify(engine);
    if (args[0] === "image") return JSON.stringify(image);
    if (verb === "create") return containerId;
    if (verb === "ls") {
      assert.equal(signal, undefined, "cleanup must not inherit cancelled signal");
      if (options.missingAfterCreateFailure || (removed && !options.lingering)) return "";
      return options.ambiguousCleanup ? containerId + "\n" + "d".repeat(64) : containerId;
    }
    if (verb === "inspect") {
      if (args.includes("{{json .State}}")) return JSON.stringify({ Status: "exited", ExitCode: 0, OOMKilled: false, Error: "" });
      const info = container();
      if (options.unsafe) info.HostConfig.Privileged = true;
      if (options.forgedCleanup && calls.some((call) => call[1] === "ls")) info.Config.Labels[PROBE_LABEL] = "forged";
      return JSON.stringify(info);
    }
    if (verb === "start") { options.cancel?.abort(); return JSON.stringify(guest); }
    if (verb === "rm") { removed = true; return containerId; }
    throw new Error("Unexpected fake operation");
  };
  return { run, calls };
}

test("successful fixture is cleaned up but never changes Guard to Isolated", async () => {
  const fake = fakeDocker();
  const report = await probeDocker(fake.run, nonce);
  assert.equal(report.probe, "passed");
  assert.equal(report.state, "locked");
  assert.equal(report.canLaunch, false);
  assert.equal(report.protection, "not-active");
  assert.equal(report.cleanup, "removed");
  assert.deepEqual(fake.calls.at(-2), ["container", "rm", "--force", containerId]);
  assert.equal(fake.calls.at(-1)?.[1], "ls", "verify removal independently");
  const create = fake.calls.find((call) => call[1] === "create")!;
  assert.ok(create.includes(imageId));
  assert.ok(!create.includes(LOCAL_NODE_IMAGE));
  assert.ok(fake.calls.every((call) => !call.includes("pull") && !call.includes("prune")));
});

test("missing engine/image cannot create or launch anything and raw errors stay private", async () => {
  for (const fail of ["info", "inspect"]) {
    const fake = fakeDocker({ fail });
    const report = await probeDocker(fake.run, nonce);
    assert.equal(report.probe, "blocked");
    assert.equal(report.cleanup, "not-needed");
    assert.ok(!fake.calls.some((call) => ["create", "start", "rm"].includes(call[1])));
    assert.doesNotMatch(JSON.stringify(report), /FAKE_PRIVATE/);
  }
});

test("unsafe inspect prevents start but permits ownership-checked cleanup", async () => {
  const fake = fakeDocker({ unsafe: true });
  const report = await probeDocker(fake.run, nonce);
  assert.equal(report.probe, "failed");
  assert.equal(report.cleanup, "removed");
  assert.ok(!fake.calls.some((call) => call[1] === "start"));
});

test("guest failure and interrupted create still attempt narrowly scoped cleanup", async () => {
  for (const fail of ["start", "create"]) {
    const fake = fakeDocker({ fail });
    const report = await probeDocker(fake.run, nonce);
    assert.equal(report.probe, "failed");
    assert.equal(report.cleanup, "removed");
    assert.ok(fake.calls.some((call) => call[1] === "ls" && call.includes(`label=${PROBE_LABEL}=${nonce}`)));
  }
});

test("an uncertain create with no visible container is not falsely reported as cleaned up", async () => {
  const fake = fakeDocker({ fail: "create", missingAfterCreateFailure: true });
  assert.equal((await probeDocker(fake.run, nonce)).cleanup, "unconfirmed");
  assert.ok(!fake.calls.some((call) => call[1] === "rm"));
});

test("ambiguous/forged cleanup never deletes a container", async () => {
  for (const options of [{ ambiguousCleanup: true }, { forgedCleanup: true }]) {
    const fake = fakeDocker(options);
    const report = await probeDocker(fake.run, nonce);
    assert.equal(report.cleanup, "unconfirmed");
    assert.equal(report.probe, "failed");
    assert.ok(!fake.calls.some((call) => call[1] === "rm"));
  }
});

test("cleanup failure remains visible even after fixture success", async () => {
  const report = await probeDocker(fakeDocker({ fail: "rm" }).run, nonce);
  assert.equal(report.probe, "failed");
  assert.equal(report.cleanup, "unconfirmed");
});

test("a successful remove response is not enough if the container still exists", async () => {
  const report = await probeDocker(fakeDocker({ lingering: true }).run, nonce);
  assert.equal(report.probe, "failed");
  assert.equal(report.cleanup, "unconfirmed");
});

test("cancellation stops new work without cancelling cleanup", async () => {
  const cancel = new AbortController();
  const fake = fakeDocker({ cancel });
  const report = await probeDocker(fake.run, nonce, cancel.signal);
  assert.equal(report.probe, "failed");
  assert.equal(report.rule, "DOCKER_PROBE_CANCELLED");
  assert.equal(report.cleanup, "removed");
  const preCancelled = new AbortController();
  preCancelled.abort();
  const noRun = fakeDocker();
  assert.equal((await probeDocker(noRun.run, nonce, preCancelled.signal)).probe, "blocked");
  assert.deepEqual(noRun.calls, []);
});

test("Windows host CLI requires deliberate consent and an absolute docker.exe, never a wrapper", () => {
  assert.deepEqual(parseProbeArguments(["--docker", "C:\\Program Files\\Docker\\docker.exe", "--confirm", "--json"]), {
    docker: "C:\\Program Files\\Docker\\docker.exe", json: true,
  });
  for (const args of [[], ["--docker", "C:\\docker.exe"], ["--confirm"], ["--confirm", "--unsafe"], ["--help", "--confirm"]]) {
    assert.throws(() => parseProbeArguments(args), DockerProbeError);
  }
  for (const path of ["docker.exe", "C:docker.exe", "\\\\host\\share\\docker.exe", "C:\\bin\\docker.cmd", "C:\\bin\\node.exe", "C:\\x\\..\\docker.exe", "C:\\x:stream\\docker.exe"]) {
    assert.throws(() => validateDockerPath(path), DockerProbeError);
  }
});

test("Docker client environment is an allowlist without inherited secrets, contexts or proxies", () => {
  const env = dockerClientEnvironment("C:\\Windows", "C:\\synthetic-temp");
  assert.equal(env.PATH, "C:\\Windows\\System32");
  assert.equal(env.HOME, "C:\\synthetic-temp");
  assert.deepEqual(Object.keys(env).sort(), ["APPDATA", "HOME", "LOCALAPPDATA", "PATH", "SystemDrive", "SystemRoot", "TEMP", "TMP", "USERPROFILE", "WINDIR"].sort());
  assert.throws(() => dockerClientEnvironment("\\\\remote\\Windows", "C:\\tmp"), DockerProbeError);
});

test("direct executable invocation preserves argument data without shell evaluation", async () => {
  const run = executeDocker(process.execPath, [], tmpdir(), process.platform === "win32" ? { SystemRoot: process.env.SystemRoot } : {});
  const value = 'spaces & echo FAKE_SHELL; $HOME "quoted"';
  assert.equal(await run(["-e", "process.stdout.write(process.argv[1])", value]), value);
  await assert.rejects(run(["-e", "process.stderr.write('FAKE_PRIVATE');process.exit(1)"]), { message: "DOCKER_COMMAND_FAILED" });
});

test("client output is bounded and cancellation kills the client rather than hanging", async () => {
  const run = executeDocker(process.execPath, [], tmpdir(), process.platform === "win32" ? { SystemRoot: process.env.SystemRoot } : {});
  await assert.rejects(run(["-e", "process.stdout.write('x'.repeat(256*1024))"]), { message: "DOCKER_COMMAND_FAILED" });
  const cancel = new AbortController();
  const timer = setTimeout(() => cancel.abort(), 50);
  try { await assert.rejects(run(["-e", "setInterval(()=>{},1000)"], cancel.signal), { message: "DOCKER_PROBE_CANCELLED" }); }
  finally { clearTimeout(timer); }
});

test("help has no effects; a Linux process cannot execute the Windows probe", async () => {
  let output = "";
  const io = { out: (text: string) => { output += text; }, error: (text: string) => { output += text; } };
  assert.equal(await runDockerProbeCli(["--help"], io), 0);
  assert.match(output, /NOT Guard acceptance/);
  if (process.platform !== "win32") {
    output = "";
    assert.equal(await runDockerProbeCli(["--docker", "C:\\synthetic\\docker.exe", "--confirm", "--json"], io), 2);
    assert.equal(JSON.parse(output).rule, "DOCKER_WINDOWS_HOST_REQUIRED");
    assert.doesNotMatch(output, /synthetic/);
  }
});
