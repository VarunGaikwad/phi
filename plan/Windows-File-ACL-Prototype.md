# Guard Phase 0: disposable Windows file-only ACL prototype

## Scope reviewed before native execution

Implemented after the [Windows API/memory review](Windows-Private-Storage-IPC-Review.md).
**Native Windows pass: all 10 checks, exit 0; both workers exited and the exact temp
root was removed and independently confirmed absent.** Files: `guard-host/acl-worker.ps1`,
`acl-probe.ts`, `probe-acl.ts`, `tests/guard-acl.test.ts`; explicit command
`guard:probe-acl -- --confirm [--json]`.

This experiment creates **only two new synthetic files with creation-time DACLs** in
one fresh nonce-named temp root. It does not change an existing object's ACL, repair
permissions, inspect real projects, resolve account names, read credentials, impersonate,
change privileges, switch users, open a pipe listener, install/compile anything, run
Docker/pi or terminate any process. Ordinary parent/child stdio is transport only.

All reports are **Locked / not active / canLaunch false / executable false / gateway
deferred**, with `productionPrivacy: not-proven` and `crossUserIsolation: not-tested`.
No full phase gate advances. The current pi process remains unprotected.

## Reviewed mechanics

The controller creates one `phi-acl-<nonce>-<suffix>` root and a fixed 32-byte ownership
marker. Only `allow.bin` and `deny.bin` may be created by the native worker. Paths,
SID, executable, PID, commands, ACLs and policy cannot be supplied through the CLI.
The worker validates fixed cwd spelling/nonce/role and basic root/marker reparse
attributes. These checks are **not production ancestor/alias/race safety**.

The fixed trusted system PowerShell runs `-NoProfile -NonInteractive -Command` with
reviewed repository source and a minimal environment. No policy override, profiles,
`Add-Type`, private reflection or helper installation. The first worker's normal exit
and closed streams must be observed before starting the second.

### Creator worker

- Queries only its current Windows user SID with `WindowsIdentity.GetCurrent(Query)`
  and disposes that identity object. SID/owner/group/descriptor bytes stay in the worker;
  no account names, token bytes/claims, privilege lists or personal paths are emitted.
- Builds protected explicit DACLs in memory with the local SID as owner. The allow file
  has one full-control allow ACE. The deny-read control has the same allow plus an
  explicit **ReadData deny** ACE. No inheritance, other principals or extra ACEs pass.
- Supplies these descriptors to the reflected `FileStream(path, CreateNew,
  FileSystemRights, share, buffer, options, FileSecurity)` constructor. It never calls
  `SetAccessControl`, `Set-Acl`, `icacls` or take-ownership/repair tools.
- Requests **WriteData + ReadPermissions**, not ReadData. Reads the exact ACL back
  through the retained handle, writes the fixed public payload `phi-acl-synthetic-v1`,
  flushes and closes. Flush/readback is not a power-loss durability test.
- After closing writers, attempts `CreateNew` against its own allow file with a different
  would-be descriptor. Only native already-exists errors **80 / 183** count as the
  collision. The unexpected stream, if any, is closed without writing. Then verifies
  original payload and raw ACL bytes unchanged through a fresh read handle.

### Separate same-user read-only worker

- Queries its own SID only locally and checks that the files' owner and exact rules
  match that SID. No name lookup or identity switching.
- Opens the allow file for read, validates its ACL and exact bytes, then closes it.
- Opens the deny file with **ReadPermissions only**, using the seven-argument rights
  constructor with null security for `Open`. This requests metadata, not data/write
  rights, and does not change the existing ACL. Requires `CanRead`/`CanWrite` false,
  validates the deny descriptor through that handle, then closes it.
- Attempts a new ordinary read handle on the deny file. Only native **access denied
  (5)** passes. Sharing violation 32, a missing file, unexpected success or timeout
  cannot substitute for a DACL denial.
- Repeats the allow-file positive control after the denial, then verifies both ACL
  snapshots unchanged. All handles and the identity object are disposed before output.

Both helpers run under the **same user**. A user owning the DACL may be able to rewrite
it, and privileged identities have additional authority. The reader deliberately
requests only reads/metadata and never tries to change permissions. These checks are
requested-operation controls, not cross-user isolation, hostile same-user containment,
production private storage or authenticated IPC. The temp root/marker retain default
creation permissions and are not claimed to be a private installation directory.

## Required checks

| Creator | Required evidence |
|---|---|
| `creationTimeAllowAcl` | Exact owner/protected one-ACE allow DACL read back through newly created handle |
| `creationTimeDenyAcl` | Exact owner/protected allow + ReadData-deny DACL read back through newly created handle |
| `createNewCollision` | Existing owned allow file rejects create with 80/183, not sharing/permission/timeout |
| `collisionPreservedBytes` | Original fixed allow payload still reads exactly |
| `collisionPreservedAcl` | Original allow descriptor unchanged after rejected create |

| Reader | Required evidence |
|---|---|
| `allowReadBefore` | Fresh allow read and exact descriptor/payload verification |
| `denyAclReadback` | Metadata-only handle validates exact deny DACL, without data/write ability |
| `denyReadAccessDenied` | Fresh data-read open returns native access denied 5 |
| `allowReadAfter` | Same reader still succeeds on the allow file after the denial |
| `readerAclUnchanged` | Both descriptor snapshots unchanged after reader controls |

