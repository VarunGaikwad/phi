# Guard Phase 0: controlled worker-loss / supervisor recovery primitive

## Status and scope

**Passed on native Windows, 2026-09-12: all five checks, exit 0; worker exited,
container and host temp data removed.** A separate bounded nonce-label query
confirmed container absence. This is an independent order 01 experiment after the
[20-check offline-agent pass](Windows-Offline-Agent-Run.md). It isolates a host
lifecycle question without loading pi again: what happens when the disposable
worker controlling a running container is abruptly terminated?

**Observed limitation:** the guest continued running after the worker died. The
surviving supervisor stopped it successfully; this does not establish automatic
stop on supervisor loss or daemon failure.

This is **not** whole-agent/session lifecycle acceptance, a production watchdog,
crash-resilient restart recovery or a supported backend. The supervisor must stay
alive. Every report remains **Locked / not active / canLaunch false**. Provider/
gateway work remains deferred. No real project data, credentials or private paths
are requested. No pi SDK code is imported or executed on either host or guest by
this particular primitive; the prior offline-agent evidence remains separate.

## Fixed effects and ownership

Files: `guard-host/recovery-spec.ts`, `recovery-worker.ts`,
`recovery-worker-client.ts`, `recovery-probe.ts`, `probe-recovery.ts`, and
`tests/guard-recovery.test.ts`.

With explicit confirmation on native Windows, the supervisor:

1. Validates the operator-selected trusted `docker.exe` path/file. Uses the existing
   fixed local Docker pipe, disposable empty client configuration and host
   environment allowlist. Does not load saved Docker auth, contexts or settings.
2. Requires Desktop Linux / WSL2 engine metadata and the existing approved local
   `node:24-bookworm-slim` image, resolved to an immutable ID with no volumes/hooks.
   There is no pull, build, installation, engine switch or Desktop/service start.
3. Creates **one** nonce-labeled/named container and independently inspects its
   configuration before allowing any start. Restrictions are identical to the
   primitive fixture: UID/GID 1000, read-only root, capabilities dropped,
   no-new-privileges, no host mounts/devices/ports, network none, private namespaces,
   no restart/log persistence, bounded CPU/memory/processes and the three tmpfs areas.
4. Spawns one trusted disposable Node host **worker**, using the current Node
   executable directly, a fixed controller module, clean environment, disposable
   temp cwd and a private parent/child IPC channel. It accepts no user-supplied command,
   module, target PID or host project path. No pi or extensions run in this worker.
5. The worker may only **start the already-created immutable container ID**,
   inspect it, and verify its fixed guest heartbeat. It cannot create/recreate
   containers. The guest parent and detached child ignore SIGTERM and atomically
   update separate synthetic heartbeat files in `/workspace`. Both require Node
   24, Linux, non-root identity, clean environment, no privileges, read-only root,
   absent common host bridges and loopback-only interfaces before writing.
6. The worker sends one exact-schema readiness message after its Docker calls have
   settled, then waits. The supervisor rejects wrong/stale/extra fields or duplicate
   messages and independently verifies running configuration and both advancing
   heartbeats. Worker output is discarded, bounded to 128 KiB, never logged raw.
7. **Forcibly terminates only that worker's retained ChildProcess object** with
   SIGKILL (abrupt termination on Windows), and requires the actual exit event with
   that signal. Merely sending a kill or observing `killed: true` does not pass.
   No host process is selected by a supplied PID, name search, or guest message.
8. Independently rechecks the running guest and both advancing heartbeats **after
   worker exit**. Continued guest execution is an expected limitation of plain
   Docker—not proof that controller loss automatically stops work.
9. The surviving supervisor rechecks identity/configuration, issues engine SIGKILL,
   and requires wait exit 137 plus exited/non-running/PID-zero/non-OOM state.
10. Independently stops/reaps any worker, ownership-checks name/ID/image/nonce-label
    before force removal, checks container absence, and removes/checks its host
    temp directory. Cleanup runs after failure/cancellation with separate deadlines.
    Uncertain create, worker exit or removal cannot report a successful experiment.

There are **five required check IDs**, all passed in the recorded native run:
`workerStartedGuest`, `guestTreeAlive`,
`workerForciblyExited`, `guestSurvivesWorkerLoss`, `supervisorStop`. Worker, container
and host-temp cleanup are separate required outcomes. A passing report deliberately
includes `coverage: worker-loss-only`; guest survival is a recorded limitation.

Docker calls retain 15-second deadlines / 128 KiB caps. Worker readiness and its
internal lifetime have 60-second limits; supervisor exit confirmation has a separate
5-second deadline. Heartbeat verification waits up to 3 seconds for startup and
compares two samples 350 ms apart. No additional network probes are sent.

## Native Windows command

With the already-installed Desktop Linux/WSL2 engine running and the approved image
retained, review the above scope and run from native PowerShell:

```powershell
$docker = (Get-Command docker.exe -CommandType Application).Source
npm.cmd run --silent guard:probe-recovery -- --docker "$docker" --confirm --json
```

