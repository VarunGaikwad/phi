import { randomBytes } from "node:crypto";
import { lstat, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeDocker } from "./docker-probe.ts";
import { DOCKER_ENDPOINT, DockerProbeError, requireProbe } from "./docker-spec.ts";
import { dockerClientEnvironment, parseProbeArguments } from "./probe-docker.ts";
import { probeNetwork, type NetworkReport } from "./network-probe.ts";

const USAGE = `Usage: ${process.platform === "win32" ? "npm.cmd" : "npm"} run guard:probe-network -- --docker "C:\\path\\to\\docker.exe" --confirm [--json]\n`;
export async function runNetworkCli(args: readonly string[], io: { out(text: string): void; error(text: string): void }): Promise<number> {
  let options: ReturnType<typeof parseProbeArguments>;
  try { options = parseProbeArguments(args); } catch { io.error(USAGE); return 64; }
  if (options === "help") {
    io.out(USAGE + "Opt-in Windows-only synthetic network/IPC primitive. Creates TWO hardened Node-only containers with network none. Guest-local TCP/UDP/DNS/redirect controls, documentation-only TEST-NET egress attempts, peer isolation and scoped cleanup. No host/LAN/provider services or system DNS queries; no pi, project data, mounts, installs or downloads. NOT full Guard/gateway acceptance. Read plan/Network-IPC-Prototype.md first.\n");
    return 0;
  }
  if (process.platform !== "win32") {
    io.error(options.json ? JSON.stringify({ version: 1, state: "locked", protection: "not-active", canLaunch: false,
      probe: "blocked", rule: "DOCKER_WINDOWS_HOST_REQUIRED" }) + "\n" : "DOCKER_WINDOWS_HOST_REQUIRED: network fixture blocked; Guard NOT active.\n");
    return 2;
  }
  const nonce = randomBytes(16).toString("hex"), peerNonce = randomBytes(16).toString("hex");
  let report: NetworkReport = { version: 1, kind: "phi-network-ipc-probe", coverage: "synthetic-network-ipc-only", gateway: "deferred",
    state: "locked", protection: "not-active", canLaunch: false, probe: "blocked", stage: "setup", checks: [],
    containerName: `phi-phase0-${nonce}`, peerName: `phi-phase0-${peerNonce}`, cleanup: "not-needed", peerCleanup: "not-needed" };
  let root: string | undefined;
  let hostCleanup = "not-needed";
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.on("SIGINT", cancel);
  process.on("SIGTERM", cancel);
  try {
    const executable = await lstat(options.docker);
    requireProbe(executable.isFile() && !executable.isSymbolicLink(), "DOCKER_REGULAR_EXE_REQUIRED");
    root = await mkdtemp(join(tmpdir(), "phi-network-probe-"));
    const config = join(root, "config");
    await mkdir(config, { mode: 0o700 });
    await writeFile(join(config, "config.json"), "{}\n", { mode: 0o600, flag: "wx" });
    const run = executeDocker(options.docker, ["--host", DOCKER_ENDPOINT, "--config", config], root, dockerClientEnvironment(process.env.SystemRoot ?? "", root));
    report = await probeNetwork(run, nonce, peerNonce, controller.signal);
  } catch (error) { report.rule = error instanceof DockerProbeError ? error.rule : "NETWORK_SETUP_FAILED"; }
  finally {
    if (root) {
      try {
        await rm(root, { recursive: true, force: true });
        const absent = await lstat(root).then(() => false, (error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return true; throw error; });
        requireProbe(absent, "NETWORK_TEMP_CLEANUP_UNCONFIRMED");
        hostCleanup = "removed";
      } catch { hostCleanup = "unconfirmed"; report.probe = "failed"; report.rule ??= "NETWORK_TEMP_CLEANUP_UNCONFIRMED"; }
    }
    process.off("SIGINT", cancel);
    process.off("SIGTERM", cancel);
  }
  io.out(options.json ? JSON.stringify({ ...report, hostCleanup }, null, 2) + "\n" : [
    `Network/IPC fixture: ${report.probe.toUpperCase()}; Guard LOCKED / protection NOT active.`,
    "Synthetic controls only; no packet-level, host/LAN or gateway acceptance is claimed.",
    `Stage: ${report.stage}; checks: ${report.checks.length}; primary cleanup: ${report.cleanup}; peer cleanup: ${report.peerCleanup}; temp cleanup: ${hostCleanup}`,
    `Disposable containers: ${report.containerName}, ${report.peerName}`, ...(report.rule ? [`Rule: ${report.rule}`] : []), "",
  ].join("\n"));
  return report.probe === "passed" ? 0 : report.probe === "blocked" ? 2 : 1;
}
if (import.meta.main) process.exitCode = await runNetworkCli(process.argv.slice(2), {
  out: (text) => { process.stdout.write(text); }, error: (text) => { process.stderr.write(text); },
});
