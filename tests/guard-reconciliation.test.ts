import assert from "node:assert/strict";
import test from "node:test";
import { appendRecoveryEvent, createRecoveryJournal, MAX_JOURNAL_BYTES, MAX_JOURNAL_EVENTS, parseRecoveryJournal,
  planReconciliation, RECOVERY_PHASES, ReconciliationModelError, type RecoveryOwner, type RecoveryPhase } from "../guard-host/reconciliation-model.ts";

const id = "c".repeat(64);
const owner: RecoveryOwner = { installationId: "a".repeat(32), engineFingerprint: "d".repeat(64), runId: "b".repeat(32),
  nonce: "e".repeat(32), imageId: "sha256:" + "f".repeat(64), profile: "node-worker-v1", creationEpoch: 7, policyEpoch: 3 };
function journal(phase: RecoveryPhase = "create-intent") {
  let bytes = createRecoveryJournal(owner);
  for (const next of RECOVERY_PHASES.slice(1, RECOVERY_PHASES.indexOf(phase) + 1)) bytes = appendRecoveryEvent(bytes, next, id);
  return bytes;
}
function candidate() {
  return { id, name: `phi-phase0-${owner.nonce}`, installationId: owner.installationId, runId: owner.runId,
    nonce: owner.nonce, imageId: owner.imageId, profile: owner.profile, creationEpoch: owner.creationEpoch,
    state: "running", profileVerified: true };
}
function evidence(bytes = journal()) {
  return { installationId: owner.installationId, engineFingerprint: owner.engineFingerprint, recoveryEpoch: 8, policyEpoch: 4,
    fence: "exclusive", operationsQuiescent: true, inventory: "complete", committedHead: parseRecoveryJournal(bytes).events.at(-1)!.hash,
    candidates: [candidate()] };
}
const wire = (value: unknown) => Buffer.from(JSON.stringify(value) + "\n");
function locked(decision: ReturnType<typeof planReconciliation>) {
  assert.equal(decision.state, "locked"); assert.equal(decision.protection, "not-active");
  assert.equal(decision.canLaunch, false); assert.equal(decision.executable, false); assert.equal(decision.gateway, "deferred");
}

test("canonical ownership journal roundtrips all phases with immutable ID and linked hashes", () => {
  for (const phase of RECOVERY_PHASES) {
    const bytes = journal(phase); const parsed = parseRecoveryJournal(bytes);
    assert.deepEqual(parsed.owner, owner);
    assert.equal(parsed.events.at(-1)?.phase, phase);
    assert.deepEqual(wire(parsed), bytes);
    assert.ok(bytes.length < MAX_JOURNAL_BYTES);
    for (let i = 0; i < parsed.events.length; i++) {
      assert.equal(parsed.events[i].sequence, i);
      assert.equal(parsed.events[i].previousHash, i ? parsed.events[i - 1].hash : "0".repeat(64));
      assert.equal(parsed.events[i].containerId, i ? id : null);
    }
  }
});

test("every changed owner/event field, reordered/dropped middle event and extra field is rejected", () => {
  const original = JSON.parse(journal("running").toString());
  const changes: Array<(v: typeof original) => void> = [
    ...Object.keys(owner).map(key => (v: typeof original) => { v.owner[key] = typeof v.owner[key] === "number" ? v.owner[key] + 1 : "0".repeat(32); }),
    (v) => { v.events[2].sequence++; }, (v) => { v.events[1].containerId = "a".repeat(64); },
    (v) => { v.events[2].previousHash = "0".repeat(64); }, (v) => { v.events[2].hash = "0".repeat(64); },
    (v) => { v.events[1].phase = "removed"; }, (v) => { v.events.reverse(); },
    (v) => { v.events.splice(1, 1); }, (v) => { v.events[0].extra = "PRIVATE_FAKE"; },
    (v) => { v.extra = true; }, (v) => { v.version = 2; }, (v) => { v.owner.extra = true; },
  ];
  for (const change of changes) {
    const changed = structuredClone(original); change(changed);
    assert.throws(() => parseRecoveryJournal(wire(changed)), ReconciliationModelError);
  }
});

