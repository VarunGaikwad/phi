// Deterministic, in-memory command-owner / delayed-engine experiment ONLY.
// No filesystem, clock, processes, IPC, Docker or pi. Not an authority adapter.
import { createHash } from "node:crypto";
export const MAX_COMMAND_RECORDS = 16;
const INSTALLATION = "a".repeat(32), ENGINE = "b".repeat(64), TARGET = "c".repeat(64);
const ZERO = "0".repeat(64);
export class CommandModelError extends Error {
  constructor(readonly rule: string) { super(rule); }
}
function need(value: unknown, rule: string): asserts value { if (!value) throw new CommandModelError(rule); }
function hash(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
export interface OwnerToken { epoch: number }
export type ResourceState = "absent" | "running" | "stopped";
export interface CommandRequest {
  version: 1; installationId: string; engineFingerprint: string; ownerEpoch: number;
  requestId: string; action: "stop" | "remove" | "historical-create"; targetId: string | null;
  intentRevision: number; previousHead: string;
}
export interface CommandReceipt {
  version: 1; requestId: string; requestHash: string; engineFingerprint: string;
  outcome: "returned" | "rejected-before-accept"; resourceId: string | null;
}
export interface CommandObservation {
  version: 1; ownerEpoch: number; engineFingerprint: string; revision: number;
  targetId: string; resource: ResourceState;
}
interface CommandRecord {
  request: CommandRequest; stage: "prepared" | "delivery-intent" | "receipted" | "settled" | "retired-unsent";
  receipt?: CommandReceipt;
}
export function receiptBytes(receipt: CommandReceipt): string { return JSON.stringify(receipt) + "\n"; }
export function parseCommandReceipt(bytes: string): CommandReceipt {
  try {
    need(typeof bytes === "string" && Buffer.byteLength(bytes) <= 1024, "COMMAND_RECEIPT_INVALID");
    const v = JSON.parse(bytes);
    need(v && Object.keys(v).sort().join(",") === "engineFingerprint,outcome,requestHash,requestId,resourceId,version"
      && v.version === 1 && typeof v.requestId === "string" && /^request-(?:[1-9]|1[0-6])$/.test(v.requestId)
      && typeof v.requestHash === "string" && /^[a-f0-9]{64}$/.test(v.requestHash)
      && typeof v.engineFingerprint === "string" && /^[a-f0-9]{64}$/.test(v.engineFingerprint)
      && ["returned", "rejected-before-accept"].includes(v.outcome)
      && (v.resourceId === null || (typeof v.resourceId === "string" && /^[a-f0-9]{64}$/.test(v.resourceId))), "COMMAND_RECEIPT_INVALID");
    const canonical: CommandReceipt = { version: 1, requestId: v.requestId, requestHash: v.requestHash,
      engineFingerprint: v.engineFingerprint, outcome: v.outcome, resourceId: v.resourceId };
    need(receiptBytes(canonical) === bytes, "COMMAND_RECEIPT_INVALID"); return canonical;
  } catch { throw new CommandModelError("COMMAND_RECEIPT_INVALID"); }
}
/** All "persistent" records, exclusive authority and engine receipts below are MOCKS.
 * A released owner loses future dispatch authority, NOT already accepted engine work.
 * Test-driver methods schedule effects; they never execute external commands.
 */
export class CommandOwnerFixture {
  private epoch = 0;
  private owner?: OwnerToken;
  private revision = 0;
  private head = ZERO;
  private records: CommandRecord[] = [];
  private storageFault = false;
  private commitCut?: "before" | "after";
  private resource: ResourceState;
  private boundId: string | null;
  private engineRevision = 0;
  private available = true;
  private inTransit = new Map<string, CommandRequest>();
  private pending = new Map<string, CommandRequest>();
  private terminal = new Map<string, CommandReceipt>();
  private effectLog: string[] = [];
  constructor(seed: "running" | "delayed-create" = "running") {
    need(seed === "running" || seed === "delayed-create", "COMMAND_SEED_INVALID");
    this.resource = seed === "running" ? "running" : "absent";
    this.boundId = seed === "running" ? TARGET : null;
    if (seed === "delayed-create") {
      // Imported historical cut point, NOT a create API or a proposed launch.
      this.epoch = 1;
      const request = this.request("historical-create", null, 1);
      this.commit([{ request, stage: "delivery-intent" }]);
      this.pending.set(request.requestId, structuredClone(request));
    }
  }
  private request(action: CommandRequest["action"], targetId: string | null, epoch: number): CommandRequest {
    return { version: 1, installationId: INSTALLATION, engineFingerprint: ENGINE, ownerEpoch: epoch,
      requestId: `request-${this.records.length + 1}`, action, targetId, intentRevision: this.revision + 1, previousHead: this.head };
  }
  private authority(token: OwnerToken): void {
    need(token && Object.keys(token).join() === "epoch" && Number.isSafeInteger(token.epoch)
      && token.epoch > 0 && this.owner && this.owner.epoch === token.epoch, "COMMAND_OWNER_FENCED");
    need(!this.storageFault, "COMMAND_STORE_UNCONFIRMED");
  }
  private record(id: string): CommandRecord {
    const record = this.records.find(record => record.request.requestId === id);
    need(record, "COMMAND_REQUEST_UNKNOWN"); return record;
  }
  private commit(records: CommandRecord[]): void {
    const cut = this.commitCut; this.commitCut = undefined;
    if (cut !== "before") {
      this.head = hash({ previous: this.head, revision: this.revision + 1, records });
      this.revision++; this.records = structuredClone(records);
    }
    if (cut) {
      this.storageFault = true; this.owner = undefined;
      throw new CommandModelError("COMMAND_COMMIT_UNCONFIRMED");
    }
  }
  private update(id: string, change: Partial<CommandRecord>): void {
    this.commit(this.records.map(record => record.request.requestId === id ? { ...record, ...change } : record));
  }
  acquire(): OwnerToken {
    need(!this.owner, "COMMAND_OWNER_BUSY");
    need(this.epoch < Number.MAX_SAFE_INTEGER - 1, "COMMAND_EPOCH_EXHAUSTED");
    // Mock reload of atomic committed memory, NOT real crash-safe checkpoint recovery.
    this.storageFault = false;
    if (this.records.some(record => record.request.action === "historical-create" && record.stage === "settled"
      && record.receipt?.outcome === "returned" && record.receipt.resourceId === TARGET)) this.boundId = TARGET;
    this.owner = { epoch: ++this.epoch }; return { ...this.owner };
  }
  loseOwner(token: OwnerToken): void { this.authority(token); this.owner = undefined; }
  failNextCommit(cut: "before" | "after"): void {
    need((cut === "before" || cut === "after") && !this.commitCut, "COMMAND_FAULT_INVALID"); this.commitCut = cut;
  }
  prepare(token: OwnerToken, action: "stop" | "remove"): CommandRequest {
    this.authority(token);
    need(action === "stop" || action === "remove", "COMMAND_ACTION_FORBIDDEN");
    need(this.records.every(record => ["settled", "retired-unsent"].includes(record.stage)), "COMMAND_OPERATIONS_UNSETTLED");
    need(this.records.length < MAX_COMMAND_RECORDS, "COMMAND_LEDGER_EXHAUSTED");
    need(this.available && this.boundId === TARGET && (action !== "remove" || this.resource !== "running"), "COMMAND_OBSERVATION_UNCONFIRMED");
    const request = this.request(action, this.boundId, token.epoch);
    this.commit([...this.records, { request, stage: "prepared" }]); return structuredClone(request);
  }
  retireUnsent(token: OwnerToken, id: string): void {
    this.authority(token); need(this.record(id).stage === "prepared", "COMMAND_DELIVERY_UNCERTAIN");
    this.update(id, { stage: "retired-unsent" });
  }
  deliver(token: OwnerToken, id: string, mode: "accept" | "drop-before-engine" | "delay-before-accept" | "reject-before-accept" = "accept"): void {
    this.authority(token);
    need(["accept", "drop-before-engine", "delay-before-accept", "reject-before-accept"].includes(mode), "COMMAND_DELIVERY_INVALID");
    const record = this.record(id);
    need(record.stage === "prepared" && record.request.ownerEpoch === token.epoch, "COMMAND_REQUEST_STALE");
    need(this.available && this.boundId === TARGET && record.request.targetId === this.boundId
      && (record.request.action !== "remove" || this.resource !== "running"), "COMMAND_OBSERVATION_UNCONFIRMED");
    this.update(id, { stage: "delivery-intent" }); // Must return an ack BEFORE any send.
    if (mode === "drop-before-engine") return;
    if (mode === "reject-before-accept") this.terminal.set(id, this.makeReceipt(record.request, "rejected-before-accept", null));
    else if (mode === "delay-before-accept") this.inTransit.set(id, structuredClone(record.request));
    else this.pending.set(id, structuredClone(record.request));
  }
  acceptDelayedInFakeEngine(id: string): void {
    const request = this.inTransit.get(id);
    need(this.available && request, "COMMAND_ENGINE_REQUEST_UNKNOWN");
    // A transport-delayed request can reach the engine AFTER replacement/fencing.
    this.inTransit.delete(id); this.pending.set(id, request);
  }
  private makeReceipt(request: CommandRequest, outcome: CommandReceipt["outcome"], resourceId: string | null): CommandReceipt {
    return { version: 1, requestId: request.requestId, requestHash: hash(request), engineFingerprint: ENGINE, outcome, resourceId };
  }
  finishInFakeEngine(id: string, effect: "apply" | "no-effect" = "apply"): void {
    need(this.available && (effect === "apply" || effect === "no-effect"), "COMMAND_ENGINE_UNAVAILABLE");
    const request = this.pending.get(id); need(request, "COMMAND_ENGINE_REQUEST_UNKNOWN");
    // Accepted work is independent of the client/owner epoch and may finish late.
    if (effect === "apply") {
      if (request.action === "historical-create") this.resource = "stopped";
      else if (request.action === "stop") { if (this.resource !== "absent") this.resource = "stopped"; }
      else { need(this.resource !== "running", "COMMAND_FAKE_REMOVE_RUNNING"); this.resource = "absent"; }
      this.engineRevision++; this.effectLog.push(`${id}:${request.action}`);
    }
    this.pending.delete(id);
    this.terminal.set(id, this.makeReceipt(request, "returned", request.action === "historical-create" && effect === "no-effect" ? null : TARGET));
  }
  lookupFakeReceipt(id: string): string | undefined {
    need(this.available, "COMMAND_ENGINE_UNAVAILABLE");
    const receipt = this.terminal.get(id); return receipt && receiptBytes(receipt);
  }
  acceptReceipt(token: OwnerToken, bytes: string): void {
    this.authority(token); const receipt = parseCommandReceipt(bytes); const record = this.record(receipt.requestId);
    need(receipt.engineFingerprint === ENGINE && receipt.requestHash === hash(record.request), "COMMAND_RECEIPT_MISMATCH");
    // Independent MOCK issuer lookup. Matching fields alone are not an authentic receipt.
    need(this.available && this.lookupFakeReceipt(receipt.requestId) === bytes, "COMMAND_RECEIPT_UNCONFIRMED");
    need(["delivery-intent", "receipted", "settled"].includes(record.stage), "COMMAND_RECEIPT_UNEXPECTED");
    if (record.receipt) { need(receiptBytes(record.receipt) === bytes, "COMMAND_RECEIPT_CONFLICT"); return; }
    this.update(receipt.requestId, { stage: "receipted", receipt });
  }
  observe(token: OwnerToken): CommandObservation {
    this.authority(token); need(this.available, "COMMAND_ENGINE_UNAVAILABLE");
    return { version: 1, ownerEpoch: token.epoch, engineFingerprint: ENGINE, revision: this.engineRevision, targetId: TARGET, resource: this.resource };
  }
  settle(token: OwnerToken, id: string, observation: CommandObservation): void {
    this.authority(token); const record = this.record(id);
    need(record.stage === "receipted" && record.receipt, "COMMAND_RECEIPT_REQUIRED");
    need(JSON.stringify(observation) === JSON.stringify(this.observe(token)), "COMMAND_OBSERVATION_STALE");
    let matches = record.receipt.outcome === "rejected-before-accept";
    if (!matches) matches = record.request.action === "stop" ? observation.resource !== "running"
      : record.request.action === "remove" ? observation.resource === "absent"
        : record.receipt.resourceId === TARGET && observation.resource !== "absent";
    need(matches, "COMMAND_POSTCONDITION_UNCONFIRMED");
    this.update(id, { stage: "settled" });
    if (record.request.action === "historical-create" && record.receipt.outcome === "returned") this.boundId = TARGET;
  }
  setFakeEngineAvailable(available: boolean): void {
    need(typeof available === "boolean", "COMMAND_ENGINE_INPUT_INVALID"); this.available = available;
    this.engineRevision++; // Invalidates observations across even an availability interruption.
  }
  setFakeResource(resource: ResourceState): void {
    need(["running", "stopped", "absent"].includes(resource), "COMMAND_ENGINE_INPUT_INVALID");
    this.resource = resource; this.engineRevision++;
  }
  snapshot() {
    return structuredClone({ revision: this.revision, head: this.head, records: this.records,
      inTransit: [...this.inTransit.keys()], pending: [...this.pending.keys()], effects: this.effectLog, boundId: this.boundId });
  }
  report() {
    const unsettled = this.records.filter(record => !["settled", "retired-unsent"].includes(record.stage)).length;
    return { version: 1 as const, state: "locked" as const, protection: "not-active" as const, canLaunch: false as const,
      executable: false as const, gateway: "deferred" as const, coverage: "command-owner-model-only" as const,
      durability: "not-proven" as const, operationsQuiescent: !!this.owner && this.available && !this.storageFault && unsettled === 0 && this.pending.size === 0 && this.inTransit.size === 0,
      unsettled, pendingFakeEffects: this.pending.size + this.inTransit.size };
  }
}
