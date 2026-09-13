// Opt-in disposable Windows file ACL experiment. No production admission/IPC API.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { lstat, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, win32 } from "node:path";
export const ACL_ROLE_CHECKS = {
  create: ["creationTimeAllowAcl", "creationTimeDenyAcl", "createNewCollision", "collisionPreservedBytes", "collisionPreservedAcl"],
  read: ["allowReadBefore", "denyAclReadback", "denyReadAccessDenied", "allowReadAfter", "readerAclUnchanged"],
} as const;
export const ACL_CHECK_IDS = [...ACL_ROLE_CHECKS.create, ...ACL_ROLE_CHECKS.read];
export type AclRole = keyof typeof ACL_ROLE_CHECKS;
export class AclProbeError extends Error {
  constructor(readonly rule: string) { super(rule); }
}
function need(value: unknown, rule = "ACL_FIXTURE_INVALID"): asserts value { if (!value) throw new AclProbeError(rule); }
export function parseAclMessage(text: string, nonce: string, role: AclRole): { checks: string[]; failedCheck: string | null } {
  try {
    need(Buffer.byteLength(text) <= 8192 && /^[a-f0-9]{32}$/.test(nonce) && (role === "create" || role === "read"));
    const v = JSON.parse(text);
    need(text.trim() === JSON.stringify(v)); // Reject duplicate keys and noncanonical rewrites.
    need(v && Object.keys(v).sort().join() === "checks,failedCheck,nonce,role,version" && v.version === 1 && v.nonce === nonce && v.role === role);
    need(v.checks && typeof v.checks === "object" && !Array.isArray(v.checks));
    const checks = Object.keys(v.checks); const expected = ACL_ROLE_CHECKS[role];
    need(checks.length <= expected.length && checks.join() === expected.slice(0, checks.length).join()
      && checks.every(key => v.checks[key] === true));
    need(v.failedCheck === null ? checks.length === expected.length
      : (checks.length === 0 && v.failedCheck === "setup") || (checks.length < expected.length && v.failedCheck === expected[checks.length]));
    return { checks, failedCheck: v.failedCheck };
  } catch { throw new AclProbeError("ACL_WORKER_MESSAGE_INVALID"); }
}
export interface AclWorkerResult { exited: boolean; code: number | null; signal: NodeJS.Signals | null; stdout: string; error?: string }
export async function runAclWorker(root: string, nonce: string, role: AclRole, signal?: AbortSignal): Promise<AclWorkerResult> {
  need(process.platform === "win32" && /^[a-f0-9]{32}$/.test(nonce) && (role === "create" || role === "read")
    && new RegExp(`^phi-acl-${nonce}-[a-zA-Z0-9]+$`).test(win32.basename(root)), "ACL_WINDOWS_FIXTURE_REQUIRED");
  const systemRoot = process.env.SystemRoot ?? "";
  need(/^[a-z]:\\Windows$/i.test(systemRoot), "ACL_SYSTEM_ROOT_UNCONFIRMED");
  const source = await readFile(new URL("./acl-worker.ps1", import.meta.url), "utf8");
  need(!signal?.aborted, "ACL_PROBE_CANCELLED");
  return new Promise(resolve => {
    const child = spawn(win32.join(systemRoot, "System32/WindowsPowerShell/v1.0/powershell.exe"),
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", source], { cwd: root, shell: false, windowsHide: true,
        env: { SystemRoot: systemRoot, WINDIR: systemRoot, OS: "Windows_NT", TEMP: root, TMP: root, PHI_ACL_NONCE: nonce, PHI_ACL_ROLE: role },
        stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", bytes = 0, done = false, error: string | undefined;
    let grace: NodeJS.Timeout | undefined;
    const detach = (rule: string) => {
      if (done) return; done = true; clearTimeout(deadline); clearTimeout(grace); signal?.removeEventListener("abort", cancel);
      // No process termination in this scope. An unconfirmed worker keeps its fixture.
      child.stdout.destroy(); child.stderr.destroy(); child.unref();
      resolve({ exited: false, code: null, signal: null, stdout: "", error: rule });
    };
    const cancel = () => {
      error ??= "ACL_PROBE_CANCELLED";
      grace ??= setTimeout(() => detach(error!), 5000); // Allow the fixed noninteractive worker to exit normally.
    };
    const deadline = setTimeout(() => detach("ACL_WORKER_TIMEOUT"), 15000);
    signal?.addEventListener("abort", cancel, { once: true }); if (signal?.aborted) cancel();
    child.on("error", () => { error ??= "ACL_WORKER_START_FAILED"; });
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (text: string) => {
      if (done) return; bytes += Buffer.byteLength(text);
      if (bytes > 8192) { detach("ACL_WORKER_OUTPUT_LIMIT"); return; } stdout += text;
    });
    child.stderr.on("data", (data: Buffer) => {
      if (done) return; bytes += data.length; error ??= "ACL_WORKER_STDERR";
      if (bytes > 8192) detach("ACL_WORKER_OUTPUT_LIMIT");
    });
    child.once("close", (code, exitSignal) => {
      if (done) return; done = true; clearTimeout(deadline); clearTimeout(grace); signal?.removeEventListener("abort", cancel);
      resolve({ exited: true, code, signal: exitSignal, stdout, ...(error ? { error } : {}) });
    });
  });
}
// Trusted test ports only. Never populated from CLI, guest messages or saved reports.
export interface AclProbeDependencies {
  platform: string;
  createRoot(nonce: string): Promise<string>;
  writeMarker(root: string, nonce: string): Promise<void>;
  worker(root: string, nonce: string, role: AclRole, signal?: AbortSignal): Promise<AclWorkerResult>;
  removeRoot(root: string): Promise<void>;
  absent(root: string): Promise<boolean>;
}
const nativeDependencies: AclProbeDependencies = {
  platform: process.platform,
  async createRoot(nonce) {
    need(/^[a-z]:[\\/]/i.test(tmpdir()) && !tmpdir().slice(2).includes(":"), "ACL_LOCAL_TEMP_REQUIRED");
    return mkdtemp(join(tmpdir(), `phi-acl-${nonce}-`));
  },
  async writeMarker(root, nonce) {
    const stat = await lstat(root); need(stat.isDirectory() && !stat.isSymbolicLink());
    await writeFile(join(root, "owner.marker"), nonce, { flag: "wx" });
  },
  worker: runAclWorker,
  async removeRoot(root) { await rm(root, { recursive: true, force: true }); },
  async absent(root) { return lstat(root).then(() => false, (e: NodeJS.ErrnoException) => { if (e.code === "ENOENT") return true; throw e; }); },
};
export interface AclProbeReport {
  version: 1; kind: "phi-file-acl-probe"; state: "locked"; protection: "not-active"; canLaunch: false; executable: false;
  gateway: "deferred"; coverage: "synthetic-file-acl-only"; productionPrivacy: "not-proven"; crossUserIsolation: "not-tested";
  probe: "blocked" | "failed" | "passed"; stage: "setup" | AclRole | "complete"; checks: string[];
  fixtureName?: string; workerCleanup: "not-needed" | "exited" | "unconfirmed"; hostCleanup: "not-needed" | "removed" | "unconfirmed";
  failedCheck?: string; rule?: string;
}
export async function probeFileAcl(signal?: AbortSignal, deps: AclProbeDependencies = nativeDependencies): Promise<AclProbeReport> {
  const report: AclProbeReport = { version: 1, kind: "phi-file-acl-probe", state: "locked", protection: "not-active", canLaunch: false,
    executable: false, gateway: "deferred", coverage: "synthetic-file-acl-only", productionPrivacy: "not-proven", crossUserIsolation: "not-tested",
    probe: "blocked", stage: "setup", checks: [], workerCleanup: "not-needed", hostCleanup: "not-needed" };
  if (deps.platform !== "win32") return { ...report, rule: "ACL_WINDOWS_HOST_REQUIRED" };
  let root: string | undefined;
  const check = () => need(!signal?.aborted, "ACL_PROBE_CANCELLED");
  try {
    check(); const nonce = randomBytes(16).toString("hex"); root = await deps.createRoot(nonce);
    report.fixtureName = win32.basename(root); await deps.writeMarker(root, nonce); check();
    report.probe = "failed";
    for (const role of ["create", "read"] as const) {
      check(); report.stage = role; report.workerCleanup = "unconfirmed";
      const result = await deps.worker(root, nonce, role, signal);
      if (result.exited) report.workerCleanup = "exited";
      need(result.exited, result.error ?? "ACL_WORKER_EXIT_UNCONFIRMED");
      need(!result.error, result.error); need(result.signal === null, "ACL_WORKER_EXIT_INVALID");
      const message = parseAclMessage(result.stdout, nonce, role); report.checks.push(...message.checks);
      if (message.failedCheck !== null) report.failedCheck = message.failedCheck;
      need(message.failedCheck === null && result.code === 0, "ACL_WORKER_FAILED"); check();
    }
    need(report.checks.join() === ACL_CHECK_IDS.join()); report.stage = "complete"; report.probe = "passed";
  } catch (error) { report.rule = error instanceof AclProbeError ? error.rule : "ACL_PROBE_FAILED"; }
  finally {
    if (root) {
      if (report.workerCleanup === "unconfirmed") report.hostCleanup = "unconfirmed";
      else try { await deps.removeRoot(root); need(await deps.absent(root), "ACL_TEMP_ABSENCE_UNCONFIRMED"); report.hostCleanup = "removed"; }
      catch { report.hostCleanup = "unconfirmed"; }
    }
    if (report.hostCleanup === "unconfirmed" || report.workerCleanup === "unconfirmed") { report.probe = "failed"; report.rule ??= "ACL_CLEANUP_UNCONFIRMED"; }
  }
  return report;
}
