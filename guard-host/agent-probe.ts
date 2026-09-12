import { execFile } from "node:child_process";
import { copyHash } from "./synthetic-copy.ts";
import { MAX_AGENT_PACKET_BYTES } from "./agent-runtime.ts";
import {
  AGENT_BOOTSTRAP, AGENT_CHECK_IDS, VERIFY_AGENT_EFFECTS, agentEnvironment,
  createAgentFixtureArgs, inspectAgentFixture, inspectAgentResult,
} from "./agent-spec.ts";
import type { DockerCommand, DockerProbeReport } from "./docker-probe.ts";
import { DockerProbeError, LOCAL_NODE_IMAGE, PROBE_LABEL, inspectEngine, inspectImage, object, ownedContainer, requireProbe } from "./docker-spec.ts";

export type DockerInputCommand = (args: readonly string[], input: Buffer, signal?: AbortSignal) => Promise<string>;
export interface OfflineAgentReport extends Omit<DockerProbeReport, "kind"> {
  kind: "phi-offline-agent-probe";
  gateway: "deferred";
}
export function executeDockerInput(executable: string, prefix: readonly string[], cwd: string, env: NodeJS.ProcessEnv): DockerInputCommand {
  return (args, input, signal) => new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DockerProbeError("DOCKER_PROBE_CANCELLED")); return; }
    if (input.length > MAX_AGENT_PACKET_BYTES) { reject(new DockerProbeError("AGENT_PACKET_TOO_LARGE")); return; }
    const child = execFile(executable, [...prefix, ...args], {
      cwd, env, encoding: "utf8", shell: false, windowsHide: true, signal,
      timeout: 15_000, maxBuffer: 128 * 1024, killSignal: "SIGKILL",
    }, (error, stdout) => {
      if (error) reject(new DockerProbeError(signal?.aborted ? "DOCKER_PROBE_CANCELLED" : "DOCKER_COMMAND_FAILED"));
      else resolve(stdout);
    });
    child.stdin?.on("error", () => { child.kill("SIGKILL"); });
    child.stdin?.end(input);
  });
}
function json(text: string): unknown {
  requireProbe(Buffer.byteLength(text) <= 128 * 1024, "DOCKER_RESPONSE_TOO_LARGE");
  try { return JSON.parse(text); } catch { throw new DockerProbeError("DOCKER_INVALID_JSON"); }
}

