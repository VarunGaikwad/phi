# Guard Phase 0: durable ownership and restart reconciliation design

## Status — design and offline decision model only

Order **01** remains in progress. The [worker-loss experiment](Worker-Loss-Prototype.md)
showed that a Docker guest survives loss of its host worker. The
[35-check whole-agent experiment](Agent-Lifecycle-Prototype.md) also showed that SDK
cancellation/disposal and extension failure do not stop detached guest work.

This continuation adds `guard-host/reconciliation-model.ts` and
`tests/guard-reconciliation.test.ts`: a bounded ownership-journal **byte format**,
structural transition validation, and a pure one-step reconciliation planner.
**There is no durable storage implementation, lock service, engine adapter,
watchdog, recovery CLI, production launcher or supervisor-loss runtime test.**
Existing Docker fixtures and their ownership/cleanup behavior are unchanged.
A subsequent [Windows synthetic store/fake-engine experiment](Windows-Store-Prototype.md)
now passes 15 native checks with verified cleanup. It observes real exclusive file
sharing and readback, but does not implement this design's private production
storage, durable independent checkpoint, installation-wide authority or engine adapter.

All model decisions have `state: "locked"`, `protection: "not-active"`,
`canLaunch: false`, `gateway: "deferred"` and **`executable: false`**. Even a model
outcome of `complete` means only that a synthetic terminal journal and supplied
absence evidence agree; it is not runtime cleanup evidence or launch permission.
The current pi process remains unprotected. No full phase gate advances.

## Chosen recovery policy

- **Stop and quarantine, never resume.** A restarted controller may reconcile
  cleanup, but cannot automatically replay a prompt, start/create a container,
  restore a grant, import history, or apply a patch. Fresh work requires a separate
  future protected-launch admission after recovery completes.
- **Write intent before external effect.** Durable ownership must exist before
  container creation. An immutable container ID must be inspected, bound and
  durably committed before a worker can receive a start operation.
- **Journal presence is not authentication.** Host-private storage, engine identity,
  exclusive command authority and independent observations are separate requirements.
  Guest reports, labels, timestamps, PIDs and a hash chain are not authority.
- **Uncertainty remains visible.** Missing/corrupt records, changed engine identity,
  ambiguous ownership, incomplete scans and possibly outstanding engine requests
  block automatic recovery. Timeouts or empty listings do not silently pass.
- **Keep scope narrow.** One record owns one container. Cleanup uses its immutable
  ID, never an untrusted name as a destructive target. Never prune, remove images,
  remove unrelated resources, change Desktop settings, or stop Docker/WSL globally.

## Trusted owner and engine command authority

A future installation needs a controller-private, bounded persistent store on an
explicitly validated local Windows filesystem, separate from guest/runtime/project
writable paths and ordinary temporary directories. No directory is selected,
created, scanned or migrated by this design model.

The owner record contains only fixed/opaque identities:

| Field | Meaning |
|---|---|
| `installationId` | Random installation identity, not a path or username |
| `engineFingerprint` | Pinned identity of the validated local engine; not its version alone |
| `runId`, `nonce` | Unique runtime/one-container identities; never reused |
| `imageId` | Immutable approved image digest, never a mutable image tag |
| `profile` | Reviewed profile revision; model supports only `node-worker-v1` |
| `creationEpoch` | Installation-wide command epoch that created this owner |
| `policyEpoch` | Host policy revision at admission; does not restore old policy |

The fixed local pipe is necessary but **not sufficient engine identity**. A daemon
replacement, reset, changed context or missing identity must not be interpreted
as proof that old resources are gone. Exact fingerprint construction and authenticated
collection need a version-matched Docker API review/test before implementation.
The model uses a synthetic SHA-256-shaped identity, not a claimed Docker field.

Future container metadata must bind installation, run, nonce, creation epoch and
profile in addition to the exact name/image/immutable ID. Current fixture labels
lack this full schema. **Do not retroactively adopt existing containers from labels
or auto-migrate old probe reports into authority records.** Missing records require
scoped operator investigation, not a broad orphan-deletion sweep.

### Exclusive authority and fencing

Use a **single trusted engine-command owner**, not several independently mutating
Docker clients that merely promise to honor a lease. Workers should have no create,
restart, mount, host-file or arbitrary Docker operation; communicate through narrow
trusted-host IPC, not guest-controlled messages. Existing worker-loss fixture
plumbing is not that production service.

