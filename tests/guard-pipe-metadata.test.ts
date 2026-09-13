import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { decodeStaticCil, type CilOpcode } from "../guard-host/static-cil.ts";
interface Method { type: string; name: string; token: number; attributes: number; signature: string; il: string }
interface Evidence {
  methods: Method[]; opcodes: CilOpcode[]; symbols: Record<string, string>;
  fields: { name: string; bytes: string }[]; imports: { entryPoint: string }[];
  targetSha256: string; [key: string]: unknown;
}
const source = await readFile(new URL("../guard-host/review-pipe-metadata.ps1", import.meta.url), "utf8");
const records = await Promise.all(["Dotnet-8", "Framework"].map(async prefix => ({ prefix,
  record: JSON.parse(await readFile(new URL(`../plan/evidence/${prefix}-Pipe-Metadata.json`, import.meta.url), "utf8")) as
    { sourceSha256: string; result: Evidence } })));
const modern = records[0].record.result, framework = records[1].record.result;
function il(e: Evidence, m: Method) { return decodeStaticCil(Buffer.from(m.il, "base64"), e.opcodes); }
function method(e: Evidence, token: number) { const m = e.methods.find(m => m.token === token); assert.ok(m); return m; }
function symbols(e: Evidence, m: Method) {
  return il(e, m).filter(i => ["call", "callvirt", "newobj", "ldfld", "stfld"].includes(i.name))
    .map(i => e.symbols[String(i.operand)] ?? "unresolved");
}
function values(e: Evidence) { return Object.fromEntries(e.fields.map(f => [f.name, Buffer.from(f.bytes, "base64").readUInt32LE()])); }
const chosen: Record<string, string[]> = {
  NamedPipeServerStream: ["Create", "ValidateParameters"],
  NamedPipeClientStream: ["TryConnect", "ValidateRemotePipeUser", "<TryConnect>g__CreateNamedPipeClient|26_0", "Connect"],
  PipeStream: ["GetSecAttrs", "GetPipePath"],
};
const constructorTokens = new Set([0x60004da, 0x60004f0, 0x60004f1]);
function render(e: Evidence) {
  const operands = new Map(e.opcodes.map(o => [o.name, o.operand]));
  const lines = ["STATIC IL ONLY; target pipe methods were NOT invoked.", "Assembly SHA256: " + e.targetSha256, ""];
  for (const m of e.methods) {
    if (!chosen[m.type.split(".").at(-1)!]?.includes(m.name) && !constructorTokens.has(m.token)) continue;
    lines.push(m.type + "::" + m.name + " token=0x" + m.token.toString(16) + " signature=" + m.signature);
    for (const i of il(e, m)) {
      let operand = i.operand;
      const symbol = /^Inline(Field|Method|Sig|String|Tok|Type)$/.test(operands.get(i.name) ?? "") && typeof operand === "number"
        ? e.symbols[String(operand)] : undefined;
      if (symbol) operand = symbol + " [0x" + (i.operand as number).toString(16) + "]";
      lines.push(i.offset.toString(16).padStart(4, "0") + "  " + i.name + (operand === undefined ? "" : " " + JSON.stringify(operand)));
    }
    lines.push("");
  }
  return lines.join("\n") + "\n";
}

test("pipe metadata records bind source, signed targets and explicitly non-executable scope", () => {
  for (const { record: r } of records) {
    assert.equal(r.sourceSha256, createHash("sha256").update(source).digest("hex"));
    const e = r.result;
    assert.equal(e.scope, "installed-assembly-static-analysis-only");
    assert.equal(e.state, "locked"); assert.equal(e.protection, "not-active"); assert.equal(e.gateway, "deferred");
    assert.equal(e.targetSignature, "Valid / Microsoft"); assert.equal(e.readerSignatures, "Valid / Microsoft");
    for (const key of ["canLaunch", "executable", "targetPipeMethodsInvoked", "targetAssemblyLoadedByReader", "listenerCreated", "identityQueried", "peerBindingProven"])
      assert.equal(e[key], false);
    assert.equal(e.symbolSelection, "overlapping-four-byte-candidates-not-call-evidence");
  }
  assert.equal(modern.targetRuntime, "8.0.15"); assert.equal(framework.targetRuntime, "Framework-4.8.9347.0");
  assert.equal(modern.targetSha256, "8e1285a55eb5d1091947b60856bdf3a29b4f65e6e3d043f7b0e96b08b2d2ca29");
  assert.equal(framework.targetSha256, "fd1097aed825d392a5dc8d19384381d4bb2a43498ea1c9d917f5d80c66600e1b");
});

