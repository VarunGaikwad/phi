import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { Script } from "node:vm";
import test from "node:test";
import { createFixtureArgs, fixtureCommand, PROBE_LABEL, TMPFS } from "../guard-host/docker-spec.ts";
import type { DockerCommand } from "../guard-host/docker-probe.ts";
import { DNS_FIXTURE_HELPERS, EGRESS_ERRORS, NETWORK_CHECK_IDS, NETWORK_GUEST_CHECKS, NETWORK_NAMESPACE_QUERY, NETWORK_PEER_VERIFY,
  NETWORK_PRIMARY, NETWORK_SOCKET_HELPERS, createNetworkArgs, inspectNamespaces, inspectNetwork, inspectNetworkResult,
  networkCommand, networkExecArgs, networkJson, type NetworkRole } from "../guard-host/network-spec.ts";
import { probeNetwork } from "../guard-host/network-probe.ts";
import { runNetworkCli } from "../guard-host/probe-network.ts";

const nonce = "a".repeat(32), peerNonce = "b".repeat(32), imageId = "sha256:" + "c".repeat(64);
const ids = { primary: "d".repeat(64), peer: "e".repeat(64) }, nonces = { primary: nonce, peer: peerNonce };
const result = { version: 1, nonce, checks: Object.fromEntries(NETWORK_GUEST_CHECKS.map(id => [id, true])) };
function ns(role: NetworkRole) { return Object.fromEntries(["net", "ipc", "pid", "mnt"].map((key, i) => [key, `${key}:[${i + (role === "peer" ? 100 : 200)}]`])); }
function container(role: NetworkRole, status = "created") {
  return { Id: ids[role], Image: imageId, Name: `/phi-phase0-${nonces[role]}`,
    State: { Status: status, Running: status === "running", Pid: status === "running" ? 1234 : 0, OOMKilled: false, Error: "" },
    Config: { Image: imageId, Labels: { [PROBE_LABEL]: nonces[role] }, User: "1000:1000", WorkingDir: "/workspace",
      Entrypoint: ["/usr/bin/env"], Cmd: networkCommand(role, nonces[role]), Volumes: null, Healthcheck: { Test: ["NONE"] } },
    HostConfig: { Privileged: false, ReadonlyRootfs: true, CapDrop: ["ALL"], CapAdd: null, SecurityOpt: ["no-new-privileges=true"],
      NetworkMode: "none", IpcMode: "private", CgroupnsMode: "private", PidMode: "", UTSMode: "", UsernsMode: "", Runtime: "runc",
      Memory: 536870912, MemorySwap: 536870912, NanoCpus: 1e9, PidsLimit: 64, Init: true, AutoRemove: false, PublishAllPorts: false,
      RestartPolicy: { Name: "no" }, LogConfig: { Type: "none" }, Tmpfs: { ...TMPFS },
      Binds: null, VolumesFrom: null, Devices: [], DeviceRequests: null, DeviceCgroupRules: null, Links: null,
      ExtraHosts: null, PortBindings: {}, GroupAdd: null, Dns: [], DnsOptions: [], DnsSearch: [] },
    Mounts: [], NetworkSettings: { Networks: { none: {} } } };
}
function fake(options: { fail?: string; unsafe?: NetworkRole; sharedNamespace?: boolean; changedPeer?: boolean; guest?: unknown;
  badStop?: NetworkRole; forged?: NetworkRole; ambiguous?: NetworkRole; lingering?: NetworkRole; missing?: NetworkRole; cancel?: AbortController } = {}) {
  const calls: string[][] = [];
  const states = { primary: "absent", peer: "absent" };
  let peerQueries = 0;
  const run: DockerCommand = async (args, signal) => {
    calls.push([...args]);
    const verb = args[0] === "info" ? "info" : args[1];
    const role: NetworkRole = args.some(v => v.includes(nonce) || v === ids.primary) ? "primary" : "peer";
    if ((verb === "info" && options.fail === "engine") || (args[0] === "image" && options.fail === "image") || `${verb}-${role}` === options.fail) throw Error("SYNTHETIC_PRIVATE_ERROR");
    if (verb === "info") return JSON.stringify({ OSType: "linux", OperatingSystem: "Docker Desktop", KernelVersion: "microsoft-wsl2", ServerVersion: "29.4.3" });
    if (args[0] === "image") return JSON.stringify({ Id: imageId, Os: "linux", Config: { Volumes: null, OnBuild: null } });
    if (verb === "create") { states[role] = "created"; return ids[role]; }
    if (verb === "inspect") {
      if (args.includes("{{json .State}}")) return JSON.stringify({ Status: "exited", Running: false, Pid: 0, ExitCode: 137, OOMKilled: options.badStop === role, Error: "" });
      const value = container(role, states[role]);
      if (options.unsafe === role) value.HostConfig.Privileged = true;
      if (options.forged === role && calls.some(c => c[1] === "ls")) value.Config.Labels[PROBE_LABEL] = "forged";
      return JSON.stringify(value);
    }
    if (verb === "start") { states[role] = "running"; return ids[role]; }
    if (verb === "exec") {
      if (args.includes(NETWORK_PRIMARY)) { options.cancel?.abort(); return JSON.stringify(options.guest ?? result); }
      if (args.includes(NETWORK_NAMESPACE_QUERY)) return JSON.stringify({ version: 1, nonce, namespaces: ns(options.sharedNamespace ? "peer" : "primary") });
      if (args.includes(NETWORK_PEER_VERIFY)) {
        peerQueries++;
        if (options.fail === (peerQueries === 1 ? "peer-before" : "peer-after")) throw Error("SYNTHETIC_PRIVATE_ERROR");
        return JSON.stringify({ version: 1, nonce: peerNonce, healthy: true, namespaces: ns(options.changedPeer && peerQueries === 2 ? "primary" : "peer") });
      }
    }
    if (verb === "kill") { states[role] = "exited"; return ids[role]; }
    if (verb === "wait") return "137";
    if (verb === "ls") {
      assert.equal(signal, undefined, "cleanup has independent deadlines and no main cancellation");
      if (options.missing === role || (states[role] === "absent" && options.lingering !== role)) return "";
      return options.ambiguous === role ? `${ids[role]}\n${"f".repeat(64)}` : ids[role];
    }
    if (verb === "rm") { states[role] = "absent"; return ids[role]; }
    throw Error("Unexpected fake operation");
  };
  return { run, calls };
}

