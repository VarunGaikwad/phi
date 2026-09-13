# PHI

Implementation of the [Guard](plan/Guard-Plan.md), [Modes](plan/Modes-Plan.md), and
[TUI](plan/TUI-Plan.md) plans has started in dependency order. See
[Execution Order](plan/Execution-Order.md) for every phase and its status.

**Current status: Guard Phase 0 prototype; the native Windows Docker Node fixture
passed all ten checks and cleanup. A separate host-only synthetic-copy fixture also
passes. The expanded offline whole-agent fixture passed all 35 checks and cleanup
on native Windows, including SDK sessions, cancellation, extension failures and host stop. A separate worker-loss
primitive passed five checks with recovery by a surviving supervisor. The synthetic
network/IPC primitive passed 21 checks and both container cleanups. Full Guard
Phase 0 acceptance remains incomplete; provider/gateway testing stays deferred.
No protection, workflow modes, theme, or PHI terminal UI is active. This checkout is
not yet an install-ready pi package.**
The manifest's future `extensions/phi.ts` and `themes/phi.json` entry points remain
unchanged; do not install/publish the scaffold as a completed product.

## Available now: read-only setup diagnostics

From this checkout, using Node.js >=22.19.0 (tested with v24.17.0 on Linux and
v22.23.0 on Windows):

```bash
npm run guard:doctor
npm run --silent guard:doctor -- --json
```

In Windows PowerShell use `npm.cmd` explicitly, especially when forwarding flags:
`npm.cmd run --silent guard:doctor -- --json`.

The diagnostic reports OS/runtime metadata, fixed candidate CLI availability on
PATH, and outstanding requirements. It does **not** execute discovered programs,
install anything, launch pi, read credentials/project data, or enable protection.
CLI availability is not proof of containment. No production backend is validated,
so diagnostic runs return **exit 2 / Locked / protection not active**. Help
(`npm run guard:doctor -- --help`) returns 0; invalid arguments return 64 and
unexpected collection failures return 1.

Running the diagnostic does not restrict an existing pi process. Its JSON is not
a security attestation or permission grant. Do not substitute an unrestricted
local agent when protected launch is unavailable.

## Next feasibility check: opt-in Docker fixture

Confirmed target: **Windows 11 Home + Docker Desktop/WSL2 + Node.js development**.
A Linux Node.js container is the provisional prototype, not a supported backend yet.

The new `guard:probe-docker` command can test a single disposable container on the
Windows host. It requires explicit consent, a trusted `docker.exe`, and an existing
local `node:24-bookworm-slim` image. It does not pull images, mount host/project
files, expose credentials, or launch pi. It independently checks container settings
before starting a fixed synthetic fixture and ownership-checks cleanup afterward.

Read [Docker Prototype](plan/Docker-Prototype.md) for the command, exact effects,
recovery, limitations and remaining acceptance tests. Even a successful fixture
leaves Guard **Locked / not active**. Ordinary `npm test` never starts Docker.

## Offline check: synthetic working copy

`guard:probe-copy` creates a disposable synthetic source, copies only three fixed
approved files, excludes synthetic secrets/history/startup resources, and checks
that editing/deleting copied files leaves the source unchanged. It accepts **no
project path**, executes no copied code, starts no Docker/pi runtime, and makes no
host apply. It is **not a production importer or containment/race-safety proof**.

```powershell
npm.cmd run --silent guard:probe-copy -- --confirm --json
```

The native Windows run passed **7 checks and cleanup**, still Locked. See
[Synthetic Copy Prototype](plan/Synthetic-Copy-Prototype.md) for effects and limits.

## Opt-in check: offline whole agent

`guard:probe-agent` transfers pinned pi runtime files and a synthetic copy into the
same hardened container profile, without host mounts or credential imports. Its
expanded native Windows run exercised the real agent loop, tools, inline
extensions, guest-only session persistence/new/resume/fork/clone/tree/reload,
stream/tool cancellation, explicit queue clearing and extension failures:
**35 checks passed, exit 0**, including host stop and cleanup. Container absence
was independently confirmed. See [lifecycle scope/evidence](plan/Agent-Lifecycle-Prototype.md)
and the [earlier 20-check record](plan/Windows-Offline-Agent-Run.md).

Read [Offline Agent Prototype](plan/Offline-Agent-Prototype.md) and the lifecycle
scope before running:

```powershell
$docker = (Get-Command docker.exe -CommandType Application).Source
npm.cmd run --silent guard:probe-agent -- --docker "$docker" --confirm --json
```

Start the already-installed Docker Desktop and wait for its Linux/WSL2 engine to
be ready before running. Use a trusted installed Docker CLI. No downloads,
installs, real-project admission or host apply are performed. The command refuses
non-Windows execution and never launches pi on the host. Even success leaves Guard
locked; gateway work is deferred.

## Opt-in check: controlled worker loss

`guard:probe-recovery` starts one hardened Node container through a disposable
host worker, force-kills only that worker, then independently stops/removes the
container through a surviving supervisor. No pi runtime or project data is loaded.
The native Windows fixture passed **five checks and cleanup**.

