// Recorded public installed-CLI evidence only. Never execute Docker or contact a daemon.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createFixtureArgs, DOCKER_ENDPOINT } from "../guard-host/docker-spec.ts";
const raw = await readFile(new URL("../plan/evidence/Docker-29.4.3-CLI-Help.json", import.meta.url), "utf8");
const evidence = JSON.parse(raw);
const expectedCommands = [["--version"], ["container", "--help"],
  ...["create", "start", "stop", "rm", "inspect", "wait"].map(command => ["container", command, "--help"]),
  ["events", "--help"], ["version", "--help"], ["info", "--help"]];
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
function help(...args: string[]): string { return evidence.commands.find((entry: { args: string[] }) => entry.args.join() === args.join()).stdout; }

test("recorded CLI evidence identifies its version and keeps every recovery gate unverified", () => {
  assert.equal(evidence.version, 1); assert.equal(evidence.kind, "docker-cli-offline-help-evidence");
  assert.equal(evidence.cliVersion, "29.4.3"); assert.equal(evidence.packagedEngineVersion, "29.4.3");
  assert.equal(evidence.desktopVersion, "4.74.0");
  assert.equal(evidence.binarySha256, "f527c90b0961cec328a9ac07bdc7530408dad89708e0502c82f1f088b3e777b4");
  assert.equal(evidence.componentsSha256, "d16b05d88f953c4d0b05c512252384270c22d36888e85cdf807a8d5efbd9211f");
  assert.equal(evidence.state, "locked"); assert.equal(evidence.protection, "not-active");
  assert.equal(evidence.canLaunch, false); assert.equal(evidence.executable, false);
  assert.equal(evidence.scope, "installed-cli-help-only"); assert.equal(evidence.apiContractVerified, false);
  assert.equal(evidence.daemonQueryPerformed, false);
});

test("record contains exactly bounded builtin help/version calls, no target operands or daemon query", () => {
  assert.ok(Buffer.byteLength(raw) <= 32 * 1024);
  assert.deepEqual(evidence.commands.map((entry: { args: string[] }) => entry.args), expectedCommands);
  assert.equal(evidence.endpointArgument, DOCKER_ENDPOINT);
  assert.equal(evidence.cleanup, "removed");
  assert.match(evidence.fixtureName, /^phi-cli-review-[a-f0-9]{32}-[a-zA-Z0-9]+$/);
  for (const entry of evidence.commands) {
    assert.equal(entry.exitCode, 0); assert.equal(typeof entry.stdout, "string");
    assert.ok(Buffer.byteLength(entry.stdout) < 24 * 1024);
    assert.equal(sha(entry.stdout), entry.stdoutSha256);
    assert.doesNotMatch(entry.stdout, /phi-cli-review-|(?:^|[\s"'])[a-z]:[\\/]/i);
  }
  assert.equal(help("--version"), "Docker version 29.4.3, build 055a478\n");
});

test("recorded CID/name/label options describe resource metadata, not operation receipts", () => {
  const create = help("container", "create", "--help");
  assert.match(create, /--cidfile string\s+Write the container ID to the file/);
  assert.match(create, /--name string\s+Assign a name to the container/);
  assert.match(create, /--label list\s+Set meta data on a container/);
  assert.match(help("container", "--help"), /commit\s+Create a new image from a container's changes/);
  // This evidence records the descriptions only; it does not synthesize a request key,
  // a committed identity receipt, a negative result, or any durable server lookup.
  assert.equal(evidence.apiContractVerified, false);
});

test("wait/events/inspect help identifies observations but no audited receipt semantics", () => {
  assert.match(help("container", "wait", "--help"), /Block until one or more containers stop, then print their exit codes/);
  assert.match(help("events", "--help"), /Get real time events from the server/);
  assert.match(help("events", "--help"), /--since string/);
  assert.match(help("container", "inspect", "--help"), /CONTAINER \[CONTAINER\.\.\.\]/);
  assert.match(help("container", "stop", "--help"), /--timeout int\s+Seconds to wait before killing the container/);
  assert.match(help("container", "rm", "--help"), /--force\s+Force the removal of a running container/);
  // Help does not supply HTTP status/body, post-return side-effect or event-retention
  // guarantees. No API schema, runtime postcondition or cancellation proof is asserted.
  assert.equal(evidence.apiContractVerified, false);
});

test("newly reviewed API-socket/auth bridge option is not added to the hardened fixture", () => {
  assert.match(help("container", "create", "--help"), /--use-api-socket\s+Bind mount Docker API socket and\s+required auth/);
  const args = createFixtureArgs("sha256:" + "a".repeat(64), "b".repeat(32));
  for (const option of ["--use-api-socket", "--cidfile", "--privileged", "--mount", "--volume", "--publish", "--env-file", "--label-file"])
    assert.equal(args.some(arg => arg === option || arg.startsWith(option + "=")), false);
  assert.ok(args.includes("--pull=never")); assert.ok(args.includes("--network=none"));
  assert.ok(args.includes("--read-only")); assert.ok(args.includes("--restart=no"));
});
