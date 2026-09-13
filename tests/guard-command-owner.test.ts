import assert from "node:assert/strict";
import test from "node:test";
import { CommandOwnerFixture, MAX_COMMAND_RECORDS, parseCommandReceipt, receiptBytes, type OwnerToken } from "../guard-host/command-owner-model.ts";
const rejects = (fn: () => unknown, rule: string) => assert.throws(fn, { rule });
function sent() {
  const fixture = new CommandOwnerFixture(); const owner = fixture.acquire(); const request = fixture.prepare(owner, "stop");
  fixture.deliver(owner, request.requestId); return { fixture, owner, request };
}
function finish(fixture: CommandOwnerFixture, owner: OwnerToken, id: string) {
  fixture.finishInFakeEngine(id); fixture.acceptReceipt(owner, fixture.lookupFakeReceipt(id)!);
  fixture.settle(owner, id, fixture.observe(owner));
}

test("command-owner model remains locked/non-executable even after complete cleanup", () => {
  const { fixture, owner, request } = sent(); finish(fixture, owner, request.requestId);
  const removal = fixture.prepare(owner, "remove"); fixture.deliver(owner, removal.requestId); finish(fixture, owner, removal.requestId);
  assert.equal(fixture.observe(owner).resource, "absent");
  assert.deepEqual(fixture.report(), { version: 1, state: "locked", protection: "not-active", canLaunch: false,
    executable: false, gateway: "deferred", coverage: "command-owner-model-only", durability: "not-proven",
    operationsQuiescent: true, unsettled: 0, pendingFakeEffects: 0 });
});

test("one synthetic owner at a time, with stale and malformed tokens fenced", () => {
  const f = new CommandOwnerFixture(); const a = f.acquire(); rejects(() => f.acquire(), "COMMAND_OWNER_BUSY");
  f.loseOwner(a); rejects(() => f.prepare({ epoch: undefined } as unknown as OwnerToken, "stop"), "COMMAND_OWNER_FENCED");
  const b = f.acquire(); assert.equal(b.epoch, a.epoch + 1);
  for (const token of [a, { epoch: b.epoch, extra: true }, { epoch: NaN }]) rejects(() => f.prepare(token, "stop"), "COMMAND_OWNER_FENCED");
});

test("a replaced owner cannot deliver a previously prepared request", () => {
  const f = new CommandOwnerFixture(); const a = f.acquire(); const r = f.prepare(a, "stop"); f.loseOwner(a); const b = f.acquire();
  rejects(() => f.deliver(a, r.requestId), "COMMAND_OWNER_FENCED");
  rejects(() => f.deliver(b, r.requestId), "COMMAND_REQUEST_STALE");
  f.retireUnsent(b, r.requestId); assert.equal(f.report().operationsQuiescent, true);
  const next = f.prepare(b, "stop"); assert.notEqual(next.requestId, r.requestId);
});

test("there is no create/start/resume/exec/public path dispatch API", () => {
  const f = new CommandOwnerFixture(); const a = f.acquire();
  for (const action of ["create", "historical-create", "start", "resume", "exec", "C:\\PRIVATE_FAKE"])
    rejects(() => f.prepare(a, action as "stop"), "COMMAND_ACTION_FORBIDDEN");
  assert.deepEqual(f.snapshot().records, []);
  rejects(() => f.prepare(a, "remove"), "COMMAND_OBSERVATION_UNCONFIRMED");
});

test("intent preparation alone causes no effect; outstanding work serializes the owner", () => {
  const f = new CommandOwnerFixture(); const a = f.acquire(); const r = f.prepare(a, "stop");
  assert.deepEqual(f.snapshot().pending, []); assert.deepEqual(f.snapshot().effects, []);
  rejects(() => f.prepare(a, "stop"), "COMMAND_OPERATIONS_UNSETTLED");
  f.deliver(a, r.requestId); assert.equal(f.snapshot().records[0].stage, "delivery-intent");
  rejects(() => f.deliver(a, r.requestId), "COMMAND_REQUEST_STALE");
  rejects(() => f.retireUnsent(a, r.requestId), "COMMAND_DELIVERY_UNCERTAIN");
});

test("accepted engine work survives simulated owner loss and epoch replacement", () => {
  const { fixture: f, owner: a, request: r } = sent(); f.loseOwner(a); const b = f.acquire();
  rejects(() => f.prepare(b, "stop"), "COMMAND_OPERATIONS_UNSETTLED");
  f.finishInFakeEngine(r.requestId); assert.equal(f.observe(b).resource, "stopped");
  assert.deepEqual(f.snapshot().effects, [`${r.requestId}:stop`]);
  rejects(() => f.acceptReceipt(a, f.lookupFakeReceipt(r.requestId)!), "COMMAND_OWNER_FENCED");
  f.acceptReceipt(b, f.lookupFakeReceipt(r.requestId)!); f.settle(b, r.requestId, f.observe(b));
  assert.equal(f.report().operationsQuiescent, true);
});

