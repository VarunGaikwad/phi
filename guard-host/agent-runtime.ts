// Phase 0 only: fixed installed vendor artifacts, never a general workspace exporter.
import { constants } from "node:fs";
import { lstat, open, readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { copyHash, type SyntheticCopyFile } from "./synthetic-copy.ts";
import { requireProbe } from "./docker-spec.ts";

const here = dirname(fileURLToPath(import.meta.url));
const installedPi = join(here, "..", "node_modules", "@earendil-works", "pi-coding-agent");
export const MAX_AGENT_PACKET_BYTES = 16 * 1024 * 1024;
const MAX_RUNTIME_BYTES = 12 * 1024 * 1024;
const PI_PACKAGE = "node_modules/@earendil-works/pi-coding-agent/package.json";
interface RuntimeEntry { source: string; path: string; bytes: number; sha256: string }

export function validateRuntimePath(path: string): void {
  requireProbe(typeof path === "string" && path.length <= 240
    && path.split("/").every((part) => /^[a-zA-Z0-9_@.-]+$/.test(part) && part !== "." && part !== ".." && !part.endsWith(".")), "AGENT_RUNTIME_PATH_DENIED");
}

/** Fixed content pin checked before export. No import(), npm hook, binary or vendor code execution. */
export async function readPinnedRuntimeFile(root: string, entry: RuntimeEntry): Promise<Buffer> {
  validateRuntimePath(entry.source);
  requireProbe(Number.isSafeInteger(entry.bytes) && entry.bytes > 0 && entry.bytes <= 5 * 1024 * 1024
    && /^[a-f0-9]{64}$/.test(entry.sha256), "AGENT_RUNTIME_PIN_INVALID");
  let current = root;
  const parts = entry.source.split("/");
  for (const part of [undefined, ...parts.slice(0, -1)]) {
    if (part !== undefined) current = join(current, part);
    const stat = await lstat(current);
    requireProbe(stat.isDirectory() && !stat.isSymbolicLink(), "AGENT_RUNTIME_LINK_DENIED");
  }
  const path = join(current, parts.at(-1)!);
  const before = await lstat(path, { bigint: true });
  requireProbe(before.isFile() && !before.isSymbolicLink() && before.nlink === 1n
    && before.size === BigInt(entry.bytes), "AGENT_RUNTIME_FILE_DENIED");
  const file = await open(path, constants.O_RDONLY | (process.platform === "win32" ? 0 : constants.O_NOFOLLOW));
  try {
    const opened = await file.stat({ bigint: true });
    requireProbe(opened.dev === before.dev && opened.ino === before.ino && opened.size === before.size && opened.nlink === 1n, "AGENT_RUNTIME_CHANGED");
    const bytes = Buffer.alloc(entry.bytes + 1);
    let length = 0;
    while (length < bytes.length) {
      const result = await file.read(bytes, length, bytes.length - length, length);
      if (!result.bytesRead) break;
      length += result.bytesRead;
    }
    const after = await file.stat({ bigint: true });
    const data = bytes.subarray(0, length);
    requireProbe(length === entry.bytes && after.size === before.size && after.mtimeNs === before.mtimeNs
      && after.ctimeNs === before.ctimeNs && copyHash(data) === entry.sha256, "AGENT_RUNTIME_PIN_MISMATCH");
    return data;
  } finally { await file.close(); }
}

export function runtimeFile(path: string, bytes: Buffer): SyntheticCopyFile {
  validateRuntimePath(path);
  return { path, bytes: bytes.length, sha256: copyHash(bytes), base64: bytes.toString("base64") };
}

export async function collectAgentRuntime(): Promise<SyntheticCopyFile[]> {
  // This inventory is reviewed source, not generated afresh from whatever happens to be installed.
  const inventory = JSON.parse(await readFile(join(here, "agent-runtime-inventory.json"), "utf8")) as {
    version: number; piVersion: string; files: RuntimeEntry[];
  };
  requireProbe(inventory.version === 1 && inventory.piVersion === "0.85.1"
    && inventory.files.length === 382, "AGENT_RUNTIME_INVENTORY_INVALID");
  const files: SyntheticCopyFile[] = [];
  let total = 0;
  const seen = new Set<string>();
  for (const entry of inventory.files) {
    validateRuntimePath(entry.path);
    requireProbe(!seen.has(entry.path.toLowerCase()), "AGENT_RUNTIME_DUPLICATE");
    seen.add(entry.path.toLowerCase());
    total += entry.bytes;
    requireProbe(total <= MAX_RUNTIME_BYTES, "AGENT_RUNTIME_TOO_LARGE");
    let bytes = await readPinnedRuntimeFile(installedPi, entry);
    if (entry.path === PI_PACKAGE) {
      // Version-pinned distribution adapter: upstream's bundled SDK exposes the
      // same public exports but is not the normal npm SDK entry. No code patches.
      const metadata = JSON.parse(bytes.toString("utf8"));
      requireProbe(metadata.name === "@earendil-works/pi-coding-agent" && metadata.version === "0.85.1", "AGENT_RUNTIME_VERSION_DENIED");
      bytes = Buffer.from(JSON.stringify({ name: metadata.name, version: metadata.version, type: "module",
        piConfig: { configDir: ".pi" }, main: "./dist/bundle/index.js", exports: { ".": "./dist/bundle/index.js" } }));
    }
    files.push(runtimeFile(entry.path, bytes));
  }
  // Transpile only our own trusted fixture; vendor artifacts are transferred verbatim.
  const source = await readFile(join(here, "guest", "offline-agent.ts"), "utf8");
  files.push(runtimeFile("fixture.mjs", Buffer.from(stripTypeScriptTypes(source))));
  return files;
}
