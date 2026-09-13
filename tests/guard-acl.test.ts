import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { win32 } from "node:path";
import test from "node:test";
import { ACL_CHECK_IDS, ACL_ROLE_CHECKS, parseAclMessage, probeFileAcl, type AclProbeDependencies, type AclRole, type AclWorkerResult } from "../guard-host/acl-probe.ts";
import { runAclCli } from "../guard-host/probe-acl.ts";
const nonce = "a".repeat(32);
function message(n: string, role: AclRole, count = 5, failedCheck: string | null = null) {
  return JSON.stringify({ version: 1, nonce: n, role, checks: Object.fromEntries(ACL_ROLE_CHECKS[role].slice(0, count).map(id => [id, true])), failedCheck });
}
function ports() {
  const calls: string[] = [];
  const deps: AclProbeDependencies = {
    platform: "win32",
    async createRoot(n) { calls.push("root"); return `C:/synthetic/phi-acl-${n}-test`; },
    async writeMarker() { calls.push("marker"); },
    async worker(_root, n, role) { calls.push(role); return { exited: true, code: 0, signal: null, stdout: message(n, role) }; },
    async removeRoot() { calls.push("remove"); }, async absent() { calls.push("absent"); return true; },
  };
  return { deps, calls };
}

test("ACL messages require exact nonce/role/check prefix and one complete success frame", () => {
  assert.deepEqual(parseAclMessage(message(nonce, "create"), nonce, "create"), { checks: [...ACL_ROLE_CHECKS.create], failedCheck: null });
  assert.deepEqual(parseAclMessage(message(nonce, "read", 2, "denyReadAccessDenied"), nonce, "read"), { checks: ACL_ROLE_CHECKS.read.slice(0, 2), failedCheck: "denyReadAccessDenied" });
  assert.deepEqual(parseAclMessage(message(nonce, "read", 0, "setup"), nonce, "read"), { checks: [], failedCheck: "setup" });
  for (const text of [message("b".repeat(32), "read"), message(nonce, "create"), message(nonce, "read", 3),
    message(nonce, "read", 2, "PRIVATE_FAKE"), message(nonce, "read", 5, "setup"),
    message(nonce, "read").replace('"version":1', '"version":1,"version":1'),
    message(nonce, "read").replace('"version":1', '"extra":true,"version":1'),
    message(nonce, "read").replace(':true', ':false'), message(nonce, "read") + message(nonce, "read"), "x".repeat(8193), "null"])
    assert.throws(() => parseAclMessage(text, nonce, "read"), { rule: "ACL_WORKER_MESSAGE_INVALID" });
});

