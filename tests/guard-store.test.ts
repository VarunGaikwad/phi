import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { win32 } from "node:path";
import test from "node:test";
import { appendRecoveryEvent, createRecoveryJournal } from "../guard-host/reconciliation-model.ts";
import { MAX_STORE_BYTES, MAX_STORE_FRAMES, parseStore, prepareStoreAppend, StoreFakeEngine, storeHash } from "../guard-host/store-format.ts";
import { parseStoreMessage, StoreWorker } from "../guard-host/store-worker-client.ts";
import { runStoreCli } from "../guard-host/probe-store.ts";

const nonce = "a".repeat(32);
const owner = { installationId: nonce, engineFingerprint: "b".repeat(64), runId: "c".repeat(32), nonce,
  imageId: "sha256:" + "d".repeat(64), profile: "node-worker-v1", creationEpoch: 7, policyEpoch: 1 };
const journal = createRecoveryJournal(owner);
const initial = prepareStoreAppend(Buffer.alloc(0), journal, 7);
function modified(change: (v: Record<string, any>) => void) {
  const frame = JSON.parse(initial.body.toString()); change(frame);
  return Buffer.from(JSON.stringify(frame) + "\n" + initial.marker);
}

test("store frames roundtrip owner, journal head, generation and epoch without file operations", () => {
  assert.deepEqual(parseStore(Buffer.alloc(0)), []);
  assert.deepEqual(parseStore(initial.combined), [initial.frame]);
  assert.equal(initial.marker.length, 76);
  assert.equal(initial.expectedHash, storeHash(Buffer.alloc(0)));
  const takeover = prepareStoreAppend(initial.combined, journal, 8);
  const nextJournal = appendRecoveryEvent(journal, "identified", "e".repeat(64));
  const next = prepareStoreAppend(takeover.combined, nextJournal, 8);
  assert.equal(parseStore(next.combined).length, 3);
  assert.equal(next.frame.previousHash, takeover.frame.hash);
});

test("every nonempty torn frame or marker tail fails instead of falling back to a prior commit", () => {
  for (let i = 1; i < initial.combined.length; i++) {
    assert.throws(() => parseStore(initial.combined.subarray(0, i)), { rule: "STORE_FIXTURE_INVALID" });
  }
  const second = prepareStoreAppend(initial.combined, journal, 8);
  for (const suffix of [second.body.subarray(0, 17), second.body, Buffer.concat([second.body, second.marker.subarray(0, 20)])]) {
    assert.throws(() => parseStore(Buffer.concat([initial.combined, suffix])), { rule: "STORE_FIXTURE_INVALID" });
  }
});

test("store hash, head, epoch, chain and schema tampering are rejected", () => {
  for (const change of [
    (v: Record<string, any>) => { v.hash = "0".repeat(64); }, (v: Record<string, any>) => { v.head = "0".repeat(64); },
    (v: Record<string, any>) => { v.previousHash = "1".repeat(64); }, (v: Record<string, any>) => { v.generation = 2; },
    (v: Record<string, any>) => { v.epoch = 0; }, (v: Record<string, any>) => { v.journal = "PRIVATE_FAKE"; },
    (v: Record<string, any>) => { v.extra = true; }, (v: Record<string, any>) => { v.version = 2; },
  ]) assert.throws(() => parseStore(modified(change)), { rule: "STORE_FIXTURE_INVALID" });
});

test("canonical encoding, bounds, invalid UTF8 and duplicate fields cannot be ignored", () => {
  for (const value of [Buffer.alloc(MAX_STORE_BYTES + 1), Buffer.from(initial.combined.toString().replace('"version":1', '"version":1,"version":1')),
    Buffer.from(initial.combined.toString().replace('{"version"', '{ "version"')), Buffer.concat([initial.combined, Buffer.from([255])]),
    Buffer.concat([initial.body, Buffer.from('PHI_COMMIT:' + '0'.repeat(64) + '\n')])]) {
    assert.throws(() => parseStore(value), { rule: "STORE_FIXTURE_INVALID" });
  }
});