test("transport-delayed requests can be accepted after the old owner has been fenced", () => {
  const f = new CommandOwnerFixture(); const a = f.acquire(); const r = f.prepare(a, "stop");
  f.deliver(a, r.requestId, "delay-before-accept"); assert.deepEqual(f.snapshot().pending, []);
  assert.equal(f.lookupFakeReceipt(r.requestId), undefined);
  f.loseOwner(a); const b = f.acquire(); rejects(() => f.prepare(b, "stop"), "COMMAND_OPERATIONS_UNSETTLED");
  f.acceptDelayedInFakeEngine(r.requestId); finish(f, b, r.requestId);
  assert.deepEqual(f.snapshot().effects, [`${r.requestId}:stop`]);
  rejects(() => f.acceptDelayedInFakeEngine(r.requestId), "COMMAND_ENGINE_REQUEST_UNKNOWN");
});

test("dispatch rechecks fresh state and engine availability, not only preparation evidence", () => {
  const { fixture: f, owner: a, request: r } = sent(); finish(f, a, r.requestId);
  const remove = f.prepare(a, "remove"); f.setFakeResource("running");
  rejects(() => f.deliver(a, remove.requestId), "COMMAND_OBSERVATION_UNCONFIRMED");
  f.setFakeResource("stopped"); f.setFakeEngineAvailable(false);
  rejects(() => f.deliver(a, remove.requestId), "COMMAND_OBSERVATION_UNCONFIRMED");
  assert.equal(f.snapshot().records.at(-1)!.stage, "prepared"); assert.deepEqual(f.snapshot().pending, []);
  f.setFakeEngineAvailable(true); f.deliver(a, remove.requestId); finish(f, a, remove.requestId);
});

test("repeated empty inventories and missing receipts never settle uncertain delivery", () => {
  const f = new CommandOwnerFixture(); const a = f.acquire(); const r = f.prepare(a, "stop");
  f.deliver(a, r.requestId, "drop-before-engine"); f.setFakeResource("absent");
  for (let i = 0; i < 20; i++) {
    assert.equal(f.lookupFakeReceipt(r.requestId), undefined); assert.equal(f.observe(a).resource, "absent");
    rejects(() => f.settle(a, r.requestId, f.observe(a)), "COMMAND_RECEIPT_REQUIRED");
    assert.equal(f.report().operationsQuiescent, false);
  }
  rejects(() => f.retireUnsent(a, r.requestId), "COMMAND_DELIVERY_UNCERTAIN");
});

test("definitive mock pre-accept rejection is distinct from lookup absence", () => {
  const f = new CommandOwnerFixture(); const a = f.acquire(); const r = f.prepare(a, "stop");
  f.deliver(a, r.requestId, "reject-before-accept");
  f.acceptReceipt(a, f.lookupFakeReceipt(r.requestId)!); f.settle(a, r.requestId, f.observe(a));
  assert.deepEqual(f.snapshot().effects, []); assert.equal(f.observe(a).resource, "running");
  assert.equal(f.report().operationsQuiescent, true, "quiescence does not mean stopped");
});

test("a terminal command return is not a successful stop postcondition", () => {
  const { fixture: f, owner: a, request: r } = sent(); f.finishInFakeEngine(r.requestId, "no-effect");
  f.acceptReceipt(a, f.lookupFakeReceipt(r.requestId)!);
  rejects(() => f.settle(a, r.requestId, f.observe(a)), "COMMAND_POSTCONDITION_UNCONFIRMED");
  assert.equal(f.report().operationsQuiescent, false);
});

test("a terminal remove return cannot hide a still-present resource", () => {
  const { fixture: f, owner: a, request: r } = sent(); finish(f, a, r.requestId);
  const remove = f.prepare(a, "remove"); f.deliver(a, remove.requestId); f.finishInFakeEngine(remove.requestId, "no-effect");
  f.acceptReceipt(a, f.lookupFakeReceipt(remove.requestId)!);
  rejects(() => f.settle(a, remove.requestId, f.observe(a)), "COMMAND_POSTCONDITION_UNCONFIRMED");
});

test("fresh observations reject resource drift, wrong identity and earlier owner epochs", () => {
  const { fixture: f, owner: a, request: r } = sent(); f.finishInFakeEngine(r.requestId);
  f.acceptReceipt(a, f.lookupFakeReceipt(r.requestId)!); const old = f.observe(a);
  f.setFakeResource("running"); rejects(() => f.settle(a, r.requestId, old), "COMMAND_OBSERVATION_STALE");
  f.setFakeResource("stopped");
  rejects(() => f.settle(a, r.requestId, { ...f.observe(a), targetId: "d".repeat(64) }), "COMMAND_OBSERVATION_STALE");
  const beforeReplacement = f.observe(a); f.loseOwner(a); const b = f.acquire();
  rejects(() => f.settle(b, r.requestId, beforeReplacement), "COMMAND_OBSERVATION_STALE");
  f.settle(b, r.requestId, f.observe(b));
});

