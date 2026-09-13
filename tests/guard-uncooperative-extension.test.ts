import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_EVENTS, MAX_PENDING, UncooperativeModelError, clearQueuedWork, confirmHostEngineStopped,
  createUncooperativeModel, extensionIgnoresAbort, observeChildAlive, observeLateEffect,
  observePreAbortWrite, planUncooperativeContainment, queueWork, requestAbort,
  requestHostEngineStop, startUncooperativeTool, validateUncooperativeState,
} from "../guard-host/uncooperative-extension-model.ts";

function scenario() {
  let s = startUncooperativeTool(createUncooperativeModel());
  s = observePreAbortWrite(s); s = queueWork(s, "steering"); s = queueWork(s, "follow-up");
  s = requestAbort(s); s = extensionIgnoresAbort(s); return s;
}

test("model is explicitly pure and bounded", () => {
  assert.equal(MAX_EVENTS, 32); assert.equal(MAX_PENDING, 4);
  const s = createUncooperativeModel();
  assert.deepEqual(s, { stage: "idle", events: [], pending: [], childAlive: false, guestAlive: true, writeCount: 0 });
});

test("an extension can write and create a detached child before abort", () => {
  const s = observePreAbortWrite(startUncooperativeTool(createUncooperativeModel()));
  assert.equal(s.writeCount, 1); assert.equal(s.childAlive, true); assert.equal(s.guestAlive, true);
  assert.deepEqual(s.events, ["tool-started", "pre-abort-write"]);
});

test("abort request is not modeled as revocation", () => {
  const s = extensionIgnoresAbort(requestAbort(observePreAbortWrite(startUncooperativeTool(createUncooperativeModel()))));
  assert.equal(s.stage, "abort-requested"); assert.equal(s.guestAlive, true); assert.equal(s.childAlive, true);
  assert.ok(s.events.includes("abort-ignored"));
});

test("queued steering and follow-up work require explicit clearing", () => {
  const before = scenario(); assert.deepEqual(before.pending, ["steering", "follow-up"]);
  const after = clearQueuedWork(before); assert.deepEqual(after.pending, []);
  assert.equal(after.events.at(-1), "queued-work-cleared");
});

test("containment plan observes a running extension before choosing host stop", () => {
  const s = observePreAbortWrite(startUncooperativeTool(createUncooperativeModel()));
  assert.deepEqual(planUncooperativeContainment(s, 100, 200), { action: "clear-queues-and-observe", deadlineMs: 200 });
});

test("uncooperative observation requires queue clearing before engine stop", () => {
  const s = clearQueuedWork(extensionIgnoresAbort(scenario()));
  assert.deepEqual(planUncooperativeContainment(s, 100, 200), { action: "host-engine-stop", reason: "guest-uncooperative" });
  assert.throws(() => requestHostEngineStop(extensionIgnoresAbort(scenario())), { rule: "UNCOOPERATIVE_MODEL_INVALID" });
});

test("late effect changes the stop reason without being treated as a successful cancel", () => {
  const s = observeLateEffect(clearQueuedWork(extensionIgnoresAbort(scenario())));
  assert.equal(s.writeCount, 2); assert.deepEqual(planUncooperativeContainment(s, 1, 2), { action: "host-engine-stop", reason: "late-effect-observed" });
});

test("detached child remains alive until the host engine boundary", () => {
  const s = observeChildAlive(extensionIgnoresAbort(scenario()));
  const stopped = confirmHostEngineStopped(requestHostEngineStop(clearQueuedWork(s)));
  assert.equal(stopped.guestAlive, false); assert.equal(stopped.childAlive, false);
  assert.equal(stopped.stage, "engine-stopped");
});

test("engine stop cannot be claimed without a request and completed postcondition", () => {
  assert.throws(() => confirmHostEngineStopped(createUncooperativeModel()), { rule: "UNCOOPERATIVE_MODEL_INVALID" });
  const s = clearQueuedWork(extensionIgnoresAbort(scenario()));
  assert.throws(() => confirmHostEngineStopped(s), { rule: "UNCOOPERATIVE_MODEL_INVALID" });
});

test("invalid transitions fail closed", () => {
  const idle = createUncooperativeModel();
  for (const action of [() => observePreAbortWrite(idle), () => requestAbort(idle), () => clearQueuedWork(idle), () => observeLateEffect(idle), () => observeChildAlive(idle)])
    assert.throws(action, { rule: "UNCOOPERATIVE_MODEL_INVALID" });
});

test("deadlines and observations are bounded integers, never timeout evidence", () => {
  const s = startUncooperativeTool(createUncooperativeModel());
  for (const pair of [[-1, 2], [1, 1], [1, 0], [1.5, 2], [1, Number.MAX_SAFE_INTEGER + 1]])
    assert.throws(() => planUncooperativeContainment(s, pair[0], pair[1]), { rule: "UNCOOPERATIVE_MODEL_INVALID" });
});

test("event ledger is capped and state mutation cannot bypass the model", () => {
  let s = scenario(); s = clearQueuedWork(s);
  s = { ...s, events: [...s.events, ...Array(MAX_EVENTS - s.events.length).fill("child-alive")] };
  assert.equal(s.events.length, MAX_EVENTS);
  assert.throws(() => validateUncooperativeState({ ...s, events: [...s.events, "child-alive"] }), UncooperativeModelError);
  assert.notEqual(s.pending, scenario().pending);
});

test("model reports no authorization or real containment result", () => {
  const s = clearQueuedWork(extensionIgnoresAbort(scenario()));
  const decision = planUncooperativeContainment(s, 10, 20);
  assert.equal(decision.action, "host-engine-stop");
  assert.equal((s as unknown as Record<string, unknown>).authorized, undefined);
  assert.equal((s as unknown as Record<string, unknown>).docker, undefined);
});
