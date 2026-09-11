import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, link, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test, { type TestContext } from "node:test";
import {
  COPY_CHECK_IDS, COPY_PATHS, MAX_COPY_FILE_BYTES, MAX_COPY_TOTAL_BYTES, copyHash,
  createSyntheticSource, materializeSyntheticSnapshot, probeSyntheticCopy, snapshotSyntheticSource,
  validateCopyPath, validateSyntheticSnapshot, type SyntheticSnapshot,
} from "../guard-host/synthetic-copy.ts";
import { runCopyProbeCli } from "../guard-host/probe-copy.ts";

async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "phi-copy-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, "source");
  const destination = join(root, "copy");
  await createSyntheticSource(source);
  return { root, source, destination };
}
function replaceContent(snapshot: SyntheticSnapshot, index: number, content: Buffer): void {
  snapshot.files[index] = {
    path: snapshot.files[index].path, bytes: content.length,
    sha256: copyHash(content), base64: content.toString("base64"),
  };
}
function capture() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return { stdout, stderr, io: {
    out: (text: string) => { stdout.push(text); }, error: (text: string) => { stderr.push(text); },
  } };
}

test("copy admission accepts only the exact synthetic file list", () => {
  for (const path of COPY_PATHS) validateCopyPath(path);
  for (const path of [
    ".env", ".env.example", ".git/config", ".git/objects/history", ".pi/agent/auth.json",
    ".pi/extensions/unapproved.js", ".npmrc", "AGENTS.md", "SYSTEM.md", "backup.txt",
    "node_modules/unapproved/index.js", "other.js", "readme.md", "SRC/index.js",
  ]) assert.throws(() => validateCopyPath(path), { message: "COPY_PATH_NOT_ADMITTED" });
});

test("portable path grammar denies traversal, Windows aliases, ADS, device names and controls", () => {
  for (const path of [
    "", "/README.md", "../README.md", "src/../README.md", "./README.md", "src//index.js",
    "C:/README.md", "C:README.md", "\\\\server\\share", "\\\\?\\C:\\README.md", "src\\index.js",
    "README.md:secret", "README.md::$DATA", "README.md.", "README.md ", "src/CON.txt",
    "NUL", "con", "PRN.js", "COM1", "LPT9.txt", "SRC~1/index.js", "src/\u0000index.js", "src/\nindex.js",
    "README.md\n", "src/index.js\r\n", "\u202eREADME.md", "a".repeat(241),
  ]) assert.throws(() => validateCopyPath(path), { message: "COPY_PATH_DENIED" });
});

test("snapshot copies exact approved bytes and contains no synthetic denied content", async (t) => {
  const { source, destination } = await fixture(t);
  const snapshot = await snapshotSyntheticSource(source);
  assert.deepEqual(snapshot.files.map((file) => file.path), COPY_PATHS);
  await materializeSyntheticSnapshot(JSON.parse(JSON.stringify(snapshot)), destination);
  for (const file of snapshot.files) {
    const original = await readFile(join(source, ...file.path.split("/")));
    assert.deepEqual(await readFile(join(destination, ...file.path.split("/"))), original);
    assert.equal(file.sha256, copyHash(original));
    assert.equal(file.bytes, original.length);
    assert.doesNotMatch(Buffer.from(file.base64, "base64").toString(), /NOT_A_CREDENTIAL|SYNTHETIC_UNAPPROVED|MUST_NOT_RUN/);
  }
  for (const path of [".env", ".env.example", ".git", ".pi", "AGENTS.md", "SYSTEM.md", ".npmrc", "backup.txt", "node_modules"]) {
    await assert.rejects(access(join(destination, path)), { code: "ENOENT" });
  }
});

test("excluded junctions/symlinks contribute no entries or bytes to the snapshot", async (t) => {
  const { root, source } = await fixture(t);
  const outside = join(root, "outside-fixture");
  await mkdir(outside);
  await writeFile(join(outside, "private.txt"), "SYNTHETIC_OUTSIDE_CANARY");
  await rm(join(source, ".git"), { recursive: true });
  await symlink(outside, join(source, ".git"), process.platform === "win32" ? "junction" : "dir");
  // Checks the exported result. No recursive source walk exists in the implementation.
  const snapshot = await snapshotSyntheticSource(source);
  assert.deepEqual(snapshot.files.map((file) => file.path), COPY_PATHS);
  assert.doesNotMatch(snapshot.files.map((file) => Buffer.from(file.base64, "base64").toString()).join(""), /SYNTHETIC_OUTSIDE_CANARY/);
});

