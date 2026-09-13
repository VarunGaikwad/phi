# Guard Phase 0: offline whole-agent lifecycle extension

## Status

On **2026-09-12**, the expanded `guard:probe-agent` passed **all 35 checks**, exit
**0**, on native Windows / Node **22.23.0**, Engine **29.4.3**, Desktop Linux / WSL2.
Container and host-temp cleanup returned **removed**; a separate scoped query
confirmed the container absent. Runtime pins, the approved image and security
profile were unchanged. This is new evidence, not inferred from the earlier
[20-check offline run](Windows-Offline-Agent-Run.md).

The 35 checks comprise the original 17 guest checks, 15 additional lifecycle
decisions, and three independent host-controller checks. No production backend or
full phase gate is passed.

Every report remains **Locked / protection not active / canLaunch false**.
Provider/authentication-method and gateway acceptance remain **deferred**, not
waived. The current pi process is not protected. Orders 02–18 stay pending.

## Scope reviewed before execution

This extends `guest/offline-agent.ts`, `agent-spec.ts`, `agent-probe.ts`,
`probe-agent.ts` and their tests. It reuses the fixed runtime inventory, guest-only
bundled-SDK adapter, approved local immutable image, bounded stdin transfer,
allowlisted environments, synthetic admitted copy, hardened container profile,
independent source/canary verification, host stop and ownership-checked cleanup
from [the offline-agent prototype](Offline-Agent-Prototype.md).

No downloads/installations, host pi, actual project/session import, credentials,
host apply, extra network targets, mounts, Docker settings or supervisor/daemon
loss are part of this experiment. The first offline SDK session remains in-memory.
The added lifecycle runtime writes only disposable **guest tmpfs** sessions under
`/home/node/.pi/sessions/lifecycle`; none is exported to the host.

The additional fixed sequence:

1. Creates a real `AgentSessionRuntime` with a factory that rejects any cwd other
   than `/workspace`, creates fresh memory-only settings/credential services,
   disables all resource discovery, supplies explicit tools/model and one named
   inline extension, and rejects diagnostics/model fallback. Re-registers the
   deterministic offline provider in each extension factory, including reload.
2. Persists one literal synthetic prompt/response. Cancels new, resume, fork,
   clone and tree operations via explicit `{ cancel: true }`; requires identical
   session identity/messages, no shutdown and no extra model invocation.
3. Performs new/resume/fork/clone through public runtime APIs with fresh extension
   bindings; verifies session identity, restored/omitted conversation, fork text,
   clone ancestry and unchanged scope. An old extension API must reject appends.
4. Navigates a tree without summarization, checks that abandoned context is absent
   from the active branch, and submits a new literal prompt. Reloads and verifies
   a *subsequent* real built-in write, not just a startup event counter.
5. Waits for positive evidence of an active deterministic stream, calls SDK abort,
   and requires an aborted assistant message and idle state. A timeout fails.
6. Starts an extension tool, observes its pre-cancel write, queues steering and
   follow-up messages, explicitly clears both queues, then aborts. Requires tool
   signal observation/error result, no later model/tool execution, and a successful
   separately requested post-cancel write. **Clearing queues is an explicit fixture
   action, not an assertion that SDK abort automatically revokes queued work.**
7. Throws from a custom tool after an observable synthetic guest write; requires
   the error tool result. Throws from a `tool_call` hook; requires that the targeted
   write never occurs. A subsequent built-in read must still work.
8. Throws from the final `session_shutdown` hook after direct containment attempts;
   requires the expected error callback, stale API invalidation and continued
   filesystem denial. Checks exact lifecycle event order and resource/model scope.
9. A separate controller-issued exec reads the event ledger, four bounded regular
   JSONL session files, persisted aborted/error outcomes and actual positive/absent
   file effects. Checks transcript markers, session cwd/ancestry and identities.
   It also verifies the original detached child still advances after all these
   session changes/failures. This verifier shares guest privilege and is **not**
   tamper-proof attestation against a compromised guest.
10. The unchanged host engine stop/removal and independent original synthetic
    source/canary comparisons remain mandatory. Failure or cancellation does not
    cancel ownership-checked cleanup. No guest lifecycle hook controls host scope.

Additional decision IDs:

`transitionCancellation`, `sessionNew`, `sessionResume`, `sessionFork`,
`sessionClone`, `sessionTree`, `sessionReloadWork`, `streamCancellation`,
`toolCancellation`, `queuedCancellation`, `extensionToolFailure`,
`extensionHookFailure`, `lifecycleScope`, `shutdownFailureContained`,
`lifecycleEventOrder`.

The existing transfer/execution limit remains 15 seconds, with 128 KiB captured
output and a 10-second bootstrap input deadline. Positive readiness is bounded to
one second; an unobserved abort fails after two seconds. No timeout counts as a
successful cancellation. Only fixed sanitized decisions/check IDs leave the guest.

## Run

After reviewing both scopes, with the trusted installed Docker CLI, already-running
Desktop Linux/WSL2 engine and retained approved Node image:

```powershell
$docker = (Get-Command docker.exe -CommandType Application).Source
npm.cmd run --silent guard:probe-agent -- --docker "$docker" --confirm --json
```

No new runtime flag or expanded host authority is introduced. Earlier success
reports cannot pass the new exact 32-guest-check schema. For failures or uncertain
cleanup, follow the existing offline-agent runbook; never prune, use real data,
relax restrictions or run pi on the host to diagnose.

