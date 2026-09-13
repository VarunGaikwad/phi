// Internal trusted controller worker: may START only the supervisor's existing ID.
// Never creates/recreates a container, discovers resources, imports pi, or runs a shell.
import { join } from "node:path";
import { executeDocker } from "./docker-probe.ts";
import { DOCKER_ENDPOINT, requireProbe } from "./docker-spec.ts";
import { dockerClientEnvironment, validateDockerPath } from "./probe-docker.ts";
import { checkHeartbeat, heartbeatArgs, inspectRecovery, recoveryJson } from "./recovery-spec.ts";

async function main(): Promise<void> {
  requireProbe(process.platform === "win32" && process.send && process.connected && process.argv.length === 7, "RECOVERY_INTERNAL_WORKER_ONLY");
  const [docker, root, nonce, imageId, id] = process.argv.slice(2);
  validateDockerPath(docker);
  requireProbe(/^[a-f0-9]{32}$/.test(nonce) && /^sha256:[a-f0-9]{64}$/.test(imageId) && /^[a-f0-9]{64}$/.test(id), "RECOVERY_IDENTITY_INVALID");
  // All arguments come from our host supervisor, not an agent/guest request.
  const run = executeDocker(docker, ["--host", DOCKER_ENDPOINT, "--config", join(root, "config")], root,
    dockerClientEnvironment(process.env.SystemRoot ?? "", root));
  const inspect = async (state: "created" | "running") => requireProbe(
    inspectRecovery(recoveryJson(await run(["container", "inspect", "--format", "{{json .}}", id])), nonce, imageId, state) === id,
    "DOCKER_OWNERSHIP_MISMATCH");
  await inspect("created");
  requireProbe((await run(["container", "start", id])).trim() === id, "RECOVERY_START_UNCONFIRMED");
  await inspect("running");
  checkHeartbeat(recoveryJson(await run(heartbeatArgs(id, nonce))), nonce);
  // There is NO outstanding Docker invocation at this checkpoint. The supervisor
  // will force-kill THIS worker, not a PID supplied by guest output.
  process.send!({ version: 1, nonce, id });
  await new Promise<void>(() => {});
}
if (import.meta.main) {
  // Avoid an orphan host worker if its supervisor disappears. This is NOT guest
  // cleanup or a crash-resilient watchdog; supervisor/daemon loss remains unproven.
  process.on("disconnect", () => process.exit(1));
  const deadline = setTimeout(() => process.exit(1), 60_000);
  try { await main(); } catch { process.exitCode = 1; }
  finally { clearTimeout(deadline); if (process.connected) process.disconnect(); }
}
