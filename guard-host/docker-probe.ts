import { execFile } from "node:child_process";
import {
  CHECK_IDS, DockerProbeError, LOCAL_NODE_IMAGE, PROBE_LABEL,
  createFixtureArgs, inspectEngine, inspectFixture, inspectFixtureResult, inspectImage,
  object, ownedContainer, requireProbe,
} from "./docker-spec.ts";

export type DockerCommand = (args: readonly string[], signal?: AbortSignal) => Promise<string>;
export interface DockerProbeReport {
  version: 1;
  kind: "phi-docker-fixture-probe";
  state: "locked";
  protection: "not-active";
  canLaunch: false;
  probe: "passed" | "blocked" | "failed";
  stage: string;
  cleanup: "not-needed" | "removed" | "absent" | "unconfirmed";
  containerName: string;
  engine?: { serverVersion: string; wsl2KernelObserved: true };
  imageId?: string;
  checks: string[];
  rule?: string;
}

/** Bounded direct executable invocation. Never a shell, cmd wrapper, or CLI plugin. */
export function executeDocker(
  executable: string, prefix: readonly string[], cwd: string, env: NodeJS.ProcessEnv,
): DockerCommand {
  return (args, signal) => new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DockerProbeError("DOCKER_PROBE_CANCELLED")); return; }
    execFile(executable, [...prefix, ...args], {
      cwd, env, encoding: "utf8", shell: false, windowsHide: true,
      timeout: 15_000, maxBuffer: 128 * 1024, killSignal: "SIGKILL", signal,
    }, (error, stdout) => {
      if (error) reject(new DockerProbeError(signal?.aborted ? "DOCKER_PROBE_CANCELLED" : "DOCKER_COMMAND_FAILED"));
      else resolve(stdout);
    });
  });
}

function parseJson(text: string): unknown {
  requireProbe(Buffer.byteLength(text, "utf8") <= 128 * 1024, "DOCKER_RESPONSE_TOO_LARGE");
  try { return JSON.parse(text); }
  catch { throw new DockerProbeError("DOCKER_INVALID_JSON"); }
}

/** Fixed controller-owned operations; no workspace/path/command supplied by an agent. */
export async function probeDocker(run: DockerCommand, nonce: string, signal?: AbortSignal): Promise<DockerProbeReport> {
  requireProbe(/^[a-f0-9]{32}$/.test(nonce), "DOCKER_INVALID_NONCE");
  const report: DockerProbeReport = {
    version: 1, kind: "phi-docker-fixture-probe", state: "locked", protection: "not-active", canLaunch: false,
    probe: "blocked", stage: "engine", cleanup: "not-needed", containerName: `phi-phase0-${nonce}`, checks: [],
  };
  let creationAttempted = false;
  let creationConfirmed = false;
  const checkedRun: DockerCommand = (args) => {
    if (signal?.aborted) throw new DockerProbeError("DOCKER_PROBE_CANCELLED");
    return run(args, signal);
  };
  try {
    // Select only non-private version/platform fields. Never echo `docker info` wholesale.
    report.engine = inspectEngine(parseJson(await checkedRun(["info", "--format",
      '{"OSType":{{json .OSType}},"OperatingSystem":{{json .OperatingSystem}},"KernelVersion":{{json .KernelVersion}},"ServerVersion":{{json .ServerVersion}}}',
    ])));
    report.stage = "local-image";
    report.imageId = inspectImage(parseJson(await checkedRun(["image", "inspect", "--format",
      '{"Id":{{json .Id}},"Os":{{json .Os}},"Config":{"Volumes":{{json .Config.Volumes}},"OnBuild":{{json .Config.OnBuild}}}}', LOCAL_NODE_IMAGE,
    ])));
    // The local tag is resolved once; create is pinned by immutable image ID and cannot pull.
    report.stage = "create";
    if (signal?.aborted) throw new DockerProbeError("DOCKER_PROBE_CANCELLED");
    creationAttempted = true;
    const id = (await checkedRun(createFixtureArgs(report.imageId, nonce))).trim();
    requireProbe(/^[a-f0-9]{64}$/.test(id), "DOCKER_CONTAINER_ID_INVALID");
    creationConfirmed = true;
    report.stage = "inspect-before-start";
    const info = parseJson(await checkedRun(["container", "inspect", "--format", "{{json .}}", id]));
    requireProbe(inspectFixture(info, nonce, report.imageId) === id, "DOCKER_OWNERSHIP_MISMATCH");
    report.stage = "guest-fixture";
    inspectFixtureResult(parseJson(await checkedRun(["container", "start", "--attach", id])), nonce);
    report.stage = "inspect-exit";
    const state = object(parseJson(await checkedRun(["container", "inspect", "--format", "{{json .State}}", id])));
    requireProbe(state.Status === "exited" && state.ExitCode === 0 && state.OOMKilled === false && state.Error === "", "DOCKER_GUEST_EXIT_FAILED");
    report.checks = [...CHECK_IDS];
    report.probe = "passed";
    report.stage = "complete";
  } catch (error) {
    report.probe = creationAttempted ? "failed" : "blocked";
    report.rule = error instanceof DockerProbeError ? error.rule : "DOCKER_PROBE_FAILED";
  } finally {
    if (creationAttempted) {
      try {
        // Cleanup has its own timeout and ignores cancellation of the fixture run.
        // A timed-out create may still have reached the daemon. Locate only our nonce,
        // then independently verify name, image, label and ID before deleting anything.
        const ids = (await run(["container", "ls", "--all", "--no-trunc", "--filter", `label=${PROBE_LABEL}=${nonce}`, "--format", "{{.ID}}"])).trim();
        if (!ids) {
          report.cleanup = creationConfirmed ? "absent" : "unconfirmed";
        } else {
          requireProbe(/^[a-f0-9]{64}$/.test(ids), "DOCKER_CLEANUP_AMBIGUOUS");
          const info = parseJson(await run(["container", "inspect", "--format", "{{json .}}", ids]));
          const id = ownedContainer(info, nonce, report.imageId!);
          requireProbe(id === ids, "DOCKER_OWNERSHIP_MISMATCH");
          await run(["container", "rm", "--force", id]);
          const remaining = await run(["container", "ls", "--all", "--no-trunc", "--filter", `label=${PROBE_LABEL}=${nonce}`, "--format", "{{.ID}}"]);
          requireProbe(remaining.trim() === "", "DOCKER_CLEANUP_UNCONFIRMED");
          report.cleanup = "removed";
        }
      } catch {
        report.cleanup = "unconfirmed";
      }
      if (report.cleanup === "unconfirmed") {
        report.probe = "failed";
        // Preserve the primary error; cleanup state always remains independently visible.
        report.rule ??= "DOCKER_CLEANUP_UNCONFIRMED";
      }
    }
  }
  return report;
}
