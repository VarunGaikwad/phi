import assert from "node:assert/strict";
import { access, chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  CANDIDATE_COMMANDS,
  MAX_PATH_ENTRIES,
  MAX_PATH_LENGTH,
  discoverTooling,
  searchDirectories,
} from "../guard-host/discovery.ts";

// Windows cases below test path construction, not real NTFS security semantics.
test("search only absolute POSIX PATH entries and deduplicate them", () => {
  assert.deepEqual(searchDirectories("linux", "/usr/bin:.:/opt/tools::../bin:/usr/bin"), {
    directories: ["/usr/bin", "/opt/tools"], complete: false,
  });
});

test("Windows PATH supports spaces/quotes, excluding drive-relative and network/device forms", () => {
  const value = '"C:\\Program Files\\Tools";c:\\program files\\tools;C:bin;\\bin;\\\\server\\share;\\\\?\\C:\\bin;D:/tools;E:/tools:stream';
  assert.deepEqual(searchDirectories("win32", value), {
    directories: ["C:\\Program Files\\Tools", "D:\\tools"], complete: false,
  });
});

test("invalid, missing, and overlarge PATH are incomplete, never silently authoritative", () => {
  for (const value of [undefined, "", "x".repeat(MAX_PATH_LENGTH + 1)]) {
    assert.deepEqual(searchDirectories("linux", value), { directories: [], complete: false });
  }
  assert.deepEqual(searchDirectories("linux", "/safe:/bad\x00path://server/share"), {
    directories: ["/safe"], complete: false,
  });
});

test("metadata search has a fixed entry limit", async () => {
  const path = Array.from({ length: MAX_PATH_ENTRIES + 1 }, (_, i) => `/bin${i}`).join(":");
  let calls = 0;
  const result = await discoverTooling("linux", path, async () => { calls++; return "not-found"; });
  assert.equal(calls, MAX_PATH_ENTRIES * CANDIDATE_COMMANDS.length);
  assert.equal(result.search.complete, false);
  assert.equal(result.search.directoriesChecked, MAX_PATH_ENTRIES);
  assert.ok(result.commands.every((tool) => tool.availability === "unknown"));
});

test("empty PATH causes no filesystem probes and no installed/absent claims", async () => {
  const result = await discoverTooling("linux", "", async () => { throw new Error("must not probe"); });
  assert.equal(result.search.directoriesChecked, 0);
  assert.ok(result.commands.every((tool) => tool.availability === "unknown"));
});

test("not-found means absent from the searched PATH only", async () => {
  const result = await discoverTooling("linux", "/synthetic/bin", async () => "not-found");
  assert.equal(result.search.complete, true);
  assert.ok(result.commands.every((tool) => tool.availability === "not-found"));
  assert.ok(!JSON.stringify(result).includes("/synthetic"));
});

test("Windows candidate extensions are data, including cmd/bat; nothing is launched", async () => {
  const checked: string[] = [];
  const result = await discoverTooling("win32", "C:\\Tools With Spaces", async (path, platform) => {
    assert.equal(platform, "win32");
    checked.push(path);
    return path === "C:\\Tools With Spaces\\docker.cmd" ? "found" : "not-found";
  });
  assert.equal(result.commands.find((tool) => tool.command === "docker")?.availability, "found");
  assert.ok(checked.includes("C:\\Tools With Spaces\\wsl.exe"));
  assert.ok(!checked.some((path) => path.endsWith(".exe.exe") || path.endsWith(".ps1")));
  assert.ok(!JSON.stringify(result).includes("C:"));
});

test("discovery errors become unknown without disclosing error text or host paths", async () => {
  const result = await discoverTooling("linux", "/synthetic-private-bin", async () => {
    throw new Error("FAKE_PRIVATE_ERROR /synthetic-private-bin");
  });
  assert.ok(result.commands.every((tool) => tool.availability === "unknown"));
  assert.doesNotMatch(JSON.stringify(result), /FAKE_PRIVATE_ERROR|synthetic-private-bin/);
  assert.equal(result.search.complete, false);
});

test("directory counts describe actual probes, not every configured PATH entry", async () => {
  const result = await discoverTooling("linux", "/first:/second:/third", async () => "found");
  assert.equal(result.search.directoriesChecked, 1);
  assert.equal(result.search.complete, true);
});

test("a later found candidate does not conceal an earlier discovery error", async () => {
  const result = await discoverTooling("linux", "/first:/second", async (path) => path.startsWith("/first/") ? "unknown" : "found");
  assert.ok(result.commands.every((tool) => tool.availability === "found"));
  assert.equal(result.search.complete, false);
  assert.equal(result.search.directoriesChecked, 2);
});

test("a candidate can be found despite incomplete discovery, but discovery confers no trust", async () => {
  const result = await discoverTooling("linux", ".:/bin", async (path) => path === "/bin/docker" ? "found" : "unknown");
  assert.equal(result.commands[0].availability, "found");
  assert.equal(result.search.complete, false);
  assert.equal(Object.hasOwn(result, "canLaunch"), false);
});

test("real metadata-only discovery does not execute a synthetic candidate or read its output", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "phi-doctor-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const windows = process.platform === "win32";
  const candidate = join(root, windows ? "docker.cmd" : "docker");
  const marker = join(root, "must-not-exist");
  await writeFile(candidate, windows
    ? '@echo FAKE_EXECUTED>"%~dp0must-not-exist"\r\n'
    : '#!/bin/sh\nprintf FAKE_EXECUTED > "$(dirname "$0")/must-not-exist"\n');
  if (!windows) await chmod(candidate, 0o700);
  await mkdir(join(root, windows ? "podman.exe" : "podman"));

  const result = await discoverTooling(process.platform, root);
  assert.equal(result.commands[0].availability, "found");
  assert.equal(result.commands[1].availability, "not-found", "directories are not candidate executables");
  await assert.rejects(access(marker), { code: "ENOENT" });
  assert.doesNotMatch(JSON.stringify(result), /FAKE_EXECUTED|must-not-exist|phi-doctor-/);
});

test("non-executable POSIX files are not confirmed candidates", { skip: process.platform === "win32" }, async (t) => {
  const root = await mkdtemp(join(tmpdir(), "phi-doctor-mode-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "docker"), "fake", { mode: 0o600 });
  const result = await discoverTooling(process.platform, root);
  assert.equal(result.commands[0].availability, "unknown");
});
