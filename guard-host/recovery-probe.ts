import type { DockerCommand, DockerProbeReport } from "./docker-probe.ts";
import { DockerProbeError, LOCAL_NODE_IMAGE, PROBE_LABEL, inspectEngine, inspectImage, object, ownedContainer, requireProbe } from "./docker-spec.ts";
import { checkHeartbeat, createRecoveryArgs, heartbeatArgs, inspectRecovery, recoveryJson } from "./recovery-spec.ts";
import type { RecoveryWorker } from "./recovery-worker-client.ts";

export interface RecoveryReport extends Omit<DockerProbeReport, "kind"> {
  kind: "phi-worker-loss-probe";
  coverage: "worker-loss-only";
  gateway: "deferred";
  workerCleanup: "not-needed" | "exited" | "unconfirmed";
}
export type RecoveryWorkerFactory = (imageId: string, id: string) => RecoveryWorker;
export async function probeWorkerLoss(run: DockerCommand, startWorker: RecoveryWorkerFactory, nonce: string, signal?: AbortSignal): Promise<RecoveryReport> {
  requireProbe(/^[a-f0-9]{32}$/.test(nonce), "DOCKER_INVALID_NONCE");
  const report: RecoveryReport = { version: 1, kind: "phi-worker-loss-probe", coverage: "worker-loss-only", gateway: "deferred",
    state: "locked", protection: "not-active", canLaunch: false, probe: "blocked", stage: "engine", checks: [],
    containerName: `phi-phase0-${nonce}`, cleanup: "not-needed", workerCleanup: "not-needed" };
  let attempted = false;
  let id: string | undefined;
  let worker: RecoveryWorker | undefined;
  const checked: DockerCommand = (args) => {
    requireProbe(!signal?.aborted, "DOCKER_PROBE_CANCELLED");
    return run(args, signal);
  };
  const inspect = async (state: "created" | "running") => requireProbe(inspectRecovery(
    recoveryJson(await checked(["container", "inspect", "--format", "{{json .}}", id!])), nonce, report.imageId!, state) === id, "DOCKER_OWNERSHIP_MISMATCH");
  try {
    report.engine = inspectEngine(recoveryJson(await checked(["info", "--format",
      '{"OSType":{{json .OSType}},"OperatingSystem":{{json .OperatingSystem}},"KernelVersion":{{json .KernelVersion}},"ServerVersion":{{json .ServerVersion}}}',
    ])));
    report.stage = "local-image";
    report.imageId = inspectImage(recoveryJson(await checked(["image", "inspect", "--format",
      '{"Id":{{json .Id}},"Os":{{json .Os}},"Config":{"Volumes":{{json (index .Config "Volumes")}},"OnBuild":{{json (index .Config "OnBuild")}}}}', LOCAL_NODE_IMAGE,
    ])));
    report.stage = "create";
    requireProbe(!signal?.aborted, "DOCKER_PROBE_CANCELLED");
    attempted = true;
    const created = (await checked(createRecoveryArgs(report.imageId, nonce))).trim();
    requireProbe(/^[a-f0-9]{64}$/.test(created), "DOCKER_CONTAINER_ID_INVALID");
    id = created;
    report.stage = "inspect-before-worker";
    await inspect("created");
    report.stage = "worker-start";
    requireProbe(!signal?.aborted, "DOCKER_PROBE_CANCELLED");
    worker = startWorker(report.imageId, id);
    await worker.ready;
    requireProbe(worker.healthy(), "RECOVERY_WORKER_EARLY_EXIT");
    await inspect("running");
    report.checks.push("workerStartedGuest");
    checkHeartbeat(recoveryJson(await checked(heartbeatArgs(id, nonce))), nonce);
    report.checks.push("guestTreeAlive");
    report.stage = "worker-loss";
    requireProbe(!signal?.aborted, "DOCKER_PROBE_CANCELLED");
    await worker.killForTest(); // Must observe real forceful exit, not just killed=true.
    report.checks.push("workerForciblyExited");
    report.stage = "post-loss-effects";
    await inspect("running");
    checkHeartbeat(recoveryJson(await checked(heartbeatArgs(id, nonce))), nonce);
    // This EXPECTED observation is a limitation of plain Docker, not an automatic
    // fail-closed guarantee: guest work continues until the surviving supervisor acts.
    report.checks.push("guestSurvivesWorkerLoss");
    report.stage = "supervisor-stop";
    await inspect("running");
    requireProbe((await checked(["container", "kill", "--signal=KILL", id])).trim() === id, "RECOVERY_STOP_UNCONFIRMED");
    requireProbe((await checked(["container", "wait", id])).trim() === "137", "RECOVERY_STOP_UNCONFIRMED");
    const state = object(recoveryJson(await checked(["container", "inspect", "--format", "{{json .State}}", id])));
    requireProbe(state.Status === "exited" && state.Running === false && state.Pid === 0 && state.ExitCode === 137
      && state.OOMKilled === false && state.Error === "", "RECOVERY_STOP_UNCONFIRMED");
    report.checks.push("supervisorStop");
    report.stage = "complete";
    report.probe = "passed";
  } catch (error) {
    report.probe = attempted ? "failed" : "blocked";
    report.rule = error instanceof DockerProbeError ? error.rule : "RECOVERY_PROBE_FAILED";
  } finally {
    // Independent cleanup deadlines, not cancelled with the experiment. Stop the
    // worker first. It never creates containers, so a late start cannot resurrect
    // an immutable ID after the supervisor removes it.
    if (worker) {
      try { await worker.close(); report.workerCleanup = "exited"; }
      catch { report.workerCleanup = "unconfirmed"; }
    }
    if (attempted) {
      try {
        const ids = (await run(["container", "ls", "--all", "--no-trunc", "--filter", `label=${PROBE_LABEL}=${nonce}`, "--format", "{{.ID}}"])).trim();
        if (!ids) report.cleanup = id ? "absent" : "unconfirmed";
        else {
          requireProbe(/^[a-f0-9]{64}$/.test(ids) && (id === undefined || ids === id), "DOCKER_CLEANUP_AMBIGUOUS");
          requireProbe(ownedContainer(recoveryJson(await run(["container", "inspect", "--format", "{{json .}}", ids])), nonce, report.imageId!) === ids, "DOCKER_OWNERSHIP_MISMATCH");
          await run(["container", "rm", "--force", ids]);
          requireProbe((await run(["container", "ls", "--all", "--no-trunc", "--filter", `label=${PROBE_LABEL}=${nonce}`, "--format", "{{.ID}}"])).trim() === "", "DOCKER_CLEANUP_UNCONFIRMED");
          report.cleanup = "removed";
        }
      } catch { report.cleanup = "unconfirmed"; }
    }
    if (report.workerCleanup === "unconfirmed" || report.cleanup === "unconfirmed") {
      report.probe = "failed";
      report.rule ??= "RECOVERY_CLEANUP_UNCONFIRMED";
    }
  }
  return report;
}