test("both profiles retain identical restrictions and fixed scripts fit native argv limits", () => {
  for (const role of ["primary", "peer"] as const) {
    const command = networkCommand(role, nonces[role]); new Script(command.at(-2)!);
    assert.deepEqual(createNetworkArgs(role, imageId, nonces[role]).slice(0, -command.length), createFixtureArgs(imageId, nonces[role]).slice(0, -fixtureCommand(nonces[role]).length));
    assert.equal(inspectNetwork(container(role), role, nonces[role], imageId, "created"), ids[role]);
    const changed = container(role, "running"); changed.State.Pid = 0;
    assert.throws(() => inspectNetwork(changed, role, nonces[role], imageId, "running"));
    assert.ok(command.join(" ").length * 2 + 4096 < 32767);
  }
  for (const script of [NETWORK_PRIMARY, NETWORK_NAMESPACE_QUERY, NETWORK_PEER_VERIFY]) {
    new Script(script); assert.ok(script.length * 2 + 4096 < 32767);
    assert.equal(networkExecArgs(ids.primary, nonce, script).at(-2), script);
  }
  assert.throws(() => networkExecArgs(ids.primary, nonce, "unapproved script"));
  assert.doesNotMatch(NETWORK_PRIMARY, /169\.254\.169\.254|host\.docker\.internal|api\.anthropic|8\.8\.8\.8/);
  assert.match(NETWORK_PRIMARY, /resolver\.setServers\(\['127\.0\.0\.1:'/);
});

test("all 17 guest decisions, exact schema and current nonce are required", () => {
  inspectNetworkResult(result, nonce);
  for (const value of [null, { ...result, nonce: peerNonce }, { ...result, extra: true },
    { ...result, checks: { ...result.checks, tcpIpv4Denied: false } }, { ...result, checks: { ...result.checks, extra: true } }]) assert.throws(() => inspectNetworkResult(value, nonce));
  assert.throws(() => networkJson("not-json")); assert.throws(() => networkJson(" ".repeat(128 * 1024 + 1)));
});

test("namespace and peer-liveness records reject missing, malformed, extra and unhealthy data", () => {
  assert.deepEqual(inspectNamespaces({ version: 1, nonce, namespaces: ns("primary") }, nonce), ns("primary"));
  for (const value of [null, { version: 1, nonce, namespaces: {} }, { version: 1, nonce, namespaces: { ...ns("primary"), ipc: "net:[1]" } },
    { version: 1, nonce, namespaces: ns("primary"), healthy: false }, { version: 1, nonce, namespaces: ns("primary"), healthy: true, extra: true }]) assert.throws(() => inspectNamespaces(value, nonce, true));
});

test("mock success needs both live peer controls, separate namespaces, guest results, host stop and two cleanups", async () => {
  const mock = fake(); const report = await probeNetwork(mock.run, nonce, peerNonce);
  assert.equal(report.probe, "passed"); assert.deepEqual(report.checks, [...NETWORK_CHECK_IDS]); assert.equal(report.checks.length, 21);
  assert.equal(report.cleanup, "removed"); assert.equal(report.peerCleanup, "removed");
  assert.equal(report.canLaunch, false); assert.equal(report.state, "locked"); assert.equal(report.protection, "not-active"); assert.equal(report.gateway, "deferred");
  const firstStart = mock.calls.findIndex(c => c[1] === "start");
  assert.equal(mock.calls.slice(0, firstStart).filter(c => c[0] === "container" && c[1] === "inspect").length, 2);
  assert.equal(mock.calls.filter(c => c[1] === "kill").length, 2);
  assert.ok(mock.calls.every(c => !c.includes("pull") && !c.includes("prune") && !c.includes("network")));
});

test("engine/image blockers create nothing and unsafe profiles prevent both starts", async () => {
  for (const options of [{ fail: "engine" }, { fail: "image" }, { unsafe: "primary" as const }, { unsafe: "peer" as const }]) {
    const mock = fake(options); const report = await probeNetwork(mock.run, nonce, peerNonce);
    assert.notEqual(report.probe, "passed"); assert.ok(!mock.calls.some(c => c[1] === "start"));
    if (options.fail) { assert.equal(report.probe, "blocked"); assert.equal(report.cleanup, "not-needed"); assert.equal(report.peerCleanup, "not-needed"); }
  }
});

test("unhealthy peer, shared/changing namespaces, failed guest and either stop cannot pass", async () => {
  for (const options of [{ fail: "peer-before" }, { fail: "peer-after" }, { sharedNamespace: true }, { changedPeer: true },
    { guest: { ...result, checks: {} } }, { badStop: "primary" as const }, { badStop: "peer" as const }]) {
    const mock = fake(options); const report = await probeNetwork(mock.run, nonce, peerNonce);
    assert.equal(report.probe, "failed"); assert.equal(report.cleanup, "removed"); assert.equal(report.peerCleanup, "removed");
    assert.doesNotMatch(JSON.stringify(report), /SYNTHETIC_PRIVATE/);
    if (options.sharedNamespace) assert.ok(!mock.calls.some(c => c.includes(NETWORK_PRIMARY)));
  }
});

test("second create uncertainty and one failed/forged/ambiguous cleanup never skip the other fixture", async () => {
  for (const options of [{ fail: "create-primary", missing: "primary" as const }, { fail: "rm-primary" },
    { forged: "primary" as const }, { ambiguous: "primary" as const }, { lingering: "primary" as const }]) {
    const mock = fake(options); const report = await probeNetwork(mock.run, nonce, peerNonce);
    assert.equal(report.probe, "failed"); assert.equal(report.cleanup, "unconfirmed"); assert.equal(report.peerCleanup, "removed");
    if (options.forged || options.ambiguous) assert.ok(!mock.calls.some(c => c[1] === "rm" && c.includes(ids.primary)));
  }
});

test("cancellation stops new work but cleans both owned fixtures; reused nonce is rejected", async () => {
  const cancel = new AbortController(), mock = fake({ cancel });
  const report = await probeNetwork(mock.run, nonce, peerNonce, cancel.signal);
  assert.equal(report.rule, "DOCKER_PROBE_CANCELLED"); assert.equal(report.cleanup, "removed"); assert.equal(report.peerCleanup, "removed");
  const untouched = fake(); await probeNetwork(untouched.run, nonce, peerNonce, cancel.signal); assert.deepEqual(untouched.calls, []);
  await assert.rejects(probeNetwork(untouched.run, nonce, nonce));
});

// All socket helpers run against these EventEmitter fakes. Never open host sockets.
function helpers(outcome: string, code = "ENETUNREACH") {
  let closed = 0, sent = 0;
  const socket = new EventEmitter() as EventEmitter & { destroy(): void; close(): void; connect(port: number, host: string, cb: (error?: { code: string }) => void): void; send(data: Buffer, cb: (error?: { code: string }) => void): void };
  socket.destroy = socket.close = () => { closed++; };
  socket.connect = (_port, _host, cb) => { queueMicrotask(() => cb(outcome === "connect-error" ? { code } : undefined)); };
  socket.send = (data, cb) => {
    sent++;
    if (outcome === "send-error") cb({ code });
    else { cb(); queueMicrotask(() => {
      if (outcome === "echo") socket.emit("message", data);
      if (outcome === "bad-echo") socket.emit("message", Buffer.from("wrong"));
      if (outcome === "error") socket.emit("error", { code });
    }); }
  };
  const timers: Array<() => void> = [];
  const api = new Script(NETWORK_SOCKET_HELPERS + ";({tcpDenied,udpAttempt,tcpEcho})").runInNewContext({
    setTimeout: (fn: () => void) => { timers.push(fn); return 1; }, clearTimeout: () => {},
    net: { createConnection: () => {
      if (outcome === "throw") throw Error("synthetic");
      queueMicrotask(() => {
        if (outcome === "error") socket.emit("error", { code });
        if (outcome === "connect") socket.emit("connect");
        if (outcome === "echo") { socket.emit("data", Buffer.from("synthetic")); socket.emit("end"); }
      }); return socket;
    } }, dgram: { createSocket: () => { if (outcome === "throw") throw Error("synthetic"); return socket; } },
  }) as { tcpDenied(options: object, codes: readonly string[]): Promise<boolean>; udpAttempt(type: string, host: string, port: number, data: Buffer, codes: readonly string[], echo: boolean): Promise<boolean>; tcpEcho(options: object, expected: string): Promise<boolean> };
  return { api, timers, state: () => ({ closed, sent }) };
}

test("TCP denial requires exact OS errors: successful connections, timeout and invalid API usage never pass", async () => {
  for (const code of EGRESS_ERRORS) { const mock = helpers("error", code); assert.equal(await mock.api.tcpDenied({}, EGRESS_ERRORS), true); assert.equal(mock.state().closed, 1); }
  for (const code of ["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "EINVAL"]) assert.equal(await helpers("error", code).api.tcpDenied({}, EGRESS_ERRORS), false);
  assert.equal(await helpers("connect").api.tcpDenied({}, EGRESS_ERRORS), false);
  assert.equal(await helpers("throw").api.tcpDenied({}, EGRESS_ERRORS), false);
  const timeout = helpers("timeout"); const pending = timeout.api.tcpDenied({}, EGRESS_ERRORS); timeout.timers[0](); assert.equal(await pending, false);
  assert.equal(await helpers("error", "ECONNREFUSED").api.tcpDenied({}, ["ECONNREFUSED"]), true);
});

test("UDP denial covers connect/send/error paths but never treats send success, response or timeout as denial", async () => {
  const data = Buffer.from("synthetic");
  for (const outcome of ["connect-error", "send-error", "error"]) assert.equal(await helpers(outcome).api.udpAttempt("udp4", "192.0.2.1", 9, data, EGRESS_ERRORS, false), true);
  assert.equal(await helpers("echo").api.udpAttempt("udp4", "192.0.2.1", 9, data, EGRESS_ERRORS, false), false);
  assert.equal(await helpers("throw").api.udpAttempt("udp4", "192.0.2.1", 9, data, EGRESS_ERRORS, false), false);
  const mock = helpers("timeout"); const pending = mock.api.udpAttempt("udp4", "192.0.2.1", 9, data, EGRESS_ERRORS, false);
  await Promise.resolve(); mock.timers[0](); assert.equal(await pending, false); assert.equal(mock.state().sent, 1); assert.equal(mock.state().closed, 1);
  assert.equal(await helpers("error", "ECONNREFUSED").api.udpAttempt("udp4", "192.0.2.1", 9, data, EGRESS_ERRORS, false), false);
});

test("positive controls require exact returned data rather than a mere connection or error", async () => {
  assert.equal(await helpers("echo").api.tcpEcho({}, "synthetic"), true);
  assert.equal(await helpers("echo").api.tcpEcho({}, "different"), false);
  const data = Buffer.from("synthetic");
  assert.equal(await helpers("echo").api.udpAttempt("udp4", "127.0.0.1", 1, data, [], true), true);
  assert.equal(await helpers("bad-echo").api.udpAttempt("udp4", "127.0.0.1", 1, data, [], true), false);
  assert.equal(await helpers("error").api.udpAttempt("udp4", "127.0.0.1", 1, data, EGRESS_ERRORS, true), false);
});

test("DNS control responds only to the bounded synthetic A question, never acts as a general resolver", () => {
  const { dnsQuery, dnsAnswer } = new Script(DNS_FIXTURE_HELPERS + ";({dnsQuery,dnsAnswer})").runInNewContext({ Buffer }) as { dnsQuery: Buffer; dnsAnswer(query: Buffer): Buffer | undefined };
  const answer = dnsAnswer(dnsQuery)!; assert.ok(answer); assert.equal(answer.readUInt16BE(0), dnsQuery.readUInt16BE(0));
  assert.equal(answer.readUInt16BE(2), 0x8180); assert.equal(answer.readUInt16BE(6), 1); assert.deepEqual([...answer.subarray(-4)], [192, 0, 2, 1]);
  for (const bytes of [Buffer.alloc(0), Buffer.alloc(513), answer]) assert.equal(dnsAnswer(bytes), undefined);
  for (const index of [4, 6, 8, 13, dnsQuery.length - 1]) { const bad = Buffer.from(dnsQuery); bad[index] ^= 1; assert.equal(dnsAnswer(bad), undefined); }
});

test("network CLI requires consent, refuses arbitrary target/DNS/host-service flags and has no non-Windows fallback", async () => {
  let text = ""; const io = { out: (s: string) => { text += s; }, error: (s: string) => { text += s; } };
  assert.equal(await runNetworkCli(["--help"], io), 0); assert.match(text, /TWO hardened/); assert.match(text, /NOT full Guard/);
  for (const args of [[], ["--confirm"], ["--docker", "C:\\synthetic\\docker.exe"], ["--confirm", "--url", "SYNTHETIC_PRIVATE"], ["--confirm", "--dns", "127.0.0.1"], ["--confirm", "--host", "other"]]) {
    text = ""; assert.equal(await runNetworkCli(args, io), 64); assert.doesNotMatch(text, /SYNTHETIC_PRIVATE/);
  }
  if (process.platform !== "win32") { text = ""; assert.equal(await runNetworkCli(["--docker", "C:\\synthetic\\docker.exe", "--confirm", "--json"], io), 2); assert.equal(JSON.parse(text).rule, "DOCKER_WINDOWS_HOST_REQUIRED"); }
});
