import { randomBytes } from "node:crypto";
import { lstat, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, win32 } from "node:path";
import { executeDocker, probeDocker } from "./docker-probe.ts";
import { DOCKER_ENDPOINT, DockerProbeError, requireProbe } from "./docker-spec.ts";

// PowerShell's npm.ps1 can consume `--`; use the explicit cmd shim on Windows.
const USAGE = `Usage: ${process.platform === "win32" ? "npm.cmd" : "npm"} run guard:probe-docker -- --docker "C:\\path\\to\\docker.exe" --confirm [--json]\n`;
export interface ProbeArguments { docker: string; json: boolean }

export function validateDockerPath(value: string): void {
  requireProbe(/^[a-z]:[\\/]/i.test(value) && !/[\x00-\x1f\x7f-\x9f:"<>|?*]/.test(value.slice(2))
    && win32.basename(value).toLowerCase() === "docker.exe"
    && !value.slice(3).split(/[\\/]/).some((part) => !part || part === "." || part === ".." || /[. ]$/.test(part)), "DOCKER_ABSOLUTE_EXE_REQUIRED");
}

export function parseProbeArguments(args: readonly string[]): ProbeArguments | "help" {
  if (args.length === 1 && args[0] === "--help") return "help";
  let docker: string | undefined;
  let confirm = false;
  let json = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--docker" && docker === undefined && i + 1 < args.length) docker = args[++i];
    else if (args[i] === "--confirm" && !confirm) confirm = true;
    else if (args[i] === "--json" && !json) json = true;
    else throw new DockerProbeError("DOCKER_INVALID_ARGUMENTS");
  }
  requireProbe(confirm && docker !== undefined, "DOCKER_EXPLICIT_PROBE_REQUIRED");
  validateDockerPath(docker);
  return { docker, json };
}

/** No inherited Docker contexts/proxies/auth helpers, cloud keys, or executable startup hooks. */
export function dockerClientEnvironment(systemRoot: string, privateTemp: string): NodeJS.ProcessEnv {
  requireProbe(/^[a-z]:[\\/]/i.test(systemRoot) && !/[\x00-\x1f\x7f-\x9f:"<>|?*]/.test(systemRoot.slice(2)), "DOCKER_SYSTEM_ROOT_REQUIRED");
  return {
    SystemRoot: systemRoot, WINDIR: systemRoot, SystemDrive: systemRoot.slice(0, 2),
    PATH: win32.join(systemRoot, "System32"),
    TEMP: privateTemp, TMP: privateTemp, HOME: privateTemp, USERPROFILE: privateTemp,
    APPDATA: privateTemp, LOCALAPPDATA: privateTemp,
  };
}

interface ProbeIO { out(text: string): void; error(text: string): void }
export async function runDockerProbeCli(args: readonly string[], io: ProbeIO): Promise<number> {
  let options: ProbeArguments | "help";
  try { options = parseProbeArguments(args); }
  catch { io.error(USAGE); return 64; }
  if (options === "help") {
    io.out(USAGE + "Opt-in Windows-only disposable Node fixture. Uses an existing local node:24-bookworm-slim image; never pulls, mounts host files, runs project code, or launches pi.\nA passing fixture is NOT Guard acceptance. See plan/Docker-Prototype.md before running.\n");
    return 0;
  }
  const fail = (rule: string) => io.error(options.json
    ? JSON.stringify({ version: 1, state: "locked", protection: "not-active", canLaunch: false, probe: "blocked", rule }) + "\n"
    : `${rule}: probe unavailable. Guard protection is NOT active.\n`);
  if (process.platform !== "win32") { fail("DOCKER_WINDOWS_HOST_REQUIRED"); return 2; }

  let root: string | undefined;
  const controller = new AbortController();
  const cancel = () => controller.abort();
  let exitCode = 1;
  process.on("SIGINT", cancel);
  process.on("SIGTERM", cancel);
  try {
    // The operator must choose a trusted installed Docker executable. A name/path
    // check is not binary signature verification or a safe host execution broker.
    const file = await lstat(options.docker);
    requireProbe(file.isFile() && !file.isSymbolicLink(), "DOCKER_REGULAR_EXE_REQUIRED");
    root = await mkdtemp(join(tmpdir(), "phi-docker-probe-"));
    const config = join(root, "docker-config");
    await mkdir(config, { mode: 0o700 });
    await writeFile(join(config, "config.json"), "{}\n", { mode: 0o600 });
    const env = dockerClientEnvironment(process.env.SystemRoot ?? "", root);
    const run = executeDocker(options.docker, ["--host", DOCKER_ENDPOINT, "--config", config], root, env);
    const report = await probeDocker(run, randomBytes(16).toString("hex"), controller.signal);
    io.out(options.json ? JSON.stringify(report, null, 2) + "\n" : [
      `Docker fixture probe: ${report.probe.toUpperCase()}`,
      "Guard remains LOCKED / protection NOT active. This is not full isolation acceptance.",
      `Stage: ${report.stage}; cleanup: ${report.cleanup}; fixture checks: ${report.checks.length}`,
      `Disposable container: ${report.containerName}`,
      ...(report.rule ? [`Rule: ${report.rule}`] : []),
      "See plan/Docker-Prototype.md for remaining tests and recovery.", "",
    ].join("\n"));
    exitCode = report.probe === "passed" ? 0 : report.probe === "blocked" ? 2 : 1;
  } catch (error) {
    fail(error instanceof DockerProbeError ? error.rule : "DOCKER_PROBE_SETUP_FAILED");
  } finally {
    try { if (root) await rm(root, { recursive: true, force: true }); }
    catch { io.error("DOCKER_TEMP_CLEANUP_UNCONFIRMED: private probe temp files may remain.\n"); exitCode = 1; }
    process.off("SIGINT", cancel);
    process.off("SIGTERM", cancel);
  }
  return exitCode;
}

if (import.meta.main) {
  process.exitCode = await runDockerProbeCli(process.argv.slice(2), {
    out: (text) => { process.stdout.write(text); },
    error: (text) => { process.stderr.write(text); },
  });
}
