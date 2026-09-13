// Phase 0 DESIGN MODEL ONLY. No filesystem, Docker, process or pi operations.
// Hashes detect corruption, not malicious host rewrites. Inputs are synthetic
// normalized evidence, NOT authenticated observations or executable authority.
import { createHash } from "node:crypto";

export const MAX_JOURNAL_BYTES = 32 * 1024;
export const MAX_JOURNAL_EVENTS = 64;
export const RECOVERY_PHASES = ["create-intent", "identified", "start-intent", "running", "stop-intent", "stopped", "remove-intent", "removed"] as const;
export type RecoveryPhase = typeof RECOVERY_PHASES[number];
export interface RecoveryOwner {
  installationId: string;
  engineFingerprint: string;
  runId: string;
  nonce: string;
  imageId: string;
  profile: "node-worker-v1";
  creationEpoch: number;
  policyEpoch: number;
}
interface JournalEvent {
  sequence: number;
  previousHash: string;
  phase: RecoveryPhase;
  containerId: string | null;
  hash: string;
}
export interface RecoveryJournal {
  version: 1;
  kind: "phi-reconciliation-model";
  owner: RecoveryOwner;
  events: JournalEvent[];
}
interface Candidate {
  id: string;
  name: string;
  installationId: string;
  runId: string;
  nonce: string;
  imageId: string;
  profile: "node-worker-v1";
  creationEpoch: number;
  state: "running" | "stopped" | "unknown";
  profileVerified: boolean;
}
interface Evidence {
  installationId: string;
  engineFingerprint: string;
  recoveryEpoch: number;
  policyEpoch: number;
  fence: "exclusive" | "busy" | "unknown";
  operationsQuiescent: boolean;
  inventory: "complete" | "unavailable";
  committedHead: string | null;
  candidates: Candidate[];
}
export type RecoveryStep = "none" | "record-identity" | "record-stop-intent" | "stop-container" | "record-stopped"
  | "record-remove-intent" | "remove-container" | "record-removed";
