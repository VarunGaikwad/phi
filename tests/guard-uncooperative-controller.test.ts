import assert from "node:assert/strict";
import test from "node:test";
import {
  CONTROLLER_DEADLINE_MS, MAX_CONTROLLER_OUTPUT, UNCOOPERATIVE_RUN_CHECKS,
  UncooperativeControllerError, planUncooperativeController, scriptHashes,
  validateCleanupNames, validateStoppedState, validateUncooperativeEvidence,
} from "../guard-host/uncooperative-controller.ts";
const nonce = "a".repeat(32), id = "b".repeat(64);

test("controller wiring is bounded and remains non-executable", () => {
  assert.equal(MAX_CONTROLLER_OUTPUT, 32768); assert.equal(CONTROLLER_DEADLINE_MS, 15000);
  assert.deepEqual(UNCOOPERATIVE_RUN_CHECKS, ["guestReady", "preAbortEffect", "abortRequested", "abortIgnored", "queuesCleared", "lateEffect", "childAdvancing", "hostStop", "guestStopped", "childStopped", "cleanup"]);
  const hashes = scriptHashes(); assert.match(hashes.guest, /^[a-f0-9]{64}$/); assert.match(hashes.verifier, /^[a-f0-9]{64}$/);
});

test("planned commands use only the fixed container, workspace and scripts", () => {
  const commands = planUncooperativeController(nonce, id);
  assert.deepEqual(commands.map(c => c.step), ["guest", "abort", "verify", "stop", "wait", "inspect", "remove"]);
  assert.equal(commands[0].args[0], "container"); assert.ok(commands[0].args.some(arg => arg === "--workdir=/workspace"));
  assert.ok(commands[0].args.includes("-e")); assert.ok(commands[1].args.includes("/workspace/uncoop-abort.request"));
  assert.ok(commands[2].args.includes("-e"));
  assert.deepEqual(commands.slice(0, 3).map(c => c.cancellable), [true, true, true]);
  assert.deepEqual(commands.slice(3).map(c => c.cancellable), [false, false, false, false]);
  assert.ok(commands.every(c => c.args.every(a => !a.includes("docker.sock") && !a.includes("/mnt/") && !a.includes("--privileged"))));
});

test("invalid nonce, IDs and argument widening fail closed", () => {
  for (const n of ["", "A".repeat(32), "a".repeat(31), "a".repeat(33), "../" + "a".repeat(29)])
    assert.throws(() => planUncooperativeController(n, id), UncooperativeControllerError);
  for (const bad of ["", "b".repeat(63), "b".repeat(65), "../" + "b".repeat(61)])
    assert.throws(() => planUncooperativeController(nonce, bad), UncooperativeControllerError);
});

test("evidence requires positive ignored-abort, late-effect and advancing-child observations", () => {
  const good = { version: 1, nonce, verified: true, guestAlive: true, childAlive: true, lateEffect: true, abortIgnored: true, childPid: 41, childTickBefore: 1, childTickAfter: 2 };
  assert.deepEqual(validateUncooperativeEvidence(good, nonce), good);
  for (const key of Object.keys(good)) {
    const bad = { ...good, [key]: key === "nonce" ? "stale" : key === "childTickBefore" ? -1 : key.includes("Tick") ? 0 : false };
    assert.throws(() => validateUncooperativeEvidence(bad, nonce), UncooperativeControllerError);
  }
});

test("evidence rejects extra fields, PID reuse-shaped observations and unsafe numbers", () => {
  const good = { version: 1, nonce, verified: true, guestAlive: true, childAlive: true, lateEffect: true, abortIgnored: true, childPid: 41, childTickBefore: 1, childTickAfter: 2 };
  for (const bad of [{ ...good, extra: true }, { ...good, childPid: 0 }, { ...good, childPid: 1.5 }, { ...good, childTickAfter: 1 }, { ...good, childTickAfter: Number.MAX_SAFE_INTEGER + 1 }, null])
    assert.throws(() => validateUncooperativeEvidence(bad, nonce), UncooperativeControllerError);
});

test("stop postcondition requires exact exited state and cannot be forged by status alone", () => {
  const good = { Status: "exited", Running: false, Pid: 0, ExitCode: 137, OOMKilled: false, Error: "" };
  validateStoppedState(good);
  for (const key of Object.keys(good)) {
    const bad = { ...good, [key]: key === "Status" ? "running" : key === "Pid" ? 1 : true };
    assert.throws(() => validateStoppedState(bad), UncooperativeControllerError);
  }
  assert.throws(() => validateStoppedState({ ...good, Status: "exited", Running: false, Pid: 0, ExitCode: 0 }), UncooperativeControllerError);
});

test("cleanup validation permits only exact synthetic names and no broad deletion", () => {
  validateCleanupNames([]); validateCleanupNames(["uncoop-before.txt", "uncoop-ready.json", "uncoop-abort.request", "uncoop-abort-ignored.txt", "uncoop-late.txt", "uncoop-child.json"]);
  for (const names of [["."], [".."], ["other.txt"], ["uncoop-before.txt", "../private"]])
    assert.throws(() => validateCleanupNames(names), UncooperativeControllerError);
});

test("cleanup commands remain non-cancellable after experiment cancellation", () => {
  const commands = planUncooperativeController(nonce, id);
  assert.ok(commands.filter(c => ["stop", "wait", "inspect", "remove"].includes(c.step)).every(c => c.cancellable === false));
  assert.ok(commands.every(c => !c.args.some(a => /prune|kill.*supervisor|desktop|wsl/i.test(a))));
});

test("returned commands and evidence are detached from caller mutation", () => {
  const commands = planUncooperativeController(nonce, id) as unknown as Array<{ args: string[] }>;
  const original = commands[0].args[3]; commands[0].args[3] = "changed";
  assert.equal(planUncooperativeController(nonce, id)[0].args[3], original);
  const evidence = validateUncooperativeEvidence({ version: 1, nonce, verified: true, guestAlive: true, childAlive: true, lateEffect: true, abortIgnored: true, childPid: 41, childTickBefore: 1, childTickAfter: 2 }, nonce);
  assert.equal(Object.isFrozen(evidence), false); assert.equal(evidence.childPid, 41);
});