Before restart reconciliation:

1. Acquire validated exclusive installation ownership and a monotonically newer
   recovery epoch. Do not break a lock because its timestamp looks old or a PID
   appears absent; Windows PIDs can be reused and a live process can be suspended.
2. Fence stale IPC/worker requests. Revoke old broker capabilities and future
   provider grants; old policy/session revisions never widen current authority.
3. Establish that old engine operations are quiescent. Closing/killing a Docker
   CLI is **not proof** that the daemon abandoned its request. An epoch label does
   not cause Docker to reject stale requests by itself.
4. Validate the persistent commit head, engine binding and fresh narrow inventory.
   Plan one next step, commit any required intent, then obtain fresh evidence
   immediately before the next engine mutation.

A Windows native mutex/handle-lock helper and an epoch/receipt protocol are
candidates, not implemented primitives. Its security descriptor, abandoned-owner
behavior, handle inheritance, process identity and namespace squatting/DoS handling
must be tested. A stale `wx` lock file, an advisory heartbeat or a check of
`process.kill(pid, 0)` is not an adequate substitute. Do not install a service,
change ACLs or kill an existing process under this document's scope.

## Persistence contract — still to implement and prove

The model emits canonical UTF-8 JSON plus one LF, at most **32 KiB / 64 events**.
Each event binds its sequence, predecessor hash, phase, immutable container ID and
owner fields into SHA-256. Exact schemas, canonical encoding, event order and ID
immutability are enforced. Canonical encoding rejects duplicate keys, trailing
JSON, unexpected fields, partial records and noncanonical rewrites.

**Hashes are corruption checks, not signatures.** A malicious host writer can
rewrite hashes; a whole valid prefix or entire old store can be replayed. The
planner additionally requires an independently supplied `committedHead` matching
the final event hash. The model tests partial journal rollback against that head.
It does **not** authenticate the head or detect coordinated rollback of the journal,
checkpoint and epoch store. Those are trusted-storage/rollback-policy requirements.

A future writer must:

- Validate the owner directory, ancestors, file identity and access policy using
  suitable native Windows handle/no-follow semantics. Reject unsupported reparse,
  alias, hard-link, remote/synced-storage and race cases rather than claiming that
  path strings or POSIX `mode: 0700` establish Windows privacy.
- Serialize updates under exclusive ownership. Treat a revision/head mismatch as
  a conflict, not last-writer-wins. Never give the guest a journal append endpoint.
- Commit journal data and its checkpoint/epoch consistently, with an explicit
  crash-recovery protocol. A temporary file + rename is not assumed to be a durable
  multi-file transaction on Windows. Choose and test an actual storage strategy
  (for example validated native replace/flush plus recoverable commit metadata)
  before promising process-crash or power-loss durability.
- Acknowledge an intent only after the required commit/flush barrier succeeds.
  Then and only then may an engine command be issued. An append-success return,
  Node promise resolution or subsequent readback alone does not prove stable storage.
- On short write, flush failure, disk full, antivirus/file-lock contention, torn
  replacement or checksum/head disagreement: deny new effects and preserve evidence.
  A previously committed stop intent can still support a separately verified
  emergency stop; failed recording never licenses a create/start.
- Reserve bounded capacity for stop/removal/tombstone records. Rotate or compact
  only under an independently designed crash-safe checkpoint protocol. The model
  caps events and refuses new record proposals when exhausted; it does not silently
  evict history. A committed stop may still be proposed without a new record.
- Retain terminal tombstones and unresolved ownership claims across restarts;
  define retention/backup/restore reconciliation before deleting old records.
  Never remove the journal merely because a container removal command returned 0.

Node/native Windows persistence and locking APIs must be reviewed against the
installed versions before implementing that adapter. No native durability or
power-loss behavior is inferred from these in-memory tests.

## Lifecycle and crash cut points

The ordinary model chain is:

```text
create-intent -> identified -> start-intent -> running
                                |              |
                                +-> stop-intent <-+
                                      |
                                   stopped
                                      |
                                 remove-intent -> removed (tombstone)
```

