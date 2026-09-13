import type { DockerCommand, DockerProbeReport } from "./docker-probe.ts";
import { DockerProbeError, LOCAL_NODE_IMAGE, PROBE_LABEL, inspectEngine, inspectImage, object, ownedContainer, requireProbe } from "./docker-spec.ts";
import { createNetworkArgs, inspectNamespaces, inspectNetwork, inspectNetworkResult, networkExecArgs, networkJson,
  NETWORK_GUEST_CHECKS, NETWORK_NAMESPACE_QUERY, NETWORK_PEER_VERIFY, NETWORK_PRIMARY, type NetworkRole } from "./network-spec.ts";

export interface NetworkReport extends Omit<DockerProbeReport, "kind"> {
  kind: "phi-network-ipc-probe";
  coverage: "synthetic-network-ipc-only";
  gateway: "deferred";
  peerName: string;
  peerCleanup: DockerProbeReport["cleanup"];
}
interface Fixture { role: NetworkRole; nonce: string; attempted: boolean; id?: string; cleanup: DockerProbeReport["cleanup"] }
/** Two fixed disposable guests; no host endpoints, arbitrary destinations or daemon settings. */
export async function probeNetwork(run: DockerCommand, nonce: string, peerNonce: string, signal?: AbortSignal): Promise<NetworkReport> {
  requireProbe(/^[a-f0-9]{32}$/.test(nonce) && /^[a-f0-9]{32}$/.test(peerNonce) && nonce !== peerNonce, "NETWORK_NONCES_INVALID");
  const report: NetworkReport = { version: 1, kind: "phi-network-ipc-probe", coverage: "synthetic-network-ipc-only", gateway: "deferred",
    state: "locked", protection: "not-active", canLaunch: false, probe: "blocked", stage: "engine", checks: [],
    containerName: `phi-phase0-${nonce}`, peerName: `phi-phase0-${peerNonce}`, cleanup: "not-needed", peerCleanup: "not-needed" };
  const primary: Fixture = { role: "primary", nonce, attempted: false, cleanup: "not-needed" };
  const peer: Fixture = { role: "peer", nonce: peerNonce, attempted: false, cleanup: "not-needed" };
  const fixtures = [peer, primary];
  const checked: DockerCommand = args => {
    requireProbe(!signal?.aborted, "DOCKER_PROBE_CANCELLED");
    return run(args, signal);
  };
  const inspect = async (f: Fixture, state: "created" | "running") => requireProbe(inspectNetwork(
    networkJson(await checked(["container", "inspect", "--format", "{{json .}}", f.id!])), f.role, f.nonce, report.imageId!, state) === f.id, "DOCKER_OWNERSHIP_MISMATCH");
  const exec = async (f: Fixture, script: string) => networkJson(await checked(networkExecArgs(f.id!, f.nonce, script)));
  try {
    report.engine = inspectEngine(networkJson(await checked(["info", "--format",
      '{"OSType":{{json .OSType}},"OperatingSystem":{{json .OperatingSystem}},"KernelVersion":{{json .KernelVersion}},"ServerVersion":{{json .ServerVersion}}}',
    ])));
    report.stage = "local-image";
    report.imageId = inspectImage(networkJson(await checked(["image", "inspect", "--format",
      '{"Id":{{json .Id}},"Os":{{json .Os}},"Config":{"Volumes":{{json (index .Config "Volumes")}},"OnBuild":{{json (index .Config "OnBuild")}}}}', LOCAL_NODE_IMAGE,
    ])));
    // Create and independently inspect BOTH profiles before starting either guest.
    for (const f of fixtures) {
      report.stage = `create-${f.role}`;
      requireProbe(!signal?.aborted, "DOCKER_PROBE_CANCELLED");
      f.attempted = true;
      const id = (await checked(createNetworkArgs(f.role, report.imageId, f.nonce))).trim();
      requireProbe(/^[a-f0-9]{64}$/.test(id) && !fixtures.some(other => other.id === id), "DOCKER_CONTAINER_ID_INVALID");
      f.id = id;
      report.stage = `inspect-${f.role}`;
      await inspect(f, "created");
    }
    for (const f of fixtures) {
      report.stage = `start-${f.role}`;
      requireProbe((await checked(["container", "start", f.id!])).trim() === f.id, "NETWORK_START_UNCONFIRMED");
      await inspect(f, "running");
    }
    report.stage = "peer-before";
    const peerNs = inspectNamespaces(await exec(peer, NETWORK_PEER_VERIFY), peerNonce, true);
    report.checks.push("peerAliveBefore");
    report.stage = "namespace-separation";
    const primaryNs = inspectNamespaces(await exec(primary, NETWORK_NAMESPACE_QUERY), nonce);
    requireProbe(Object.keys(peerNs).every(key => peerNs[key] !== primaryNs[key]), "NETWORK_NAMESPACES_SHARED");
    report.checks.push("separateNamespaces");
    report.stage = "network-fixture";
    inspectNetworkResult(await exec(primary, NETWORK_PRIMARY), nonce);
    report.checks.push(...NETWORK_GUEST_CHECKS);
    report.stage = "peer-after";
    await inspect(peer, "running");
    const peerAfter = inspectNamespaces(await exec(peer, NETWORK_PEER_VERIFY), peerNonce, true);
    requireProbe(Object.keys(peerNs).every(key => peerNs[key] === peerAfter[key]), "NETWORK_NAMESPACE_CHANGED");
    report.checks.push("peerAliveAfter");
    report.stage = "host-stop";
    for (const f of [primary, peer]) {
      await inspect(f, "running");
      requireProbe((await checked(["container", "kill", "--signal=KILL", f.id!])).trim() === f.id, "NETWORK_STOP_UNCONFIRMED");
      requireProbe((await checked(["container", "wait", f.id!])).trim() === "137", "NETWORK_STOP_UNCONFIRMED");
      const state = object(networkJson(await checked(["container", "inspect", "--format", "{{json .State}}", f.id!])));
      requireProbe(state.Status === "exited" && state.Running === false && state.Pid === 0 && state.ExitCode === 137
        && state.OOMKilled === false && state.Error === "", "NETWORK_STOP_UNCONFIRMED");
    }
    report.checks.push("hostStop");
    report.probe = "passed";
    report.stage = "complete";
  } catch (error) {
    report.probe = fixtures.some(f => f.attempted) ? "failed" : "blocked";
    report.rule = error instanceof DockerProbeError ? error.rule : "NETWORK_PROBE_FAILED";
  } finally {
    // Each fixture has independent ownership checks and cleanup deadlines. Failure
    // for one must never skip recovery of the other. No cancellation, prune or broad ls.
    for (const f of [primary, peer]) {
      if (!f.attempted) continue;
      try {
        const query = ["container", "ls", "--all", "--no-trunc", "--filter", `label=${PROBE_LABEL}=${f.nonce}`, "--format", "{{.ID}}"];
        const ids = (await run(query)).trim();
        if (!ids) f.cleanup = f.id ? "absent" : "unconfirmed";
        else {
          requireProbe(/^[a-f0-9]{64}$/.test(ids) && (f.id === undefined || f.id === ids), "DOCKER_CLEANUP_AMBIGUOUS");
          requireProbe(ownedContainer(networkJson(await run(["container", "inspect", "--format", "{{json .}}", ids])), f.nonce, report.imageId!) === ids, "DOCKER_OWNERSHIP_MISMATCH");
          await run(["container", "rm", "--force", ids]);
          requireProbe((await run(query)).trim() === "", "DOCKER_CLEANUP_UNCONFIRMED");
          f.cleanup = "removed";
        }
      } catch { f.cleanup = "unconfirmed"; }
    }
    report.cleanup = primary.cleanup;
    report.peerCleanup = peer.cleanup;
    if (fixtures.some(f => f.cleanup === "unconfirmed")) {
      report.probe = "failed";
      report.rule ??= "DOCKER_CLEANUP_UNCONFIRMED";
    }
  }
  return report;
}
