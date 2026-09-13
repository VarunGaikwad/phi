# Guard Phase 0: Windows synthetic store / fake-engine prototype

## Status and scope reviewed before native execution

**Passed on native Windows, 2026-09-12: all 15 checks, exit 0; all file workers
exited and all six temporary fixtures were removed.** A separate native verifier
confirmed each exact directory absent. This is the bounded host-only follow-up to
the [restart-reconciliation design](Restart-Reconciliation-Design.md), not a Docker
recovery executor or production journal service.

Files: `guard-host/store-format.ts`, `store-worker.ps1`, `store-worker-client.ts`,
`store-probe.ts`, `probe-store.ts`, `tests/guard-store.test.ts`.
The new opt-in command is `guard:probe-store -- --confirm [--json]`.

All reports remain **Locked / protection not active / canLaunch false**, with
`gateway: deferred`, `coverage: synthetic-store-only`, and `durability: not-proven`.
No full phase gate advances. The current pi process is not protected.

**No Docker/WSL, pi runtime, real project, credentials, arbitrary host path,
network target, download, installation, host apply, ACL or saved-setting change.**
No supervisor is killed. The only deliberate abrupt termination is of the command's
own retained disposable **file worker**, after a positive checkpoint. The trusted
Node fixture controller stays alive and performs all cleanup.

## API review and choice

Reviewed the installed Node `fs/promises` API typings: `FileHandle.sync()` requests
flush to the storage device; its implementation is OS/device specific. A resolved
promise does not prove a crash-safe multi-file transaction or stable-media behavior.
Node's portable file API does not expose the Windows sharing mode required here.

Reviewed installed .NET reference XML for `FileStream`, `FileShare.None`,
`FileStream.Flush(Boolean)`, `FileStream.Lock`, `FileOptions.WriteThrough`, named
`Mutex` construction and abandoned-owner exceptions. Local reference pack:
`Microsoft.NETCore.App.Ref/8.0.15/ref/net8.0/System.Runtime.xml` and
`System.Threading.xml`. These are reference descriptions, **not** a claim that
PowerShell runs that .NET version. Native reflection confirmed the required
`FileStream(path, mode, access, share)` constructor and `Flush(Boolean)` on the
actual Windows PowerShell runtime: PowerShell **5.1.26100.9444**, CLR
**4.0.30319.42000**. No SDK was built, restored or installed.

Chosen bounded primitive: a trusted system PowerShell child opens **the data file
itself**, not a separate lock file, with `FileMode.Open`, `FileAccess.ReadWrite`,
and **`FileShare.None`**, retaining that handle through reads, comparison, writes,
flush/readback and the fake-engine check. Another process must receive native
`ERROR_SHARING_VIOLATION` (32); permission errors/timeouts are not contention passes.
The same child owns the native file handle and performs the I/O, avoiding a design
where a separate lock-holder dies but an unfenced Node writer keeps using the file.

No named mutex is used, no timestamp/PID lease is stolen, and no lock file is deleted
to force access. The file persists after worker exit; reopening is an OS-handle
release observation, **not** a clean-recovery assertion. Default Windows temp-directory
ACLs, ancestors, reparse/alias races, identity stability against hostile host actors,
service ownership and namespace security remain unvalidated for production use.

The helper is fixed reviewed `-Command` text from the repository, using the known
system PowerShell path, `-NoProfile`, `-NonInteractive`, direct argv and a minimal
environment. No execution-policy override, external helper compilation, profile,
user-provided script or shell-startup file is used. Only a random fixture nonce is
passed as environment data; messages over stdin cannot select file paths/programs.

## Store protocol — an experiment, not the production format

The fixture creates six disposable `phi-store-<nonce>-<random>` temp directories.
Each contains exactly a synthetic nonce marker and an initially empty `store.bin`.
The helper checks its fixed root spelling, marker and simple reparse attributes
before opening that fixed file. Those checks deliberately do not claim NTFS race
safety, audited private storage or safe arbitrary-path admission.

`store-format.ts` wraps the existing canonical ownership journal in bounded
append-only snapshot frames:

- At most **128 KiB / eight generations**. No rotation, compaction, truncation,
  overwrite, rename or automatic repair.
- Each canonical frame binds generation, epoch, predecessor hash, base64 journal
  and journal head into SHA-256, followed by a separate `PHI_COMMIT:<hash>` line.
- A data update extends the exact previous journal by one event at the same epoch.
  An epoch claim increments epoch by exactly one without changing journal history.
  Owner identity cannot change within the file.
- Every nonempty partial/torn body or missing/partial marker is rejected. The parser
  never silently falls back to the previous complete frame. Empty storage is only
  a fresh synthetic fixture, not evidence that an old runtime is absent.
