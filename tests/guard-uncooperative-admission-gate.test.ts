import assert from "node:assert/strict";
import test from "node:test";
import { AdmissionGateError, REQUIRED_RECEIPT_FACTS, evaluateUncooperativeAdmission, unprovenEvidence } from "../guard-host/uncooperative-admission-gate.ts";

test("admission starts blocked with every backend fact missing", () => {
  const evidence = unprovenEvidence(), result = evaluateUncooperativeAdmission(evidence);
  assert.equal(result.executableAdapter, "blocked"); assert.equal(result.canLaunch, false); assert.equal(result.state, "locked");
  assert.deepEqual(result.missing, REQUIRED_RECEIPT_FACTS); assert.equal(result.reason, "backend-receipts-unproven");
});

test("all receipt facts plus revocation and exact binding are required", () => {
  const evidence = unprovenEvidence();
  for (const fact of REQUIRED_RECEIPT_FACTS) { const partial = structuredClone(evidence) as any; partial.facts[fact] = true; assert.equal(evaluateUncooperativeAdmission(partial).executableAdapter, "blocked"); }
  const complete = { ...evidence, facts: Object.fromEntries(REQUIRED_RECEIPT_FACTS.map(f => [f, true])), transportRevoked: true, exactResourceBinding: true };
  const result = evaluateUncooperativeAdmission(complete); assert.equal(result.executableAdapter, "eligible"); assert.deepEqual(result.missing, []);
});

test("missing transport revocation or exact resource binding stays blocked", () => {
  const complete = { version: 1, facts: Object.fromEntries(REQUIRED_RECEIPT_FACTS.map(f => [f, true])), transportRevoked: true, exactResourceBinding: true };
  for (const key of ["transportRevoked", "exactResourceBinding"]) assert.equal(evaluateUncooperativeAdmission({ ...complete, [key]: false }).executableAdapter, "blocked");
});

test("CLI success, missing response and empty inventory cannot be represented as receipts", () => {
  const evidence = unprovenEvidence();
  for (const value of ["0", "removed", "", "[]", "container-name", null]) {
    const facts = { ...evidence.facts, removeReceipt: value === "removed" };
    assert.equal(evaluateUncooperativeAdmission({ ...evidence, facts }).executableAdapter, "blocked");
  }
});

test("unknown, duplicate or non-boolean facts fail closed", () => {
  const evidence = unprovenEvidence();
  assert.throws(() => evaluateUncooperativeAdmission({ ...evidence, facts: { ...evidence.facts, extra: true } }), AdmissionGateError);
  assert.throws(() => evaluateUncooperativeAdmission({ ...evidence, facts: { engineIncarnation: true } }), AdmissionGateError);
  assert.throws(() => evaluateUncooperativeAdmission({ ...evidence, facts: { ...evidence.facts, createReceipt: "yes" } }), AdmissionGateError);
  assert.throws(() => evaluateUncooperativeAdmission({ ...evidence, extra: false }), AdmissionGateError);
});

test("malformed evidence and widened values never authorize the adapter", () => {
  for (const value of [null, [], {}, { version: 2 }, { version: 1, facts: {}, transportRevoked: true, exactResourceBinding: true },
    { version: 1, facts: Object.fromEntries(REQUIRED_RECEIPT_FACTS.map(f => [f, true])), transportRevoked: "true", exactResourceBinding: true }])
    assert.throws(() => evaluateUncooperativeAdmission(value), AdmissionGateError);
});

test("result is locked even when a synthetic complete evidence record is supplied", () => {
  const complete = { version: 1, facts: Object.fromEntries(REQUIRED_RECEIPT_FACTS.map(f => [f, true])), transportRevoked: true, exactResourceBinding: true };
  const result = evaluateUncooperativeAdmission(complete);
  assert.equal(result.state, "locked"); assert.equal(result.protection, "not-active"); assert.equal(result.canLaunch, false);
});
