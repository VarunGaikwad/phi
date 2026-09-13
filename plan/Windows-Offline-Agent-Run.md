# Guard Phase 0: native Windows offline-agent fixture passed

Recorded **2026-09-12**, continuing order 01 in
[Execution Order](Execution-Order.md). After the engine blockers preserved below,
the [offline-agent fixture](Offline-Agent-Prototype.md) **passed all 20 checks**,
exit **0**, with container and host cleanup **removed**. A separate bounded query
confirmed the container absent. No code or security restriction needed changing.

This is acceptance of the fixed offline experiment only, **not the full Guard
Phase 0 gate or a supported production backend**. Gateway work remains deferred;
the current pi process is not protected.

**Historical revision:** this record preserves the original 20-check run. The
command was subsequently expanded and [passed 35 combined lifecycle checks](Agent-Lifecycle-Prototype.md)
with unchanged vendor pins and container restrictions. Consult that scope before
running the current command; the report below is not evidence for the added cases.

## Initial host observations (before the successful retry)

Only fixed executable signature/version fields, runtime metadata and counts of
Docker Desktop/backend processes were collected. No credentials, saved Docker
contexts/settings, private files or WSL distribution contents were inspected.

| Item | Observed result |
|---|---|
| Native Node process | Windows x64, Node `22.23.0` |
| PowerShell | `5.1.26100.9444`; non-elevated process |
| Selected Docker CLI | Expected Program Files installation; Authenticode `Valid`, Docker Inc signer; version `29.4.3` |
| Docker Desktop / backend process counts | `0` / `0` |
| Fixed local engine endpoint | Missing `docker_engine` named pipe / daemon unavailable |
| Installed pinned runtime artifacts | Collection and syntax-only guest check passed; no host pi import |
| Current engine/image identity | Not queried successfully; earlier primitive-fixture evidence is historical, not current engine health |

The previously confirmed Windows 11 Home / Docker Desktop / WSL2 setup does not
need reconfirmation. Its earlier successful primitive run is recorded in
[Windows Docker Fixture Pass](Windows-Docker-Fixture-Pass.md).

## Initial native command and blocked result

After checking the selected executable's expected location and Docker Inc signature:

```powershell
$docker = (Get-Command docker.exe -CommandType Application).Source
npm.cmd run --silent guard:probe-agent -- --docker "$docker" --confirm --json
```

Exit **2**:

```json
{
  "version": 1,
  "kind": "phi-offline-agent-probe",
  "state": "locked",
  "protection": "not-active",
  "canLaunch": false,
  "gateway": "deferred",
  "probe": "blocked",
  "stage": "engine",
  "cleanup": "not-needed",
  "containerName": "phi-phase0-37d4c2e0c9aa46ae0395bbbfe6d36f54",
  "checks": [],
  "rule": "DOCKER_COMMAND_FAILED",
  "hostCleanup": "removed"
}
```

The container name is a proposed synthetic fixture identity, not evidence of a
created container. The runner collected pinned bytes and prepared its disposable
synthetic source/client configuration, then stopped before image inspection or
container creation. It removed and checked absence of its host temp directory.
No runtime packet reached a guest; no combined checks were reported passed. The
controller still verified its own synthetic source/canary after the blocked attempt.

A bounded metadata-only follow-up used the same fixed local pipe, empty temporary
Docker client configuration and allowlisted environment. It classified the engine
failure as **missing pipe / daemon unavailable**, exit **1**, with no timeout,
access-denied or template-error indication. Only fixed classifications were
emitted; raw Docker output/errors were not recorded. Its temp directory was also
removed and checked absent. An initial ad-hoc diagnostic returned an unclassified
invocation failure and was not used as engine evidence.

## Initial native Windows regression results

| Check | Result | Scope |
|---|---|---|
| `npm.cmd run typecheck` | Passed | Current host/guest source and tests |
| `npm.cmd test` | **79 passed, 0 failed, 1 POSIX-only skip** (80 cases) | Docker fakes, synthetic filesystem cases including Windows junctions/hard links/ADS, pinned byte collection and syntax-only guest validation |
| `npm.cmd run test:smoke` | Passed | Doctor CLI only; no TUI or runtime containment |
| `npm.cmd run --silent guard:doctor -- --json` | Exit **2**, Locked | Docker/WSL executable metadata found; no launch authority |
| Native `guard:probe-agent` | Exit **2**, blocked at `engine` | Zero reported checks, no container; host cleanup removed |