- While holding the exclusive handle, the worker compares the whole current file
  digest with the caller's expected digest, appends body, calls `Flush(true)`, appends
  marker, calls `Flush(true)` again and returns bounded readback. The controller
  requires exact bytes and a fully valid frame before recognizing the acknowledgement.
- The acknowledgement is a **fixture receipt**, not a power-loss durability claim.
  The fake engine checks current epoch/head, live worker and one-shot consumption;
  its only effects are adding `stop-intent`/`remove-intent` strings to an in-memory
  array. It has no Docker API and cannot create/start/resume work.

The co-located journal/head and checksums do **not** implement the independently
validated high-water checkpoint from the recovery design. Replay of a whole valid
prefix or the entire file remains undetected without separately trusted state;
unit tests explicitly demonstrate that limit. Do not feed this file's head into a
production reconciler as authenticated anti-rollback evidence.

## Fixed native checks and failure cuts

The expected report requires these **15 checks**, plus confirmed worker/temp cleanup:

| Check | Required observation |
|---|---|
| `nativeExclusiveContention` | A live owner holds the data file; a second real PowerShell process gets only sharing violation 32 |
| `commitReadback` | Both flush calls returned and exact validated snapshot bytes were read back |
| `staleWriterConflict` | A newly opened worker rejects an old whole-file digest without writing |
| `epochAdvance` | Same journal gets a committed next-epoch frame |
| `intentBeforeFakeEffect` | The mock engine rejects an intent before its commit acknowledgement |
| `staleEpochRejected` | An unused request with an earlier epoch/head is rejected by the mock |
| `oneShotRequest` | A live acknowledged stop intent has one fake effect, never two |
| `releasedOwnerRejected` | An otherwise current unconsumed request is rejected after native owner release |
| `reopenCommittedState` | A fresh process independently reopens and validates all five committed frames |
| `shortWriteLocked` | Injected half-body write leaves invalid storage; no fake effect |
| `flushFailureLocked` | Injected failure before the body flush yields no acknowledgement/effect; stored tail is rejected |
| `bodyOnlyLocked` | Failure after body flush but before marker leaves invalid storage |
| `unacknowledgedCommitNoEffect` | Failure after marker write but before explicit final flush/ack may leave complete bytes via disposal; no effect is replayed |
| `interruptedWriterLocked` | At a confirmed post-body-flush checkpoint, force-kill only the retained file worker; partial store is rejected |
| `nativeHandleReleaseAfterKill` | Require actual SIGKILL exit and closed streams, then acquire the same file through a fresh native process |

**Fault injection is explicit:** half writes and flush failures are controller-owned
synthetic exceptions/cuts, not observations of a failing disk or actual short
`FileStream.Write` return. `.Dispose()` can flush buffered bytes after an exception;
no acknowledgement is inferred from later visibility. The fixture tests failure
handling and one controlled process interruption, not every in-flight I/O crash.

The native sharing primitive is real. Epoch/request consumption is **fake-engine
logic**, not Docker-enforced fencing or a validated installation-wide command owner.
The known uncertain-create problem is unchanged: a terminated client does not imply
that a real daemon discarded its request.

Input is capped at 70,000 ASCII characters per command; storage at 128 KiB; worker
output at 512 KiB overall and bounded JSON lines. Responses carry only the fixture's
synthetic bytes over private parent/child pipes, never into the final report. Each
response has a 10-second deadline, exit/cleanup five seconds, whole command 90 seconds.
Timeouts fail; cleanup is independent of main cancellation.

Every retained worker must be observed closed before any fixture directory removal.
Cleanup attempts every owned worker/root independently; uncertain exit preserves
files and reports unconfirmed cleanup. Reports include only synthetic directory
basenames, not personal paths or file contents. Inspect only those exact fixtures
if cleanup is unconfirmed; never remove unrelated temp directories or processes.

## Native command

After reviewing this scope, from native PowerShell in the checkout:

```powershell
npm.cmd run --silent guard:probe-store -- --confirm --json
```

No Docker engine or image is needed. Use the trusted Windows system PowerShell;
its signature should be checked before the first native run. The command accepts no
workspace, storage root, executable, PID, script, engine or provider argument.
`--help` is effect-free; missing/invalid consent returns 64. Non-Windows is blocked
with exit 2. Success is exit 0; execution/verification/cleanup failure is exit 1.
No exit code enables Guard or authorizes a recovery service.

## Native evidence and development validation