test("hard-linked admitted files are rejected on the real test filesystem", async (t) => {
  const { root, source } = await fixture(t);
  await link(join(source, "README.md"), join(root, "synthetic-hardlink"));
  assert.equal((await lstat(join(source, "README.md"))).nlink, 2);
  await assert.rejects(snapshotSyntheticSource(source), { message: "COPY_FILE_OR_LINK_DENIED" });
});

test("admitted ancestor junctions/symlinks and linked roots are rejected", async (t) => {
  const { root, source } = await fixture(t);
  const outside = join(root, "outside-fixture");
  await mkdir(outside);
  await writeFile(join(outside, "index.js"), "SYNTHETIC_OUTSIDE_CANARY");
  await rm(join(source, "src"), { recursive: true });
  await symlink(outside, join(source, "src"), process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(snapshotSyntheticSource(source), { message: "COPY_DIRECTORY_OR_LINK_DENIED" });
  const alias = join(root, "root-alias");
  await symlink(source, alias, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(snapshotSyntheticSource(alias), { message: "COPY_DIRECTORY_OR_LINK_DENIED" });
});

test("Windows alternate-stream bytes are not copied with an admitted primary stream", { skip: process.platform !== "win32" }, async (t) => {
  const { source, destination } = await fixture(t);
  const stream = join(source, "README.md") + ":phi-synthetic-canary";
  await writeFile(stream, "SYNTHETIC_ADS_CANARY");
  assert.equal(await readFile(stream, "utf8"), "SYNTHETIC_ADS_CANARY");
  const snapshot = await snapshotSyntheticSource(source);
  await materializeSyntheticSnapshot(snapshot, destination);
  assert.doesNotMatch(snapshot.files.map((file) => Buffer.from(file.base64, "base64").toString()).join(""), /SYNTHETIC_ADS_CANARY/);
  await assert.rejects(access(join(destination, "README.md") + ":phi-synthetic-canary"), { code: "ENOENT" });
});

test("directories cannot masquerade as admitted regular files", async (t) => {
  const { source } = await fixture(t);
  await rm(join(source, "README.md"));
  await mkdir(join(source, "README.md"));
  await assert.rejects(snapshotSyntheticSource(source), { message: "COPY_FILE_OR_LINK_DENIED" });
});

test("source content is bounded per file and across the complete packet", async (t) => {
  const { source } = await fixture(t);
  await writeFile(join(source, "README.md"), Buffer.alloc(MAX_COPY_FILE_BYTES + 1));
  await assert.rejects(snapshotSyntheticSource(source), { message: "COPY_SIZE_DENIED" });
  for (const path of COPY_PATHS) await writeFile(join(source, ...path.split("/")), Buffer.alloc(Math.ceil(MAX_COPY_TOTAL_BYTES / 3)));
  await assert.rejects(snapshotSyntheticSource(source), { message: "COPY_SIZE_DENIED" });
});

test("invalid packets cannot create a destination or disclose raw candidate paths", async (t) => {
  const { source, destination } = await fixture(t);
  const snapshot = await snapshotSyntheticSource(source);
  const malformed: unknown[] = [null, [], {}, { ...snapshot, version: 2 }, { ...snapshot, hostPath: "FAKE_PRIVATE_PATH" },
    { ...snapshot, files: snapshot.files.slice(1) }, { ...snapshot, files: [...snapshot.files, snapshot.files[0]] }];
  for (const patch of [
    { path: ".env" }, { path: "../../FAKE_PRIVATE_PATH" }, { symlink: "FAKE_PRIVATE_PATH" }, { bytes: -1 },
    { bytes: 0 }, { bytes: 1.5 }, { sha256: "0".repeat(64) }, { base64: "?" }, { base64: "AAAA\n" },
    { base64: "A".repeat(4 * MAX_COPY_FILE_BYTES) },
  ]) {
    const changed = structuredClone(snapshot);
    Object.assign(changed.files[0], patch);
    malformed.push(changed);
  }
  const duplicate = structuredClone(snapshot);
  duplicate.files[1] = duplicate.files[0];
  malformed.push(duplicate);
  for (const value of malformed) {
    await assert.rejects(materializeSyntheticSnapshot(value, destination), (error: Error) => {
      assert.match(error.message, /^COPY_[A-Z_]+$/);
      assert.doesNotMatch(error.message, /FAKE_PRIVATE_PATH/);
      return true;
    });
    await assert.rejects(access(destination), { code: "ENOENT" });
  }
});

test("packet validation handles binary and empty content without relaxing hash/size limits", async (t) => {
  const { source } = await fixture(t);
  const snapshot = await snapshotSyntheticSource(source);
  replaceContent(snapshot, 0, Buffer.from([0, 255, 128, 10]));
  replaceContent(snapshot, 1, Buffer.alloc(0));
  assert.deepEqual(validateSyntheticSnapshot(snapshot), snapshot);
  for (let i = 0; i < snapshot.files.length; i++) replaceContent(snapshot, i, Buffer.alloc(Math.ceil(MAX_COPY_TOTAL_BYTES / 3)));
  assert.throws(() => validateSyntheticSnapshot(snapshot), { message: "COPY_SIZE_DENIED" });
});

test("materialization refuses existing destinations rather than merging or following links", async (t) => {
  const { root, source, destination } = await fixture(t);
  const snapshot = await snapshotSyntheticSource(source);
  await mkdir(destination);
  await assert.rejects(materializeSyntheticSnapshot(snapshot, destination), { code: "EEXIST" });
  await rm(destination, { recursive: true });
  await writeFile(destination, "SYNTHETIC_KEEP");
  await assert.rejects(materializeSyntheticSnapshot(snapshot, destination), { code: "EEXIST" });
  assert.equal(await readFile(destination, "utf8"), "SYNTHETIC_KEEP");
  await rm(destination);
  await symlink(source, destination, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(materializeSyntheticSnapshot(snapshot, destination), { code: "EEXIST" });
  await assert.rejects(access(join(root, "unrequested")), { code: "ENOENT" });
});

test("actual disposable copy probe passes detached-edit checks and cleanup but stays Locked", async () => {
  const result = await probeSyntheticCopy();
  assert.equal(result.probe, "passed");
  assert.equal(result.stage, "complete");
  assert.equal(result.cleanup, "removed");
  assert.deepEqual(result.checks, COPY_CHECK_IDS);
  assert.equal(result.platform, process.platform);
  assert.equal(result.canLaunch, false);
  assert.equal(result.state, "locked");
  assert.equal(result.protection, "not-active");
  assert.doesNotMatch(JSON.stringify(result), /NOT_A_CREDENTIAL|[a-z]:[\\/]|(?:temp|tmp)[\\/]|base64|sha256/i);
});

test("copy CLI help and rejected arguments do not create fixtures", async () => {
  for (const args of [["--help"], [], ["--json"], ["--confirm", "--confirm"], ["--confirm", "--json", "--json"],
    ["--confirm", "--help"], ["--confirm", "--project", "FAKE_PRIVATE_PATH"], ["--confirm", "--allow-all"]]) {
    const output = capture();
    let ran = false;
    const result = await runCopyProbeCli(args, output.io, async () => { ran = true; throw new Error("must not run"); });
    assert.equal(ran, false);
    assert.equal(result, args[0] === "--help" ? 0 : 64);
    assert.doesNotMatch(output.stdout.join("") + output.stderr.join(""), /FAKE_PRIVATE_PATH/);
    if (result === 0) {
      assert.match(output.stdout.join(""), /NOT isolation\/admission acceptance/);
      assert.ok(output.stdout.join("").startsWith(`Usage: ${process.platform === "win32" ? "npm.cmd" : "npm"} run guard:probe-copy -- `));
    }
  }
});

test("copy CLI fails closed and redacts unexpected errors", async () => {
  for (const args of [["--confirm"], ["--confirm", "--json"]]) {
    const output = capture();
    const result = await runCopyProbeCli(args, output.io, async () => { throw new Error("FAKE_CREDENTIAL_AND_PATH"); });
    assert.equal(result, 1);
    assert.deepEqual(output.stdout, []);
    assert.match(output.stderr.join(""), /COPY_FIXTURE_FAILED/);
    assert.doesNotMatch(output.stderr.join(""), /FAKE_CREDENTIAL_AND_PATH/);
  }
});

test("actual copy CLI ignores synthetic credentials and never treats environment as launch approval", () => {
  const entry = fileURLToPath(new URL("../guard-host/probe-copy.ts", import.meta.url));
  const result = spawnSync(process.execPath, ["--experimental-transform-types", entry, "--confirm", "--json"], {
    env: {
      ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
      ...(process.env.TEMP ? { TEMP: process.env.TEMP } : {}),
      ...(process.env.TMP ? { TMP: process.env.TMP } : {}),
      PATH: "", OPENAI_API_KEY: "FAKE_CREDENTIAL_SENTINEL", PHI_GUARD_APPROVED: "true",
      HOME: "/synthetic-home-do-not-read", USERPROFILE: "C:\\synthetic-home-do-not-read",
      PI_CODING_AGENT_DIR: "/synthetic-config-do-not-read",
    },
    encoding: "utf8", timeout: 15_000, maxBuffer: 64 * 1024, windowsHide: true,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.probe, "passed");
  assert.equal(parsed.cleanup, "removed");
  assert.equal(parsed.canLaunch, false);
  assert.doesNotMatch(result.stdout + result.stderr, /FAKE_CREDENTIAL_SENTINEL|synthetic-home|synthetic-config/);
});
