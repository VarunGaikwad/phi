import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { win32 } from "node:path";
import test from "node:test";
import { inspectSyntheticDescriptor, MAX_SYNTHETIC_DESCRIPTOR_BYTES } from "../guard-host/windows-security-descriptor.ts";
const record = JSON.parse(await readFile(new URL("../plan/evidence/Windows-Security-API-Memory.json", import.meta.url), "utf8"));
const source = await readFile(new URL("../guard-host/review-windows-security.ps1", import.meta.url), "utf8");
const evidence = record.result;
const file = Buffer.from(evidence.descriptors.file, "base64");
const pipe = Buffer.from(evidence.descriptors.pipe, "base64");
function invalid(bytes: Uint8Array, kind: "file" | "pipe" = "file") {
  assert.throws(() => inspectSyntheticDescriptor(bytes, kind), { rule: "WINDOWS_SYNTHETIC_DESCRIPTOR_INVALID" });
}
function changed(change: (bytes: Buffer) => void) { const bytes = Buffer.from(file); change(bytes); return bytes; }

test("Windows memory evidence binds the reviewed source and explicitly makes no OS access claim", () => {
  assert.equal(createHash("sha256").update(source).digest("hex"), record.sourceSha256);
  assert.equal(evidence.scope, "reflection-and-synthetic-memory-only");
  assert.equal(evidence.powershell, "5.1.26100.9444"); assert.equal(evidence.clr, "4.0.30319.42000");
  for (const key of ["canLaunch", "executable", "fileCreated", "pipeCreated", "realIdentityRead", "accessCheckPerformed", "nativePrivacyProven"])
    assert.equal(evidence[key], false);
  assert.equal(evidence.state, "locked"); assert.equal(evidence.protection, "not-active"); assert.equal(evidence.gateway, "deferred");
});

test("independent byte verifier accepts only the two emitted synthetic profiles and stays locked", () => {
  for (const kind of ["file", "pipe"] as const) {
    const decision = inspectSyntheticDescriptor(Buffer.from(evidence.descriptors[kind], "base64"), kind);
    assert.deepEqual(decision, { version: 1, state: "locked", protection: "not-active", canLaunch: false,
      executable: false, gateway: "deferred", coverage: "synthetic-descriptor-only", kind,
      protectedDacl: true, explicitAceCount: 1, nativePrivacyProven: false, accessCheckPerformed: false });
  }
});

test("Framework reflection is not replaced by newer reference-pack pipe options", () => {
  assert.deepEqual(evidence.pipeOptions, ["None", "Asynchronous", "WriteThrough"]);
  assert.equal(evidence.pipeOptions.includes("CurrentUserOnly"), false);
  assert.equal(evidence.pipeOptions.includes("FirstPipeInstance"), false);
  assert.match(evidence.fileSecurityConstructors.join(), /FileSystemRights.*FileSecurity/);
  assert.match(evidence.pipeSecurityConstructors.join(), /PipeSecurity.*HandleInheritability/);
  assert.equal(evidence.fileHandleAclRead, true); assert.equal(evidence.pipeHandleAclRead, true);
  assert.doesNotMatch(evidence.pipePeerMethods.join(), /ProcessId/);
  assert.match(evidence.pipePeerMethods.join(), /RunAsClient/);
});

test("pipe full-control includes server-instance creation unlike the explicit read/write ACE", () => {
  assert.equal(evidence.fileRuleMask, 0x1f01ff); assert.equal(evidence.pipeRuleMask, 0x12019b);
  assert.equal(evidence.pipeFullControlIncludesCreateInstance, true);
  assert.equal(evidence.pipeReadWriteIncludesCreateInstance, false);
  assert.equal(evidence.pipeRuleMask & 4, 0); assert.notEqual(evidence.pipeRuleMask & 0x100000, 0);
  // Mask inspection does NOT evaluate owner rights or prove an endpoint is private.
});

test("native-generated null and empty DACLs are distinct, and neither meets the usable fixture profile", () => {
  const absent = Buffer.from(evidence.descriptors.nullDacl, "base64");
  const empty = Buffer.from(evidence.descriptors.emptyDacl, "base64");
  assert.equal(absent.readUInt32LE(16), 0); assert.notEqual(empty.readUInt32LE(16), 0);
  assert.equal(absent.readUInt16LE(2) & 4, 4, "DACL_PRESENT alone does not prove a non-null ACL");
  assert.equal(empty.readUInt16LE(empty.readUInt32LE(16) + 4), 0);
  const protectedNull = Buffer.from(absent); protectedNull.writeUInt16LE(0x9004, 2);
  invalid(absent); invalid(protectedNull); invalid(empty);
});

