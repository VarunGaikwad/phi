import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DockerProbeError, requireProbe } from "./docker-spec.ts";
import { checkWorkerReady } from "./recovery-spec.ts";

export interface RecoveryWorker {
  ready: Promise<void>;
  healthy(): boolean;
  killForTest(): Promise<void>;
  close(): Promise<void>;
}
/** Owns a ChildProcess object, never looks up or kills a guest-supplied host PID. */
export function manageRecoveryWorker(child: ChildProcess, nonce: string, id: string, signal?: AbortSignal, readyTimeout = 60_000): RecoveryWorker {
  let resolveReady!: () => void;
  let rejectReady!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  // Also cover a caller failing before awaiting readiness; failures remain visible to await.
  void ready.catch(() => {});
  let exited = false;
  let fault = false;
  let received = false;
  let resolveExit!: (signal: NodeJS.Signals | null) => void;
  let observedExitSignal: NodeJS.Signals | null = null;
  const exit = new Promise<NodeJS.Signals | null>((resolve) => { resolveExit = resolve; });
  let killRequested = false;
  const terminate = () => {
    if (exited || child.pid === undefined || killRequested) return false;
    killRequested = true; // A failed kill emits error; do not recurse through that handler.
    return child.kill("SIGKILL");
  };
  const fail = (rule: string) => {
    fault = true;
    rejectReady(new DockerProbeError(rule));
    terminate();
  };
  const timer = setTimeout(() => fail("RECOVERY_WORKER_TIMEOUT"), readyTimeout);
  const cancel = () => fail("DOCKER_PROBE_CANCELLED");
  const dispose = () => { clearTimeout(timer); signal?.removeEventListener("abort", cancel); };
  child.on("error", () => {
    fail("RECOVERY_WORKER_FAILED");
    if (child.pid === undefined) { exited = true; dispose(); resolveExit(null); }
  });
  child.on("exit", (_code, exitSignal) => {
    exited = true;
    dispose();
    rejectReady(new DockerProbeError("RECOVERY_WORKER_EARLY_EXIT"));
    observedExitSignal = exitSignal;
  });
  // Drain/discard bounded stdout/stderr before declaring the worker fully reaped.
  child.on("close", () => resolveExit(observedExitSignal));
  let outputBytes = 0;
  for (const stream of [child.stdout, child.stderr]) stream?.on("data", (chunk: Buffer) => {
    outputBytes += chunk.length; // Never retain or echo raw worker output.
    if (outputBytes > 128 * 1024) fail("RECOVERY_WORKER_OUTPUT_LIMIT");
  });
  child.on("message", (message: unknown) => {
    try {
      requireProbe(!received, "RECOVERY_WORKER_MESSAGE_INVALID");
      checkWorkerReady(message, nonce, id);
      received = true;
      clearTimeout(timer);
      resolveReady();
    } catch { fail("RECOVERY_WORKER_MESSAGE_INVALID"); }
  });
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) cancel();
  const waitExit = async () => {
    let deadline: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([exit, new Promise<never>((_resolve, reject) => {
        deadline = setTimeout(() => reject(new DockerProbeError("RECOVERY_WORKER_STOP_UNCONFIRMED")), 5000);
      })]);
    } finally { clearTimeout(deadline); }
  };
  return {
    ready,
    healthy: () => !fault && !exited && received,
    killForTest: async () => {
      requireProbe(!fault && !exited && received && terminate(), "RECOVERY_WORKER_STOP_UNCONFIRMED");
      requireProbe(await waitExit() === "SIGKILL" && !fault, "RECOVERY_WORKER_STOP_UNCONFIRMED");
    },
    close: async () => {
      terminate();
      await waitExit();
      dispose();
    },
  };
}
export function startRecoveryWorker(docker: string, root: string, nonce: string, imageId: string, id: string, env: NodeJS.ProcessEnv, signal?: AbortSignal): RecoveryWorker {
  requireProbe(!signal?.aborted, "DOCKER_PROBE_CANCELLED");
  const child = spawn(process.execPath, ["--experimental-transform-types", fileURLToPath(new URL("./recovery-worker.ts", import.meta.url)), docker, root, nonce, imageId, id], {
    cwd: root, env, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe", "ipc"], serialization: "json",
  });
  return manageRecoveryWorker(child, nonce, id, signal);
}
