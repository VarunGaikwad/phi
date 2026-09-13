import assert from "node:assert/strict";
import test from "node:test";
import {
  UNCOOPERATIVE_PROFILE, UncooperativeDockerIntegrationError,
  planUncooperativeDockerIntegration, validateUncooperativeCleanup, validateUncooperativeDockerPlan,
} from "../guard-host/uncooperative-docker-integration.ts";
const image = "sha256:" + "a".repeat(64), nonce = "b".repeat(32), id = "c".repeat(64);

test("profile remains the existing hardened disposable profile", () => {
  assert.equal(UNCOOPERATIVE_PROFILE.user, "1000:1000"); assert.equal(UNCOOPERATIVE_PROFILE.workingDir, "/workspace");
  assert.equal(UNCOOPERATIVE_PROFILE.network, "none"); assert.equal(UNCOOPERATIVE_PROFILE.ipc, "private");
  assert.equal(UNCOOPERATIVE_PROFILE.pid, "private"); assert.equal(UNCOOPERATIVE_PROFILE.readOnly, true);
  assert.equal(UNCOOPERATIVE_PROFILE.privileged, false); assert.equal(UNCOOPERATIVE_PROFILE.noNewPrivileges, true);
  assert.equal(UNCOOPERATIVE_PROFILE.mounts, 0); assert.equal(UNCOOPERATIVE_PROFILE.devices, 0); assert.equal(UNCOOPERATIVE_PROFILE.ports, 0);
});

test("integration plan validates before guest execution and stops only after positive verification", () => {
  const plan = planUncooperativeDockerIntegration(image, nonce, id);
  assert.deepEqual(plan.map(s => s.name), ["create", "inspect-created", "start", "inspect-running", "guest", "abort", "verify", "stop", "wait", "inspect-stopped", "remove"]);
  assert.equal(plan[0].ownershipRequired, false);
  assert.ok(plan.slice(1).every(s => s.ownershipRequired));
  assert.ok(plan.slice(0, 7).every(s => s.cancellable));
  validateUncooperativeDockerPlan(plan, image, nonce, id); validateUncooperativeCleanup(plan);
});

test("create uses immutable image and exact nonce label, while later operations bind ID", () => {
  const plan = planUncooperativeDockerIntegration(image, nonce, id);
  assert.ok(plan[0].args.includes(image)); assert.ok(plan[0].args.includes("--label")); assert.ok(plan[0].args.includes(`com.preapexis.phi.phase0=${nonce}`));
  for (const s of plan.slice(1)) assert.ok(s.args.includes(id));
  assert.ok(plan[4].args.includes("/usr/local/bin/node")); assert.ok(plan[6].args.includes("/usr/local/bin/node"));
});

test("cleanup remains non-cancellable and is not skipped after experiment cancellation", () => {
  const plan = planUncooperativeDockerIntegration(image, nonce, id);
  for (const name of ["stop", "wait", "inspect-stopped", "remove"]) {
    const s = plan.find(x => x.name === name); assert.ok(s); assert.equal(s.cancellable, false); assert.equal(s.ownershipRequired, true);
  }
});

test("unsafe profile or reordered/changed commands fail closed", () => {
  const plan = planUncooperativeDockerIntegration(image, nonce, id);
  for (const mutate of [
    (p: any) => { p[0].args = [...p[0].args, "--privileged"]; },
    (p: any) => { [p[5], p[6]] = [p[6], p[5]]; },
    (p: any) => { p[10].args = ["container", "rm", "--force", "d".repeat(64)]; },
    (p: any) => { p[3].cancellable = false; },
  ]) { const changed = structuredClone(plan) as any; mutate(changed); assert.throws(() => validateUncooperativeDockerPlan(changed, image, nonce, id), UncooperativeDockerIntegrationError); }
});

test("invalid identities and broad cleanup cannot be planned", () => {
  for (const args of [["image", nonce, id], [image, "short", id], [image, nonce, "short"]])
    assert.throws(() => planUncooperativeDockerIntegration(args[0], args[1], args[2]), UncooperativeDockerIntegrationError);
  const plan = planUncooperativeDockerIntegration(image, nonce, id);
  assert.throws(() => validateUncooperativeCleanup(plan.filter(s => s.name !== "remove")), UncooperativeDockerIntegrationError);
  assert.throws(() => validateUncooperativeCleanup(plan.map(s => s.name === "remove" ? { ...s, args: ["container", "rm", "--force"] } : s)), UncooperativeDockerIntegrationError);
});

test("planner returns detached argument arrays and never adds host bridges or pruning", () => {
  const plan = planUncooperativeDockerIntegration(image, nonce, id) as unknown as Array<{ args: string[] }>;
  plan[0].args.push("--volume");
  const fresh = planUncooperativeDockerIntegration(image, nonce, id);
  assert.ok(!fresh[0].args.includes("--volume"));
  assert.ok(fresh.every(s => s.args.every(a => !a.includes("docker.sock") && !a.includes("/mnt/") && !/prune|desktop|wsl/i.test(a))));
});
