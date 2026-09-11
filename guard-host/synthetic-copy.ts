// Offline Phase 0 experiment. NOT a production importer, approval API, or sandbox.
// The CLI creates its own source; it never accepts a project/root/path from a user or agent.
import { createHash } from "node:crypto";
import { constants, type BigIntStats } from "node:fs";
import { lstat, mkdir, mkdtemp, open, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const COPY_PATHS = ["README.md", "package.json", "src/index.js"] as const;
export const MAX_COPY_FILE_BYTES = 16 * 1024;
export const MAX_COPY_TOTAL_BYTES = 32 * 1024;
const SHARED_FILES: Readonly<Record<string, string>> = {
  "README.md": "# Synthetic project\nApproved fixture data only.\n",
  "package.json": '{"name":"phi-synthetic-fixture","private":true,"type":"module"}\n',
  "src/index.js": 'export const message = "synthetic fixture";\n',
};
const EXCLUDED_FILES: Readonly<Record<string, string>> = {
  ".env": "PHI_TEST_SECRET=SYNTHETIC_SECRET_NOT_A_CREDENTIAL\n",
  ".env.example": "SYNTHETIC_SECRET_NOT_A_CREDENTIAL\n",
  ".npmrc": "SYNTHETIC_AUTH_CONFIG_NOT_A_CREDENTIAL\n",
  ".git/config": "SYNTHETIC_GIT_CONFIG\n",
  ".git/objects/history": "SYNTHETIC_SECRET_NOT_A_CREDENTIAL\n",
  ".pi/agent/auth.json": '{"synthetic":"NOT_A_CREDENTIAL"}\n',
  ".pi/extensions/unapproved.js": 'throw new Error("SYNTHETIC_STARTUP_MUST_NOT_RUN");\n',
  "AGENTS.md": "SYNTHETIC_UNAPPROVED_CONTEXT\n",
  "SYSTEM.md": "SYNTHETIC_UNAPPROVED_SYSTEM_PROMPT\n",
  "backup.txt": "SYNTHETIC_SECRET_NOT_A_CREDENTIAL\n",
  "node_modules/unapproved/index.js": 'throw new Error("SYNTHETIC_DEPENDENCY_MUST_NOT_RUN");\n',
};

export class SyntheticCopyError extends Error {
  constructor(readonly rule: string) { super(rule); }
}
function requireCopy(value: unknown, rule: string): asserts value {
  if (!value) throw new SyntheticCopyError(rule);
}
export function copyHash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Conservative portable spelling, followed by an EXACT, controller-owned fixture allowlist. */
export function validateCopyPath(value: unknown): asserts value is string {
  requireCopy(typeof value === "string" && value.length <= 240, "COPY_PATH_DENIED");
  const parts = value.split("/");
  requireCopy(parts.every((part) => part.length >= 1 && part.length <= 64 && !/[^a-zA-Z0-9_.-]/.test(part)
    && part !== "." && part !== ".." && !part.endsWith(".")
    && !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part)), "COPY_PATH_DENIED");
  // This is not a configurable protected-path policy. Everything else is omitted,
  // including friendly-looking examples, Git objects, startup resources and backups.
  requireCopy((COPY_PATHS as readonly string[]).includes(value), "COPY_PATH_NOT_ADMITTED");
}

export interface SyntheticCopyFile { path: string; bytes: number; sha256: string; base64: string }
export interface SyntheticSnapshot {
  version: 1;
  kind: "phi-synthetic-snapshot";
  files: SyntheticCopyFile[];
}
function record(value: unknown): Record<string, unknown> {
  requireCopy(value !== null && typeof value === "object" && !Array.isArray(value), "COPY_INVALID_SNAPSHOT");
  return value as Record<string, unknown>;
}
function exactKeys(value: Record<string, unknown>, expected: string[]): void {
  requireCopy(Object.keys(value).length === expected.length && expected.every((key) => Object.hasOwn(value, key)), "COPY_INVALID_SNAPSHOT");
}

