import { randomBytes } from "node:crypto";
import { lstat, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeDocker } from "./docker-probe.ts";
import { DOCKER_ENDPOINT, DockerProbeError, requireProbe } from "./docker-spec.ts";
import { dockerClientEnvironment, parseProbeArguments } from "./probe-docker.ts";
import { probeWorkerLoss, type RecoveryReport } from "./recovery-probe.ts";
import { startRecoveryWorker } from "./recovery-worker-client.ts";

const USAGE = `Usage: ${process.platform === "win32" ? "npm.cmd" : "npm"} run guard:probe-recovery -- --docker "C:\\path\\to\\docker.exe" --confirm [--json]\n`;
export async function runRecoveryCli(args: readonly string[], io: { out(text: string): void; error(text: string): void }): Promise<number> {
  let options: ReturnType<typeof parseProbeArguments>;
  try { options = parseProbeArguments(args); } catch { io.error(USAGE); return 64; }
  if (options === "help") {
    io.out(USAGE + "Opt-in Windows-only controller WORKER-loss primitive. Force-kills only a disposable host worker created by this runner, then independently stops/removes its hardened Node container. No pi, project data, mounts, installs, downloads, credentials or network requests. A surviving supervisor is REQUIRED; not crash-resilient production recovery or Guard acceptance. Read plan/Worker-Loss-Prototype.md first.\n");
    return 0;
  }
  if (process.platform !== "win32") {
    io.error(options.json ? JSON.stringify({ version: 1, state: "locked", protection: "not-active", canLaunch: false,
      probe: "blocked", rule: "DOCKER_WINDOWS_HOST_REQUIRED" }) + "\n" : "DOCKER_WINDOWS_HOST_REQUIRED: recovery fixture blocked; Guard NOT active.\n");
    return 2;
  }
  const nonce = randomBytes(16).toString("hex");
  let report: RecoveryReport = { version: 1, kind: "phi-worker-loss-probe", coverage: "worker-loss-only", gateway: "deferred",
    state: "locked", protection: "not-active", canLaunch: false, probe: "blocked", stage: "setup", checks: [],
    containerName: `phi-phase0-${nonce}`, cleanup: "not-needed", workerCleanup: "not-needed" };
  let root: string | undefined;
  let hostCleanup = "not-needed";
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.on("SIGINT", cancel);
  process.on("SIGTERM", cancel);
  try {
    const executable = await lstat(options.docker);
    requireProbe(executable.isFile() && !executable.isSymbolicLink(), "DOCKER_REGULAR_EXE_REQUIRED");
    root = await mkdtemp(join(tmpdir(), "phi-recovery-probe-"));
    const config = join(root, "config");
    await mkdir(config, { mode: 0o700 });
    await writeFile(join(config, "config.json"), "{}\n", { mode: 0o600, flag: "wx" });
    const env = dockerClientEnvironment(process.env.SystemRoot ?? "", root);
    const run = executeDocker(options.docker, ["--host", DOCKER_ENDPOINT, "--config", config], root, env);
    report = await probeWorkerLoss(run, (imageId, id) => startRecoveryWorker(options.docker, root!, nonce, imageId, id, env, controller.signal), nonce, controller.signal);
  } catch (error) { report.rule = error instanceof DockerProbeError ? error.rule : "RECOVERY_SETUP_FAILED"; }
  finally {
    if (root) {
      try {
        await rm(root, { recursive: true, force: true });
        const absent = await lstat(root).then(() => false, (error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return true; throw error; });
        requireProbe(absent, "RECOVERY_TEMP_CLEANUP_UNCONFIRMED");
        hostCleanup = "removed";
      } catch { hostCleanup = "unconfirmed"; report.probe = "failed"; report.rule ??= "RECOVERY_TEMP_CLEANUP_UNCONFIRMED"; }
    }
    process.off("SIGINT", cancel);
    process.off("SIGTERM", cancel);
  }
  io.out(options.json ? JSON.stringify({ ...report, hostCleanup }, null, 2) + "\n" : [
    `Worker-loss fixture: ${report.probe.toUpperCase()}; Guard LOCKED / protection NOT active.`,
    "Guest survival after worker loss is an expected limitation; recovery requires the surviving supervisor.",
    `Stage: ${report.stage}; checks: ${report.checks.length}; worker cleanup: ${report.workerCleanup}; container cleanup: ${report.cleanup}; temp cleanup: ${hostCleanup}`,
    `Disposable container: ${report.containerName}`, ...(report.rule ? [`Rule: ${report.rule}`] : []), "",
  ].join("\n"));
  return report.probe === "passed" ? 0 : report.probe === "blocked" ? 2 : 1;
}
if (import.meta.main) process.exitCode = await runRecoveryCli(process.argv.slice(2), {
  out: (text) => { process.stdout.write(text); }, error: (text) => { process.stderr.write(text); },
});