test("torn/noncanonical/duplicate-key/oversized data and unsupported ownership values are invalid", () => {
  const original = journal().toString();
  for (const input of [Buffer.alloc(0), Buffer.alloc(MAX_JOURNAL_BYTES + 1), Buffer.from(original.slice(0, -3)),
    Buffer.from(original + "{}"), Buffer.from(original.replace('"version":1', '"version":1,"version":1')),
    Buffer.from(original.trim()), Buffer.from(original.replace('{"version"', '{ "version"')), Buffer.from("PRIVATE_FAKE")]) {
    assert.throws(() => parseRecoveryJournal(input), { message: "RECONCILIATION_JOURNAL_INVALID" });
  }
  for (const value of [{ ...owner, creationEpoch: 0 }, { ...owner, policyEpoch: Number.MAX_SAFE_INTEGER },
    { ...owner, creationEpoch: 1.5 }, { ...owner, imageId: "node:latest" }, { ...owner, nonce: "../PRIVATE_FAKE" },
    { ...owner, profile: "host-pi" }, { ...owner, arbitraryPath: "PRIVATE_FAKE" }, null]) {
    assert.throws(() => createRecoveryJournal(value), { message: "RECONCILIATION_JOURNAL_INVALID" });
  }
});

test("illegal phase transitions, ID rebinding and tombstone reuse are rejected", () => {
  for (const [from, to] of [["create-intent", "running"], ["identified", "removed"], ["running", "remove-intent"],
    ["stop-intent", "running"], ["removed", "identified"], ["removed", "start-intent"]] as const) {
    assert.throws(() => appendRecoveryEvent(journal(from), to, id), ReconciliationModelError);
  }
  assert.throws(() => appendRecoveryEvent(journal(), "identified"), ReconciliationModelError);
  assert.throws(() => appendRecoveryEvent(journal("identified"), "start-intent", "a".repeat(64)), ReconciliationModelError);
  assert.throws(() => appendRecoveryEvent(journal(), "identified", "--PRIVATE_FAKE"), ReconciliationModelError);
});

test("missing or corrupt journal never adopts a labeled container or leaks raw input", () => {
  for (const bytes of [undefined, Buffer.from("PRIVATE_FAKE")]) {
    const decision = planReconciliation(bytes, evidence()); locked(decision);
    assert.equal(decision.outcome, "blocked"); assert.equal(decision.step, "none"); assert.equal(decision.containerId, null);
    assert.doesNotMatch(JSON.stringify(decision), /PRIVATE_FAKE/);
  }
});

test("engine/installation changes, absent fencing and stale epochs block reconciliation", () => {
  const input = journal("running");
  for (const changes of [{ installationId: "1".repeat(32) }, { engineFingerprint: "1".repeat(64) },
    { fence: "busy" }, { fence: "unknown" }, { recoveryEpoch: 7 }, { recoveryEpoch: 6 }, { policyEpoch: 2 }]) {
    const decision = planReconciliation(input, { ...evidence(input), ...changes }); locked(decision);
    assert.equal(decision.outcome, "blocked"); assert.equal(decision.step, "none"); assert.equal(decision.containerId, null);
  }
});

test("unsettled old requests and incomplete engine inventories cannot produce absence or cleanup", () => {
  for (const phase of RECOVERY_PHASES) {
    const input = journal(phase);
    for (const changes of [{ operationsQuiescent: false }, { inventory: "unavailable" }]) {
      const decision = planReconciliation(input, { ...evidence(input), candidates: [], ...changes }); locked(decision);
      assert.equal(decision.outcome, "pending"); assert.equal(decision.step, "none");
    }
  }
});

test("hash chain alone cannot detect a valid prefix rollback; separate committed head blocks it", () => {
  const full = journal("removed"); const parsed = parseRecoveryJournal(full);
  parsed.events.pop(); const prefix = wire(parsed);
  assert.equal(parseRecoveryJournal(prefix).events.at(-1)?.phase, "remove-intent");
  const decision = planReconciliation(prefix, { ...evidence(full), candidates: [] });
  assert.equal(decision.rule, "RECOVERY_COMMIT_HEAD_UNCONFIRMED"); assert.equal(decision.step, "none");
  assert.equal(planReconciliation(full, { ...evidence(full), committedHead: null, candidates: [] }).step, "none");
});

