// Pure failure-state model for a future uncooperative Docker adapter.
// No command runner, Docker API, process, filesystem or cleanup operation exists here.
export const MAX_ADAPTER_EVENTS = 24;
export type AdapterPhase = "setup" | "created" | "running" | "verified" | "stopped" | "removed";
export type AdapterOutcome = "blocked" | "failed" | "passed";
export type AdapterEvent = "create-attempt" | "create-confirmed" | "create-uncertain" | "inspect-rejected"
  | "guest-failed" | "verify-failed" | "verify-confirmed" | "stop-requested" | "stop-unconfirmed" | "stopped-confirmed"
  | "remove-requested" | "remove-unconfirmed" | "removed-confirmed";
export interface AdapterState {
  readonly phase: AdapterPhase;
  readonly outcome: AdapterOutcome;
  readonly events: readonly AdapterEvent[];
  readonly createAttempted: boolean;
  readonly createConfirmed: boolean;
  readonly cleanupRequired: boolean;
  readonly cleanupConfirmed: boolean;
  readonly guestEvidence: boolean;
  readonly stopConfirmed: boolean;
}
export class UncooperativeExecutionModelError extends Error {
  readonly rule = "UNCOOPERATIVE_EXECUTION_MODEL_INVALID";
  constructor() { super("UNCOOPERATIVE_EXECUTION_MODEL_INVALID"); }
}
export function validateAdapterState(s: AdapterState): void {
  if (s.events.length > MAX_ADAPTER_EVENTS || (!s.createAttempted && s.createConfirmed)
    || (s.cleanupConfirmed && !s.cleanupRequired) || (s.phase === "removed" && !s.cleanupConfirmed)
    || (s.stopConfirmed && !s.createConfirmed) || (s.guestEvidence && s.phase === "setup"))
    throw new UncooperativeExecutionModelError();
}
function advance(s: AdapterState, event: AdapterEvent, patch: Partial<AdapterState>): AdapterState {
  const result = { ...s, ...patch, events: [...s.events, event] } as AdapterState;
  validateAdapterState(result); return result;
}
export function createAdapterState(): AdapterState {
  const s: AdapterState = { phase: "setup", outcome: "blocked", events: [], createAttempted: false, createConfirmed: false,
    cleanupRequired: false, cleanupConfirmed: false, guestEvidence: false, stopConfirmed: false };
  validateAdapterState(s); return s;
}
export function beginCreate(s: AdapterState): AdapterState {
  if (s.phase !== "setup" || s.createAttempted) throw new UncooperativeExecutionModelError();
  return advance(s, "create-attempt", { createAttempted: true });
}
export function confirmCreate(s: AdapterState): AdapterState {
  if (!s.createAttempted || s.createConfirmed || s.phase !== "setup") throw new UncooperativeExecutionModelError();
  return advance(s, "create-confirmed", { phase: "created", outcome: "failed", createConfirmed: true, cleanupRequired: true });
}
export function uncertainCreate(s: AdapterState): AdapterState {
  if (!s.createAttempted || s.createConfirmed || s.phase !== "setup") throw new UncooperativeExecutionModelError();
  return advance(s, "create-uncertain", { outcome: "failed", cleanupRequired: true });
}
export function rejectInspection(s: AdapterState): AdapterState {
  if (s.phase !== "created") throw new UncooperativeExecutionModelError();
  return advance(s, "inspect-rejected", { outcome: "failed" });
}
export function confirmRunning(s: AdapterState): AdapterState {
  if (s.phase !== "created") throw new UncooperativeExecutionModelError();
  const result = { ...s, phase: "running", events: [...s.events] } as AdapterState; validateAdapterState(result); return result;
}
export function guestFailed(s: AdapterState): AdapterState {
  if (s.phase !== "running") throw new UncooperativeExecutionModelError();
  return advance(s, "guest-failed", { outcome: "failed" });
}
export function verifierFailed(s: AdapterState): AdapterState {
  if (s.phase !== "running") throw new UncooperativeExecutionModelError();
  return advance(s, "verify-failed", { outcome: "failed" });
}
export function confirmGuestEvidence(s: AdapterState): AdapterState {
  if (s.phase !== "running" || s.outcome === "blocked") throw new UncooperativeExecutionModelError();
  return advance(s, "verify-confirmed", { phase: "verified", guestEvidence: true });
}
export function requestStop(s: AdapterState): AdapterState {
  if (!s.createConfirmed || s.phase !== "verified" || s.events.includes("stop-requested")) throw new UncooperativeExecutionModelError();
  return advance(s, "stop-requested", {});
}
export function stopUnconfirmed(s: AdapterState): AdapterState {
  if (!s.events.includes("stop-requested") || s.stopConfirmed) throw new UncooperativeExecutionModelError();
  return advance(s, "stop-unconfirmed", { outcome: "failed" });
}
export function confirmStopped(s: AdapterState): AdapterState {
  if (!s.events.includes("stop-requested") || s.stopConfirmed) throw new UncooperativeExecutionModelError();
  return advance(s, "stopped-confirmed", { phase: "stopped", stopConfirmed: true });
}
export function requestRemove(s: AdapterState): AdapterState {
  if (s.phase !== "stopped" || !s.stopConfirmed) throw new UncooperativeExecutionModelError();
  return advance(s, "remove-requested", {});
}
export function removeUnconfirmed(s: AdapterState): AdapterState {
  if (!s.events.includes("remove-requested") || s.cleanupConfirmed) throw new UncooperativeExecutionModelError();
  return advance(s, "remove-unconfirmed", { outcome: "failed" });
}
export function confirmRemoved(s: AdapterState): AdapterState {
  if (!s.events.includes("remove-requested") || s.cleanupConfirmed || s.events.includes("remove-unconfirmed")) throw new UncooperativeExecutionModelError();
  return advance(s, "removed-confirmed", { phase: "removed", outcome: "passed", cleanupConfirmed: true });
}
export function cleanupDecision(s: AdapterState): "not-needed" | "ownership-check-required" | "unconfirmed" | "removed" {
  if (!s.createAttempted) return "not-needed";
  if (!s.createConfirmed) return "unconfirmed";
  if (s.cleanupConfirmed) return "removed";
  if (s.createConfirmed && !s.events.includes("remove-unconfirmed") && !s.events.includes("stop-unconfirmed")) return "ownership-check-required";
  return "unconfirmed";
}
