import assert from "node:assert/strict";
import test from "node:test";
import { CANDIDATE_COMMANDS, type ToolingObservation } from "../guard-host/discovery.ts";
import { assessPreflight, formatPreflight, type HostObservation } from "../guard-host/preflight.ts";

const linux: HostObservation = {
  platform: "linux", architecture: "x64", osRelease: "synthetic", nodeVersion: "v24.17.0",
};
const missing: ToolingObservation = {
  commands: CANDIDATE_COMMANDS.map((command) => ({ command, availability: "not-found" })),
  search: { complete: true, directoriesChecked: 1 },
};

test("missing Windows host and backend tooling are explicit blockers", () => {
  const report = assessPreflight(linux, missing);
  assert.ok(report.blockers.some((blocker) => blocker.id === "G0_WINDOWS_HOST_REQUIRED"));
  assert.ok(report.blockers.some((blocker) => blocker.id === "G0_BACKEND_TOOLING_UNCONFIRMED"));
  assert.equal(report.state, "locked");
  assert.equal(report.protection, "not-active");
  assert.equal(report.canLaunch, false);
});

test("even Windows plus every candidate CLI cannot authorize protected launch", () => {
  const report = assessPreflight({ ...linux, platform: "win32", osRelease: "10.0.synthetic" }, {
    ...missing,
    commands: CANDIDATE_COMMANDS.map((command) => ({ command, availability: "found" })),
  });
  assert.equal(report.canLaunch, false);
  assert.equal(report.state, "locked");
  assert.deepEqual(report.validatedBackends, []);
  assert.ok(!report.blockers.some((blocker) => blocker.id === "G0_WINDOWS_HOST_REQUIRED"));
  assert.ok(report.blockers.some((blocker) => blocker.id === "G0_WINDOWS_SETUP_REQUIRED"));
  assert.ok(report.blockers.some((blocker) => blocker.id === "G0_NO_VALIDATED_BACKEND"));
  assert.ok(report.blockers.some((blocker) => blocker.id === "G0_CONTAINMENT_NOT_TESTED"));
  assert.ok(report.blockers.some((blocker) => blocker.id === "G0_PROVIDER_GATEWAY_NOT_TESTED"));
});

test("unknown tooling does not become available", () => {
  const report = assessPreflight(linux, {
    ...missing,
    commands: CANDIDATE_COMMANDS.map((command) => ({ command, availability: "unknown" })),
  });
  assert.ok(report.blockers.some((blocker) => blocker.id === "G0_BACKEND_TOOLING_UNCONFIRMED"));
  assert.equal(report.canLaunch, false);
});

test("a successful discovery is not a substitute for toolchains or protected-file policy", () => {
  const report = assessPreflight(linux, missing);
  assert.ok(report.blockers.some((blocker) => blocker.id === "G0_GUEST_TOOLCHAINS_REQUIRED"));
  assert.ok(report.blockers.some((blocker) => blocker.id === "G0_PROTECTED_POLICY_REQUIRED"));
  assert.equal(new Set(report.blockers.map((blocker) => blocker.id)).size, report.blockers.length);
});

test("plain diagnostic text warns about the current process and sanitizes OS metadata", () => {
  const text = formatPreflight(assessPreflight({ ...linux, osRelease: "bad\x1b[2J\n\r\x9b" }, missing));
  assert.match(text, /PHI Guard preflight: LOCKED/);
  assert.match(text, /Protection is NOT active/);
  assert.match(text, /does not restrict the current pi process/);
  assert.match(text, /nothing executed/);
  assert.doesNotMatch(text, /\x1b|\x9b|\r/);
});