**Important:** the guest kept running after worker death. Recovery depends on the
supervisor surviving; supervisor/daemon loss and production restart recovery are
not solved. Read [Worker Loss Prototype](plan/Worker-Loss-Prototype.md) before running:

```powershell
$docker = (Get-Command docker.exe -CommandType Application).Source
npm.cmd run --silent guard:probe-recovery -- --docker "$docker" --confirm --json
```

This accepts no target PID, workspace or engine-control flags. It does not stop
Docker Desktop, change settings, install software or authorize Guard launch.

## Opt-in check: synthetic network/IPC

`guard:probe-network` uses two hardened Node-only containers, each with network
none and no host mounts. Its native Windows run passed **21 checks**, covering
local TCP/UDP/DNS controls, TEST-NET and controlled-redirect denials, separate
namespaces and an inaccessible live peer's services/socket/shared-memory marker.
Both containers and temporary data were removed; absence was independently checked.

Read [Network/IPC Prototype](plan/Network-IPC-Prototype.md) before running:

```powershell
$docker = (Get-Command docker.exe -CommandType Application).Source
npm.cmd run --silent guard:probe-network -- --docker "$docker" --confirm --json
```

No host listener, system DNS, host/LAN/cloud/provider endpoint or pi runtime is
used. Timeouts are not passing denials. This is synthetic evidence, not packet-level
containment or provider-gateway acceptance; Guard remains Locked.

## Offline design model: restart reconciliation

The [restart-reconciliation design](plan/Restart-Reconciliation-Design.md) defines
intent-before-effect ownership, exclusive command authority and stop-only recovery.
`guard-host/reconciliation-model.ts` validates bounded journal bytes and proposes
one non-executable step from synthetic observations. Its tests cover crash cut
points, stale ownership, uncertain creates, rollback and cleanup postconditions.

This is **not durable storage or a recovery service**. It performs no Docker,
filesystem, process or pi operations and is not integrated into the runtime probes.
No supervisor/daemon-loss experiment is authorized by these model tests.

## Windows synthetic store / fake-engine fixture

The [Windows store prototype](plan/Windows-Store-Prototype.md) passed **15 checks**:
real exclusive-file contention and handle release, commit/readback, stale-writer
conflicts, fake-engine epoch/receipt checks and injected interrupted writes. It
force-kills only its own disposable file worker at a confirmed checkpoint, never
Docker or a supervisor. All six temp fixtures were independently confirmed absent.

Read its scope before opting in:

```powershell
npm.cmd run --silent guard:probe-store -- --confirm --json
```

This is **not power-loss durability, private production storage, Docker fencing or
restart recovery**. The fake engine records only synthetic cleanup strings. No
Docker/pi runtime, credential or real project is used; Guard remains Locked.

## Offline command-owner / receipt experiment

The [command-owner design](plan/Command-Owner-Receipts-Design.md) adds **24 deterministic
tests** for stale owners, delayed acceptance/completion, missing receipts, fresh
postconditions and commit failures. Replacement fences new requests, but cannot
retract requests already in transport or accepted by the fake engine.

This is an in-memory experiment, with no new CLI, subprocess, Docker or pi execution.
Its trusted receipt lookup is a **mock capability**, not an established Docker API.
Unknown delivery stays unresolved; even synthetic quiescence never enables launch.

The subsequent [installed Docker API evidence review](plan/Docker-Recovery-API-Review.md)
recorded 11 offline builtin help/version calls from signed CLI **29.4.3**. Available
local materials do **not establish** the required engine-incarnation or durable
terminal/negative receipt contract. No recovery adapter was built; no daemon query
or mutation command was issued. The sole synthetic config directory was removed
and independently confirmed absent.

## Windows security API review

The [private-storage/IPC review](plan/Windows-Private-Storage-IPC-Review.md) adds **12 tests**
for native reflection and synthetic in-memory descriptors. Windows PowerShell's
actual Framework runtime lacks the named `CurrentUserOnly`/`FirstPipeInstance` pipe
options found in newer references. Descriptor validity is not access enforcement.
No file ACL, real identity or pipe listener was touched by the review.

The subsequent [file-only ACL fixture](plan/Windows-File-ACL-Prototype.md) passed
**all 10 native checks**: creation-time ACL/readback, collision preservation and a
same-user read denial bracketed by successful reads. Both workers exited; the exact
temp root was independently confirmed absent. No existing ACL was changed or process
killed. This is **not cross-user/process isolation**, a pipe service or a Docker adapter.

After reading its scope, opt in with:

```powershell
npm.cmd run --silent guard:probe-acl -- --confirm --json
```

## Offline review: Windows pipe contracts

The [installed pipe implementation review](plan/Windows-Pipe-Contract-Review.md)
records 219 method bodies without invoking pipe code. Framework's one-instance server
constructor adds a first-instance flag despite the missing enum name. Explicit
local-only rejection and exact process-lifetime binding remain unestablished, so no
listener/service was added. Thirteen new tests validate static evidence only.