test("mock controller orders creator exit before reader and verifies cleanup without enabling Guard", async () => {
  const { deps, calls } = ports(); const r = await probeFileAcl(undefined, deps);
  assert.equal(r.probe, "passed"); assert.deepEqual(r.checks, ACL_CHECK_IDS);
  assert.deepEqual(calls, ["root", "marker", "create", "read", "remove", "absent"]);
  assert.equal(r.workerCleanup, "exited"); assert.equal(r.hostCleanup, "removed");
  assert.equal(r.state, "locked"); assert.equal(r.protection, "not-active"); assert.equal(r.canLaunch, false); assert.equal(r.executable, false);
  assert.equal(r.productionPrivacy, "not-proven"); assert.equal(r.crossUserIsolation, "not-tested"); assert.equal(r.gateway, "deferred");
  assert.match(r.fixtureName!, /^phi-acl-[a-f0-9]{32}-test$/); assert.doesNotMatch(JSON.stringify(r), /C:\//);
});

test("no Windows fallback or work after pre-cancelled consent", async () => {
  const { deps, calls } = ports(); deps.platform = "linux";
  assert.equal((await probeFileAcl(undefined, deps)).rule, "ACL_WINDOWS_HOST_REQUIRED"); assert.deepEqual(calls, []);
  deps.platform = "win32"; const controller = new AbortController(); controller.abort();
  assert.equal((await probeFileAcl(controller.signal, deps)).rule, "ACL_PROBE_CANCELLED"); assert.deepEqual(calls, []);
});

test("marker setup failure still cleans only the owned root, with no identity/worker query", async () => {
  const { deps, calls } = ports(); deps.writeMarker = async () => { throw new Error("PRIVATE_FAKE"); };
  const r = await probeFileAcl(undefined, deps);
  assert.equal(r.probe, "blocked"); assert.equal(r.hostCleanup, "removed"); assert.equal(r.workerCleanup, "not-needed");
  assert.deepEqual(calls, ["root", "remove", "absent"]); assert.doesNotMatch(JSON.stringify(r), /PRIVATE_FAKE/);
});

test("creator failure reports only a bounded failed check and prevents reader execution", async () => {
  const { deps, calls } = ports(); deps.worker = async (_root, n, role) => ({ exited: true, code: 1, signal: null,
    stdout: message(n, role, 1, "creationTimeDenyAcl") });
  const r = await probeFileAcl(undefined, deps);
  assert.equal(r.probe, "failed"); assert.equal(r.failedCheck, "creationTimeDenyAcl");
  assert.deepEqual(r.checks, ["creationTimeAllowAcl"]); assert.equal(r.hostCleanup, "removed"); assert.equal(calls.includes("read"), false);
});

test("unexpected success-shaped output with nonzero/signal/stderr failure cannot pass", async () => {
  for (const change of [{ code: 1 }, { signal: "SIGTERM" as const }, { error: "ACL_WORKER_STDERR" }]) {
    const { deps } = ports(); const worker = deps.worker;
    deps.worker = async (...args) => ({ ...await worker(...args), ...change });
    const r = await probeFileAcl(undefined, deps); assert.equal(r.probe, "failed"); assert.equal(r.hostCleanup, "removed");
  }
});

test("malformed private worker output is never echoed and still permits cleanup after confirmed exit", async () => {
  const { deps } = ports(); deps.worker = async () => ({ exited: true, code: 1, signal: null, stdout: "PRIVATE_FAKE" });
  const r = await probeFileAcl(undefined, deps); assert.equal(r.rule, "ACL_WORKER_MESSAGE_INVALID");
  assert.equal(r.hostCleanup, "removed"); assert.doesNotMatch(JSON.stringify(r), /PRIVATE_FAKE/);
});

test("unconfirmed timeout/output-limit/worker exit preserves fixtures without kill or ACL repair", async () => {
  for (const error of ["ACL_WORKER_TIMEOUT", "ACL_WORKER_OUTPUT_LIMIT", "ACL_PROBE_CANCELLED"]) {
    const { deps, calls } = ports(); deps.worker = async (): Promise<AclWorkerResult> => ({ exited: false, code: null, signal: null, stdout: "", error });
    const r = await probeFileAcl(undefined, deps); assert.equal(r.probe, "failed"); assert.equal(r.workerCleanup, "unconfirmed");
    assert.equal(r.hostCleanup, "unconfirmed"); assert.deepEqual(calls, ["root", "marker"]); assert.equal(r.rule, error);
  }
});

test("a throwing worker port is conservatively unconfirmed rather than deleting possibly live files", async () => {
  const { deps, calls } = ports(); deps.worker = async () => { throw new Error("PRIVATE_FAKE"); };
  const r = await probeFileAcl(undefined, deps); assert.equal(r.workerCleanup, "unconfirmed"); assert.equal(r.hostCleanup, "unconfirmed");
  assert.equal(calls.includes("remove"), false); assert.doesNotMatch(JSON.stringify(r), /PRIVATE_FAKE/);
});

test("cancellation between completed workers skips the reader but cannot cancel cleanup", async () => {
  const { deps, calls } = ports(); const worker = deps.worker; const controller = new AbortController();
  deps.worker = async (...args) => { const result = await worker(...args); controller.abort(); return result; };
  const r = await probeFileAcl(controller.signal, deps);
  assert.equal(r.rule, "ACL_PROBE_CANCELLED"); assert.equal(r.hostCleanup, "removed");
  assert.deepEqual(calls, ["root", "marker", "create", "remove", "absent"]);
});

test("removal failure or missing absence confirmation overrides passing checks", async () => {
  for (const fault of ["remove", "absence"] as const) {
    const { deps } = ports();
    if (fault === "remove") deps.removeRoot = async () => { throw new Error("PRIVATE_FAKE"); }; else deps.absent = async () => false;
    const r = await probeFileAcl(undefined, deps); assert.equal(r.probe, "failed"); assert.equal(r.checks.length, 10);
    assert.equal(r.hostCleanup, "unconfirmed"); assert.doesNotMatch(JSON.stringify(r), /PRIVATE_FAKE/);
  }
});

test("ACL CLI requires exact opt-in and exposes no SID/root/PID/executable target options", async () => {
  let text = ""; const io = { out: (s: string) => { text += s; }, error: (s: string) => { text += s; } };
  assert.equal(await runAclCli(["--help"], io), 0); assert.match(text, /FILE-ONLY/); assert.match(text, /NOT production privacy/);
  for (const args of [[], ["--json"], ["--confirm", "--confirm"], ["--confirm", "--root", "PRIVATE_FAKE"],
    ["--confirm", "--sid", "PRIVATE_FAKE"], ["--confirm", "--pid", "1"], ["--confirm", "--powershell", "PRIVATE_FAKE"]]) {
    text = ""; assert.equal(await runAclCli(args, io), 64); assert.doesNotMatch(text, /PRIVATE_FAKE/);
  }
});

test("native parser accepts fixed ACL worker as syntax only; source has no ACL repair or process kill", { skip: process.platform !== "win32" }, async () => {
  const source = await readFile(new URL("../guard-host/acl-worker.ps1", import.meta.url), "utf8");
  // Parse, never execute the worker body in ordinary unit tests.
  const command = '$t=$null;$e=$null;[void][System.Management.Automation.Language.Parser]::ParseInput([Console]::In.ReadToEnd(),[ref]$t,[ref]$e);if($e.Count){exit 1};"SYNTAX_OK"';
  const result = execFileSync(win32.join(process.env.SystemRoot!, "System32/WindowsPowerShell/v1.0/powershell.exe"),
    ["-NoProfile", "-NonInteractive", "-Command", command], { input: source, encoding: "utf8", timeout: 10000, maxBuffer: 4096,
      windowsHide: true, shell: false, env: { SystemRoot: process.env.SystemRoot } });
  assert.equal(result.trim(), "SYNTAX_OK");
  assert.doesNotMatch(source, /\.SetAccessControl\s*\(|\b(?:Set-Acl|Start-Process|Stop-Process|Add-Type|Invoke-Expression)\b|\.Name\b|\.Claims\b/);
  const transport = await readFile(new URL("../guard-host/acl-probe.ts", import.meta.url), "utf8");
  assert.doesNotMatch(transport, /\.kill\s*\(/);
});
