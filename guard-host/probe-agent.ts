import { randomBytes } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectAgentRuntime } from "./agent-runtime.ts";
import { buildAgentPacket, syntheticCanaryPaths } from "./agent-spec.ts";
import { executeDockerInput, probeOfflineAgent, type OfflineAgentReport } from "./agent-probe.ts";
import { executeDocker } from "./docker-probe.ts";
import { DOCKER_ENDPOINT, DockerProbeError, requireProbe } from "./docker-spec.ts";
import { dockerClientEnvironment, parseProbeArguments } from "./probe-docker.ts";
import { createSyntheticSource, snapshotSyntheticSource, verifySyntheticSource } from "./synthetic-copy.ts";

const USAGE = `Usage: ${process.platform === "win32" ? "npm.cmd" : "npm"} run guard:probe-agent -- --docker "C:\\path\\to\\docker.exe" --confirm [--json]\n`;
interface ProbeIO { out(text: string): void; error(text: string): void }
export async function runOfflineAgentCli(args: readonly string[], io: ProbeIO): Promise<number> {
  let options: ReturnType<typeof parseProbeArguments>;
  try { options = parseProbeArguments(args); } catch { io.error(USAGE); return 64; }
  if (options === "help") {
    io.out(USAGE + "Opt-in Windows-only whole-agent OFFLINE experiment. Uses existing pinned pi 0.85.1 artifacts and the local Node image. Transfers only reviewed runtime bytes and disposable synthetic files, without host mounts, installs, downloads, credentials or host apply.\nExercises pi/tools/inline extensions, guest-only persisted sessions, transitions, cancellation, deliberate extension failures and a detached child; kills and removes the owned container. NOT Guard acceptance; gateway work remains deferred. Read plan/Offline-Agent-Prototype.md and plan/Agent-Lifecycle-Prototype.md first.\n");
    return 0;
  }
  if (process.platform !== "win32") {
    io.error(options.json ? JSON.stringify({ version: 1, state: "locked", protection: "not-active", canLaunch: false,
      probe: "blocked", gateway: "deferred", rule: "DOCKER_WINDOWS_HOST_REQUIRED" }) + "\n"
      : "DOCKER_WINDOWS_HOST_REQUIRED: offline fixture blocked; Guard is NOT active.\n");
    return 2;
  }
  const nonce = randomBytes(16).toString("hex");
  let report: OfflineAgentReport = { version: 1, kind: "phi-offline-agent-probe", state: "locked", protection: "not-active", canLaunch: false,
    gateway: "deferred", probe: "blocked", stage: "setup", cleanup: "not-needed", containerName: `phi-phase0-${nonce}`, checks: [] };
  let root: string | undefined;
  let hostCleanup: "not-needed" | "removed" | "unconfirmed" = "not-needed";
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.on("SIGINT", cancel);
  process.on("SIGTERM", cancel);
  try {
    const executable = await lstat(options.docker);
    requireProbe(executable.isFile() && !executable.isSymbolicLink(), "DOCKER_REGULAR_EXE_REQUIRED");
    // Trust/signature of this operator-selected binary is a prerequisite, not
    // something proven by the filename. No PATH execution or shell wrapper.
    report.stage = "pinned-runtime";
    const runtime = await collectAgentRuntime();
    requireProbe(!controller.signal.aborted, "DOCKER_PROBE_CANCELLED");
    root = await mkdtemp(join(tmpdir(), "phi-agent-probe-"));
    const config = join(root, "docker-config");
    await mkdir(config, { mode: 0o700 });
    await writeFile(join(config, "config.json"), "{}\n", { mode: 0o600, flag: "wx" });
    report.stage = "synthetic-source";
    const source = join(root, "source");
    await createSyntheticSource(source);
    const denied = join(root, "denied.txt");
    const canary = randomBytes(32);
    await writeFile(denied, canary, { mode: 0o600, flag: "wx" });
    const packet = buildAgentPacket(runtime, await snapshotSyntheticSource(source), nonce, syntheticCanaryPaths(denied));
    const env = dockerClientEnvironment(process.env.SystemRoot ?? "", root);
    const prefix = ["--host", DOCKER_ENDPOINT, "--config", config];
    report = await probeOfflineAgent(executeDocker(options.docker, prefix, root, env),
      executeDockerInput(options.docker, prefix, root, env), packet, nonce, async () => {
        await verifySyntheticSource(source);
        requireProbe((await readFile(denied)).equals(canary), "AGENT_HOST_FIXTURES_CHANGED");
      }, controller.signal);
  } catch (error) {
    report.rule = error instanceof DockerProbeError ? error.rule : "AGENT_PROBE_SETUP_FAILED";
  } finally {
    if (root) {
      try {
        await rm(root, { recursive: true, force: true });
        const absent = await lstat(root).then(() => false, (error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return true;
          throw error;
        });
        requireProbe(absent, "AGENT_TEMP_CLEANUP_UNCONFIRMED");
        hostCleanup = "removed";
      } catch {
        hostCleanup = "unconfirmed";
        report.probe = "failed";
        report.rule ??= "AGENT_TEMP_CLEANUP_UNCONFIRMED";
      }
    }
    process.off("SIGINT", cancel);
    process.off("SIGTERM", cancel);
  }
  io.out(options.json ? JSON.stringify({ ...report, hostCleanup }, null, 2) + "\n" : [
    `Offline agent fixture: ${report.probe.toUpperCase()}`,
    "Guard remains LOCKED / protection NOT active. Gateway acceptance is deferred.",
    `Stage: ${report.stage}; checks: ${report.checks.length}; container cleanup: ${report.cleanup}; temp cleanup: ${hostCleanup}`,
    `Disposable container: ${report.containerName}`, ...(report.rule ? [`Rule: ${report.rule}`] : []), "",
  ].join("\n"));
  return report.probe === "passed" ? 0 : report.probe === "blocked" ? 2 : 1;
}
if (import.meta.main) {
  process.exitCode = await runOfflineAgentCli(process.argv.slice(2), {
    out: (text) => { process.stdout.write(text); }, error: (text) => { process.stderr.write(text); },
  });
}
