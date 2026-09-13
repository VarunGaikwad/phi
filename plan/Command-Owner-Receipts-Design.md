# Guard Phase 0: single command owner and uncertain-operation receipts

## Scope

Follow-up to the [restart-reconciliation design](Restart-Reconciliation-Design.md)
and [Windows store experiment](Windows-Store-Prototype.md). Implemented as
`guard-host/command-owner-model.ts` plus `tests/guard-command-owner.test.ts`:
a **deterministic in-memory owner/store/transport/fake-engine experiment**, not an
engine adapter, authenticated IPC endpoint, service or recovery executor.

No filesystem, subprocess, termination, clock, networking, Docker, pi import,
credential inspection, installation or host settings change is performed by this
module or its tests. There is no new CLI or package script. Existing native fixture
code and scopes remain unchanged. The previously passed 15-check Windows file-worker
experiment is not rerun or promoted into production storage by this work.

Every report remains **Locked / not active / canLaunch false / executable false /
gateway deferred / durability not proven**, including synthetic quiescent outcomes.
The current pi process remains unprotected; order 01 remains in progress and orders
02–18 remain pending.

## Required ownership split

A future deployment needs one separately supervised, trusted **command owner** with
exclusive engine-command access. Runtime workers submit narrow host IPC requests;
they do not own Docker clients or receive a general engine socket. The owner must
survive loss of an ordinary requesting worker and retain its operation ledger.

Fencing has two different meanings:

1. **Future-request fencing:** after authority changes, the old worker/owner token
   cannot submit new commands at the sole command-owner entry point.
2. **Already-sent work:** a request may still be in transport, accepted by the engine,
   executing, or completed with its response lost. Changing an epoch, closing a pipe
   or killing the original client does not retract that work.

The new experiment deliberately lets the fake engine accept transport-delayed old
requests **after** replacement of the modeled owner. It also lets previously accepted
work finish after replacement. The engine does not enforce the owner's epoch.
An old receipt can therefore be relevant reconciliation evidence without granting
its old sender any renewed command authority.

The modeled token is only an integer epoch. It is **not secret, authenticated or an
unforgeable capability**; all callers are trusted test-driver code. Exclusive acquire,
monotonic epoch recovery and ledger persistence are in-memory assumptions. Production
requires native private IPC/peer binding, installation ownership, secured engine access,
process/handle inheritance analysis and crash-safe storage that this class cannot supply.

## Bounded operation ledger

One fixed synthetic installation, engine and resource; at most **16 retained requests**.
There is at most one unsettled request. No automatic eviction, retry, lease expiry,
backoff, rotation, pruning or resubmission. Capacity exhaustion blocks new requests.

The public modeled command path accepts only `stop` and `remove`, using the fixed
bound immutable ID. It rejects create/start/resume/exec, arbitrary paths and arbitrary
engine actions. A special constructor seed represents an **already outstanding
historical create**, with no bound ID; it is not a create/launch API.

Each request binds installation, engine, issuing epoch, unique committed request ID,
action, immutable target (null for the historical create), intent revision and prior
ledger head. Receipts bind the exact canonical request digest, not just the latest
epoch or a replaceable global head. Old receipt replay never rolls the current ledger
head back. Exact duplicate receipt processing is an idempotent read, not a new write
or another engine effect.

```text
prepared --delivery-intent--> receipted --fresh postcondition--> settled
    |
    +-- proven never sent --> retired-unsent
```

Both `prepared` and `delivery-intent` require acknowledged mock commits. The second
commit must return before a send is attempted. If only `prepared` is committed, a
replacement owner may retire it as unsent, but cannot dispatch it with its old epoch.
Once `delivery-intent` might be committed, absence of a response or receipt lookup
is uncertainty, not cancellation. The request cannot be retired as unsent or reused.

Preparation checks do not remain a reusable grant: dispatch rechecks current owner,
engine availability and exact target/state before committing delivery intent. Fresh
state changes after that point still require receipt/postcondition handling; the
model is not an atomic engine-state transaction.

## Receipt contract and the missing backend guarantee

The fake engine provides a deliberately stronger oracle than has been established
for Docker: a request-keyed, retained terminal receipt with no later effects for that
request. Receipt input is canonical bounded JSON (**1 KiB maximum**) with exact fields;
duplicate keys, noncanonical encoding, unknown outcomes/IDs and wrong identities fail.
Matching request bytes are necessary but not sufficient: the model also checks the
receipt against its separate **trusted fake issuer**. This comparison is not a
cryptographic signature or a production receipt adapter.

| Evidence | Allowed interpretation |
|---|---|
| No response / timeout / closed client | Request may still arrive or finish; do not resend |
| Receipt lookup returns no entry | Still unknown; this is not a negative receipt |
| Complete empty resource inventory | No current matching object seen, not proof against a late create |
| Explicit fake `rejected-before-accept` | Issuer promises zero accepted work and no future effect for this exact request |
| Fake terminal `returned` | Request is finished according to the issuer, not proof of desired resource state |
| Bound receipt plus fresh exact observation | May record the modeled postcondition, not resume work |
| Engine unavailable / changed observation revision or owner | Block settlement and re-observe through current authority |

**No Docker API is asserted to provide that terminal/negative receipt oracle.** No
real engine identity or version-matched HTTP semantics were reviewed by this new
module. The existing fixed local pipe/version metadata and CLI exit codes do not
satisfy this contract. Implementing an in-memory lookup table next to a Docker client
would not repair the crash window between daemon acceptance and local receipt commit.

