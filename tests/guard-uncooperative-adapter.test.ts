import assert from "node:assert/strict";
import test from "node:test";
import { reviewUncooperativeAdapter } from "../guard-host/uncooperative-adapter.ts";
import { validateUncooperativeDockerPlan } from "../guard-host/uncooperative-docker-integration.ts";
const image = "sha256:" + "a".repeat(64), nonce = "b".repeat(32), id = "c".repeat(64);

test("adapter review is explicitly blocked and non-executable", () => {
  const review = reviewUncooperativeAdapter(image, nonce, id);
  assert.equal(review.state, "locked"); assert.equal(review.protection, "not-active"); assert.equal(review.canLaunch, false);
  assert.equal(review.executable, false); assert.equal(review.gateway, "deferred");
  assert.equal(review.executableAdapter, "blocked");
  assert.equal(review.reason, "operation-receipts-and-recovery-cleanup-unproven");
});

test("review exposes the exact declarative plan but no callable runner", () => {
  const review = reviewUncooperativeAdapter(image, nonce, id);
  assert.deepEqual(review.plan.map(s => s.name), ["create", "inspect-created", "start", "inspect-running", "guest", "abort", "verify", "stop", "wait", "inspect-stopped", "remove"]);
  assert.ok(review.plan.slice(-4).every(s => s.cancellable === false));
  assert.equal(Object.hasOwn(review, "run"), false); assert.equal(Object.hasOwn(review, "execute"), false);
});

test("invalid plan identities and widened command data fail closed", () => {
  for (const args of [["sha256:" + "a".repeat(63), nonce, id], [image, "x".repeat(32), id], [image, nonce, "x".repeat(64)]])
    assert.throws(() => reviewUncooperativeAdapter(args[0], args[1], args[2]), Error);
  const review = reviewUncooperativeAdapter(image, nonce, id);
  const changed = structuredClone(review.plan) as any[]; changed[0].args.push("--volume");
  assert.throws(() => validateUncooperativeDockerPlan(changed, image, nonce, id), Error);
  assert.ok(changed[0].args.includes("--volume"));
});

test("review does not infer cleanup success from a plan", () => {
  const review = reviewUncooperativeAdapter(image, nonce, id);
  assert.equal(review.plan.some(s => s.name === "remove"), true);
  assert.equal(review.reason, "operation-receipts-and-recovery-cleanup-unproven");
  assert.equal((review as unknown as Record<string, unknown>).cleanup, undefined);
});

test("returned plan arrays are detached from the review contract", () => {
  const review = reviewUncooperativeAdapter(image, nonce, id);
  const copy = review.plan as unknown as Array<{ args: string[] }>;
  copy[0].args.push("tamper");
  const fresh = reviewUncooperativeAdapter(image, nonce, id);
  assert.ok(!fresh.plan[0].args.includes("tamper"));
});
