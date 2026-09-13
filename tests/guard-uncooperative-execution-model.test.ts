import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_ADAPTER_EVENTS, UncooperativeExecutionModelError, beginCreate, cleanupDecision, confirmCreate,
  confirmGuestEvidence, confirmRemoved, confirmRunning, confirmStopped, createAdapterState,
  guestFailed, removeUnconfirmed, rejectInspection, requestRemove, requestStop, stopUnconfirmed,
  uncertainCreate, validateAdapterState, verifierFailed,
} from "../guard-host/uncooperative-execution-model.ts";
function created() { return confirmCreate(beginCreate(createAdapterState())); }
function stopped() { return confirmStopped(requestStop(confirmGuestEvidence(confirmRunning(created())))); }

test("adapter starts blocked and has bounded event history", () => {
  assert.equal(MAX_ADAPTER_EVENTS, 24); assert.deepEqual(createAdapterState(), { phase: "setup", outcome: "blocked", events: [], createAttempted: false, createConfirmed: false, cleanupRequired: false, cleanupConfirmed: false, guestEvidence: false, stopConfirmed: false });
  assert.equal(cleanupDecision(createAdapterState()), "not-needed");
});

test("confirmed create requires an attempt and makes cleanup mandatory", () => {
  const s = created(); assert.equal(s.phase, "created"); assert.equal(s.createConfirmed, true); assert.equal(s.cleanupRequired, true); assert.equal(cleanupDecision(s), "ownership-check-required");
  assert.throws(() => confirmCreate(createAdapterState()), UncooperativeExecutionModelError);
});

test("uncertain create never becomes absence or successful cleanup", () => {
  const s = uncertainCreate(beginCreate(createAdapterState())); assert.equal(s.outcome, "failed"); assert.equal(s.createConfirmed, false); assert.equal(cleanupDecision(s), "unconfirmed");
  assert.throws(() => confirmRemoved(s), UncooperativeExecutionModelError);
});

test("inspection, guest and verifier failures remain failed but retain cleanup", () => {
  assert.equal(rejectInspection(created()).cleanupRequired, true);
  assert.equal(guestFailed(confirmRunning(created())).outcome, "failed");
  assert.equal(verifierFailed(confirmRunning(created())).outcome, "failed");
});

test("positive guest evidence precedes stop request", () => {
  const s = confirmGuestEvidence(confirmRunning(created())); assert.equal(s.phase, "verified"); assert.equal(s.guestEvidence, true);
  assert.throws(() => requestStop(created()), UncooperativeExecutionModelError);
  assert.equal(requestStop(s).events.at(-1), "stop-requested");
});

test("stop uncertainty cannot be reported as stopped or removed", () => {
  const s = stopUnconfirmed(requestStop(confirmGuestEvidence(confirmRunning(created()))));
  assert.equal(s.outcome, "failed"); assert.equal(cleanupDecision(s), "unconfirmed");
  assert.throws(() => requestRemove(s), UncooperativeExecutionModelError);
});

test("successful cleanup requires exact stop before remove", () => {
  const s = stopped(); assert.equal(s.phase, "stopped"); assert.equal(s.stopConfirmed, true);
  const removed = confirmRemoved(requestRemove(s)); assert.equal(removed.phase, "removed"); assert.equal(removed.outcome, "passed"); assert.equal(cleanupDecision(removed), "removed");
});

test("remove uncertainty remains failed and never passes", () => {
  const s = removeUnconfirmed(requestRemove(stopped())); assert.equal(s.outcome, "failed"); assert.equal(s.cleanupConfirmed, false); assert.equal(cleanupDecision(s), "unconfirmed");
  assert.throws(() => confirmRemoved(s), UncooperativeExecutionModelError);
});

test("invalid ordering, repeated operations and forged state fail closed", () => {
  const idle = createAdapterState();
  for (const action of [() => requestStop(idle), () => confirmRunning(idle), () => requestRemove(idle), () => confirmRemoved(idle)]) assert.throws(action, UncooperativeExecutionModelError);
  const s = created(); assert.throws(() => beginCreate(s), UncooperativeExecutionModelError); assert.throws(() => confirmCreate(s), UncooperativeExecutionModelError);
  assert.throws(() => validateAdapterState({ ...s, cleanupConfirmed: true, cleanupRequired: false }), UncooperativeExecutionModelError);
});

test("returned state does not share event arrays and never exposes execution authority", () => {
  const a = created(), b = confirmRunning(a); assert.notEqual(a.events, b.events); assert.equal((b as unknown as Record<string, unknown>).docker, undefined);
  assert.equal((b as unknown as Record<string, unknown>).authorized, undefined); assert.ok(b.events.includes("create-confirmed"));
});