test("empty inventory after uncertain create stays pending; exact late create first needs identity persistence", () => {
  const input = journal();
  const empty = { ...evidence(input), candidates: [] };
  for (let i = 0; i < 10; i++) assert.equal(planReconciliation(input, empty).rule, "RECOVERY_CREATE_UNRESOLVED");
  const late = planReconciliation(input, evidence(input)); locked(late);
  assert.equal(late.step, "record-identity"); assert.equal(late.containerId, id);
  assert.equal(planReconciliation(input, { ...evidence(input), candidates: [{ ...candidate(), profileVerified: false }] }).step, "none");
  const bound = appendRecoveryEvent(input, "identified", id);
  assert.equal(planReconciliation(bound, evidence(bound)).step, "record-stop-intent");
});

test("known immutable ID/name/image/installation/run/nonce/epoch must all match independently", () => {
  const input = journal("running");
  const changes = [{ id: "0".repeat(64) }, { name: `phi-phase0-${"0".repeat(32)}` }, { imageId: "sha256:" + "0".repeat(64) },
    { installationId: "0".repeat(32) }, { runId: "0".repeat(32) }, { nonce: "0".repeat(32) }, { creationEpoch: 8 }];
  for (const change of changes) {
    const decision = planReconciliation(input, { ...evidence(input), candidates: [{ ...candidate(), ...change }] });
    assert.equal(decision.rule, "RECOVERY_OWNERSHIP_MISMATCH"); assert.equal(decision.step, "none"); assert.equal(decision.containerId, null);
  }
  for (const candidates of [[candidate(), candidate()], [candidate(), { ...candidate(), id: "0".repeat(64) }]]) {
    assert.equal(planReconciliation(input, { ...evidence(input), candidates }).rule, "RECOVERY_AMBIGUOUS_IDENTITY");
  }
});

test("every crash cut point yields one conservative next step; no starts or guest execs", () => {
  const running = ["record-identity", "record-stop-intent", "record-stop-intent", "record-stop-intent", "stop-container", "record-stop-intent", "record-stop-intent", "none"];
  const stopped = ["record-identity", "record-remove-intent", "record-stop-intent", "record-stop-intent", "record-stopped", "record-remove-intent", "remove-container", "none"];
  const absent = ["none", "record-remove-intent", "record-stop-intent", "record-stop-intent", "record-stopped", "record-remove-intent", "record-removed", "none"];
  for (const [index, phase] of RECOVERY_PHASES.entries()) {
    const input = journal(phase);
    for (const [state, steps] of [["running", running], ["stopped", stopped], ["absent", absent]] as const) {
      const decision = planReconciliation(input, { ...evidence(input), candidates: state === "absent" ? [] : [{ ...candidate(), state }] });
      locked(decision); assert.equal(decision.step, steps[index], `${phase}/${state}`);
      assert.equal(decision.outcome === "complete", phase === "removed" && state === "absent");
      assert.ok(!["create", "start", "exec", "restart", "prune"].includes(decision.step));
    }
  }
});

test("stop/removal need persisted intents and fresh observations; replies alone cannot complete", () => {
  let input = journal("running");
  assert.equal(planReconciliation(input, evidence(input)).step, "record-stop-intent");
  input = appendRecoveryEvent(input, "stop-intent");
  assert.equal(planReconciliation(input, evidence(input)).step, "stop-container");
  assert.equal(planReconciliation(input, evidence(input)).step, "stop-container", "no simulated success reply changes evidence");
  assert.equal(planReconciliation(input, { ...evidence(input), candidates: [{ ...candidate(), state: "stopped" }] }).step, "record-stopped");
  input = appendRecoveryEvent(input, "stopped");
  input = appendRecoveryEvent(input, "remove-intent");
  const stopped = { ...evidence(input), candidates: [{ ...candidate(), state: "stopped" }] };
  assert.equal(planReconciliation(input, stopped).step, "remove-container");
  assert.equal(planReconciliation(input, { ...evidence(input), candidates: [] }).step, "record-removed");
  input = appendRecoveryEvent(input, "removed");
  const complete = planReconciliation(input, { ...evidence(input), candidates: [] }); locked(complete);
  assert.equal(complete.outcome, "complete");
  assert.equal(planReconciliation(input, evidence(input)).rule, "RECOVERY_TOMBSTONE_CONFLICT");
});