/** Revalidate the complete bounded packet before any destination filesystem effect. */
export function validateSyntheticSnapshot(value: unknown): SyntheticSnapshot {
  const packet = record(value);
  exactKeys(packet, ["version", "kind", "files"]);
  requireCopy(packet.version === 1 && packet.kind === "phi-synthetic-snapshot"
    && Array.isArray(packet.files) && packet.files.length === COPY_PATHS.length, "COPY_INVALID_SNAPSHOT");
  const seen = new Set<string>();
  let total = 0;
  const files = packet.files.map((entry: unknown) => {
    const file = record(entry);
    exactKeys(file, ["path", "bytes", "sha256", "base64"]);
    validateCopyPath(file.path);
    requireCopy(!seen.has(file.path.toLowerCase()), "COPY_DUPLICATE_PATH");
    seen.add(file.path.toLowerCase());
    requireCopy(Number.isSafeInteger(file.bytes) && (file.bytes as number) >= 0
      && (file.bytes as number) <= MAX_COPY_FILE_BYTES, "COPY_SIZE_DENIED");
    requireCopy(typeof file.base64 === "string" && file.base64.length <= 4 * Math.ceil(MAX_COPY_FILE_BYTES / 3), "COPY_SIZE_DENIED");
    const bytes = Buffer.from(file.base64, "base64");
    requireCopy(bytes.toString("base64") === file.base64 && bytes.length === file.bytes, "COPY_INVALID_ENCODING");
    requireCopy(typeof file.sha256 === "string" && /^[a-f0-9]{64}$/.test(file.sha256)
      && copyHash(bytes) === file.sha256, "COPY_HASH_MISMATCH");
    total += bytes.length;
    requireCopy(total <= MAX_COPY_TOTAL_BYTES, "COPY_SIZE_DENIED");
    return { path: file.path, bytes: bytes.length, sha256: file.sha256, base64: file.base64 };
  });
  requireCopy(COPY_PATHS.every((path) => seen.has(path.toLowerCase())), "COPY_INVALID_SNAPSHOT");
  return { version: 1, kind: "phi-synthetic-snapshot", files };
}

function sameFile(a: BigIntStats, b: BigIntStats): boolean {
  return a.dev === b.dev && a.ino === b.ino && a.mode === b.mode && a.nlink === b.nlink
    && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
}

async function readAdmittedFile(root: string, path: string): Promise<Buffer> {
  // Authorization is checked before metadata or content access to this candidate.
  validateCopyPath(path);
  const parents: Array<{ path: string; stat: BigIntStats }> = [];
  let current = root;
  const segments = path.split("/");
  for (const segment of [undefined, ...segments.slice(0, -1)]) {
    if (segment !== undefined) current = join(current, segment);
    const stat = await lstat(current, { bigint: true });
    requireCopy(!stat.isSymbolicLink() && stat.isDirectory(), "COPY_DIRECTORY_OR_LINK_DENIED");
    parents.push({ path: current, stat });
  }
  const target = join(current, segments.at(-1)!);
  const before = await lstat(target, { bigint: true });
  requireCopy(before.isFile() && !before.isSymbolicLink() && before.nlink === 1n, "COPY_FILE_OR_LINK_DENIED");
  requireCopy(before.size <= BigInt(MAX_COPY_FILE_BYTES), "COPY_SIZE_DENIED");
  // O_NOFOLLOW is additional POSIX defense only. Node's Windows APIs do NOT prove
  // handle-relative, reparse-safe traversal or eliminate ancestor replacement races.
  const flags = constants.O_RDONLY | (process.platform === "win32" ? 0 : constants.O_NOFOLLOW);
  const handle = await open(target, flags);
  try {
    requireCopy(sameFile(before, await handle.stat({ bigint: true })), "COPY_SOURCE_CHANGED");
    const buffer = Buffer.alloc(MAX_COPY_FILE_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const read = await handle.read(buffer, length, buffer.length - length, length);
      if (read.bytesRead === 0) break;
      length += read.bytesRead;
    }
    requireCopy(length <= MAX_COPY_FILE_BYTES, "COPY_SIZE_DENIED");
    requireCopy(BigInt(length) === before.size && sameFile(before, await handle.stat({ bigint: true }))
      && sameFile(before, await lstat(target, { bigint: true })), "COPY_SOURCE_CHANGED");
    for (const parent of parents) {
      requireCopy(sameFile(parent.stat, await lstat(parent.path, { bigint: true })), "COPY_SOURCE_CHANGED");
    }
    return Buffer.from(buffer.subarray(0, length));
  } finally {
    await handle.close();
  }
}

/** Internal fixture helper, not an authorized entry point for arbitrary project import. */
export async function snapshotSyntheticSource(root: string): Promise<SyntheticSnapshot> {
  const files: SyntheticCopyFile[] = [];
  // No recursive source walk; denied directories and files are never opened here.
  for (const path of COPY_PATHS) {
    const bytes = await readAdmittedFile(root, path);
    files.push({ path, bytes: bytes.length, sha256: copyHash(bytes), base64: bytes.toString("base64") });
  }
  return validateSyntheticSnapshot({ version: 1, kind: "phi-synthetic-snapshot", files });
}

/** Fresh controller-owned destination only. No merge, overwrite, link, or host apply. */
export async function materializeSyntheticSnapshot(value: unknown, destination: string): Promise<void> {
  const snapshot = validateSyntheticSnapshot(value);
  await mkdir(destination, { mode: 0o700 }); // EEXIST rejects existing files, dirs and links.
  await mkdir(join(destination, "src"), { mode: 0o700 });
  for (const file of snapshot.files) {
    await writeFile(join(destination, ...file.path.split("/")), Buffer.from(file.base64, "base64"), {
      flag: "wx", mode: 0o600,
    });
  }
}