## Native run evidence and development validation

Native PowerShell invocation at **2026-09-12T20:15:28+09:00** used `npm.cmd` and the
expected `C:\Program Files\Docker\Docker\resources\bin\docker.exe`; Authenticode
was rechecked as **Valid / Docker Inc** before execution. Exit **0**:

```json
{
  "version": 1,
  "kind": "phi-offline-agent-probe",
  "state": "locked",
  "protection": "not-active",
  "canLaunch": false,
  "gateway": "deferred",
  "probe": "passed",
  "stage": "complete",
  "cleanup": "removed",
  "containerName": "phi-phase0-81daeeb37b98f9b797109080f85d164b",
  "checks": [
    "cleanEnvironment", "snapshotMatch", "sdkVersion", "resourcesExplicit",
    "extensionDirect", "deniedReads", "deniedWrites", "noHostBridges",
    "networkInterfaces", "networkProbes", "detachedChild", "builtInRead",
    "builtInEdit", "builtInWrite", "shellChild", "agentLoop", "sessionLifecycle",
    "transitionCancellation", "sessionNew", "sessionResume", "sessionFork",
    "sessionClone", "sessionTree", "sessionReloadWork", "streamCancellation",
    "toolCancellation", "queuedCancellation", "extensionToolFailure",
    "extensionHookFailure", "lifecycleScope", "shutdownFailureContained",
    "lifecycleEventOrder", "independentGuestEffects", "hostStop",
    "hostFixturesUnchanged"
  ],
  "engine": { "serverVersion": "29.4.3", "wsl2KernelObserved": true },
  "imageId": "sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553",
  "hostCleanup": "removed"
}
```

A separate native Node verifier used the fixed local pipe, fresh empty Docker
config/environment, 15-second command limit and exact nonce-label filter. It
returned `independentlyAbsent: true` and `verifierTempCleanup: removed`. An initial
verifier invocation failed because its executable path was over-escaped; that
attempt also removed its own temp directory. Correcting only the verifier path
produced the successful absence query; no fixture was rerun or restriction changed.

Typecheck and doctor CLI smoke passed. **111 tests passed, 1 POSIX-only skip,
0 failed** (112 cases), including **seven new lifecycle verifier/schema tests**.
The first typecheck found TypeScript retaining a getter's literal narrowing across
queue mutation; the readiness assertion was corrected without changing runtime
semantics, and all checks passed before native execution. Unit tests use synthetic
in-memory filesystem effects, fake Docker operations, fixed vendor-file reads and
syntax checks; they do not execute pi or Docker on the host or establish real
lifecycle behavior. The native fixture is the source of the lifecycle evidence.

Observed limits matter: a throwing extension tool's earlier guest write remains;
queue clearing is explicit; shutdown failure does not stop the detached child.
The surviving host controller still performs the decisive engine stop and cleanup.

## Limits and next work

Session controls and tool cancellation are cooperative SDK behavior, not the Guard
security boundary. Extension errors may leave prior writes or detached processes
behind; SDK disposal is not an engine stop. Production scope/epoch/capability
revocation, session import validation, cross-workspace separation, third-party
extension loading, hung/uncooperative extension cancellation, compaction, TUI/RPC
transport and all workflow-mode paths still need separate coverage.

Durable host ownership records/restart reconciliation must precede any
supervisor-loss experiment. A subsequent [design and pure decision model](Restart-Reconciliation-Design.md)
is tested offline; a separate [Windows synthetic store/fake-engine fixture](Windows-Store-Prototype.md)
now passes 15 checks with verified cleanup. Production durable storage, real engine
fencing and actual recovery remain unimplemented. The passing [worker-loss primitive](Worker-Loss-Prototype.md)
requires a surviving supervisor. No permission to kill that supervisor, restart the
daemon, stop Desktop/WSL, remove unrelated resources or broaden networking is
implied. Provider gateway work and broader [network/IPC evidence](Network-IPC-Prototype.md)
stay outstanding.

The subsequent [installed pipe contract review](Windows-Pipe-Contract-Review.md)
leaves listener/service work blocked while correcting the first-instance enum ambiguity.
The [execution queue](Execution-Order.md) now schedules independent **guest-only
uncooperative-extension containment scope/design and unit tests** here. The pure
[model](Uncooperative-Extension-Prototype.md) and fixed guest/verifier scripts cover
ignored aborts, explicit queue clearing, late effects and surviving host-engine stop
without runtime operations. Eighteen focused tests pass; this does not change the
passing 35-check fixture yet. Review any new guest code, fixed targets,
deadlines, exact host-owned stop and cleanup before a separately opt-in native run;
keep the supervisor alive and never execute guest/pi code on the host.

## API review

Installed pi **0.85.1** SDK, extensions, session-format/sessions, settings,
environment and custom-provider documentation; compaction references for tree
navigation without summary; SDK session/full-control and extension
confirm-destructive/reload-runtime examples. Version-matched public SDK/runtime,
services, session-manager, AgentSession and extension runner types/implementations
were inspected as text only. Session replacement lives on `AgentSessionRuntime`,
not `AgentSession`; callers must rebind extensions. `AgentSession.dispose()` alone
does not emit the full runtime quit lifecycle. No vendor JavaScript is patched.