Use the known trusted, signature-checked Docker CLI; path discovery alone does not
prove trust. `--help` performs no fixture operations. Exit **0** means help or a
passing experiment/cleanup; **2** means blocked before container creation; **1**
means an experiment/cleanup failure; **64** means invalid arguments or absent
consent. No exit code authorizes production Guard launch.

## Native run evidence and development validation

The known Docker CLI location and valid Docker Inc signature were rechecked before
the native PowerShell command above. Host Node **22.23.0**, Engine **29.4.3**,
Desktop Linux / WSL2 metadata, and the previously approved immutable Node image
were used. No additional image download or Docker setting change was needed.

Exit **0**, sanitized report:

```json
{
  "version": 1,
  "kind": "phi-worker-loss-probe",
  "coverage": "worker-loss-only",
  "gateway": "deferred",
  "state": "locked",
  "protection": "not-active",
  "canLaunch": false,
  "probe": "passed",
  "stage": "complete",
  "checks": [
    "workerStartedGuest",
    "guestTreeAlive",
    "workerForciblyExited",
    "guestSurvivesWorkerLoss",
    "supervisorStop"
  ],
  "containerName": "phi-phase0-ba2d8632d4b2c0832ae62e04b6a0dd80",
  "cleanup": "removed",
  "workerCleanup": "exited",
  "engine": {
    "serverVersion": "29.4.3",
    "wsl2KernelObserved": true
  },
  "imageId": "sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553",
  "hostCleanup": "removed"
}
```

A separate bounded clean-client query for only this nonce found the container
absent; that verifier also removed and checked absence of its own temp directory.
The image was retained. The actual worker exit event and closed stdio were observed;
no broad host PID/process scan or process-tree kill was used.

Native Windows `npm.cmd run typecheck` and doctor CLI smoke passed. `npm.cmd test`:
**91 passed, 0 failed, 1 POSIX-only skip** (92 cases). The **12 new tests** cover
profile/protocol checks, Docker fakes, worker/heartbeat/stop failures, cancelled and
uncertain cleanup, forged/ambiguous ownership, and actual synthetic host workers.
The real host-worker tests prove forceful exit without a cooperative exit hook,
malformed/duplicate IPC rejection, bounded output, readiness timeout, cancellation,
early exit, failed spawn and refusal of direct internal-worker invocation without
IPC. Unit tests start no Docker containers or pi runtimes; they do not replace the
five real-backend checks above.

No full phase gate advanced. Next: broader adversarial network/IPC and whole-agent
lifecycle tests; durable ownership/reconciliation design before supervisor-loss or
restart recovery experiments. Gateway and private-policy finalization remain pending.

## Failure recovery and limits

The supervisor creates the container before the worker exists. Even if the worker
fails during a Docker start request, it has no create operation that could recreate
the removed ID afterward. On ambiguous initial creation, only the supervisor's
nonce label is queried; every ownership field must match before removal. Never prune
or remove another container. An uncertain create with no visible result remains
unconfirmed, not proof that a delayed daemon operation cannot occur.

Do not deliberately kill the supervisor, stop Desktop/WSL, restart the daemon,
change host settings or simulate machine loss with this command. Those tests need
separately designed recovery and authorization because they may affect other work.
If the supervisor is forcibly killed or the daemon disappears, resources may remain:
use the reported synthetic `phi-phase0-<nonce>` identity to inspect and remove only
that fixture after verifying its label/name/image. No durable recovery journal,
protected-policy epoch, expiry service, restart registration or independent OS
watchdog is implemented. Loss of the supervisor itself remains a gap. A subsequent
[restart-reconciliation design and pure model](Restart-Reconciliation-Design.md)
now tests proposed journal/cleanup decisions offline. It implements no durable
store or recovery service and does not change this fixture's permissions. A later
[Windows synthetic store/fake-engine experiment](Windows-Store-Prototype.md) passes
15 checks and cleanup, including native file sharing and a checkpointed kill of only
its own file worker. Its injected faults/mock engine are not real Docker fencing,
power-loss durability or permission to kill this experiment's supervisor.

The worker's private IPC is trusted host plumbing, not a guest-facing authorization
protocol. Guest heartbeat checks share guest privileges, so they are independent
of the worker result but not tamper-proof against hostile guest code. They do not
prove kernel/hypervisor exploit resistance, DNS/redirect/LAN containment, production
admission/NTFS race safety, provider compatibility or all pi session transitions.

## Reviewed material and API references

- Installed pi 0.85.1 `docs/containerization.md`, linked `docs/security.md`, and the
  Gondolin example: whole-agent location and extension permissions; no host tool-
  routing or broad project mounts were adopted. No pi API was changed here.
- Node `child_process` documentation in installed Node typings: direct spawn and IPC,
  Windows forceful termination, `killed` versus actual exit, and descendant caveats.
  [API reference](https://nodejs.org/docs/latest-v22.x/api/child_process.html).
- Existing [Docker profile/API review](Docker-Prototype.md#references-reviewed),
  [container kill](https://docs.docker.com/reference/cli/docker/container/kill/),
  [wait](https://docs.docker.com/reference/cli/docker/container/wait/) and
  [remove](https://docs.docker.com/reference/cli/docker/container/rm/) semantics used
  by the already-passing offline fixture. No new Docker privilege or lifecycle flag.
