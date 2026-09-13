// Bounded static instruction reader for recorded managed IL. Never executes code.
// Not a CLR verifier, decompiler, native ABI validator or authorization service.
export interface CilOpcode { value: number; name: string; operand: string }
export interface CilInstruction { offset: number; name: string; operand?: number | string | number[] }
export class StaticCilError extends Error {
  readonly rule = "STATIC_CIL_INVALID";
  constructor() { super("STATIC_CIL_INVALID"); }
}
function need(value: unknown): asserts value { if (!value) throw new StaticCilError(); }
const FIXED: Record<string, number> = { InlineNone: 0, ShortInlineI: 1, ShortInlineVar: 1,
  InlineVar: 2, InlineI: 4, InlineI8: 8, ShortInlineR: 4, InlineR: 8,
  ShortInlineBrTarget: 1, InlineBrTarget: 4, InlineField: 4, InlineMethod: 4,
  InlineSig: 4, InlineString: 4, InlineTok: 4, InlineType: 4 };
export function decodeStaticCil(input: Uint8Array, table: readonly CilOpcode[]): CilInstruction[] {
  try {
    need(input instanceof Uint8Array && input.byteLength <= 8192 && Array.isArray(table) && table.length <= 512);
    const opcodes = new Map<number, CilOpcode>();
    for (const op of table) {
      need(op && Number.isInteger(op.value) && op.value >= 0 && op.value <= 65535 && !opcodes.has(op.value)
        && typeof op.name === "string" && /^[a-z0-9_.]{1,32}$/.test(op.name)
        && (Object.hasOwn(FIXED, op.operand) || op.operand === "InlineSwitch"));
      opcodes.set(op.value, op);
    }
    const bytes = Buffer.from(input); let offset = 0;
    const instructions: CilInstruction[] = [], targets: number[] = [];
    while (offset < bytes.length) {
      const start = offset; let code = bytes[offset++];
      if (code === 0xfe) { need(offset < bytes.length); code = 0xfe00 | bytes[offset++]; }
      const op = opcodes.get(code); need(op);
      const instruction: CilInstruction = { offset: start, name: op.name };
      if (op.operand === "InlineSwitch") {
        need(offset + 4 <= bytes.length); const count = bytes.readUInt32LE(offset); offset += 4;
        need(count <= 1024 && offset + count * 4 <= bytes.length);
        const end = offset + count * 4; const branches: number[] = [];
        while (offset < end) { branches.push(end + bytes.readInt32LE(offset)); offset += 4; }
        instruction.operand = branches; targets.push(...branches);
      } else {
        const size = FIXED[op.operand]; need(offset + size <= bytes.length);
        switch (op.operand) {
          case "ShortInlineI": instruction.operand = bytes.readInt8(offset); break;
          case "ShortInlineVar": instruction.operand = bytes.readUInt8(offset); break;
          case "InlineVar": instruction.operand = bytes.readUInt16LE(offset); break;
          case "InlineI": instruction.operand = bytes.readInt32LE(offset); break;
          case "InlineI8": instruction.operand = bytes.readBigInt64LE(offset).toString(); break;
          case "ShortInlineR": instruction.operand = String(bytes.readFloatLE(offset)); break;
          case "InlineR": instruction.operand = String(bytes.readDoubleLE(offset)); break;
          case "ShortInlineBrTarget": case "InlineBrTarget": {
            const target = offset + size + (size === 1 ? bytes.readInt8(offset) : bytes.readInt32LE(offset));
            instruction.operand = target; targets.push(target); break;
          }
          case "InlineNone": break;
          default: instruction.operand = bytes.readUInt32LE(offset);
        }
        offset += size;
      }
      instructions.push(instruction);
    }
    const boundaries = new Set(instructions.map(instruction => instruction.offset));
    need(targets.every(target => boundaries.has(target)));
    return instructions;
  } catch { throw new StaticCilError(); }
}