test("bounded decoder walks all 219 recorded pipe method bodies without executing them", () => {
  assert.equal(modern.methods.length, 119); assert.equal(framework.methods.length, 100);
  for (const e of [modern, framework]) for (const m of e.methods) {
    const instructions = il(e, m);
    assert.equal(new Set(instructions.map(i => i.offset)).size, instructions.length);
    assert.ok(instructions.length <= Buffer.from(m.il, "base64").length);
  }
});

test("Framework enum absence is distinct from modern named first-instance support", () => {
  assert.deepEqual(values(framework), { None: 0, WriteThrough: 0x80000000, Asynchronous: 0x40000000 });
  assert.deepEqual(values(modern), { None: 0, WriteThrough: 0x80000000, Asynchronous: 0x40000000,
    CurrentUserOnly: 0x20000000, FirstPipeInstance: 0x80000 });
});

test("both installed server implementations add first-instance bit when max instances is one", () => {
  for (const [e, token, offset] of [[framework, 0x60004dd, 0], [modern, 0x60000bf, 0x87]] as const) {
    const instructions = il(e, method(e, token)); const start = instructions.findIndex(i => i.offset === offset);
    assert.deepEqual(instructions.slice(start, start + 8).map(i => i.name),
      ["ldarg.2", "ldarg.3", "ldc.i4.1", "beq.s", "ldc.i4.0", "br.s", "ldc.i4", "or"]);
    assert.equal(instructions[start + 6].operand, 0x80000);
    assert.match(symbols(e, method(e, token)).join(), /::CreateNamedPipe/);
  }
});

test("both inspected pipe-mode builders produce zero or six, not an explicit local-only bit", () => {
  for (const [e, token, offset] of [[framework, 0x60004dd, 0x15], [modern, 0x60000bf, 0x9c]] as const) {
    const instructions = il(e, method(e, token)); const start = instructions.findIndex(i => i.offset === offset);
    assert.deepEqual(instructions.slice(start, start + 7).map(i => [i.name, i.operand]),
      [["ldarg.s", 4], ["ldc.i4.2", undefined], ["shl", undefined], ["ldarg.s", 4], ["ldc.i4.1", undefined], ["shl", undefined], ["or", undefined]]);
    assert.deepEqual([0, 1].map(mode => (mode << 2) | (mode << 1)), [0, 6]);
  }
  // Static call-site evidence, NOT a native remote-client denial experiment.
});

test("inheritability is explicit security-attribute plumbing, not non-duplication proof", () => {
  for (const e of [modern, framework]) {
    const attributes = e.methods.filter(m => m.type.endsWith(".PipeStream") && m.name === "GetSecAttrs");
    assert.equal(attributes.length, 2);
    assert.ok(attributes.some(m => symbols(e, m).some(s => s.endsWith("::bInheritHandle"))));
    assert.ok(attributes.every(m => il(e, m).some(i => i.name === "and") || symbols(e, m).some(s => s.endsWith("::GetSecAttrs"))));
  }
});

test("Framework specific-rights client constructor preserves its requested mask instead of directional generic access", () => {
  const instructions = il(framework, method(framework, 0x60004f1));
  const tail = instructions.slice(-4);
  assert.deepEqual(tail.map(i => i.name), ["ldarg.0", "ldarg.3", "stfld", "ret"]);
  assert.equal(framework.symbols[String(tail[2].operand)], "System.IO.Pipes.NamedPipeClientStream::m_access");
  assert.ok(symbols(framework, method(framework, 0x60004f6)).includes("System.IO.Pipes.NamedPipeClientStream::m_access"));
  assert.ok(il(framework, method(framework, 0x60004f0)).some(i => i.name === "ldc.i4" && i.operand === 0x40000000));
});

test("current-user-only implementation compares owners and grants broad owner rights, not exact peers", () => {
  const check = method(modern, 0x60000a7); const calls = symbols(modern, check).join();
  assert.match(calls, /ObjectSecurity::GetOwner/); assert.match(calls, /WindowsIdentity::get_Owner/);
  assert.doesNotMatch(calls, /ProcessId|OpenProcess|GetProcessTimes/);
  const create = il(modern, method(modern, 0x60000bf));
  assert.ok(create.some(i => i.name === "ldc.i4" && i.operand === 0x1f019f));
  assert.notEqual(0x1f019f & 4, 0, "owner full-control includes instance creation; not a client-only permission profile");
});