test("same-journal epoch advance is separate from an exactly one-event journal append", () => {
  for (const epoch of [6, 7, 9, Number.MAX_SAFE_INTEGER, 7.5]) assert.throws(() => prepareStoreAppend(initial.combined, journal, epoch));
  const next = appendRecoveryEvent(journal, "identified", "e".repeat(64));
  assert.throws(() => prepareStoreAppend(initial.combined, next, 8), "epoch and journal cannot change together");
  const skipped = appendRecoveryEvent(next, "start-intent");
  assert.throws(() => prepareStoreAppend(initial.combined, skipped, 7));
  assert.throws(() => prepareStoreAppend(initial.combined, createRecoveryJournal({ ...owner, nonce: "f".repeat(32) }), 7));
  const advanced = prepareStoreAppend(initial.combined, next, 7);
  assert.throws(() => prepareStoreAppend(advanced.combined, journal, 7), "cannot truncate history");
});

test("generation cap is explicit and no history is silently rotated or erased", () => {
  let bytes = initial.combined;
  for (let i = 1; i < MAX_STORE_FRAMES; i++) bytes = prepareStoreAppend(bytes, journal, 7 + i).combined;
  assert.equal(parseStore(bytes).length, MAX_STORE_FRAMES);
  assert.throws(() => prepareStoreAppend(bytes, journal, 7 + MAX_STORE_FRAMES), { rule: "STORE_FIXTURE_FULL" });
});

test("complete prefix replay is a documented limitation, not cryptographic anti-rollback", () => {
  const second = prepareStoreAppend(initial.combined, journal, 8);
  assert.equal(parseStore(second.combined).at(-1)?.epoch, 8);
  assert.equal(parseStore(initial.combined).at(-1)?.epoch, 7);
  assert.notEqual(storeHash(initial.combined), storeHash(second.combined));
});

function stopFrame() {
  let next = appendRecoveryEvent(journal, "identified", "e".repeat(64));
  next = appendRecoveryEvent(next, "stop-intent");
  return prepareStoreAppend(Buffer.alloc(0), next, 7);
}

test("fake engine rejects pre-commit, stale epoch/head, missing live owner and duplicate requests", () => {
  const prepared = stopFrame(); const engine = new StoreFakeEngine();
  assert.throws(() => engine.dispatch(prepared.frame, true), { rule: "STORE_STALE_REQUEST" });
  engine.acceptCommit(prepared.frame);
  const newer = prepareStoreAppend(prepared.combined, Buffer.from(prepared.frame.journal, "base64"), 8);
  engine.acceptCommit(newer.frame);
  assert.throws(() => engine.acceptCommit(prepared.frame), { rule: "STORE_STALE_EPOCH" });
  assert.throws(() => engine.dispatch(prepared.frame, true), { rule: "STORE_STALE_REQUEST" });
  assert.throws(() => engine.dispatch(newer.frame, false), { rule: "STORE_STALE_REQUEST" });
  engine.dispatch(newer.frame, true);
  assert.throws(() => engine.dispatch(newer.frame, true), { rule: "STORE_STALE_REQUEST" });
  assert.deepEqual(engine.effects, ["stop-intent"]);
});

test("fake engine has cleanup-only effects, never create/start/guest exec", () => {
  const engine = new StoreFakeEngine(); engine.acceptCommit(initial.frame);
  assert.throws(() => engine.dispatch(initial.frame, true), { rule: "STORE_NON_CLEANUP_REQUEST" });
  assert.deepEqual(engine.effects, []);
});

