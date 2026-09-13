import assert from "node:assert/strict";
import { Script } from "node:vm";
import test from "node:test";
import { AGENT_CHECK_IDS, LIFECYCLE_CHECK_IDS, LIFECYCLE_EVENTS, VERIFY_LIFECYCLE_EFFECTS, inspectAgentResult } from "../guard-host/agent-spec.ts";

const nonce = "a".repeat(32);
const root = "/home/node/.pi/sessions/lifecycle";
// Execute only our independent verifier against synthetic in-memory files.
// No pi import, real guest execution, Docker, host filesystem or sockets.
function fixture() {
  const files = new Map<string, string>([
    ["/workspace/lifecycle.json", JSON.stringify({ version: 1, nonce, events: LIFECYCLE_EVENTS })],
    ["/workspace/reload-work.txt", "PHI_RELOAD_WORK"],
    ["/workspace/cancel-before.txt", "PHI_CANCEL_BEFORE"],
    ["/workspace/cancel-observed.txt", "PHI_CANCEL_OBSERVED"],
    ["/workspace/after-cancel.txt", "PHI_AFTER_CANCEL"],
    ["/workspace/throw-before.txt", "PHI_THROW_BEFORE"],
  ]);
  const user = (content: string) => ({ type: "message", message: { role: "user", content } });
  const failed = (toolName: string, content: string) => ({ type: "message", message: { role: "toolResult", toolName, content, isError: true } });
  const names = ["a.jsonl", "b.jsonl", "c.jsonl", "d.jsonl"];
  const sessions: Array<Array<Record<string, unknown>>> = [
    [user("PHI_SESSION_ORIGINAL")], [user("PHI_SESSION_NEW")], [user("PHI_SESSION_FORK")],
    [user("PHI_SESSION_FORK"), { type: "message", message: { role: "assistant", stopReason: "aborted" } },
      failed("fixture_wait", "PHI_EXPECTED_TOOL_ABORT"), failed("fixture_throw", "PHI_EXPECTED_TOOL_FAILURE"), failed("write", "PHI_EXPECTED_HOOK_FAILURE")],
  ];
  for (let i = 0; i < 4; i++) files.set(`${root}/${names[i]}`, [
    { type: "session", version: 3, id: String(i), cwd: "/workspace", ...(i === 3 ? { parentSession: `${root}/c.jsonl` } : {}) },
    ...sessions[i],
  ].map((entry) => JSON.stringify(entry)).join("\n") + "\n");
  return { files, names };
}
function verify(data: ReturnType<typeof fixture>, stat?: { link?: boolean; links?: number; size?: number }) {
  const reads: string[] = [];
  const fs = {
    readdirSync: (path: string) => { assert.equal(path, root); return data.names; },
    existsSync: (path: string) => data.files.has(path),
    lstatSync: (path: string) => {
      assert.ok(data.files.has(path));
      return { isFile: () => true, isSymbolicLink: () => stat?.link ?? false, nlink: stat?.links ?? 1,
        size: stat?.size ?? Buffer.byteLength(data.files.get(path)!) };
    },
    readFileSync: (path: string, encoding: string) => {
      assert.equal(encoding, "utf8"); reads.push(path); assert.ok(data.files.has(path)); return data.files.get(path);
    },
  };
  try { return { passed: new Script(VERIFY_LIFECYCLE_EFFECTS + "\nverifyLifecycle(nonce)").runInNewContext({ fs, nonce }) === true, reads }; }
  catch { return { passed: false, reads }; }
}
function changeSession(data: ReturnType<typeof fixture>, name: string, change: (entries: Array<Record<string, any>>) => void) {
  const path = `${root}/${name}`;
  const entries = data.files.get(path)!.trim().split("\n").map((line) => JSON.parse(line));
  change(entries);
  data.files.set(path, entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
}

test("lifecycle revision requires every new decision; the earlier 20-check report is not enough", () => {
  assert.equal(LIFECYCLE_CHECK_IDS.length, 15);
  assert.equal(AGENT_CHECK_IDS.length, 32);
  assert.equal(new Set(AGENT_CHECK_IDS).size, 32);
  const checks = Object.fromEntries(AGENT_CHECK_IDS.map((id) => [id, true]));
  inspectAgentResult({ version: 1, nonce, checks }, nonce);
  for (const id of AGENT_CHECK_IDS) {
    const missing = { ...checks }; delete missing[id];
    for (const changed of [missing, { ...checks, [id]: false }, { ...checks, [id]: "true" }]) {
      assert.throws(() => inspectAgentResult({ version: 1, nonce, checks: changed }, nonce));
    }
  }
  const oldChecks = Object.fromEntries(AGENT_CHECK_IDS.slice(0, 17).map((id) => [id, true]));
  assert.throws(() => inspectAgentResult({ version: 1, nonce, checks: oldChecks }, nonce));
});

test("independent verifier requires persisted session/control effects, not guest booleans", () => {
  const result = verify(fixture());
  assert.equal(result.passed, true);
  assert.equal(result.reads.length, 10);
});

test("nonce/schema and every shutdown/start/cancel/tree event are required in order", () => {
  const ledgers = [
    { version: 1, nonce: "stale", events: LIFECYCLE_EVENTS },
    { version: 2, nonce, events: LIFECYCLE_EVENTS },
    { version: 1, nonce, events: LIFECYCLE_EVENTS, extra: true },
    { version: 1, nonce, events: [...LIFECYCLE_EVENTS].reverse() },
    ...LIFECYCLE_EVENTS.map((_, index) => ({ version: 1, nonce, events: LIFECYCLE_EVENTS.filter((_, i) => i !== index) })),
  ];
  for (const ledger of ledgers) {
    const data = fixture(); data.files.set("/workspace/lifecycle.json", JSON.stringify(ledger));
    assert.equal(verify(data).passed, false);
  }
});

test("missing positive effects and unexpected post-cancel/hook writes fail independently", () => {
  for (const path of fixture().files.keys()) {
    const data = fixture(); data.files.delete(path);
    assert.equal(verify(data).passed, false);
  }
  for (const path of ["hook-must-not-write.txt", "cancel-must-not-write.txt"]) {
    const data = fixture(); data.files.set(`/workspace/${path}`, "BAD");
    assert.equal(verify(data).passed, false);
  }
});

test("malformed or out-of-scope session histories and stale/queued data cannot pass", () => {
  const changes: Array<(entries: Array<Record<string, any>>) => void> = [
    (entries) => { entries[0].cwd = "/outside"; },
    (entries) => { entries[0].parentSession = `${root}/../private.jsonl`; },
    (entries) => { entries[0].id = "0"; },
    (entries) => { entries[0].version = 2; },
    (entries) => { entries.push({ type: "custom", customType: "phi-stale-must-not-append" }); },
    (entries) => { entries.push({ type: "message", message: { role: "user", content: "PHI_QUEUED_MUST_NOT_RUN" } }); },
    (entries) => { entries.push({ type: "message", message: { role: "user", content: "SYNTHETIC_SECRET_NOT_A_CREDENTIAL" } }); },
    (entries) => { entries[2].message.stopReason = "stop"; },
    (entries) => { entries[3].message.isError = false; },
    (entries) => { entries[4].message.isError = false; },
    (entries) => { entries[5].message.isError = false; },
    (entries) => { entries[1].message.content = "unexpected"; },
  ];
  for (const change of changes) {
    const data = fixture(); changeSession(data, "d.jsonl", change);
    assert.equal(verify(data).passed, false);
  }
  const malformed = fixture(); malformed.files.set(`${root}/d.jsonl`, "not JSON");
  assert.equal(verify(malformed).passed, false);
});

test("session file names/counts are bounded before any session reads", () => {
  for (const names of [["../private.jsonl", "b.jsonl", "c.jsonl", "d.jsonl"], [], [...fixture().names, "e.jsonl"]]) {
    const data = fixture(); data.names = names;
    const result = verify(data);
    assert.equal(result.passed, false);
    assert.deepEqual(result.reads, ["/workspace/lifecycle.json"]);
  }
});

test("verifier refuses linked, empty and oversized artifacts before reading bytes", () => {
  for (const stat of [{ link: true }, { links: 2 }, { size: 0 }, { size: 131073 }]) {
    const result = verify(fixture(), stat);
    assert.equal(result.passed, false);
    assert.deepEqual(result.reads, []);
  }
});
