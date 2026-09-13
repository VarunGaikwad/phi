// Pure model of an uncooperative guest extension. No process, filesystem, Docker,
// pi or network operations. It describes evidence requirements; it is not authority.
export const MAX_EVENTS = 32;
export const MAX_PENDING = 4;
export type UncooperativeStage = "idle" | "running" | "abort-requested" | "engine-stopped";
export type UncooperativeEvent =
  | "tool-started" | "pre-abort-write" | "abort-requested" | "abort-ignored"
  | "queued-work-cleared" | "late-write" | "child-alive" | "child-stopped"
  | "engine-stop-requested" | "engine-stopped";
export interface UncooperativeState {
  readonly stage: UncooperativeStage;
  readonly events: readonly UncooperativeEvent[];
  readonly pending: readonly ("steering" | "follow-up")[];
  readonly childAlive: boolean;
  readonly guestAlive: boolean;
  readonly writeCount: number;
}
export type ContainmentDecision =
  | { action: "none"; reason: "not-observed" | "cooperative-complete" }
  | { action: "clear-queues-and-observe"; deadlineMs: number }
  | { action: "host-engine-stop"; reason: "guest-uncooperative" | "late-effect-observed" };
export class UncooperativeModelError extends Error {
  readonly rule = "UNCOOPERATIVE_MODEL_INVALID";
  constructor() { super("UNCOOPERATIVE_MODEL_INVALID"); }
}
export function validateUncooperativeState(s: UncooperativeState): void {
  if (s.events.length > MAX_EVENTS || s.pending.length > MAX_PENDING || s.writeCount < 0
    || (s.stage === "idle" && s.events.length !== 0) || (s.stage === "engine-stopped" && (s.guestAlive || s.childAlive)))
    throw new UncooperativeModelError();
}
function next(s: UncooperativeState, event: UncooperativeEvent, patch: Partial<UncooperativeState> = {}): UncooperativeState {
  const result: UncooperativeState = { ...s, ...patch, events: [...s.events, event] };
  validateUncooperativeState(result); return result;
}
export function createUncooperativeModel(): UncooperativeState {
  const state: UncooperativeState = { stage: "idle", events: [], pending: [], childAlive: false, guestAlive: true, writeCount: 0 };
  validateUncooperativeState(state); return state;
}
export function startUncooperativeTool(s: UncooperativeState): UncooperativeState {
  if (s.stage !== "idle" || !s.guestAlive) throw new UncooperativeModelError();
  return next(s, "tool-started", { stage: "running" });
}
export function observePreAbortWrite(s: UncooperativeState): UncooperativeState {
  if (s.stage !== "running") throw new UncooperativeModelError();
  return next(s, "pre-abort-write", { writeCount: s.writeCount + 1, childAlive: true });
}
export function queueWork(s: UncooperativeState, kind: "steering" | "follow-up"): UncooperativeState {
  if (s.stage !== "running" || s.pending.length >= MAX_PENDING) throw new UncooperativeModelError();
  return { ...s, pending: [...s.pending, kind] };
}
export function requestAbort(s: UncooperativeState): UncooperativeState {
  if (s.stage !== "running") throw new UncooperativeModelError();
  return next(s, "abort-requested", { stage: "abort-requested" });
}
export function extensionIgnoresAbort(s: UncooperativeState): UncooperativeState {
  if (s.stage !== "abort-requested") throw new UncooperativeModelError();
  return next(s, "abort-ignored", { guestAlive: true });
}
export function clearQueuedWork(s: UncooperativeState): UncooperativeState {
  if (s.stage !== "abort-requested") throw new UncooperativeModelError();
  return next(s, "queued-work-cleared", { pending: [] });
}
export function observeLateEffect(s: UncooperativeState): UncooperativeState {
  if (s.stage !== "abort-requested" || s.pending.length !== 0) throw new UncooperativeModelError();
  return next(s, "late-write", { writeCount: s.writeCount + 1 });
}
export function observeChildAlive(s: UncooperativeState): UncooperativeState {
  if (!s.childAlive || !s.guestAlive) throw new UncooperativeModelError();
  return next(s, "child-alive");
}
export function requestHostEngineStop(s: UncooperativeState): UncooperativeState {
  if (s.stage !== "abort-requested" || s.pending.length !== 0) throw new UncooperativeModelError();
  return next(s, "engine-stop-requested");
}
export function confirmHostEngineStopped(s: UncooperativeState): UncooperativeState {
  if (!s.events.includes("engine-stop-requested")) throw new UncooperativeModelError();
  return next(s, "engine-stopped", { stage: "engine-stopped", guestAlive: false, childAlive: false });
}
export function planUncooperativeContainment(s: UncooperativeState, observedAtMs: number, deadlineMs: number): ContainmentDecision {
  if (!Number.isSafeInteger(observedAtMs) || !Number.isSafeInteger(deadlineMs) || observedAtMs < 0 || deadlineMs <= observedAtMs)
    throw new UncooperativeModelError();
  if (s.stage === "idle") return { action: "none", reason: "not-observed" };
  if (s.stage === "engine-stopped") return { action: "none", reason: "cooperative-complete" };
  if (s.stage === "running") return { action: "clear-queues-and-observe", deadlineMs };
  return { action: "host-engine-stop", reason: s.events.includes("late-write") ? "late-effect-observed" : "guest-uncooperative" };
}
