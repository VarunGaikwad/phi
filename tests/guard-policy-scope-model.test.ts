import assert from "node:assert/strict";
import test from "node:test";
import { PolicyScopeModelError, acceptRequest, advancePolicy, createScopeAuthority, fenceScope, replaceWorkspace, requestFor, rotateToken, validateScopeAuthority } from "../guard-host/policy-scope-model.ts";

test("authority starts with a fixed bounded workspace and admitted paths", () => {
  const a = createScopeAuthority(); assert.equal(a.workspace, "workspace-00000000"); assert.equal(a.policyEpoch, 0); assert.equal(a.tokenEpoch, 0); assert.deepEqual(a.admittedPaths, ["README.md", "src/index.js"]); assert.equal(a.fenced, false);
});

test("requests bind workspace, policy epoch, token epoch and admitted path", () => { const a = createScopeAuthority(), r = requestFor(a, "README.md"); acceptRequest(a, r); assert.deepEqual(Object.keys(r).sort(), ["path", "policyEpoch", "tokenEpoch", "workspace"]); });

test("policy advance fences an old request even when its path remains admitted", () => { const a = createScopeAuthority(), r = requestFor(a, "README.md"), next = advancePolicy(a, ["README.md"]); assert.equal(next.policyEpoch, 1); assert.throws(() => acceptRequest(next, r), PolicyScopeModelError); acceptRequest(next, requestFor(next, "README.md")); });

test("workspace replacement clears paths and fences old workspace requests", () => { const a = createScopeAuthority(), r = requestFor(a, "src/index.js"), next = replaceWorkspace(a, "workspace-12345678"); assert.equal(next.admittedPaths.length, 0); assert.equal(next.tokenEpoch, 1); assert.throws(() => acceptRequest(next, r), PolicyScopeModelError); assert.throws(() => requestFor(next, "src/index.js"), PolicyScopeModelError); });

test("token rotation rejects already-issued requests without changing workspace policy", () => { const a = createScopeAuthority(), r = requestFor(a, "README.md"), next = rotateToken(a); assert.equal(next.workspace, a.workspace); assert.equal(next.policyEpoch, a.policyEpoch); assert.throws(() => acceptRequest(next, r), PolicyScopeModelError); });

test("fencing clears admission and rejects new and old requests", () => { const a = createScopeAuthority(), r = requestFor(a, "README.md"), next = fenceScope(a); assert.equal(next.fenced, true); assert.deepEqual(next.admittedPaths, []); assert.throws(() => acceptRequest(next, r), PolicyScopeModelError); assert.throws(() => requestFor(next, "README.md"), PolicyScopeModelError); });

test("unadmitted, traversal and empty paths fail closed", () => { const a = createScopeAuthority(); for (const p of ["package.json", "../README.md", "src//index.js", "", "/README.md"]) assert.throws(() => requestFor(a, p), PolicyScopeModelError); });

test("malformed requests cannot widen scope", () => { const a = createScopeAuthority(), r = requestFor(a, "README.md"); for (const bad of [{ ...r, path: "package.json" }, { ...r, workspace: "workspace-12345678" }, { ...r, policyEpoch: 1 }, { ...r, tokenEpoch: 1 }, { ...r, extra: true }]) assert.throws(() => acceptRequest(a, bad as never), PolicyScopeModelError); });

test("policy paths are bounded and returned arrays are detached", () => { const a = createScopeAuthority(), next = advancePolicy(a, ["package.json"]); assert.deepEqual(next.admittedPaths, ["package.json"]); assert.notEqual(next.admittedPaths, a.admittedPaths); for (const paths of [Array(17).fill("x"), ["../escape"], ["src//bad"]]) assert.throws(() => advancePolicy(a, paths), PolicyScopeModelError); });

test("invalid authority state remains non-authoritative", () => { const a = createScopeAuthority(); assert.throws(() => validateScopeAuthority({ ...a, policyEpoch: -1 }), PolicyScopeModelError); assert.throws(() => validateScopeAuthority({ ...a, workspace: "C:\\private" }), PolicyScopeModelError); assert.equal((a as unknown as Record<string, unknown>).authorized, undefined); });