test("all truncations of either native descriptor fail with a bounded rule", () => {
  for (const [bytes, kind] of [[file, "file"], [pipe, "pipe"]] as const)
    for (let length = 0; length < bytes.length; length++) invalid(bytes.subarray(0, length), kind);
});

test("oversized/non-byte input and unknown profiles cannot widen acceptance", () => {
  invalid(Buffer.alloc(MAX_SYNTHETIC_DESCRIPTOR_BYTES + 1));
  invalid(null as unknown as Uint8Array); invalid({} as Uint8Array);
  assert.throws(() => inspectSyntheticDescriptor(file, "service" as "file"), { rule: "WINDOWS_SYNTHETIC_DESCRIPTOR_INVALID" });
});

test("self-relative/protected/present bits, revision and reserved header bytes are mandatory", () => {
  for (const flags of [0, 0x8000, 0x8004, 0x1004, 0x9014, 0x9005]) invalid(changed(b => b.writeUInt16LE(flags, 2)));
  invalid(changed(b => { b[0] = 2; })); invalid(changed(b => { b[1] = 1; }));
  invalid(changed(b => b.writeUInt32LE(20, 12)));
});

test("descriptor offsets reject aliasing, wraparound, misalignment and unreferenced bytes", () => {
  for (const at of [4, 8, 16]) for (const offset of [0, 4, 21, 0xfffffffc]) invalid(changed(b => b.writeUInt32LE(offset, at)));
  invalid(changed(b => b.writeUInt32LE(b.readUInt32LE(4), 8)));
  invalid(Buffer.concat([file, Buffer.alloc(4)]));
  const padded = Buffer.concat([file.subarray(0, 76), Buffer.alloc(4), file.subarray(76)]);
  padded.writeUInt32LE(80, 16); invalid(padded);
});

test("extra/defaulted/inherited ACEs, broad rights and any different SID fail closed", () => {
  const acl = file.readUInt32LE(16); const ace = acl + 8;
  for (const change of [
    (b: Buffer) => { b[acl] = 4; }, (b: Buffer) => { b[acl + 1] = 1; },
    (b: Buffer) => b.writeUInt16LE(48, acl + 2), (b: Buffer) => b.writeUInt16LE(2, acl + 4),
    (b: Buffer) => b.writeUInt16LE(1, acl + 6), (b: Buffer) => { b[ace] = 1; },
    (b: Buffer) => { b[ace + 1] = 0x10; }, (b: Buffer) => b.writeUInt16LE(40, ace + 2),
    (b: Buffer) => b.writeUInt32LE(0xffffffff, ace + 4), (b: Buffer) => { b[ace + 8] = 2; },
    (b: Buffer) => { b[20 + 24] ^= 1; }, (b: Buffer) => { b[48 + 24] ^= 1; },
    (b: Buffer) => { b[ace + 8 + 24] ^= 1; },
  ]) invalid(changed(change));
});

test("file and pipe profiles are not interchangeable and verification preserves input bytes", () => {
  invalid(file, "pipe"); invalid(pipe, "file");
  const original = Buffer.from(file); inspectSyntheticDescriptor(file, "file"); assert.deepEqual(file, original);
});

test("native PowerShell reproduces only in-memory descriptors without creating secured objects", { skip: process.platform !== "win32" }, () => {
  const output = execFileSync(win32.join(process.env.SystemRoot!, "System32/WindowsPowerShell/v1.0/powershell.exe"),
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", source], { encoding: "utf8", timeout: 10000,
      maxBuffer: 16384, windowsHide: true, shell: false, env: { SystemRoot: process.env.SystemRoot, OS: "Windows_NT" }, stdio: ["ignore", "pipe", "pipe"] });
  const live = JSON.parse(output); assert.deepEqual(live.descriptors, evidence.descriptors);
  for (const key of ["fileCreated", "pipeCreated", "realIdentityRead", "accessCheckPerformed", "nativePrivacyProven", "canLaunch", "executable"])
    assert.equal(live[key], false);
  for (const kind of ["file", "pipe"] as const) inspectSyntheticDescriptor(Buffer.from(live.descriptors[kind], "base64"), kind);
});