test("worker protocol rejects wrong nonce, arbitrary statuses, extra fields and malformed encodings", () => {
  const valid = { version: 1, nonce, status: "locked", data: initial.combined.toString("base64") };
  assert.deepEqual(parseStoreMessage(JSON.stringify(valid), nonce), valid);
  for (const value of [null, { ...valid, nonce: "stale" }, { ...valid, status: "PRIVATE_FAKE" }, { ...valid, data: "not-base64" },
    { ...valid, data: "x".repeat(200000) }, { ...valid, status: "busy" }, { ...valid, extra: true }]) {
    assert.throws(() => parseStoreMessage(JSON.stringify(value), nonce), { rule: "STORE_WORKER_MESSAGE_INVALID" });
  }
});

// Transport tests start only our own synthetic Node processes, not PowerShell/Docker/pi.
function fakeWorker(script: string) {
  const child = spawn(process.execPath, ["-e", script], { cwd: tmpdir(), shell: false, windowsHide: true,
    env: process.platform === "win32" ? { SystemRoot: process.env.SystemRoot } : {}, stdio: ["pipe", "pipe", "pipe"] });
  return new StoreWorker(child, nonce);
}
const ready = JSON.stringify({ version: 1, nonce, status: "locked", data: "" });

test("transport observes real closed streams and forceful exit of only its retained worker", async () => {
  const worker = fakeWorker(`process.stdout.write(${JSON.stringify(ready + "\n")});setInterval(()=>{},1000);`);
  try { assert.equal((await worker.next()).status, "locked"); assert.equal(worker.alive(), true); await worker.killForTest(); assert.equal(worker.alive(), false); }
  finally { await worker.close(); }
});

test("transport rejects malformed/oversized messages, early exit and hidden private errors", async () => {
  for (const script of ["process.stdout.write('PRIVATE_FAKE\\n');setInterval(()=>{},1000)",
    "process.stdout.write('x'.repeat(600000));setInterval(()=>{},1000)", "process.stderr.write('PRIVATE_FAKE');process.exit(1)"]) {
    const worker = fakeWorker(script);
    try { await assert.rejects(worker.next(), error => error instanceof Error && !error.message.includes("PRIVATE_FAKE")); }
    finally { await worker.close(); }
  }
});

test("CLI requires consent and exposes no target path, executable, PID or Docker option", async () => {
  let text = ""; const io = { out: (s: string) => { text += s; }, error: (s: string) => { text += s; } };
  assert.equal(await runStoreCli(["--help"], io), 0); assert.match(text, /FAKE-engine/); assert.match(text, /NOT durable recovery/);
  for (const args of [[], ["--json"], ["--confirm", "--confirm"], ["--confirm", "--root", "PRIVATE_FAKE"], ["--confirm", "--docker", "PRIVATE_FAKE"]]) {
    text = ""; assert.equal(await runStoreCli(args, io), 64); assert.doesNotMatch(text, /PRIVATE_FAKE/);
  }
  if (process.platform !== "win32") {
    text = ""; assert.equal(await runStoreCli(["--confirm", "--json"], io), 2);
    assert.equal(JSON.parse(text).canLaunch, false); assert.equal(JSON.parse(text).rule, "STORE_WINDOWS_HOST_REQUIRED");
  }
});

test("native PowerShell parser accepts the fixed helper as syntax only", { skip: process.platform !== "win32" }, async () => {
  const source = await readFile(new URL("../guard-host/store-worker.ps1", import.meta.url), "utf8");
  const script = `$t=$null;$e=$null;[void][System.Management.Automation.Language.Parser]::ParseInput([Console]::In.ReadToEnd(),[ref]$t,[ref]$e);if($e.Count -gt 0){exit 1};'SYNTAX_OK'`;
  const result = execFileSync(win32.join(process.env.SystemRoot!, "System32/WindowsPowerShell/v1.0/powershell.exe"),
    ["-NoProfile", "-NonInteractive", "-Command", script], { input: source, encoding: "utf8", shell: false, windowsHide: true,
      timeout: 10000, maxBuffer: 4096, env: { SystemRoot: process.env.SystemRoot } });
  assert.equal(result.trim(), "SYNTAX_OK");
});
