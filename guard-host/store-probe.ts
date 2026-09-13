// Opt-in host-only synthetic persistence/Windows sharing experiment. NEVER Docker recovery.
import { randomBytes } from "node:crypto";
import { mkdtemp, writeFile, rm, lstat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { appendRecoveryEvent, createRecoveryJournal } from "./reconciliation-model.ts";
import { parseStore, prepareStoreAppend, StoreFakeEngine, StoreFixtureError, requireStore } from "./store-format.ts";
import { startStoreWorker, type StoreWorker } from "./store-worker-client.ts";
export const STORE_CHECK_IDS = ["nativeExclusiveContention", "commitReadback", "staleWriterConflict", "epochAdvance",
  "intentBeforeFakeEffect", "staleEpochRejected", "oneShotRequest", "releasedOwnerRejected", "reopenCommittedState",
  "shortWriteLocked", "flushFailureLocked", "bodyOnlyLocked", "unacknowledgedCommitNoEffect", "interruptedWriterLocked", "nativeHandleReleaseAfterKill"] as const;
export interface StoreProbeReport {
  version: 1; kind: "phi-synthetic-store-probe"; state: "locked"; protection: "not-active"; canLaunch: false;
  gateway: "deferred"; coverage: "synthetic-store-only"; durability: "not-proven";
  probe: "passed" | "blocked" | "failed"; checks: string[]; fixtureNames: string[]; workerCleanup: "not-needed" | "exited" | "unconfirmed";
  hostCleanup: "not-needed" | "removed" | "unconfirmed"; rule?: string;
}
export async function probeSyntheticStore(signal?: AbortSignal): Promise<StoreProbeReport> {
  const report: StoreProbeReport = { version: 1, kind: "phi-synthetic-store-probe", state: "locked", protection: "not-active", canLaunch: false,
    gateway: "deferred", coverage: "synthetic-store-only", durability: "not-proven", probe: "blocked", checks: [], fixtureNames: [], workerCleanup: "not-needed", hostCleanup: "not-needed" };
  if (process.platform !== "win32") return { ...report, rule: "STORE_WINDOWS_HOST_REQUIRED" };
  const roots: string[] = []; const workers: StoreWorker[] = [];
  const check = () => requireStore(!signal?.aborted, "STORE_PROBE_CANCELLED");
  const onAbort = () => { for (const worker of workers) void worker.close().catch(() => {}); };
  signal?.addEventListener("abort", onAbort, { once: true });
  const open = async (root: string, nonce: string) => {
    check(); const worker = await startStoreWorker(root, nonce); workers.push(worker); check(); return worker;
  };
  const make = async () => {
    check(); const nonce = randomBytes(16).toString("hex");
    const root = await mkdtemp(join(tmpdir(), `phi-store-${nonce}-`)); roots.push(root); report.fixtureNames.push(basename(root));
    await writeFile(join(root, "owner.marker"), nonce, { flag: "wx" });
    await writeFile(join(root, "store.bin"), "", { flag: "wx" });
    const stat = await lstat(join(root, "store.bin")); requireStore(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1);
    let journal = createRecoveryJournal({ installationId: "a".repeat(32), engineFingerprint: "b".repeat(64), runId: nonce, nonce,
      imageId: "sha256:" + "d".repeat(64), profile: "node-worker-v1", creationEpoch: 7, policyEpoch: 1 });
    for (const phase of ["identified", "start-intent", "running"] as const) journal = appendRecoveryEvent(journal, phase, "c".repeat(64));
    return { root, nonce, journal };
  };
  const locked = async (root: string, nonce: string) => {
    const worker = await open(root, nonce); const ready = await worker.next();
    requireStore(ready.status === "locked", "STORE_LOCK_UNCONFIRMED");
    return { worker, bytes: Buffer.from(ready.data, "base64") };
  };
  const commit = async (worker: StoreWorker, nonce: string, prepared: ReturnType<typeof prepareStoreAppend>) => {
    check(); worker.send({ version: 1, nonce, expectedHash: prepared.expectedHash, body: prepared.body.toString("base64"), marker: prepared.marker.toString("base64"), fault: "none" });
    const reply = await worker.next();
    requireStore(reply.status === "committed" && Buffer.from(reply.data, "base64").equals(prepared.combined) && worker.alive(), "STORE_COMMIT_UNCONFIRMED");
    parseStore(prepared.combined); return prepared.frame;
  };
  const rejected = (fn: () => void, rule: string) => {
    try { fn(); return false; } catch (error) { return error instanceof StoreFixtureError && error.rule === rule; }
  };
  try {
    const fixture = await make(); report.probe = "failed";
    const first = await locked(fixture.root, fixture.nonce);
    const contender = await open(fixture.root, fixture.nonce);
    requireStore((await contender.next()).status === "busy" && (await contender.finish()).code === 0 && first.worker.alive(), "STORE_CONTENTION_UNCONFIRMED");
    report.checks.push("nativeExclusiveContention");
    const initial = prepareStoreAppend(first.bytes, fixture.journal, 7);
    await commit(first.worker, fixture.nonce, initial); await first.worker.release();
    report.checks.push("commitReadback");
    const staleWriter = await locked(fixture.root, fixture.nonce);
    staleWriter.worker.send({ version: 1, nonce: fixture.nonce, expectedHash: initial.expectedHash,
      body: initial.body.toString("base64"), marker: initial.marker.toString("base64"), fault: "none" });
    requireStore((await staleWriter.worker.next()).status === "conflict" && (await staleWriter.worker.finish()).code === 0);
    report.checks.push("staleWriterConflict");
    const takeover = await locked(fixture.root, fixture.nonce);
    requireStore(takeover.bytes.equals(initial.combined));
    const claim = prepareStoreAppend(takeover.bytes, fixture.journal, 8);
    const engine = new StoreFakeEngine(); engine.acceptCommit(await commit(takeover.worker, fixture.nonce, claim)); await takeover.worker.release();
    report.checks.push("epochAdvance");
    const stop = await locked(fixture.root, fixture.nonce);
    const stopJournal = appendRecoveryEvent(fixture.journal, "stop-intent");
    const stopWrite = prepareStoreAppend(stop.bytes, stopJournal, 8);
    requireStore(rejected(() => engine.dispatch(stopWrite.frame, true), "STORE_STALE_REQUEST") && Number(engine.effects.length) === 0);
    report.checks.push("intentBeforeFakeEffect");
    engine.acceptCommit(await commit(stop.worker, fixture.nonce, stopWrite));
    requireStore(rejected(() => engine.dispatch(initial.frame, true), "STORE_STALE_REQUEST")); report.checks.push("staleEpochRejected");
    engine.dispatch(stopWrite.frame, stop.worker.alive());
    requireStore(rejected(() => engine.dispatch(stopWrite.frame, true), "STORE_STALE_REQUEST") && engine.effects.length === 1);
    report.checks.push("oneShotRequest"); await stop.worker.release();
    const stopped = await locked(fixture.root, fixture.nonce);
    const stoppedJournal = appendRecoveryEvent(stopJournal, "stopped");
    const stoppedWrite = prepareStoreAppend(stopped.bytes, stoppedJournal, 8);
    await commit(stopped.worker, fixture.nonce, stoppedWrite); await stopped.worker.release();
    const removal = await locked(fixture.root, fixture.nonce);
    const removeWrite = prepareStoreAppend(removal.bytes, appendRecoveryEvent(stoppedJournal, "remove-intent"), 8);
    engine.acceptCommit(await commit(removal.worker, fixture.nonce, removeWrite)); await removal.worker.release();
    requireStore(rejected(() => engine.dispatch(removeWrite.frame, removal.worker.alive()), "STORE_STALE_REQUEST") && engine.effects.length === 1);
    report.checks.push("releasedOwnerRejected");
    const reopened = await locked(fixture.root, fixture.nonce);
    requireStore(reopened.bytes.equals(removeWrite.combined) && parseStore(reopened.bytes).length === 5); await reopened.worker.release();
    report.checks.push("reopenCommittedState");
    for (const [fault, id] of [["short-write", "shortWriteLocked"], ["flush-failure", "flushFailureLocked"],
      ["after-body-flush", "bodyOnlyLocked"], ["after-marker-write", "unacknowledgedCommitNoEffect"], ["pause-after-body", "interruptedWriterLocked"]] as const) {
      const f = await make(); const writer = await locked(f.root, f.nonce);
      const prepared = prepareStoreAppend(writer.bytes, f.journal, 7);
      const fake = new StoreFakeEngine();
      writer.worker.send({ version: 1, nonce: f.nonce, expectedHash: prepared.expectedHash, body: prepared.body.toString("base64"), marker: prepared.marker.toString("base64"), fault });
      const reply = await writer.worker.next();
      if (fault === "pause-after-body") {
        requireStore(reply.status === "cut" && writer.worker.alive(), "STORE_CUT_UNCONFIRMED");
        await writer.worker.killForTest(); // ONLY the file worker, not any Docker/controller process.
      } else requireStore(reply.status === "failed" && (await writer.worker.finish()).code === 1, "STORE_FAULT_UNCONFIRMED");
      requireStore(fake.effects.length === 0 && rejected(() => fake.dispatch(prepared.frame, false), "STORE_STALE_REQUEST"));
      const next = await locked(f.root, f.nonce);
      if (fault === "after-marker-write") {
        // Dispose may flush a complete frame even though no commit ack was issued.
        // It must not automatically replay the missing external effect.
        requireStore(next.bytes.equals(prepared.combined) && parseStore(next.bytes).length === 1);
      } else requireStore(rejected(() => { parseStore(next.bytes); }, "STORE_FIXTURE_INVALID"), "STORE_TORN_TAIL_ACCEPTED");
      await next.worker.release(); report.checks.push(id);
      if (fault === "pause-after-body") report.checks.push("nativeHandleReleaseAfterKill");
    }
    check(); requireStore(report.checks.join() === STORE_CHECK_IDS.join()); report.probe = "passed";
  } catch (error) { report.rule = error instanceof StoreFixtureError ? error.rule : "STORE_PROBE_FAILED"; }
  finally {
    signal?.removeEventListener("abort", onAbort);
    for (const worker of workers) {
      try { await worker.close(); if (report.workerCleanup !== "unconfirmed") report.workerCleanup = "exited"; }
      catch { report.workerCleanup = "unconfirmed"; }
    }
    // Never delete a possibly live worker's files; preserve the fixture on uncertain exit.
    if (report.workerCleanup !== "unconfirmed") for (const root of roots) {
      try {
        await rm(root, { recursive: true, force: true });
        requireStore(await lstat(root).then(() => false, (e: NodeJS.ErrnoException) => { if (e.code === "ENOENT") return true; throw e; }));
        if (report.hostCleanup !== "unconfirmed") report.hostCleanup = "removed";
      } catch { report.hostCleanup = "unconfirmed"; }
    } else if (roots.length) report.hostCleanup = "unconfirmed";
    if (report.workerCleanup === "unconfirmed" || report.hostCleanup === "unconfirmed") { report.probe = "failed"; report.rule ??= "STORE_CLEANUP_UNCONFIRMED"; }
  }
  return report;
}