test("engine availability interruption blocks receipts/observations and invalidates old scans", () => {
  const { fixture: f, owner: a, request: r } = sent(); f.finishInFakeEngine(r.requestId);
  const receipt = f.lookupFakeReceipt(r.requestId)!; f.acceptReceipt(a, receipt); const old = f.observe(a);
  f.setFakeEngineAvailable(false); assert.equal(f.report().operationsQuiescent, false);
  rejects(() => f.acceptReceipt(a, receipt), "COMMAND_RECEIPT_UNCONFIRMED");
  rejects(() => f.observe(a), "COMMAND_ENGINE_UNAVAILABLE");
  f.setFakeEngineAvailable(true); rejects(() => f.settle(a, r.requestId, old), "COMMAND_OBSERVATION_STALE");
  f.settle(a, r.requestId, f.observe(a));
});

test("receipts bind exact request digest, identity, outcome and trusted mock issuer", () => {
  const { fixture: f, owner: a, request: r } = sent(); f.finishInFakeEngine(r.requestId);
  const good = parseCommandReceipt(f.lookupFakeReceipt(r.requestId)!);
  for (const bad of [{ ...good, requestHash: "f".repeat(64) }, { ...good, engineFingerprint: "f".repeat(64) }])
    rejects(() => f.acceptReceipt(a, receiptBytes(bad)), "COMMAND_RECEIPT_MISMATCH");
  for (const bad of [{ ...good, resourceId: "f".repeat(64) }, { ...good, outcome: "rejected-before-accept" as const }])
    rejects(() => f.acceptReceipt(a, receiptBytes(bad)), "COMMAND_RECEIPT_UNCONFIRMED");
  f.acceptReceipt(a, receiptBytes(good));
});

test("receipt parser rejects oversized, duplicate, unknown and noncanonical fields", () => {
  const { fixture: f, request: r } = sent(); f.finishInFakeEngine(r.requestId); const bytes = f.lookupFakeReceipt(r.requestId)!;
  assert.equal(receiptBytes(parseCommandReceipt(bytes)), bytes);
  for (const bad of ["PRIVATE_FAKE", " ".repeat(1025), bytes.trim(), bytes.replace('"version":1', '"version":1,"version":1'),
    bytes.replace('"version":1', '"extra":true,"version":1'), bytes.replace('"returned"', '"timeout"'), bytes.replace('"request-1"', '"request-17"')])
    rejects(() => parseCommandReceipt(bad), "COMMAND_RECEIPT_INVALID");
});

test("duplicate and out-of-order receipts cannot roll back the command ledger", () => {
  const { fixture: f, owner: a, request: r } = sent(); finish(f, a, r.requestId); const old = f.lookupFakeReceipt(r.requestId)!;
  const next = f.prepare(a, "remove"); f.deliver(a, next.requestId); finish(f, a, next.requestId);
  const snapshot = f.snapshot(); f.acceptReceipt(a, old); f.acceptReceipt(a, f.lookupFakeReceipt(next.requestId)!);
  assert.deepEqual(f.snapshot(), snapshot); assert.equal(f.snapshot().effects.length, 2);
  rejects(() => f.deliver(a, r.requestId), "COMMAND_REQUEST_STALE");
});

test("historical delayed create can appear after empty scans and new owner acquisition", () => {
  const f = new CommandOwnerFixture("delayed-create"); const a = f.acquire(); const id = f.snapshot().records[0].request.requestId;
  assert.equal(f.snapshot().boundId, null);
  for (let i = 0; i < 10; i++) { assert.equal(f.observe(a).resource, "absent"); assert.equal(f.report().operationsQuiescent, false); }
  rejects(() => f.prepare(a, "stop"), "COMMAND_OPERATIONS_UNSETTLED");
  f.loseOwner(a); const b = f.acquire(); f.finishInFakeEngine(id); f.acceptReceipt(b, f.lookupFakeReceipt(id)!);
  assert.equal(f.snapshot().boundId, null, "receipt alone does not bind the observed target");
  f.settle(b, id, f.observe(b)); assert.equal(f.snapshot().boundId, "c".repeat(64));
  const cleanup = f.prepare(b, "remove"); f.deliver(b, cleanup.requestId); finish(f, b, cleanup.requestId);
  assert.equal(f.observe(b).resource, "absent");
});