## Offline model: uncooperative extension containment

The [uncooperative-extension scope](plan/Uncooperative-Extension-Prototype.md)
now includes a pure model plus a fixed guest/verifier script. Eighteen focused tests
cover ignored aborts, explicit queue clearing, late effects, detached-child identity
and script-scope rejection. The scripts are parsed but not run; only a surviving
host-engine stop is decisive. No guest, process, Docker, filesystem or network
operation was performed. The [policy-drift model](plan/Policy-Scope-Drift-Model.md)
binds requests to opaque workspace, policy and token epochs; stale requests and
workspace replacement fail closed without runtime operations. The [compaction model](plan/Session-Compaction-Model.md)
bounds untrusted summaries and preserves session/policy identity without execution authority. The [transport model](plan/Runtime-Transport-Model.md)
bounds nonce/epoch/sequence framing without opening IPC or claiming peer authentication.

## Development checks

Using the existing checkout's development dependencies:

```bash
npm run typecheck
npm test
npm run test:smoke
```

The smoke command needs Python 3 and currently tests **only the doctor CLI**, not
the TUI or isolation. Tests use disposable synthetic fixtures, not personal files,
real credentials, package installations, or production services. No dependency or
virtualization installation is performed by these checks.

## Next requirement

The operator-approved official Node image was downloaded, a Docker 29 metadata
query issue was fixed, and the native fixture passed **10 checks** with verified
container removal. The approved image remains in Docker's local store. See
[Windows fixture pass evidence](plan/Windows-Docker-Fixture-Pass.md).
Latest native Windows validation: typecheck and doctor CLI smoke passed;
**295 tests passed, 1 POSIX-only test skipped, 0 failed** (296 cases), including 10 new
controller-wiring tests and five fixed-script tests, 13 uncooperative-model tests,
13 pipe-metadata/static-decoder tests, 13 file-ACL controller/protocol tests, 12 Windows security-descriptor/API tests, five
recorded-CLI evidence tests, 24
command-owner/receipt tests, 14 store-format/transport tests, 17 reconciliation-model
tests and Windows ADS.
Unit tests and doctor smoke do not execute pi/Docker or open host network sockets; some launch
and force-kill their own synthetic host workers. A Windows syntax test parses the
fixed store and file-ACL helpers without executing their bodies. The uncooperative
guest/verifier scripts are parsed only; controller commands are planned and never
executed. A separate Windows test runs the
security-review helper's reflection and synthetic descriptor construction in memory,
without creating secured files/pipes or reading real identities.
Separately, the expanded offline-agent fixture passed 35 checks, worker-loss passed
five, and synthetic network/IPC passed 21. Their resources were cleaned up.

The ownership/restart-reconciliation model and native synthetic store/fake-engine
harness now pass their separate scopes. The single command-owner / uncertain-operation
receipt design and deterministic fake-engine experiment now pass too. The installed
CLI evidence review leaves Engine API identity/receipt semantics **not established**;
no matching API schema/implementation was located in the checked local materials.
That blocks the recovery adapter, not independent offline work. Windows private-storage /
IPC API review and memory tests are recorded; the file-only ACL fixture now passes
its 10-check native scope with verified cleanup. The bounded pipe implementation
review is complete, with partial first-instance/rights/inheritance evidence but no
local-only or exact peer-lifetime proof. Listener/service work stays blocked.
Next: separately review any executable adapter and operation receipts before an
opt-in native run. The pure failure model keeps uncertain create/stop/remove
unconfirmed and never infers resource absence. The adapter contract remains
review-only and blocked: it exposes no runner or CLI until operation receipts and
recovery cleanup are established. A pure admission gate now requires engine
incarnation, request-bound receipts, fresh postconditions, transport revocation,
recovery authority and exact resource binding. The fixed script requires explicit queue clearing and
surviving host-engine stop; no supervisor loss is authorized. A declarative Docker
integration review adds exact hardened-profile sequencing and ID-bound,
non-cancellable cleanup, but no runner or CLI.
Named-pipe authentication and handle-safe production storage remain unproven. Do not replace
missing backend evidence with the mock engine's receipt oracle.
Private production storage, durable checkpoint recovery, real engine fencing and
actual restart recovery remain unimplemented; they precede any supervisor-loss
Docker experiment. Broader lifecycle coverage (including uncooperative extensions and
cross-workspace/policy changes), network variants and packet-level evidence remain
pending. SDK cancellation does not undo guest writes or stop detached processes;
engine stop remains host-owned.
These fixed experiments are not full backend acceptance. The
operator deferred provider/authentication-method and gateway work; it stays pending,
not passed, and need not be selected for independent offline checks.
Private path classifications stay local. VM/container isolation and reviewed
working copies are already approved. No full phase gate has advanced.

See [Phase 0 findings](plan/Phase-0-Findings.md) for verified results, limitations,
and the inputs required before continuing.
