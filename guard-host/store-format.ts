// Disposable synthetic store format, not production persistence or rollback protection.
import { createHash } from "node:crypto";
import { MAX_JOURNAL_BYTES, parseRecoveryJournal } from "./reconciliation-model.ts";
export const MAX_STORE_BYTES = 128 * 1024;
export const MAX_STORE_FRAMES = 8;
export class StoreFixtureError extends Error {
  constructor(readonly rule: string = "STORE_FIXTURE_INVALID") { super(rule); }
}
export function requireStore(ok: unknown, rule = "STORE_FIXTURE_INVALID"): asserts ok { if (!ok) throw new StoreFixtureError(rule); }
export function storeHash(bytes: Uint8Array): string { return createHash("sha256").update(bytes).digest("hex"); }
export interface StoreFrame {
  version: 1;
  generation: number;
  epoch: number;
  previousHash: string;
  journal: string;
  head: string;
  hash: string;
}
function content(frame: Omit<StoreFrame, "hash">): Buffer { return Buffer.from(JSON.stringify(frame)); }
function journalOf(frame: StoreFrame) { return parseRecoveryJournal(Buffer.from(frame.journal, "base64")); }
function successor(previous: StoreFrame | undefined, frame: Omit<StoreFrame, "hash">): void {
  const journalBytes = Buffer.from(frame.journal, "base64");
  requireStore(journalBytes.length <= MAX_JOURNAL_BYTES && journalBytes.toString("base64") === frame.journal);
  const journal = parseRecoveryJournal(journalBytes);
  requireStore(frame.head === journal.events.at(-1)!.hash && Number.isSafeInteger(frame.epoch) && frame.epoch > 0
    && frame.epoch < Number.MAX_SAFE_INTEGER && frame.generation === (previous?.generation ?? 0) + 1
    && frame.previousHash === (previous?.hash ?? "0".repeat(64)));
  if (!previous) requireStore(frame.epoch === journal.owner.creationEpoch);
  else {
    const old = journalOf(previous);
    requireStore(JSON.stringify(old.owner) === JSON.stringify(journal.owner));
    if (frame.journal === previous.journal) requireStore(frame.epoch === previous.epoch + 1);
    else requireStore(frame.epoch === previous.epoch && journal.events.length === old.events.length + 1
      && JSON.stringify(journal.events.slice(0, -1)) === JSON.stringify(old.events));
  }
}
/** Refuse ANY incomplete tail. Never silently roll back to an earlier complete frame. */
export function parseStore(input: Uint8Array): StoreFrame[] {
  try {
    requireStore(input instanceof Uint8Array && input.byteLength <= MAX_STORE_BYTES);
    if (!input.byteLength) return [];
    const raw = Buffer.from(input); const text = raw.toString("utf8");
    requireStore(Buffer.from(text).equals(raw) && text.endsWith("\n"));
    const lines = text.slice(0, -1).split("\n");
    requireStore(lines.length % 2 === 0 && lines.length <= MAX_STORE_FRAMES * 2);
    const frames: StoreFrame[] = [];
    for (let i = 0; i < lines.length; i += 2) {
      const v = JSON.parse(lines[i]);
      requireStore(v && typeof v === "object" && Object.keys(v).sort().join(",") === "epoch,generation,hash,head,journal,previousHash,version"
        && v.version === 1 && typeof v.journal === "string" && v.journal.length <= 45000
        && typeof v.hash === "string" && /^[a-f0-9]{64}$/.test(v.hash));
      const base = { version: 1 as const, generation: v.generation, epoch: v.epoch, previousHash: v.previousHash, journal: v.journal, head: v.head };
      successor(frames.at(-1), base);
      requireStore(storeHash(content(base)) === v.hash && lines[i] === JSON.stringify({ ...base, hash: v.hash })
        && lines[i + 1] === `PHI_COMMIT:${v.hash}`);
      frames.push({ ...base, hash: v.hash });
    }
    return frames;
  } catch { throw new StoreFixtureError(); }
}
export function prepareStoreAppend(current: Uint8Array, journalBytes: Uint8Array, epoch: number) {
  const frames = parseStore(current); requireStore(frames.length < MAX_STORE_FRAMES, "STORE_FIXTURE_FULL");
  const journal = parseRecoveryJournal(journalBytes);
  const base = { version: 1 as const, generation: frames.length + 1, epoch, previousHash: frames.at(-1)?.hash ?? "0".repeat(64),
    journal: Buffer.from(journalBytes).toString("base64"), head: journal.events.at(-1)!.hash };
  successor(frames.at(-1), base);
  const frame = { ...base, hash: storeHash(content(base)) };
  const body = Buffer.from(JSON.stringify(frame) + "\n"); const marker = Buffer.from(`PHI_COMMIT:${frame.hash}\n`);
  const combined = Buffer.concat([current, body, marker]); parseStore(combined);
  return { expectedHash: storeHash(current), body, marker, combined, frame };
}
/** Mock engine only: epoch/head matching, once-only use, and live-owner checks. */
export class StoreFakeEngine {
  private latest?: { epoch: number; hash: string };
  private used = new Set<string>();
  readonly effects: string[] = [];
  acceptCommit(frame: StoreFrame): void {
    requireStore(!this.latest || frame.epoch >= this.latest.epoch, "STORE_STALE_EPOCH");
    this.latest = { epoch: frame.epoch, hash: frame.hash };
  }
  dispatch(frame: StoreFrame, ownerAlive: boolean): void {
    requireStore(ownerAlive && this.latest?.epoch === frame.epoch && this.latest.hash === frame.hash
      && !this.used.has(frame.hash), "STORE_STALE_REQUEST");
    const phase = journalOf(frame).events.at(-1)!.phase;
    requireStore(phase === "stop-intent" || phase === "remove-intent", "STORE_NON_CLEANUP_REQUEST");
    this.used.add(frame.hash); this.effects.push(phase); // No real engine API exists.
  }
}