/** All operations and input are controller-created, never guest proposals or user commands. */
export async function probeOfflineAgent(
  run: DockerCommand, transfer: DockerInputCommand, packet: Buffer, nonce: string,
  verifyHost: () => Promise<void>, signal?: AbortSignal,
): Promise<OfflineAgentReport> {
  requireProbe(/^[a-f0-9]{32}$/.test(nonce) && packet.length > 0 && packet.length <= MAX_AGENT_PACKET_BYTES, "AGENT_PACKET_INVALID");
  const report: OfflineAgentReport = {
    version: 1, kind: "phi-offline-agent-probe", state: "locked", protection: "not-active", canLaunch: false,
    gateway: "deferred", probe: "blocked", stage: "engine", cleanup: "not-needed", containerName: `phi-phase0-${nonce}`, checks: [],
  };
  let attempted = false;
  let confirmed = false;
  const checked: DockerCommand = (args) => {
    if (signal?.aborted) throw new DockerProbeError("DOCKER_PROBE_CANCELLED");
    return run(args, signal);
  };
  try {
    report.engine = inspectEngine(json(await checked(["info", "--format",
      '{"OSType":{{json .OSType}},"OperatingSystem":{{json .OperatingSystem}},"KernelVersion":{{json .KernelVersion}},"ServerVersion":{{json .ServerVersion}}}',
    ])));
    report.stage = "local-image";
    report.imageId = inspectImage(json(await checked(["image", "inspect", "--format",
      '{"Id":{{json .Id}},"Os":{{json .Os}},"Config":{"Volumes":{{json (index .Config "Volumes")}},"OnBuild":{{json (index .Config "OnBuild")}}}}', LOCAL_NODE_IMAGE,
    ])));
    report.stage = "create";
    if (signal?.aborted) throw new DockerProbeError("DOCKER_PROBE_CANCELLED");
    attempted = true;
    const id = (await checked(createAgentFixtureArgs(report.imageId, nonce))).trim();
    requireProbe(/^[a-f0-9]{64}$/.test(id), "DOCKER_CONTAINER_ID_INVALID");
    confirmed = true;
    report.stage = "inspect-before-start";
    requireProbe(inspectAgentFixture(json(await checked(["container", "inspect", "--format", "{{json .}}", id])), nonce, report.imageId) === id, "DOCKER_OWNERSHIP_MISMATCH");
    report.stage = "start";
    requireProbe((await checked(["container", "start", id])).trim() === id, "AGENT_START_UNCONFIRMED");
    report.stage = "inspect-running";
    requireProbe(inspectAgentFixture(json(await checked(["container", "inspect", "--format", "{{json .}}", id])), nonce, report.imageId, "running") === id, "DOCKER_OWNERSHIP_MISMATCH");
    report.stage = "offline-agent";
    if (signal?.aborted) throw new DockerProbeError("DOCKER_PROBE_CANCELLED");
    const result = await transfer(["container", "exec", "--interactive", "--workdir=/workspace", id,
      "/usr/bin/env", ...agentEnvironment(), "/usr/local/bin/node", "-e", AGENT_BOOTSTRAP, copyHash(packet), nonce], packet, signal);
    inspectAgentResult(json(result), nonce);
    report.checks = [...AGENT_CHECK_IDS];
    report.stage = "independent-effects";
    const effects = object(json(await checked(["container", "exec", "--workdir=/workspace", id,
      "/usr/bin/env", ...agentEnvironment(), "/usr/local/bin/node", "-e", VERIFY_AGENT_EFFECTS])));
    requireProbe(Object.keys(effects).join(",") === "verified" && effects.verified === true, "AGENT_EFFECTS_UNCONFIRMED");
    report.checks.push("independentGuestEffects");
    report.stage = "host-stop";
    // The guest parent AND detached child ignore SIGTERM. This stop is host-owned,
    // through the engine, not dependent on a pi hook or a cooperative guest API.
    requireProbe(inspectAgentFixture(json(await checked(["container", "inspect", "--format", "{{json .}}", id])), nonce, report.imageId, "running") === id, "DOCKER_OWNERSHIP_MISMATCH");
    requireProbe((await checked(["container", "kill", "--signal=KILL", id])).trim() === id, "AGENT_STOP_UNCONFIRMED");
    requireProbe((await checked(["container", "wait", id])).trim() === "137", "AGENT_STOP_UNCONFIRMED");
    const state = object(json(await checked(["container", "inspect", "--format", "{{json .State}}", id])));
    requireProbe(state.Status === "exited" && state.Running === false && state.Pid === 0 && state.ExitCode === 137
      && state.OOMKilled === false && state.Error === "", "AGENT_STOP_UNCONFIRMED");
    report.checks.push("hostStop");
    report.probe = "passed";
    report.stage = "complete";
  } catch (error) {
    report.probe = attempted ? "failed" : "blocked";
    report.rule = error instanceof DockerProbeError ? error.rule : "AGENT_PROBE_FAILED";
  } finally {
    if (attempted) {
      try {
        // Independent deadline, never cancelled with the main run. Match all
        // ownership fields, not a name alone; never prune or remove other work.
        const ids = (await run(["container", "ls", "--all", "--no-trunc", "--filter", `label=${PROBE_LABEL}=${nonce}`, "--format", "{{.ID}}"])).trim();
        if (!ids) report.cleanup = confirmed ? "absent" : "unconfirmed";
        else {
          requireProbe(/^[a-f0-9]{64}$/.test(ids), "DOCKER_CLEANUP_AMBIGUOUS");
          const id = ownedContainer(json(await run(["container", "inspect", "--format", "{{json .}}", ids])), nonce, report.imageId!);
          requireProbe(id === ids, "DOCKER_OWNERSHIP_MISMATCH");
          await run(["container", "rm", "--force", id]);
          requireProbe((await run(["container", "ls", "--all", "--no-trunc", "--filter", `label=${PROBE_LABEL}=${nonce}`, "--format", "{{.ID}}"])).trim() === "", "DOCKER_CLEANUP_UNCONFIRMED");
          report.cleanup = "removed";
        }
      } catch { report.cleanup = "unconfirmed"; }
      if (report.cleanup === "unconfirmed") {
        report.probe = "failed";
        report.rule ??= "DOCKER_CLEANUP_UNCONFIRMED";
      }
    }
    try {
      // Run even after guest failure: a failed canary attack must not hide mutation.
      await verifyHost();
      if (report.probe === "passed") report.checks.push("hostFixturesUnchanged");
    } catch {
      report.probe = "failed";
      report.rule = "AGENT_HOST_FIXTURES_CHANGED";
      report.stage = "host-verification";
    }
  }
  return report;
}
