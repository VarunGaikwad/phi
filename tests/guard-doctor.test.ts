import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { runDoctor, LOCKED_EXIT_CODE, USAGE_EXIT_CODE } from "../guard-host/doctor.ts";
import { assessPreflight } from "../guard-host/preflight.ts";

function capture() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return { stdout, stderr, io: {
    out: (text: string) => { stdout.push(text); },
    error: (text: string) => { stderr.push(text); },
  } };
}

const report = assessPreflight({
  platform: "linux", architecture: "x64", osRelease: "synthetic", nodeVersion: "v24.17.0",
}, { commands: [], search: { complete: false, directoriesChecked: 0 } });

test("text and JSON diagnostics both return a non-success status when launch is unavailable", async () => {
  for (const args of [[], ["--json"]]) {
    const output = capture();
    assert.equal(await runDoctor(args, output.io, async () => report), LOCKED_EXIT_CODE);
    assert.deepEqual(output.stderr, []);
    if (args.length) assert.deepEqual(JSON.parse(output.stdout.join("")), report);
    else assert.match(output.stdout.join(""), /LOCKED/);
  }
});

test("help is informational and does not inspect the host", async () => {
  const output = capture();
  let collected = false;
  const code = await runDoctor(["--help"], output.io, async () => { collected = true; return report; });
  assert.equal(code, 0);
  assert.equal(collected, false);
  assert.match(output.stdout.join(""), /never launches pi or enables protection/);
});

test("unknown commands, flags, and bypass attempts are rejected before collection", async () => {
  for (const args of [["start"], ["--unguarded"], ["--allow-all"], ["--json", "--help"], ["FAKE_PRIVATE_ARGUMENT"]]) {
    const output = capture();
    let collected = false;
    const code = await runDoctor(args, output.io, async () => { collected = true; return report; });
    assert.equal(code, USAGE_EXIT_CODE);
    assert.equal(collected, false);
    assert.deepEqual(output.stdout, []);
    assert.doesNotMatch(output.stderr.join(""), /FAKE_PRIVATE_ARGUMENT/);
  }
});

test("collection failure cannot produce a success or leak raw errors", async () => {
  for (const args of [[], ["--json"]]) {
    const output = capture();
    const code = await runDoctor(args, output.io, async () => { throw new Error("FAKE_CREDENTIAL_AND_PATH"); });
    assert.equal(code, 1);
    assert.deepEqual(output.stdout, []);
    assert.match(output.stderr.join(""), /PHI_PREFLIGHT_FAILED/);
    assert.doesNotMatch(output.stderr.join(""), /FAKE_CREDENTIAL_AND_PATH/);
    if (args.length) assert.equal(JSON.parse(output.stderr.join("")).canLaunch, false);
  }
});

test("actual CLI stays locked without PATH and ignores fake credential/approval environment values", () => {
  const entry = fileURLToPath(new URL("../guard-host/doctor.ts", import.meta.url));
  const result = spawnSync(process.execPath, ["--experimental-transform-types", entry, "--json"], {
    env: {
      ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
      PATH: "",
      HOME: "/synthetic-home-do-not-read",
      USERPROFILE: "C:\\synthetic-home-do-not-read",
      OPENAI_API_KEY: "FAKE_CREDENTIAL_SENTINEL",
      PI_CODING_AGENT_DIR: "/synthetic-config-do-not-read",
      PHI_GUARD_STATE: "isolated",
      PHI_GUARD_APPROVED: "true",
    },
    encoding: "utf8", timeout: 15_000, maxBuffer: 64 * 1024, windowsHide: true,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, LOCKED_EXIT_CODE);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.state, "locked");
  assert.equal(parsed.canLaunch, false);
  assert.equal(parsed.tooling.search.directoriesChecked, 0);
  assert.ok(parsed.tooling.commands.every((tool: { availability: string }) => tool.availability === "unknown"));
  assert.doesNotMatch(result.stdout + result.stderr, /FAKE_CREDENTIAL_SENTINEL|synthetic-home|synthetic-config/);
});