/** Writes only literal synthetic fixtures below a newly created source directory. */
export async function createSyntheticSource(root: string): Promise<void> {
  await mkdir(root, { mode: 0o700 });
  for (const [path, content] of Object.entries({ ...SHARED_FILES, ...EXCLUDED_FILES })) {
    const parts = path.split("/");
    if (parts.length > 1) await mkdir(join(root, ...parts.slice(0, -1)), { recursive: true, mode: 0o700 });
    await writeFile(join(root, ...parts), content, { flag: "wx", mode: 0o600 });
  }
}

export const COPY_CHECK_IDS = [
  "explicitFileSet", "manifestHashes", "excludedEntriesAbsent", "copyBytesMatch",
  "copyEditDetached", "copyDeleteDetached", "sourceFixturesUnchanged",
] as const;
export interface SyntheticCopyReport {
  version: 1;
  kind: "phi-synthetic-copy-probe";
  state: "locked";
  protection: "not-active";
  canLaunch: false;
  platform: NodeJS.Platform;
  probe: "passed" | "failed";
  stage: string;
  cleanup: "not-needed" | "removed" | "unconfirmed";
  checks: string[];
  rule?: string;
}

export async function probeSyntheticCopy(): Promise<SyntheticCopyReport> {
  const report: SyntheticCopyReport = {
    version: 1, kind: "phi-synthetic-copy-probe", state: "locked", protection: "not-active", canLaunch: false,
    platform: process.platform, probe: "failed", stage: "synthetic-source", cleanup: "not-needed", checks: [],
  };
  let root: string | undefined;
  try {
    root = await mkdtemp(join(tmpdir(), "phi-synthetic-copy-"));
    const source = join(root, "source");
    const destination = join(root, "copy");
    await createSyntheticSource(source);
    report.stage = "snapshot";
    const snapshot = await snapshotSyntheticSource(source);
    requireCopy(snapshot.files.map((file) => file.path).join(",") === COPY_PATHS.join(","), "COPY_FILE_SET_MISMATCH");
    report.checks.push("explicitFileSet");
    validateSyntheticSnapshot(snapshot);
    report.checks.push("manifestHashes");
    report.stage = "materialize";
    await materializeSyntheticSnapshot(snapshot, destination);
    requireCopy((await readdir(destination)).sort().join(",") === "README.md,package.json,src"
      && (await readdir(join(destination, "src"))).join(",") === "index.js", "COPY_FILE_SET_MISMATCH");
    report.checks.push("excludedEntriesAbsent");
    for (const [path, content] of Object.entries(SHARED_FILES)) {
      requireCopy((await readFile(join(destination, ...path.split("/")), "utf8")) === content, "COPY_BYTES_MISMATCH");
    }
    report.checks.push("copyBytesMatch");
    report.stage = "detached-mutations";
    await writeFile(join(destination, "README.md"), "Synthetic copy edit, never applied to source.\n");
    requireCopy(await readFile(join(source, "README.md"), "utf8") === SHARED_FILES["README.md"], "COPY_SOURCE_MUTATED");
    report.checks.push("copyEditDetached");
    await rm(join(destination, "src", "index.js"));
    requireCopy(await readFile(join(source, "src", "index.js"), "utf8") === SHARED_FILES["src/index.js"], "COPY_SOURCE_MUTATED");
    report.checks.push("copyDeleteDetached");
    // Independent host-side verifier reads its OWN literal canaries, not personal
    // files. These reads are separate from admission, which never opens exclusions.
    for (const [path, content] of Object.entries({ ...SHARED_FILES, ...EXCLUDED_FILES })) {
      requireCopy(await readFile(join(source, ...path.split("/")), "utf8") === content, "COPY_SOURCE_MUTATED");
    }
    report.checks.push("sourceFixturesUnchanged");
    report.probe = "passed";
    report.stage = "complete";
  } catch (error) {
    report.rule = error instanceof SyntheticCopyError ? error.rule : "COPY_FIXTURE_FAILED";
  } finally {
    if (root) {
      try {
        await rm(root, { recursive: true, force: true });
        const absent = await lstat(root).then(() => false, (error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return true;
          throw error;
        });
        requireCopy(absent, "COPY_CLEANUP_UNCONFIRMED");
        report.cleanup = "removed";
      } catch {
        report.cleanup = "unconfirmed";
        report.probe = "failed";
        report.rule ??= "COPY_CLEANUP_UNCONFIRMED";
      }
    }
  }
  return report;
}
