// Strict verifier for the TWO synthetic descriptor profiles emitted by the reviewed
// PowerShell memory fixture. NOT a general Windows ACL parser or authorization API.
export const MAX_SYNTHETIC_DESCRIPTOR_BYTES = 4096;
export class WindowsDescriptorError extends Error {
  readonly rule = "WINDOWS_SYNTHETIC_DESCRIPTOR_INVALID";
  constructor() { super("WINDOWS_SYNTHETIC_DESCRIPTOR_INVALID"); }
}
function requireDescriptor(value: unknown): asserts value { if (!value) throw new WindowsDescriptorError(); }
const SYNTHETIC_SID = Buffer.from("01050000000000051500000064000000c80000002c010000e9030000", "hex");
/** Accept only the exact protected, self-relative, one-ACE synthetic profile.
 * Empty ACLs are rejected as unusable for this profile, not classified as permissive.
 * No real SID, effective access, owner override, token or namespace is evaluated.
 */
export function inspectSyntheticDescriptor(input: Uint8Array, kind: "file" | "pipe") {
  try {
    requireDescriptor(input instanceof Uint8Array && input.byteLength >= 20 && input.byteLength <= MAX_SYNTHETIC_DESCRIPTOR_BYTES);
    requireDescriptor(kind === "file" || kind === "pipe");
    const bytes = Buffer.from(input);
    requireDescriptor(bytes[0] === 1 && bytes[1] === 0 && bytes.readUInt16LE(2) === 0x9004);
    // Revision 1; SELF_RELATIVE + DACL_PRESENT + DACL_PROTECTED; no defaulted/SACL flags.
    requireDescriptor(bytes.readUInt32LE(12) === 0);
    const ranges: [number, number][] = [[0, 20]];
    const sid = (offset: number) => {
      requireDescriptor(offset >= 20 && offset % 4 === 0 && offset + SYNTHETIC_SID.length <= bytes.length);
      requireDescriptor(bytes.subarray(offset, offset + SYNTHETIC_SID.length).equals(SYNTHETIC_SID));
    };
    for (const at of [4, 8]) {
      const offset = bytes.readUInt32LE(at); sid(offset); ranges.push([offset, offset + SYNTHETIC_SID.length]);
    }
    const dacl = bytes.readUInt32LE(16);
    requireDescriptor(dacl >= 20 && dacl % 4 === 0 && dacl + 8 <= bytes.length);
    const aclSize = bytes.readUInt16LE(dacl + 2);
    requireDescriptor(aclSize === 44 && dacl + aclSize <= bytes.length && bytes[dacl] === 2 && bytes[dacl + 1] === 0
      && bytes.readUInt16LE(dacl + 4) === 1 && bytes.readUInt16LE(dacl + 6) === 0);
    const ace = dacl + 8;
    requireDescriptor(bytes[ace] === 0 && bytes[ace + 1] === 0 && bytes.readUInt16LE(ace + 2) === 36);
    const mask = bytes.readUInt32LE(ace + 4);
    requireDescriptor(mask === (kind === "file" ? 0x1f01ff : 0x12019b)); sid(ace + 8);
    ranges.push([dacl, dacl + aclSize]); ranges.sort((a, b) => a[0] - b[0]);
    requireDescriptor(ranges.at(-1)![1] === bytes.length && ranges.every((range, i) => i === 0 || range[0] === ranges[i - 1][1]));
    return { version: 1 as const, state: "locked" as const, protection: "not-active" as const,
      canLaunch: false as const, executable: false as const, gateway: "deferred" as const,
      coverage: "synthetic-descriptor-only" as const, kind, protectedDacl: true as const, explicitAceCount: 1 as const,
      nativePrivacyProven: false as const, accessCheckPerformed: false as const };
  } catch { throw new WindowsDescriptorError(); }
}
