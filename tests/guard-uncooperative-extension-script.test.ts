import assert from "node:assert/strict";
import { Script } from "node:vm";
import test from "node:test";
import {
  UNCOOPERATIVE_FILES, UNCOOPERATIVE_GUEST_SCRIPT, UNCOOPERATIVE_VERIFY_SCRIPT,
  validateUncooperativeGuestScript, validateUncooperativeVerifierScript,
} from "../guard-host/uncooperative-extension.ts";

test("fixed guest and verifier scripts parse but are never run by unit tests", () => {
  new Script(UNCOOPERATIVE_GUEST_SCRIPT); new Script(UNCOOPERATIVE_VERIFY_SCRIPT);
  validateUncooperativeGuestScript(UNCOOPERATIVE_GUEST_SCRIPT);
  validateUncooperativeVerifierScript(UNCOOPERATIVE_VERIFY_SCRIPT);
});

test("guest script is fixed, bounded and uses only synthetic workspace effects", () => {
  assert.ok(Buffer.byteLength(UNCOOPERATIVE_GUEST_SCRIPT) <= 8192);
  assert.match(UNCOOPERATIVE_GUEST_SCRIPT, /process\.on\('SIGTERM'/);
  assert.match(UNCOOPERATIVE_GUEST_SCRIPT, /detached:true/);
  assert.match(UNCOOPERATIVE_GUEST_SCRIPT, /uncoop-abort\.request/);
  assert.deepEqual(UNCOOPERATIVE_FILES, ["uncoop-before.txt", "uncoop-ready.json", "uncoop-abort.request",
    "uncoop-abort-ignored.txt", "uncoop-late.txt", "uncoop-child.json"]);
  for (const bad of [UNCOOPERATIVE_GUEST_SCRIPT.replace("/workspace", "/outside"),
    UNCOOPERATIVE_GUEST_SCRIPT.replace("detached:true", "detached:false"),
    UNCOOPERATIVE_GUEST_SCRIPT.replace("process.getuid()!==1000", "process.getuid()!==0"),
    UNCOOPERATIVE_GUEST_SCRIPT + "\nprocess.env.SECRET"])
    assert.throws(() => validateUncooperativeGuestScript(bad), { message: "UNCOOPERATIVE_SCRIPT_INVALID" });
});

test("verifier requires the known child identity and advancing child effect", () => {
  assert.ok(Buffer.byteLength(UNCOOPERATIVE_VERIFY_SCRIPT) <= 8192);
  assert.match(UNCOOPERATIVE_VERIFY_SCRIPT, /ready\.childPid/);
  assert.match(UNCOOPERATIVE_VERIFY_SCRIPT, /second\.tick>first\.tick/);
  for (const bad of [UNCOOPERATIVE_VERIFY_SCRIPT.replace("second.tick>first.tick", "true"),
    UNCOOPERATIVE_VERIFY_SCRIPT.replace("uncoop-late.txt", "outside.txt"),
    UNCOOPERATIVE_VERIFY_SCRIPT + "\nrequire('node:net')"])
    assert.throws(() => validateUncooperativeVerifierScript(bad), { message: "UNCOOPERATIVE_VERIFIER_INVALID" });
});

test("script rejects widening to host paths, environment or network APIs", () => {
  for (const fragment of ["/mnt/c/private", "process.env.PHI", "require('node:net')", "child_process.exec", "spawnSync"])
    assert.throws(() => validateUncooperativeGuestScript(UNCOOPERATIVE_GUEST_SCRIPT + fragment), { message: "UNCOOPERATIVE_SCRIPT_INVALID" });
  for (const fragment of ["/mnt/c/private", "process.env.PHI", "require('node:http')", "child_process"])
    assert.throws(() => validateUncooperativeVerifierScript(UNCOOPERATIVE_VERIFY_SCRIPT + fragment), { message: "UNCOOPERATIVE_VERIFIER_INVALID" });
});

test("script declarations contain no host cleanup, Docker or supervisor control", () => {
  for (const script of [UNCOOPERATIVE_GUEST_SCRIPT, UNCOOPERATIVE_VERIFY_SCRIPT]) {
    assert.doesNotMatch(script, /docker|container|SIGKILL|kill\(/i);
    assert.doesNotMatch(script, /\/proc\/|\/run\/|\/mnt\/|\/host_mnt/);
  }
});