test("checked managed APIs/imports do not provide exact peer PID and retained-process binding", () => {
  for (const e of [modern, framework]) {
    // Framework records an unsuffixed import name; do not pretend metadata
    // already includes the runtime's charset-dependent native symbol lookup.
    const entryPoint = e === framework ? "CreateNamedPipe" : "CreateNamedPipeW";
    assert.ok(e.imports.some(i => i.entryPoint === entryPoint));
    assert.equal(e.imports.some(i => /GetNamedPipe(Client|Server)ProcessId|OpenProcess|GetProcessTimes/.test(i.entryPoint)), false);
    assert.equal(e.methods.some(m => (m.attributes & 7) === 6 && /ProcessId|ProcessHandle/.test(m.name)), false);
    assert.ok(e.methods.some(m => m.name === "RunAsClient"));
  }
  // This bounded inventory does NOT assert global absence of Win32 mechanisms.
});

test("selected IL evidence is reproducible from raw bodies and real token operands", async () => {
  for (const { prefix, record } of records)
    assert.equal(render(record.result), await readFile(new URL(`../plan/evidence/${prefix}-Pipe-Selected-IL.txt`, import.meta.url), "utf8"));
});

test("static decoder handles signed constants, two-byte opcodes and branches without evaluation", () => {
  assert.deepEqual(decodeStaticCil(Buffer.from([0x1f, 0x80, 0x20, 255, 255, 255, 255, 0xfe, 1, 0x2a]), modern.opcodes),
    [{ offset: 0, name: "ldc.i4.s", operand: -128 }, { offset: 2, name: "ldc.i4", operand: -1 }, { offset: 7, name: "ceq" }, { offset: 9, name: "ret" }]);
  assert.deepEqual(decodeStaticCil(Buffer.from([0x2b, 0xfe]), modern.opcodes), [{ offset: 0, name: "br.s", operand: 0 }]);
  assert.deepEqual(decodeStaticCil(Buffer.from([0x45, 1, 0, 0, 0, 0, 0, 0, 0, 0x2a]), modern.opcodes),
    [{ offset: 0, name: "switch", operand: [9] }, { offset: 9, name: "ret" }]);
  const long = Buffer.from([0x21, 255, 255, 255, 255, 255, 255, 255, 255, 0x2a]);
  assert.equal(decodeStaticCil(long, modern.opcodes)[0].operand, "-1");
});

test("static decoder rejects truncation, unknown opcodes, oversized bodies/switches and invalid branch targets", () => {
  for (const bytes of [Buffer.alloc(8193), Buffer.from([0xfe]), Buffer.from([0xfe, 0xff]),
    Buffer.from([0x20, 1]), Buffer.from([0x45, 255, 255, 255, 255]), Buffer.from([0x45, 1, 0, 0, 0]),
    Buffer.from([0x2b, 127, 0x2a]), Buffer.from([0x2b, 1, 0x20, 0, 0, 0, 0, 0x2a])])
    assert.throws(() => decodeStaticCil(bytes, modern.opcodes), { rule: "STATIC_CIL_INVALID" });
  assert.throws(() => decodeStaticCil(null as unknown as Uint8Array, modern.opcodes), { rule: "STATIC_CIL_INVALID" });
});

test("static decoder rejects ambiguous operand tables and isolates returned data", () => {
  for (const table of [[modern.opcodes[0], modern.opcodes[0]], [{ value: 1, name: "break", operand: "constructor" }],
    [{ value: -1, name: "ret", operand: "InlineNone" }], Array(513).fill(modern.opcodes[0])])
    assert.throws(() => decodeStaticCil(Buffer.alloc(0), table), { rule: "STATIC_CIL_INVALID" });
  const bytes = Buffer.from([0x45, 1, 0, 0, 0, 0, 0, 0, 0, 0x2a]); const snapshot = Buffer.from(bytes);
  const decoded = decodeStaticCil(bytes, modern.opcodes); (decoded[0].operand as number[])[0] = 0;
  assert.deepEqual(bytes, snapshot); assert.deepEqual(decodeStaticCil(bytes, modern.opcodes)[0].operand, [9]);
});