Native PowerShell invocation at **2026-09-12T20:55:29+09:00** used `npm.cmd`, Node
**22.23.0** and the fixed system PowerShell path. Authenticode was rechecked as
**Valid / Microsoft** before execution. Exit **0**:

```json
{
  "version": 1,
  "kind": "phi-synthetic-store-probe",
  "state": "locked",
  "protection": "not-active",
  "canLaunch": false,
  "gateway": "deferred",
  "coverage": "synthetic-store-only",
  "durability": "not-proven",
  "probe": "passed",
  "checks": [
    "nativeExclusiveContention", "commitReadback", "staleWriterConflict",
    "epochAdvance", "intentBeforeFakeEffect", "staleEpochRejected",
    "oneShotRequest", "releasedOwnerRejected", "reopenCommittedState",
    "shortWriteLocked", "flushFailureLocked", "bodyOnlyLocked",
    "unacknowledgedCommitNoEffect", "interruptedWriterLocked",
    "nativeHandleReleaseAfterKill"
  ],
  "fixtureNames": [
    "phi-store-87963aed43e8c9b43ce431f863ce6bef-too0s3",
    "phi-store-85c19a30651206e6f871feb02c5a60c7-9ZVAqK",
    "phi-store-65aea22967c1558eea4bb668152a0e91-oISKpT",
    "phi-store-35f784855181350378f7097d7100f5f0-WQ3ehX",
    "phi-store-a92f8e3666d1e2520ee35ba6441d417f-r3hnNN",
    "phi-store-301b358f4f63a551c53f1b1c1df2767c-ZDAWiV"
  ],
  "workerCleanup": "exited",
  "hostCleanup": "removed"
}
```

A separate native Node verifier first confirmed agreement with PowerShell's temp
root, then required `ENOENT` from `lstat` for all six exact basenames above. It
returned `independentlyAbsent: 6`, `tempRootAgreement: true`; it scanned no directory
contents, removed nothing and created no further fixtures. Worker exit/closed
streams were required by the fixture controller itself.

Native typecheck and doctor CLI smoke passed; **142 tests passed, 1 POSIX-only skip,
0 failed** (143 cases), including **14 new tests**. Tests cover frame integrity/cut
points/limits/epoch transitions, rollback limitations, fake-engine fencing, message
schemas and retained synthetic Node worker transport. On Windows, the helper is
also passed to the PowerShell **parser only**, without executing its body. Ordinary
unit tests do not run the native store fixture, Docker or pi, and do not establish
real file sharing or durability. Those native sharing/flush/readback observations
come from the separately confirmed fixture above.

Observed: after the injected marker-write/pre-final-flush failure, normal disposal
left a complete frame on disk even though no commit acknowledgement was issued.
No fake effect was replayed. After the controlled kill following body flush, a new
process acquired the file but rejected the incomplete tail. **Handle release is
not a successful commit or permission to resume work.**

## Remaining gates / next step

A subsequent [command-owner / uncertain-operation receipt design](Command-Owner-Receipts-Design.md)
and deterministic experiment now pass 24 new tests. That in-memory work introduces no
native adapter; its terminal/negative receipt oracle is not a proven Docker capability.
The subsequent [installed Docker evidence review](Docker-Recovery-API-Review.md)
leaves the Engine identity/receipt contract unverified and native recovery adapter
implementation blocked. The subsequent [Windows security API/memory review](Windows-Private-Storage-IPC-Review.md)
now passes 12 tests; the subsequent [file-only ACL harness](Windows-File-ACL-Prototype.md)
passes 10 native checks with both workers exited and independent temp absence. These
are same-user operation controls, not production privacy or a backend receipt. The
subsequent [pipe implementation review](Windows-Pipe-Contract-Review.md) records
first-instance behavior in both installed runtimes, but leaves local-only rejection
and exact peer/process-lifetime binding unestablished. No listener/service is ready;
independent guest-only uncooperative-extension scope/design work is next.
The 15-check native evidence above is unchanged.

Before any Docker supervisor-loss experiment: design and validate the **actual
single engine-command owner and operation receipts**, together with installation-wide
native ownership, private handle-safe storage and a crash-safe checkpoint/epoch
recovery protocol. Resolve the uncertain-create and lease/availability limits without
pretending that these fake-engine checks solve them. A real service/daemon adapter
needs a separate reviewed synthetic experiment and authorization for any termination.

Power loss, machine sleep, disk/flush failure, hostile NTFS replacement, ACL/privacy,
backup rollback, store migration/retention, real controller restart and automatic
expiry remain unproven. No Docker/WSL disruption, new dependency, host settings
change, credentials, real projects or host-pi fallback is approved by this result.
Provider gateway work remains deferred and orders 02–18 stay pending.