test("a historical create return without immutable identity stays unresolved", () => {
  const f = new CommandOwnerFixture("delayed-create"); const a = f.acquire(); const id = "request-1";
  f.finishInFakeEngine(id, "no-effect"); f.acceptReceipt(a, f.lookupFakeReceipt(id)!);
  rejects(() => f.settle(a, id, f.observe(a)), "COMMAND_POSTCONDITION_UNCONFIRMED");
  assert.equal(f.snapshot().boundId, null); assert.equal(f.report().operationsQuiescent, false);
});

test("all intent/delivery/receipt/settlement commit cuts preserve uncertainty without extra effects", () => {
  for (const stage of ["prepare", "deliver", "receipt", "settle"] as const) for (const cut of ["before", "after"] as const) {
    const f = new CommandOwnerFixture(); const a = f.acquire();
    if (stage !== "prepare") f.prepare(a, "stop");
    if (stage === "receipt" || stage === "settle") { f.deliver(a, "request-1"); f.finishInFakeEngine("request-1"); }
    if (stage === "settle") f.acceptReceipt(a, f.lookupFakeReceipt("request-1")!);
    const before = f.snapshot(); f.failNextCommit(cut);
    rejects(() => stage === "prepare" ? f.prepare(a, "stop") : stage === "deliver" ? f.deliver(a, "request-1")
      : stage === "receipt" ? f.acceptReceipt(a, f.lookupFakeReceipt("request-1")!) : f.settle(a, "request-1", f.observe(a)), "COMMAND_COMMIT_UNCONFIRMED");
    assert.equal(f.report().operationsQuiescent, false);
    assert.deepEqual(f.snapshot().effects, before.effects);
    assert.equal(f.snapshot().revision, before.revision + (cut === "after" ? 1 : 0));
    assert.deepEqual(f.snapshot().pending, []);
    rejects(() => f.prepare(a, "stop"), "COMMAND_OWNER_FENCED");
    const b = f.acquire(); assert.equal(b.epoch, a.epoch + 1);
    if (stage === "deliver" && cut === "after") {
      assert.equal(f.lookupFakeReceipt("request-1"), undefined);
      rejects(() => f.retireUnsent(b, "request-1"), "COMMAND_DELIVERY_UNCERTAIN");
    }
  }
});

test("lost receipt-persistence ack can be recovered without resubmitting a command", () => {
  const { fixture: f, owner: a, request: r } = sent(); f.finishInFakeEngine(r.requestId); const receipt = f.lookupFakeReceipt(r.requestId)!;
  f.failNextCommit("after"); rejects(() => f.acceptReceipt(a, receipt), "COMMAND_COMMIT_UNCONFIRMED");
  const b = f.acquire(); const before = f.snapshot(); f.acceptReceipt(b, receipt); assert.deepEqual(f.snapshot(), before);
  f.settle(b, r.requestId, f.observe(b)); assert.equal(f.snapshot().effects.length, 1);
});

test("historical identity binding reloads from a committed settlement after missing acknowledgement", () => {
  const f = new CommandOwnerFixture("delayed-create"); const a = f.acquire(); f.finishInFakeEngine("request-1");
  f.acceptReceipt(a, f.lookupFakeReceipt("request-1")!); f.failNextCommit("after");
  rejects(() => f.settle(a, "request-1", f.observe(a)), "COMMAND_COMMIT_UNCONFIRMED");
  const b = f.acquire(); assert.equal(f.snapshot().boundId, "c".repeat(64)); assert.equal(f.prepare(b, "remove").action, "remove");
});

test("bounded records are retained, never evicted or reused to authorize more work", () => {
  const f = new CommandOwnerFixture(); const a = f.acquire();
  for (let i = 0; i < MAX_COMMAND_RECORDS; i++) { const r = f.prepare(a, "stop"); f.deliver(a, r.requestId); finish(f, a, r.requestId); }
  const before = f.snapshot(); rejects(() => f.prepare(a, "stop"), "COMMAND_LEDGER_EXHAUSTED");
  assert.deepEqual(f.snapshot(), before); assert.equal(before.records.length, MAX_COMMAND_RECORDS);
});

test("returned requests, observations and snapshots cannot mutate fixture authority/state", () => {
  const f = new CommandOwnerFixture(); const a = f.acquire(); const r = f.prepare(a, "stop"); const before = f.snapshot();
  r.action = "remove"; before.records[0].request.targetId = "PRIVATE_FAKE"; before.records.length = 0;
  assert.equal(f.snapshot().records[0].request.action, "stop"); assert.equal(f.snapshot().records[0].request.targetId, "c".repeat(64));
  const observation = f.observe(a); observation.resource = "absent"; assert.equal(f.observe(a).resource, "running");
  a.epoch = 99; rejects(() => f.deliver(a, "request-1"), "COMMAND_OWNER_FENCED");
});