test("profile drift on an exactly bound ID still proposes stop, never readoption or launch", () => {
  const input = journal("running");
  const decision = planReconciliation(input, { ...evidence(input), candidates: [{ ...candidate(), profileVerified: false }] });
  assert.equal(decision.step, "record-stop-intent"); locked(decision);
  const stop = appendRecoveryEvent(input, "stop-intent");
  assert.equal(planReconciliation(stop, { ...evidence(stop), candidates: [{ ...candidate(), profileVerified: false }] }).step, "stop-container");
});

test("a guest running again after stop or remove intent must return through a new stop intent", () => {
  for (const phase of ["stopped", "remove-intent"] as const) {
    const input = journal(phase);
    assert.equal(planReconciliation(input, evidence(input)).step, "record-stop-intent");
    const stoppedAgain = appendRecoveryEvent(input, "stop-intent");
    assert.equal(planReconciliation(stoppedAgain, evidence(stoppedAgain)).step, "stop-container");
  }
});

test("invalid or unknown evidence remains inert and sanitized", () => {
  const input = journal("running");
  const missing = evidence(input) as Partial<ReturnType<typeof evidence>>; delete missing.inventory;
  for (const value of [missing, null, { ...evidence(input), extra: "PRIVATE_FAKE" }, { ...evidence(input), candidates: Array(17).fill(candidate()) },
    { ...evidence(input), candidates: [{ ...candidate(), id: "PRIVATE_FAKE" }] }, { ...evidence(input), inventory: "timeout-is-absence" },
    { ...evidence(input), recoveryEpoch: Number.MAX_SAFE_INTEGER }, { ...evidence(input), operationsQuiescent: "true" }]) {
    const decision = planReconciliation(input, value); locked(decision);
    assert.equal(decision.rule, "RECOVERY_EVIDENCE_INVALID"); assert.equal(decision.step, "none");
    assert.doesNotMatch(JSON.stringify(decision), /PRIVATE_FAKE/);
  }
  assert.equal(planReconciliation(input, { ...evidence(input), candidates: [{ ...candidate(), state: "unknown" }] }).rule, "RECOVERY_STATE_UNCONFIRMED");
});

test("planning is deterministic, leaves inputs untouched, and record proposals obey the journal grammar", () => {
  const phases = { "record-identity": "identified", "record-stop-intent": "stop-intent", "record-stopped": "stopped",
    "record-remove-intent": "remove-intent", "record-removed": "removed" } as const;
  for (const phase of RECOVERY_PHASES) for (const state of ["running", "stopped", "absent"] as const) {
    const input = journal(phase); const before = Buffer.from(input);
    const observed = { ...evidence(input), candidates: state === "absent" ? [] : [{ ...candidate(), state }] };
    const original = structuredClone(observed);
    const decision = planReconciliation(input, observed);
    assert.deepEqual(planReconciliation(input, observed), decision);
    assert.deepEqual(observed, original); assert.deepEqual(input, before);
    if (decision.step in phases) {
      const next = phases[decision.step as keyof typeof phases];
      assert.equal(parseRecoveryJournal(appendRecoveryEvent(input, next, decision.containerId!)).events.at(-1)?.phase, next);
    }
  }
});

test("bounded journal exhaustion blocks new records but preserves an already committed stop proposal", () => {
  let input = journal("stop-intent");
  while (parseRecoveryJournal(input).events.length < MAX_JOURNAL_EVENTS) {
    const previous = parseRecoveryJournal(input).events.at(-1)!.phase;
    input = appendRecoveryEvent(input, previous === "stop-intent" ? "stopped" : "stop-intent");
  }
  assert.throws(() => appendRecoveryEvent(input, "remove-intent"), ReconciliationModelError);
  const decision = planReconciliation(input, evidence(input));
  assert.equal(decision.rule, "RECOVERY_JOURNAL_EXHAUSTED"); assert.equal(decision.step, "none");
  // The cap is even: the above sequence ends in stopped. A different valid path
  // ends on stop-intent at the cap; it can propose only that precommitted stop.
  let second = appendRecoveryEvent(journal("identified"), "remove-intent");
  while (parseRecoveryJournal(second).events.length < MAX_JOURNAL_EVENTS) {
    const phase = parseRecoveryJournal(second).events.at(-1)!.phase;
    second = appendRecoveryEvent(second, phase === "stop-intent" ? "stopped" : "stop-intent");
  }
  assert.equal(parseRecoveryJournal(second).events.at(-1)!.phase, "stop-intent");
  assert.equal(planReconciliation(second, evidence(second)).step, "stop-container");
});
