# Guard Phase 0: uncooperative extension containment model

## Status

The state machine remains a **pure, non-executable model**. A separately fixed
guest script and verifier are now reviewed for a possible future opt-in run; they
have not been executed. This is not native containment evidence or a production
authorization claim. It models an extension that writes before cancellation, ignores an abort,
leaves a detached child alive and may produce a late effect. It requires explicit
queue clearing and a surviving host-engine stop. No process, filesystem, network,
Docker, pi or supervisor operation is performed.

All Guard reports remain **Locked / protection not active / canLaunch false /
executable false / gateway deferred**. The current pi process is unprotected;
order 01 remains in progress and orders 02–18 remain pending.

## Files and bounded scope

- `guard-host/uncooperative-extension-model.ts`: immutable state transitions and
  conservative containment decisions.
- `tests/guard-uncooperative-extension.test.ts`: 13 model tests.
- `guard-host/uncooperative-extension.ts`: fixed guest/independent-verifier script
  strings and exact synthetic filenames; importing it does not execute them.
- `tests/guard-uncooperative-extension-script.test.ts`: five syntax/scope tests.
- `guard-host/uncooperative-controller.ts`: fixed command/evidence/stop-state
  planner; it never executes its returned commands.
- `tests/guard-uncooperative-controller.test.ts`: nine controller protocol tests.
- `guard-host/uncooperative-docker-integration.ts`: declarative integration plan
  reusing the existing hardened Docker profile; it has no runner or CLI.
- `tests/guard-uncooperative-docker-integration.test.ts`: seven integration tests.
- `guard-host/uncooperative-execution-model.ts`: pure failure/cleanup state model
  for a future executable adapter.
- `tests/guard-uncooperative-execution-model.test.ts`: ten failure-state tests.
- `guard-host/uncooperative-adapter.ts`: review-only adapter contract; it exposes
  no runner or CLI while operation receipts/recovery cleanup remain unproven.
- `tests/guard-uncooperative-adapter.test.ts`: five adapter-review tests.

The model has fixed limits of **32 events** and **4 queued messages**. Deadlines
must be safe nonnegative integers with a strictly later deadline; timeout is never
represented as successful cancellation. Its only terminal action is a description
of host-engine stop; it does not execute that action.

The scenario is deliberately stronger than cooperative SDK cancellation:

1. Start a tool and record a pre-abort write plus a detached child.
2. Queue steering and follow-up work.
3. Request abort; the extension ignores it.
4. Clear both queues explicitly. Abort is not queue revocation.
5. A late write remains possible and changes the reason for host stop.
6. Only an independently observed host-engine stop ends both guest and child.

The model rejects stop confirmation without a stop request, rejects stop while
queued work remains, and never exposes Docker, authorization, credentials or an
engine receipt. State transitions and returned event arrays are copied rather than
shared. It is not a scheduler, process supervisor, hostile-guest attestation,
filesystem policy, or proof that SDK/engine APIs kill descendants.

## Decisions

| Decision | Required result |
|---|---|
| Abort semantics | An ignored abort leaves guest and detached child alive |
| Queue semantics | Steering/follow-up messages are cleared explicitly; clearing is not inferred from abort |
| Late effects | A post-abort write remains observable and cannot be erased by the model |
| Containment boundary | Host-engine stop, not extension disposal or hook success, is decisive |
| Postcondition | Guest and detached child are both false only after a requested stop is confirmed |
| Bounds | Event/pending/deadline bounds fail closed |
| Authority | Model returns no launch, Docker, credential, identity or authorization capability |

## Validation

Native Windows typecheck and the focused test passed after implementation. The
13 tests cover pure initial state, pre-abort effects, ignored abort, explicit queue
clearing, observation-before-stop, late effects, detached-child persistence,
required stop postconditions, invalid transitions, deadline bounds, event caps,
mutation isolation and absence of authority fields.

No opt-in native guest run has been performed. The fixed controller review confirms
seven direct commands: guest start, controller-created abort marker, independent
verifier, then non-cancellable stop/wait/inspect/remove. It accepts only the exact
container ID shape, fixed workspace/scripts, positive child PID/tick evidence and
exact exited state; cleanup names are bounded to six synthetic files. The Docker
integration review adds the existing 11-step create/inspect/start/verify/stop plan,
requires immutable image/nonce ownership and repeats exact hardened-profile checks;
cleanup remains non-cancellable and ID-bound. A real adapter would still need
operation receipts from the existing Docker controller. The pure failure-state
model adds ten tests and keeps uncertain create/stop/removal unconfirmed; no
resource absence is inferred. The pure admission gate adds seven tests and requires
real engine/receipt/recovery facts; synthetic complete facts still remain Locked.
The adapter review intentionally exposes no runner:
its contract is Locked/non-executable until operation receipts and recovery cleanup
are established. Five tests verify this block, exact plan and detached artifacts.

The failure model keeps uncertain create, stop and removal as failed/unconfirmed
states; only a positive stop postcondition permits removal, and only confirmed
removal permits an apparent pass. It has no runner and cannot claim resource absence.

The fixed script review confirms
Linux UID 1000, `/workspace`, six exact synthetic filenames, no environment/network
or host-path input, detached-child/ignored-signal behavior, and an independent
same-guest verifier binding the recorded child PID and advancing tick. This is
still not hostile-guest attestation. Before a run is considered, separately review
container wiring, exact admitted files, engine/container ownership,
execution/output/deadline bounds, controller-created abort signaling, independent
effect verification and cleanup. Keep the supervisor alive; do not kill it, stop Desktop/WSL, restart a
daemon, use a real project, inspect credentials or execute guest/pi code on the host.
A native run would demonstrate only this disposable scenario, not supervisor-loss
recovery, production extension containment or full Guard acceptance.

## Next dependency

The next independent Guard work may wire this fixed script and planner into the
existing guest-only fixture only after controller ownership/profile checks,
Docker-operation receipts, executable-adapter failure handling, admission gating and
cleanup are reviewed again. The [policy-drift model](Policy-Scope-Drift-Model.md)
independently fences stale workspace/policy/token requests. A native run would require
explicit opt-in and would remain a disposable experiment. The declarative Docker integration plan is not a
runner: it does not contact Docker, start a container or authorize cleanup. Cross-workspace/policy changes, uncooperative
extension execution, compaction and runtime transports remain broader pending
coverage. Native private storage, authenticated IPC, durable checkpoints, engine
receipts and recovery remain prerequisites to any supervisor-loss experiment.