export interface ReconciliationDecision {
  version: 1;
  kind: "phi-reconciliation-decision-model";
  state: "locked";
  protection: "not-active";
  canLaunch: false;
  gateway: "deferred";
  executable: false;
  outcome: "blocked" | "pending" | "proposed" | "complete";
  rule: string;
  step: RecoveryStep;
  containerId: string | null;
}
export class ReconciliationModelError extends Error {
  readonly rule = "RECONCILIATION_JOURNAL_INVALID";
  constructor() { super("RECONCILIATION_JOURNAL_INVALID"); }
}
function need(ok: unknown): asserts ok { if (!ok) throw new ReconciliationModelError(); }
function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  need(value !== null && typeof value === "object" && !Array.isArray(value));
  const v = value as Record<string, unknown>;
  need(Object.keys(v).length === keys.length && keys.every(key => Object.hasOwn(v, key)));
  return v;
}
const token = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{32}$/.test(value);
const digest = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const image = (value: unknown): value is string => typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
const epoch = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0 && (value as number) < Number.MAX_SAFE_INTEGER;
function owner(value: unknown): RecoveryOwner {
  const v = exact(value, ["installationId", "engineFingerprint", "runId", "nonce", "imageId", "profile", "creationEpoch", "policyEpoch"]);
  need(token(v.installationId) && digest(v.engineFingerprint) && token(v.runId) && token(v.nonce)
    && image(v.imageId) && v.profile === "node-worker-v1" && epoch(v.creationEpoch) && epoch(v.policyEpoch));
  return { installationId: v.installationId, engineFingerprint: v.engineFingerprint, runId: v.runId,
    nonce: v.nonce, imageId: v.imageId, profile: v.profile, creationEpoch: v.creationEpoch, policyEpoch: v.policyEpoch };
}
const transitions: Record<RecoveryPhase, readonly RecoveryPhase[]> = {
  "create-intent": ["identified"],
  identified: ["start-intent", "stop-intent", "remove-intent"],
  "start-intent": ["running", "stop-intent"],
  running: ["stop-intent"],
  "stop-intent": ["stopped"],
  stopped: ["stop-intent", "remove-intent"],
  "remove-intent": ["stop-intent", "removed"],
  removed: [], // A tombstone can never start, adopt or resurrect work.
};
function eventHash(o: RecoveryOwner, event: Omit<JournalEvent, "hash">): string {
  return createHash("sha256").update(JSON.stringify([1, "phi-reconciliation-model", o,
    event.sequence, event.previousHash, event.phase, event.containerId])).digest("hex");
}
function bytes(journal: RecoveryJournal): Buffer {
  const result = Buffer.from(JSON.stringify(journal) + "\n");
  need(result.length <= MAX_JOURNAL_BYTES);
  return result;
}
/** Strict canonical wire form also rejects duplicate JSON keys and trailing data. */
export function parseRecoveryJournal(input: Uint8Array): RecoveryJournal {
  try {
    need(input instanceof Uint8Array && input.byteLength > 0 && input.byteLength <= MAX_JOURNAL_BYTES);
    const raw = Buffer.from(input);
    const v = exact(JSON.parse(raw.toString("utf8")), ["version", "kind", "owner", "events"]);
    need(v.version === 1 && v.kind === "phi-reconciliation-model" && Array.isArray(v.events)
      && v.events.length > 0 && v.events.length <= MAX_JOURNAL_EVENTS);
    const o = owner(v.owner);
    const events: JournalEvent[] = [];
    for (const value of v.events) {
      const e = exact(value, ["sequence", "previousHash", "phase", "containerId", "hash"]);
      const previous = events.at(-1);
      need(e.sequence === events.length && e.previousHash === (previous?.hash ?? "0".repeat(64))
        && typeof e.phase === "string" && RECOVERY_PHASES.includes(e.phase as RecoveryPhase) && digest(e.hash));
      const phase = e.phase as RecoveryPhase;
      if (!previous) need(phase === "create-intent" && e.containerId === null);
      else need(transitions[previous.phase].includes(phase) && digest(e.containerId)
        && (previous.containerId === null || e.containerId === previous.containerId));
      const event = { sequence: events.length, previousHash: e.previousHash as string, phase,
        containerId: e.containerId as string | null };
      need(eventHash(o, event) === e.hash);
      events.push({ ...event, hash: e.hash });
    }
    const journal: RecoveryJournal = { version: 1, kind: "phi-reconciliation-model", owner: o, events };
    need(bytes(journal).equals(raw));
    return journal;
  } catch { throw new ReconciliationModelError(); }
}
/** Produces bytes only: no durable commit or permission to create a container. */
export function createRecoveryJournal(value: unknown): Buffer {
  const o = owner(value);
  const initial = { sequence: 0, previousHash: "0".repeat(64), phase: "create-intent" as const, containerId: null };
  return bytes({ version: 1, kind: "phi-reconciliation-model", owner: o, events: [{ ...initial, hash: eventHash(o, initial) }] });
}
/** Validates structural order only. A future trusted writer must verify receipts. */
export function appendRecoveryEvent(input: Uint8Array, phase: RecoveryPhase, containerId?: string): Buffer {
  const journal = parseRecoveryJournal(input);
  const previous = journal.events.at(-1)!;
  need(journal.events.length < MAX_JOURNAL_EVENTS && transitions[previous.phase].includes(phase));
  const id = containerId ?? previous.containerId;
  need(digest(id) && (previous.containerId === null || id === previous.containerId));
  const event = { sequence: journal.events.length, previousHash: previous.hash, phase, containerId: id };
  journal.events.push({ ...event, hash: eventHash(journal.owner, event) });
  return bytes(journal);
}
function evidence(input: unknown): Evidence {
  const v = exact(input, ["installationId", "engineFingerprint", "recoveryEpoch", "policyEpoch", "fence", "operationsQuiescent", "inventory", "committedHead", "candidates"]);
  need(token(v.installationId) && digest(v.engineFingerprint) && epoch(v.recoveryEpoch) && epoch(v.policyEpoch)
    && ["exclusive", "busy", "unknown"].includes(v.fence as string) && typeof v.operationsQuiescent === "boolean"
    && ["complete", "unavailable"].includes(v.inventory as string) && (v.committedHead === null || digest(v.committedHead))
    && Array.isArray(v.candidates) && v.candidates.length <= 16);
  const candidates = v.candidates.map(value => {
    const c = exact(value, ["id", "name", "installationId", "runId", "nonce", "imageId", "profile", "creationEpoch", "state", "profileVerified"]);
    need(digest(c.id) && typeof c.name === "string" && /^phi-phase0-[a-f0-9]{32}$/.test(c.name)
      && token(c.installationId) && token(c.runId) && token(c.nonce) && image(c.imageId) && c.profile === "node-worker-v1"
      && epoch(c.creationEpoch) && ["running", "stopped", "unknown"].includes(c.state as string) && typeof c.profileVerified === "boolean");
    return { ...c } as unknown as Candidate;
  });
  return { ...v, candidates } as unknown as Evidence;
}
/** Plans ONE conceptual next step from fresh evidence; never executes or authorizes it. */
export function planReconciliation(input: Uint8Array | undefined, observation: unknown): ReconciliationDecision {
  const result = (outcome: ReconciliationDecision["outcome"], rule: string, step: RecoveryStep = "none", containerId: string | null = null): ReconciliationDecision => ({
    version: 1, kind: "phi-reconciliation-decision-model", state: "locked", protection: "not-active", canLaunch: false,
    gateway: "deferred", executable: false, outcome, rule, step, containerId,
  });
  if (input === undefined) return result("blocked", "RECOVERY_JOURNAL_MISSING");
  let journal: RecoveryJournal;
  try { journal = parseRecoveryJournal(input); } catch { return result("blocked", "RECOVERY_JOURNAL_INVALID"); }
  let e: Evidence;
  try { e = evidence(observation); } catch { return result("blocked", "RECOVERY_EVIDENCE_INVALID"); }
  const o = journal.owner;
  if (e.installationId !== o.installationId || e.engineFingerprint !== o.engineFingerprint) return result("blocked", "RECOVERY_AUTHORITY_MISMATCH");
  if (e.fence !== "exclusive" || e.recoveryEpoch <= o.creationEpoch) return result("blocked", "RECOVERY_FENCE_UNCONFIRMED");
  if (e.policyEpoch < o.policyEpoch) return result("blocked", "RECOVERY_POLICY_ROLLBACK");
  if (!e.operationsQuiescent) return result("pending", "RECOVERY_OPERATIONS_UNSETTLED");
  if (e.inventory !== "complete") return result("pending", "RECOVERY_ENGINE_UNAVAILABLE");
  if (e.candidates.length > 1) return result("blocked", "RECOVERY_AMBIGUOUS_IDENTITY");
  const last = journal.events.at(-1)!;
  if (e.committedHead !== last.hash) return result("blocked", "RECOVERY_COMMIT_HEAD_UNCONFIRMED");
  const propose = (rule: string, step: RecoveryStep, id: string) =>
    step.startsWith("record-") && journal.events.length >= MAX_JOURNAL_EVENTS
      ? result("blocked", "RECOVERY_JOURNAL_EXHAUSTED") : result("proposed", rule, step, id);
  const candidate = e.candidates[0];
  if (!candidate) {
    // Empty inventory after an uncertain create is NOT a receipt that it cannot finish later.
    if (last.containerId === null) return result("pending", "RECOVERY_CREATE_UNRESOLVED");
    if (last.phase === "removed") return result("complete", "RECOVERY_TOMBSTONE_CONFIRMED");
    const step: RecoveryStep = last.phase === "remove-intent" ? "record-removed"
      : last.phase === "stop-intent" ? "record-stopped"
      : last.phase === "identified" || last.phase === "stopped" ? "record-remove-intent" : "record-stop-intent";
    return propose("RECOVERY_ABSENCE_OBSERVED", step, last.containerId);
  }
  if ((last.containerId !== null && candidate.id !== last.containerId)
    || candidate.name !== `phi-phase0-${o.nonce}` || candidate.nonce !== o.nonce
    || candidate.installationId !== o.installationId || candidate.runId !== o.runId
    || candidate.imageId !== o.imageId || candidate.profile !== o.profile || candidate.creationEpoch !== o.creationEpoch) {
    return result("blocked", "RECOVERY_OWNERSHIP_MISMATCH");
  }
  if (last.phase === "removed") return result("blocked", "RECOVERY_TOMBSTONE_CONFLICT");
  if (candidate.state === "unknown") return result("pending", "RECOVERY_STATE_UNCONFIRMED");
  if (last.containerId === null) {
    // Ambiguous create can bind only a fully checked candidate, never a label alone.
    return candidate.profileVerified ? propose("RECOVERY_IDENTITY_OBSERVED", "record-identity", candidate.id)
      : result("blocked", "RECOVERY_ADOPTION_UNCONFIRMED");
  }
  // Profile drift blocks launch, but does not prevent stopping an already bound,
  // exactly owned ID. No proposal here can launch or broaden its authority.
  if (candidate.state === "running") {
    return propose("RECOVERY_OWNED_GUEST_ALIVE", last.phase === "stop-intent" ? "stop-container" : "record-stop-intent", candidate.id);
  }
  const step: RecoveryStep = last.phase === "stop-intent" ? "record-stopped"
    : last.phase === "remove-intent" ? "remove-container"
    : last.phase === "identified" || last.phase === "stopped" ? "record-remove-intent" : "record-stop-intent";
  return propose("RECOVERY_OWNED_GUEST_STOPPED", step, candidate.id);
}