All **10 checks**, both normal worker exits and verified owned-temp cleanup are needed
for a fixture pass. Neither a single denial nor success-shaped stdout alone is enough.

## Protocol, cancellation and cleanup

Workers emit one compact nonce/role-bound JSON frame containing only ordered boolean
checks and a bounded failed-check identifier. No exception text, SID, security descriptor,
raw filesystem path or payload is included. Controller rejects duplicate keys, extra or
out-of-order checks, wrong nonce/role, false/missing checks, nonzero/signal exits and stderr.
Input to the workers is fixed source/env, not a guest or general-purpose command protocol.

Worker output is bounded to **8 KiB total**; each worker deadline is **15 seconds**;
main command cancellation is requested at **45 seconds**. Cancellation stops new work
and allows up to five seconds for the current fixed worker to exit naturally.

**There is no process-kill fallback.** On timeout/excess output or unconfirmed exit,
the controller closes its own stdio endpoints, unreferences the child and reports
worker/temp cleanup **unconfirmed**, preserving the files. This may leave a worker
alive; no stopped/cleaned claim is made. Do not infer authority to kill a PID or change
ACLs to recover. Retain the exact reported fixture and investigate under separate scope.

Only after every started worker is confirmed closed does the controller remove its
exact root and require `ENOENT` from `lstat`. Main cancellation cannot cancel that
cleanup. Removal or absence-verification failure overrides otherwise passing checks.
No ACL reset, parent permission change, prune or unrelated resource removal is allowed.
Cleanup/filesystem behavior and unconfirmed-worker cases are also exercised through
trusted mocked test ports; those tests are not native kernel evidence.

## Native command

Read this scope and review the code before opting in from native PowerShell:

```powershell
npm.cmd run --silent guard:probe-acl -- --confirm --json
```

Verify the fixed system PowerShell signature before the first run. `--help` performs
no fixture work. Missing/invalid consent exits 64; non-Windows is blocked with exit 2;
fixture failure exits 1. Only full fixture success including cleanup exits 0.
No exit code enables Guard. No credentials, provider or real-project input is needed.

## Native evidence / validation

Native PowerShell invocation at **2026-09-12T22:46:56+09:00**, Node **22.23.0**,
PowerShell **5.1.26100.9444 / CLR 4.0.30319.42000**. System PowerShell Authenticode
was rechecked **Valid / Microsoft** before the run. Exit **0**:

```json
{
  "version": 1,
  "kind": "phi-file-acl-probe",
  "state": "locked",
  "protection": "not-active",
  "canLaunch": false,
  "executable": false,
  "gateway": "deferred",
  "coverage": "synthetic-file-acl-only",
  "productionPrivacy": "not-proven",
  "crossUserIsolation": "not-tested",
  "probe": "passed",
  "stage": "complete",
  "checks": [
    "creationTimeAllowAcl", "creationTimeDenyAcl", "createNewCollision",
    "collisionPreservedBytes", "collisionPreservedAcl", "allowReadBefore",
    "denyAclReadback", "denyReadAccessDenied", "allowReadAfter",
    "readerAclUnchanged"
  ],
  "workerCleanup": "exited",
  "hostCleanup": "removed",
  "fixtureName": "phi-acl-f5273aee9198a47096b8e02b88e93356-VzxRsC"
}
```

A separate native Node verifier first confirmed agreement with PowerShell's temp
root, then required `ENOENT` from `lstat` for that exact basename. It returned
`tempRootAgreement: true` and `independentlyAbsent` with the basename above. It scanned
no directory contents and removed nothing. Worker exit/closed streams were required
by the fixture controller itself; no process was killed or ACL repaired.

Observed: Framework's metadata-only `ReadPermissions` handle supports ACL readback
with both `CanRead`/`CanWrite` false. The separate reader received native access denied
on the deny file between successful allow-file reads. No SID/descriptor/personal path
was emitted. These are the stated same-user controls, not a distinct-user test.

Native typecheck and doctor CLI smoke passed; **196 tests passed, 1 POSIX-only skip,
0 failed** (197 cases), including **13 new tests**. Ordinary tests use mocked controller
ports and parse the fixed helper through PowerShell's syntax parser only; they do not
execute the native ACL worker, query real identity or change file ACLs. The existing
full suite retains its separately scoped disposable-worker/memory tests.

## Remaining dependency and next step

The successful file-only result establishes only these creation/collision/read
controls. Windows path/ancestor/alias safety, distinct-principal enforcement, peer PID /
handle lifetime binding, pipe namespace ownership/local-only rejection, exclusive
engine-command authority, durable checkpoints and actual restart recovery remain open.

The subsequent [installed pipe implementation review](Windows-Pipe-Contract-Review.md)
found first-instance behavior in Framework's one-instance constructor despite the
missing enum name, but did not establish local-only rejection or exact peer/process
lifetime binding. No listener/IPC harness is ready. Do not cast absent Framework flags
or use unreviewed native interop. Next independent work is a separately bounded
guest-only uncooperative-extension experiment, designed/tested before opt-in execution. Existing [backend identity/receipt evidence gaps](Docker-Recovery-API-Review.md)
keep the recovery adapter blocked. Gateway stays deferred; no supervisor, daemon or
Desktop/WSL disruption, host-pi fallback, settings change or production admission is
implied. Orders 02–18 remain pending.