`identified` can go straight to stop or remove intent. A guest found running again
from `stopped` or `remove-intent` returns through a new stop intent; a terminal
record cannot be reopened. Restart reconciliation never proposes `start-intent`
or `running`: those exist only to represent crash points from a future launcher.
`appendRecoveryEvent()` validates **structure**, not evidence that an effect or
commit happened. It must never be treated as the future authorization service.

| Crash/observation | Conservative recovery decision |
|---|---|
| No valid journal, even with familiar labels | Block; no automatic adoption/deletion |
| Another owner busy or authority/epoch unconfirmed | Block; no lease stealing |
| Old operation may still finish or engine unavailable | Pending; no success/absence claim |
| Durable create intent, no bound ID, empty inventory | Pending unresolved create; do not retry create or discard record |
| Late create appears with exact ownership and verified full profile | Propose recording immutable identity first, not stop/remove by name |
| Candidate mismatches any ownership field, or multiple candidates | Block; no automatic destructive target |
| Bound ID running, no stop intent | Propose durable stop intent |
| Bound ID running, stop intent committed | Propose scoped engine stop |
| Stop command returned but guest still running | Continue stop path; do not record stopped |
| Stop intent with independently stopped/absent known ID | Propose recording stopped |
| Bound ID stopped, required history permits removal | Propose remove intent before removal |
| Remove intent committed, stopped owned ID still exists | Propose scoped removal |
| Remove returned but resource is still visible | Not complete; re-observe/reconcile |
| Remove intent committed, known ID independently absent | Propose recording terminal removal |
| Terminal removal plus fresh authoritative absence | Model complete, still Locked/non-executable |
| Terminal removal but matching resource reappears | Block as tombstone conflict; never resume or silently re-adopt |

An empty inventory for an unbound create stays unresolved **even on repeated
successful scans**. The model deliberately has no automatic “cancelled create”
terminal state. Proving that a lost request cannot appear later is an outstanding
command-owner/engine-receipt problem; bounded polling is not a solution. Retain the
claim/nonce, keep launches locked and report the limit instead of retrying creation.

## Required fresh inventory and action receipts

The future observation adapter must query a bounded union of the expected exact
name, installation/run/nonce labels **and the known immutable ID**, then independently
inspect every candidate. Looking up only the nonce label can falsely report absence
if a known container's metadata is unexpected. Duplicate or incomplete query results
must not be truncated into a passing single match.

The planner accepts at most 16 **normalized synthetic candidates**. `inventory:
complete`, `operationsQuiescent`, `fence`, `profileVerified` and `committedHead` are
plain model inputs, **not cryptographically verified assertions**. No adapter
currently produces them from Docker, a lock handle or persistent storage. Production
code must not accept these booleans from guests, saved transcripts or remote callers.

- A newly discovered unbound candidate needs full profile verification before
  identity binding. Exact labels alone are insufficient.
- A previously bound immutable ID with matching owner fields can be stopped even
  if its current security profile drifts. Launch safety is not a prerequisite to
  stopping already-owned unsafe work. Ownership mismatch still prevents automation.
- Normalize `stopped` only from independent, complete backend state (no live PID,
  no running/restarting/paused work), not an exit reply or guest heartbeat absence.
  Unrecognized state stays pending. All mutations recheck current ownership.
- Stop/removal actions must be issued only by immutable ID through the fixed trusted
  client/endpoint; never execute the planner's output as arbitrary argv. No guest
  exec, host shell, image deletion or broad engine command exists in the model.
- Every mutation needs independent post-effect observation, and every commit needs
  a storage receipt. Retry decisions are idempotent only after fresh observation.
  Saved decisions/evidence are not reusable grants and must not survive an epoch
  change, lock loss or engine change.

The 64-event bound is not a retry scheduler. A future executor needs bounded
attempt/backoff/deadline policy, private sanitized audit and explicit unresolved
outcomes. A failure cleaning one record must not skip other independently owned
records, but may not weaken their checks. This model handles one record only.

## Supervisor loss versus a working watchdog

Restart reconciliation addresses **eventual cleanup after control returns**. It
cannot guarantee that a guest stops while no trusted controller/engine channel is
available. Docker `--restart=no`, a persisted lease expiry and a dead parent PID do
not enforce an autonomous deadline on the guest.

To promise bounded stop on supervisor loss, a separately supervised command owner
must survive the lost client and enforce expiration using its own monotonic timer,
or a validated lower-level mechanism must stop the owned guest independently.
Clock rollback and machine sleep/resume must not renew stale authority. A
cooperative guest timer or pi shutdown hook is not that boundary.