If the actual backend cannot establish the required negative/terminal result, keep
the request **unresolved**. Do not synthesize rejection from repeated polling, an
expired deadline, a missing container, an old PID or a dead CLI. This can leave work
running and block cleanup in the conservative single-request model: it is a visible
availability/containment gap, not a successful watchdog outcome.

## Settlement and historical create

Receipts and postconditions are separate commits. A returned stop that leaves the
resource running cannot settle; a returned remove that leaves it present cannot
settle. Observations are tied to current owner, engine identity, immutable target
and fresh fake-engine revision. Resource drift or even an availability interruption
invalidates an earlier observation. An earlier owner's observation is not reusable.

`operationsQuiescent: true` means only that this **mock** owner has no unresolved
requests/transports/effects and the mock engine is available. It does not mean a
guest is stopped: a definitively rejected stop can be quiescent while the resource
is still running. It is never passed to `planReconciliation()` as real evidence.

The historical-create seed remains unresolved through repeated empty observations.
It can become visible after owner replacement. The model binds its immutable ID
only after both an exact terminal receipt and current positive observation, then
allows separately requested cleanup. It never starts the created resource. A create
return without an immutable identity remains unresolved. The fixture assumes one
prevalidated identity/profile; ambiguity, actual label/profile verification and
untrusted candidate admission remain the separate reconciliation/adapter problem.

## Failure cuts and persistence limitations

Mock commit injection cuts before or after the **atomic memory update** for each of
preparation, delivery intent, receipt persistence and settlement. Either cut revokes
the modeled owner and requires explicit reacquisition/reload; no missing commit ack
licenses a send. A post-delivery-marker/pre-send cut intentionally stays unresolved,
even though the test driver knows it never sent anything.

A lost receipt-commit acknowledgement can be recovered by reading the committed
receipt without resubmitting. A committed historical identity settlement likewise
survives simulated owner replacement by reloading that binding from its record.
These are deterministic state-machine tests, **not actual process restart, native
storage crash recovery or power-loss evidence**. The entire ledger/epoch/head and
mock issuer share the trusted test process; coordinated rollback is not prevented.

The older `StoreFakeEngine` helper remains scoped to its serial file-store fixture.
Its `acceptCommit` input is trusted test input, not a general delayed receipt ledger.
The new experiment uses request-bound retained records and tests same-epoch/out-of-order
receipt replay separately; it is not wired to that store helper or Docker probes.

## Validation

Native Windows / Node **22.23.0**, PowerShell invocation at
**2026-09-12T21:20:00+09:00**:

- `npm.cmd run typecheck`: passed.
- `npm.cmd test`: **166 passed, 1 POSIX-only skip, 0 failed** (167 cases), including
  **24 new deterministic tests**.
- `npm.cmd run test:smoke`: passed, doctor CLI only.

The new model tests spawn/kill nothing and perform no I/O. The full existing suite
still includes its previously scoped disposable host-worker and PowerShell syntax
tests. No native store/Docker/pi runtime fixture was run in this continuation.

The new tests cover single-owner contention, stale/malformed tokens, forbidden actions,
intent ordering, fresh dispatch checks, transport-delayed acceptance, late completion,
unknown delivery, definitive fake rejection, failed postconditions, receipt integrity,
replay, stale observations, availability changes, historical late creates, eight
commit cuts, lost acknowledgements, bounds and returned-object mutation isolation.

## Next dependency / explicit stop condition

The subsequent [installed Docker evidence review](Docker-Recovery-API-Review.md)
collected 11 offline builtin help/version responses but did not locate matching Engine
API schema/implementation in the checked local material. Identity/terminal/negative
receipt guarantees remain unverified; no native recovery adapter was built. CLI help
is not a substitute for the fake issuer's contract, nor proof of global API absence.
The subsequent [Windows security API/memory review](Windows-Private-Storage-IPC-Review.md)
passes 12 new tests; the subsequent [file-only ACL fixture](Windows-File-ACL-Prototype.md)
passes 10 native checks with verified cleanup and no existing ACL/settings change.
Same-user controls are not production privacy or a backend receipt. The subsequent
[installed pipe implementation review](Windows-Pipe-Contract-Review.md) finds
first-instance behavior in Framework's one-instance constructor, but leaves explicit
local-only rejection and exact peer/process-lifetime binding unestablished. No IPC
harness/service is authorized. Independent guest-only uncooperative-extension
scope/design work is next, without promoting any mock authority into a real adapter.

The blocked dependency remains: map this required contract to **version-matched local backend API evidence** before
implementing a native command-owner adapter: engine incarnation identity, create/start/
stop/remove completion semantics, transport cancellation and whether any authoritative
negative or terminal request lookup exists. Record unsupported guarantees as blockers;
an adapter must not fabricate the fake engine's oracle.

Then separately scope a host-only IPC/receipt-adapter experiment for supported
semantics, while preserving the remaining Windows private-storage/checkpoint/fencing
requirements. No production recovery integration or supervisor-loss Docker test is
allowed until those independent gates and retained recovery authority are validated.
No installation, ACL change, network target, download, host-pi fallback, real project,
credential inspection, Docker Desktop/WSL interruption or process termination is
implicitly authorized by this design. Provider gateway work remains deferred.