No code, dependency, image, virtualization setting, host permission or project
trust was changed. Docker Desktop/services were not started or reconfigured. No
provider work, credential inspection, real-project admission or host apply occurred.

## Continuation and successful retry

After the operator requested continuation, the selected Docker CLI's location and
valid Docker Inc signature were rechecked. The first retry still returned exit
**2**, `DOCKER_COMMAND_FAILED` at `engine`, with proposed fixture identity
`phi-phase0-ad16a4ad7b3e4827a67c58ff007c2b01`, no container work, and host cleanup
`removed`. The initial error's cause was not independently classified.

A subsequent selected process check observed **5 Desktop / 2 backend processes**.
A bounded clean-client metadata query then returned **exit 0 / engine-responsive**;
its temp data was removed. Desktop/services were not started or reconfigured by
the agent. The same native PowerShell fixture command was retried without changing
code, runtime pins, resource limits, network policy or mounts.

Exit **0**, sanitized report:

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
  "containerName": "phi-phase0-5b99cea086aff4bce68f0bf8df3b3b6e",
  "checks": [
    "cleanEnvironment",
    "snapshotMatch",
    "sdkVersion",
    "resourcesExplicit",
    "extensionDirect",
    "deniedReads",
    "deniedWrites",
    "noHostBridges",
    "networkInterfaces",
    "networkProbes",
    "detachedChild",
    "builtInRead",
    "builtInEdit",
    "builtInWrite",
    "shellChild",
    "agentLoop",
    "sessionLifecycle",
    "independentGuestEffects",
    "hostStop",
    "hostFixturesUnchanged"
  ],
  "engine": {
    "serverVersion": "29.4.3",
    "wsl2KernelObserved": true
  },
  "imageId": "sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553",
  "hostCleanup": "removed"
}
```

### What this run demonstrated

- Native Windows Node **22.23.0** controller to Docker Desktop Linux / WSL2,
  Engine **29.4.3**, using the previously approved immutable Node image ID.
- Pinned pi **0.85.1** bundled-SDK adapter loaded **inside the Node 24 guest**,
  with explicit resources, memory-only credentials/settings/session data and
  the exact clean environment. No host pi import or resource discovery fallback.
- Real SDK read/edit/write/bash/inline-extension sequence completed against the
  three-file synthetic snapshot. Excluded startup/history/secret fixtures stayed
  absent; direct synthetic denied reads/writes and TEST-NET IPv4/IPv6 denials passed.
- Detached child heartbeat advanced after the agent loop and reload. A separate
  controller-issued guest exec checked actual copy effects and heartbeat; it is
  independent of pi's result, not hostile-guest tamper-proof attestation.
- Host-owned engine SIGKILL passed the required wait/exit-137/non-OOM/PID-zero
  checks. Ownership-checked removal and host source/canary verification passed.
- A **separate post-run** bounded nonce-label query found no container for the
  successful fixture. That verifier's own temporary empty client configuration
  was removed and checked absent.

Only disposable synthetic source and pinned runtime bytes were transferred over
stdin. No host mounts, downloads, installs, provider requests, real credentials,
real-project admission, host apply or settings changes were performed. The local
image was reused, not removed or repulled. No source-code change was required.

### Regression checks after success

`npm.cmd run typecheck` and `npm.cmd run test:smoke` passed again; `npm.cmd test`
passed **79 tests, 0 failures, 1 POSIX-only skip** (80 cases). These remain separate
unit/CLI results, not the source of the 20 real-backend results above. The smoke
check still covers only the doctor CLI, not a terminal/TUI.

## Remaining gate and next action

Continue order 01 with broader adversarial network/IPC, lifecycle and controller-
loss/recovery experiments using disposable synthetic data. The passing host stop
and one reload do not prove controller-crash cleanup, daemon-loss recovery, all
session transitions, packet-level egress behavior or a production watchdog.
Do not relax restrictions or run pi on the host to fill a missing capability.

Provider/authentication-method and fake-credential gateway acceptance stay
**deferred**, not passed. Active settings/trust assumptions, private-category
finalization (local only), native toolchain coverage and production admission/
NTFS race safety remain unproven. The copy helper is not a production importer.
**No full phase gate advanced; orders 02–18 remain pending.**
