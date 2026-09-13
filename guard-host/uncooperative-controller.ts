// Pure controller-wiring specification for the uncooperative guest script.
// It returns command data and validates evidence; it never executes a command.
import { createHash } from "node:crypto";
import { UNCOOPERATIVE_GUEST_SCRIPT, UNCOOPERATIVE_VERIFY_SCRIPT, UNCOOPERATIVE_FILES } from "./uncooperative-extension.ts";

export const MAX_CONTROLLER_OUTPUT = 32 * 1024;
export const CONTROLLER_DEADLINE_MS = 15_000;
export const UNCOOPERATIVE_RUN_CHECKS = [
  "guestReady", "preAbortEffect", "abortRequested", "abortIgnored", "queuesCleared",
  "lateEffect", "childAdvancing", "hostStop", "guestStopped", "childStopped", "cleanup",
] as const;
export type ControllerStep = "create" | "start" | "guest" | "abort" | "verify" | "stop" | "wait" | "inspect" | "remove";
export interface ControllerCommand { readonly step: ControllerStep; readonly args: readonly string[]; readonly cancellable: boolean }
export interface UncooperativeEvidence {
  readonly version: 1; readonly nonce: string; readonly verified: boolean;
  readonly guestAlive: boolean; readonly childAlive: boolean; readonly lateEffect: boolean;
  readonly abortIgnored: boolean; readonly childPid: number; readonly childTickBefore: number; readonly childTickAfter: number;
}
export class UncooperativeControllerError extends Error {
  readonly rule = "UNCOOPERATIVE_CONTROLLER_INVALID";
  constructor() { super("UNCOOPERATIVE_CONTROLLER_INVALID"); }
}
function validNonce(nonce: string): void { if (!/^[a-f0-9]{32}$/.test(nonce)) throw new UncooperativeControllerError(); }
function command(step: ControllerStep, args: string[], cancellable = true): ControllerCommand {
  // Newlines are allowed only because the fixed script is passed as one direct
  // argv value with shell=false; NUL remains forbidden.
  if (args.length > 12 || args.some(arg => typeof arg !== "string" || arg.length > 8192 || /\0/.test(arg))) throw new UncooperativeControllerError();
  return { step, args: [...args], cancellable };
}
export function scriptHashes(): { guest: string; verifier: string } {
  return { guest: createHash("sha256").update(UNCOOPERATIVE_GUEST_SCRIPT).digest("hex"), verifier: createHash("sha256").update(UNCOOPERATIVE_VERIFY_SCRIPT).digest("hex") };
}
export function planUncooperativeController(nonce: string, containerId: string): readonly ControllerCommand[] {
  validNonce(nonce); if (!/^[a-f0-9]{64}$/.test(containerId)) throw new UncooperativeControllerError();
  const guest = ["container", "exec", "--workdir=/workspace", containerId, "/usr/local/bin/node", "-e", UNCOOPERATIVE_GUEST_SCRIPT];
  const abort = ["container", "exec", "--workdir=/workspace", containerId, "/usr/bin/touch", "--", "/workspace/uncoop-abort.request"];
  const verify = ["container", "exec", "--workdir=/workspace", containerId, "/usr/local/bin/node", "-e", UNCOOPERATIVE_VERIFY_SCRIPT];
  return [
    command("guest", guest), command("abort", abort), command("verify", verify),
    command("stop", ["container", "kill", "--signal=KILL", containerId], false),
    command("wait", ["container", "wait", containerId], false),
    command("inspect", ["container", "inspect", "--format", "{{json .State}}", containerId], false),
    command("remove", ["container", "rm", "--force", containerId], false),
  ];
}
export function validateUncooperativeEvidence(value: unknown, nonce: string): UncooperativeEvidence {
  validNonce(nonce); if (!value || typeof value !== "object" || Array.isArray(value)) throw new UncooperativeControllerError();
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join(",") !== "abortIgnored,childAlive,childPid,childTickAfter,childTickBefore,guestAlive,lateEffect,nonce,verified,version"
    || v.version !== 1 || v.nonce !== nonce || v.verified !== true || v.guestAlive !== true || v.childAlive !== true
    || v.abortIgnored !== true || v.lateEffect !== true || !Number.isSafeInteger(v.childPid) || (v.childPid as number) <= 0
    || !Number.isSafeInteger(v.childTickBefore) || (v.childTickBefore as number) < 0
    || !Number.isSafeInteger(v.childTickAfter) || (v.childTickAfter as number) <= (v.childTickBefore as number))
    throw new UncooperativeControllerError();
  return { version: 1, nonce, verified: true, guestAlive: true, childAlive: true, lateEffect: true, abortIgnored: true,
    childPid: v.childPid as number, childTickBefore: v.childTickBefore as number, childTickAfter: v.childTickAfter as number };
}
export function validateStoppedState(value: unknown): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new UncooperativeControllerError();
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join(",") !== "Error,ExitCode,OOMKilled,Pid,Running,Status"
    || v.Status !== "exited" || v.Running !== false || v.Pid !== 0 || v.ExitCode !== 137 || v.OOMKilled !== false || v.Error !== "")
    throw new UncooperativeControllerError();
}
export function validateCleanupNames(names: readonly string[]): void {
  if (names.length !== 0 && (names.length !== UNCOOPERATIVE_FILES.length || names.some(name => !UNCOOPERATIVE_FILES.includes(name as never))))
    throw new UncooperativeControllerError();
}