If the daemon or this command owner disappears, report **Locked / stop unconfirmed**,
revoke available broker authority and preserve ownership. Do not report stopped or
kill the shared Docker/WSL VM, which could disrupt unrelated work. Provider expiry
and host-apply capabilities are future integrations; gateway work remains deferred.
No automatic-containment-on-supervisor-loss claim is justified yet.

## Validation and next bounded experiment

The 17 new pure tests cover canonical/limited parsing, all crash cut points,
intent ordering, missing/corrupt/rolled-back ownership, engine/installation changes,
stale epochs, unsettled requests, empty and late-create observations, exact identity,
ambiguous candidates, profile drift, revived work, removal postconditions, tombstones
and journal exhaustion. They perform **no file I/O, Docker calls, networking, process
kills, pi imports or credential inspection**. Native suite results are recorded
below after validation; no new native Docker run is required for this model.

The scheduled Windows API review and **disposable host-only synthetic store/fake-engine
harness** have since [passed their bounded scope](Windows-Store-Prototype.md): 15 checks,
all workers exited and six exact temp roots independently confirmed absent. Native
sharing is real; short writes/flush failures are injected, engine fencing is mocked,
and only one retained file worker was killed at a confirmed post-body-flush cut.
Process-crash observations are not power-loss or production privacy/rollback proof.

The subsequent [single command-owner / receipt design and experiment](Command-Owner-Receipts-Design.md)
now passes 24 deterministic tests, including late transport acceptance/completion,
request-bound receipts and independent postconditions. All authority/storage/issuer
mechanisms are mocks, with no native engine integration. The subsequent
[installed Docker evidence review](Docker-Recovery-API-Review.md) found insufficient
local API material to establish identity/receipt guarantees; native recovery adapter
implementation remains blocked. The subsequent [Windows security API/memory review](Windows-Private-Storage-IPC-Review.md)
passes 12 tests but proves no native privacy or authenticated IPC. Its subsequent
[file-only ACL fixture](Windows-File-ACL-Prototype.md) passes 10 native checks and
cleanup, not cross-user/process isolation. The subsequent [pipe implementation review](Windows-Pipe-Contract-Review.md)
records first-instance constructor behavior but leaves local-only rejection and exact
peer/process-lifetime binding unestablished. No listener/IPC harness is ready; independent
guest-only uncooperative-extension design/testing is next. Missing backend
evidence must not be replaced with the mock receipt oracle. The store harness deliberately
has no independent authenticated high-water checkpoint and cannot substitute for
validated durable recovery. Do not integrate either model into current Docker fixtures
or treat fake-engine fencing as real command authority. Any further termination
requires a narrowly reviewed disposable-harness target, never this agent/controller.

**Before a supervisor-loss Docker experiment**, require all of:

- validated private Windows storage, commit/checkpoint recovery and native exclusive
  ownership/fencing; no stale writer can dispatch new effects;
- a reviewed operation-receipt strategy for uncertain create/start requests;
- a retained, independently supervised recovery authority plus exact owned-resource
  and temp-data cleanup procedures;
- unchanged hardened synthetic fixture and explicit scope/authorization for killing
  only its disposable supervisor, not this agent/controller, Docker Desktop or WSL;
- clean independent absence verification, and no claims about production watchdog
  availability, all failure windows or power-loss recovery beyond tested evidence.

Until then **do not kill a supervisor, restart the daemon, stop Desktop/WSL, inspect
credentials, import real projects, download/install anything or remove unrelated
resources**. All original Guard gates and orders 02–18 remain pending.

## Development validation

Native Windows / Node **22.23.0**, using `npm.cmd` from PowerShell:

- `npm.cmd run typecheck`: passed.
- `npm.cmd test`: **128 passed, 1 POSIX-only skip, 0 failed** (129 cases), including
  **17 new pure model tests**. The existing suite still includes separately scoped
  disposable host-worker tests; the new model tests do not spawn or kill processes.
- `npm.cmd run test:smoke`: passed, doctor CLI only.

No Docker or pi runtime was launched in this continuation. No native storage,
engine identity/fencing adapter or supervisor-loss behavior was tested. These
results validate the offline model, **not durability or restart-recovery acceptance**.
