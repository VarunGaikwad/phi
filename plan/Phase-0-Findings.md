# Phase 0 findings: offline whole-agent fixture passed, full gate incomplete

Companions: [execution queue](Execution-Order.md), [Guard](Guard-Plan.md),
[Modes](Modes-Plan.md), [TUI](TUI-Plan.md).

## Current continuation: uncooperative extension model — native run not authorized

The [uncooperative-extension scope](Uncooperative-Extension-Prototype.md) now has
a pure model and fixed guest/verifier scripts. Eighteen focused tests cover an
extension that ignores abort, retains a detached child, produces late effects,
requires explicit queue clearing and binds independent evidence to the child PID/tick.
Scripts are syntax/scope checked only; no guest, process, filesystem, Docker, network
or supervisor operation was performed. This is design evidence, not containment evidence.

The fixed [controller wiring](Uncooperative-Extension-Prototype.md) now plans only
seven direct commands: guest, abort marker, verifier, then non-cancellable stop/wait/
inspect/remove. It validates exact container IDs, positive child PID/tick evidence,
exact exited state and six synthetic cleanup names. **27 focused tests** pass across
the model, scripts and controller; no command is executed. Docker profile/ownership
checks and operation receipts still require a separate review before native wiring.

The full validation then passed **236 tests, 1 POSIX-only skip, 0 failed** (237
cases), with typecheck and doctor smoke. The five script and nine controller tests
were added; no native guest run occurred.

The declarative Docker integration review adds the existing hardened profile and
11-step create/inspect/start/guest/abort/verify/stop/wait/inspect/remove sequence.
It requires immutable image/nonce ownership, exact container-ID binding and
non-cancellable cleanup, but has no executable runner or CLI. Docker operation
receipts and failure handling remain separately unproven. The pure failure-state
model adds ten focused tests: uncertain create/stop/removal remain unconfirmed,
and only confirmed stop followed by confirmed removal can appear successful. Full
validation is now **253 passed, 1 skipped, 0 failed** (254 cases); no Docker command
was executed. A review-only adapter contract then deliberately exposes no runner or
CLI while operation receipts and recovery cleanup remain unproven; five tests verify
that block and exact-plan immutability.

Full validation is now **258 passed, 1 skipped, 0 failed** (259 cases). No Docker
command was executed. A pure admission gate adds seven tests and requires real
engine incarnation, request-bound receipts, fresh postconditions, transport
revocation, recovery authority and exact resource binding; synthetic complete facts
still produce a Locked result. Full validation is now **265 passed, 1 skipped, 0
failed** (266 cases). The subsequent policy-scope model adds ten tests for
workspace/policy/token epochs, stale requests, workspace replacement and explicit
fencing; no runtime operation is performed. Full validation is now **275 passed,
1 skipped, 0 failed** (276 cases). The subsequent [session-compaction model](Session-Compaction-Model.md)
adds ten tests for bounded untrusted summaries, session/workspace/policy binding and
non-executable output; no runtime operation is performed. Full validation is now
**285 passed, 1 skipped, 0 failed** (286 cases). The subsequent transport model adds ten tests for bounded nonce/epoch/
sequence frames, cancellation and late-frame rejection; it opens no IPC and provides
no peer authority. Full validation is now **295 passed, 1 skipped, 0 failed** (296
cases).

Native typecheck and focused tests passed. Guard remains Locked/non-executable and
full Phase 0 is unchanged. Before any native guest run, review controller wiring,
abort signaling, ownership, deadlines, independent effect checks and cleanup separately.
Do not kill a supervisor or disrupt Docker/WSL.

## Earlier continuation: pipe implementation review — partial evidence, listener blocked

The [bounded installed pipe review](Windows-Pipe-Contract-Review.md) statically reads
signed Framework **4.8.9347.0** and .NET **8.0.15** pipe implementations using signed,
pinned SDK metadata readers. It records **219** pipe method bodies and reproducible
selected IL, without invoking any target pipe method or creating a listener.

Important correction: Framework lacks a named `FirstPipeInstance` enum member, but
its ordinary one-instance server constructor **does add the first-instance bit**.
Enum absence alone did not establish constructor incapability. Both inspected versions
also pass security/inheritability attributes at creation; Framework's explicit-rights
client constructor preserves the requested mask instead of directional generic access.
These are static candidate mechanisms, not native namespace/access/lifetime acceptance.

The selected mode builders do not establish explicit remote-client rejection. The
modern current-user-only client compares owners, not exact processes; its server
uses broad owner full-control rights. No supported exact peer PID/retained-process
binding was established in the checked managed surfaces/imports. Missing Win32
SDK/header evidence is a bounded evidence gap, not global API absence. No absent-flag
cast, private interop invocation, impersonation, real identity query, compile, install,
ACL change, Docker operation or pi runtime was used. A metadata dependency failure
was resolved only by the installed SDK's narrow process-local binding policy.

Final collectors exited **0** at **2026-09-12T21:55:06.988Z / 21:55:10.530Z**, with no
OS fixtures to clean up. Native typecheck and doctor CLI smoke passed at
**2026-09-13T06:59:03+09:00**; **209 tests passed, 1 POSIX-only skip, 0 failed** (210
cases), including **13 new offline tests**. The new tests never rerun the collector
or execute pipe code; existing tests retain their earlier synthetic scopes.

Listener/service and Docker recovery adapter implementation remain blocked. Continue
order 01 independently with a separately bounded **guest-only uncooperative-extension
containment experiment**, designed/unit-tested before an opt-in run, using the existing
isolated-agent fixture and surviving-supervisor host stop. Do not repeat the same
installed evidence search as if it could supply missing native contracts. No supervisor,
daemon or Desktop/WSL disruption is authorized. Guard stays Locked/non-executable,
gateway deferred, all full gates pending, current pi process unprotected.

## Earlier continuation: native file-only creation-time ACL fixture passed

Implemented and reviewed [the file-only ACL fixture](Windows-File-ACL-Prototype.md):
`acl-worker.ps1`, `acl-probe.ts`, `probe-acl.ts`, `guard:probe-acl` and 13 new tests.
Native PowerShell on **2026-09-12**, Node **22.23.0**, signed system PowerShell **Valid /
Microsoft**: **all 10 native checks passed**, exit **0**. Both workers exited; the
exact synthetic temp root was removed and independently confirmed absent.

New synthetic allow/deny-read files received protected DACLs **at creation**, with
exact current-user owner/ACE checks through retained handles. A `CreateNew` collision
preserved original bytes/ACL. The separate same-user reader bracketed native access
denied **5** with successful allow-file reads; sharing violation, missing file or timeout
could not pass. Metadata-only `ReadPermissions` handles returned ACLs with neither
data-read nor write capability. No SID, descriptor or personal path was emitted.

This proves the stated **same-user requested-operation controls**, not cross-user
isolation, containment against a DACL owner, production private storage or authenticated
IPC. Existing ACLs, parent permissions and settings were unchanged; no impersonation,
identity switch, process kill, pipe listener, Docker/pi run or credential inspection
occurred. On uncertain worker exit, the controller preserves files without a kill or
ACL-repair fallback; mocked tests cover those failure paths.

Native typecheck and doctor CLI smoke passed; **196 tests passed, 1 POSIX-only skip,
0 failed** (197 cases), including 13 new tests. Ordinary tests do not execute the
native ACL worker or query real identity; real ACL observations come from the separate
opt-in run. Existing disposable-worker/memory tests retain their earlier scopes.

Its scheduled pipe namespace/local-only/peer-binding review is recorded above;
partial static evidence does not authorize a listener/IPC harness. The latest pure
uncooperative-extension model is design/test evidence only; no native guest run is
authorized by it. Engine identity/receipt evidence still blocks real recovery
integration. Guard remains Locked / not active / canLaunch false / non-executable,
gateway deferred, all full gates pending; the current pi process is unprotected.

## Earlier continuation: Windows private-storage / IPC API and memory review

Added the [Windows security API review and next file-only scope](Windows-Private-Storage-IPC-Review.md),
`review-windows-security.ps1`, `windows-security-descriptor.ts`, recorded native memory
evidence and **12 tests**. The fixed system PowerShell signature was **Valid / Microsoft**.
Actual PowerShell **5.1.26100.9444 / CLR 4.0.30319.42000** exposes file/pipe security-at-create
and handle-ACL read APIs, but its `PipeOptions` enum lacks the named `CurrentUserOnly`
and `FirstPipeInstance` options in newer .NET references. No private interop workaround
or pipe listener was added.

Native .NET generated four descriptors using an invented numeric SID, without reading
real identities or touching any OS resource ACL. The independent verifier accepts
only two bounded protected one-ACE synthetic profiles and rejects malformed offsets,
truncation, extra/inherited ACEs, mask/SID drift and null/empty DACL controls. Native
pipe full-control includes server-instance creation rights; read/write does not.
Neither that mask distinction nor a protected descriptor proves effective access,
privacy, exact peer identity or containment against the same Windows user.

All results remain Locked / not active / canLaunch false / non-executable /
`nativePrivacyProven: false`. No file/pipe was created, real ACL applied, account
resolved, token/credential inspected, client impersonated, service installed or Docker
command invoked by the new helper. No native access check was performed.

On **2026-09-12**, native typecheck and doctor CLI smoke passed; **183 tests passed,
1 POSIX-only skip, 0 failed** (184 cases), including all 12 new tests. The Windows
replay test runs only reflection and synthetic in-memory construction; the full suite
retains its separately scoped host-worker tests.

Its scheduled **file-only creation-time ACL** harness has now passed the separately
reviewed native scope above, not a pipe/production privacy gate. Only new fixture DACLs; no existing ACL repair, named-pipe service,
Docker integration or cross-user/process-isolation claim. Engine identity/receipt
proof and IPC peer/namespace contracts stay unresolved. Gateway remains deferred,
all full gates pending, and the current pi process unprotected.

## Earlier continuation: installed Docker evidence reviewed; recovery API contract still unverified

Reviewed bounded public installed materials and collected **11 offline builtin
help/version responses** from Authenticode **Valid / Docker Inc** CLI **29.4.3**, build
**055a478**. Components metadata says Desktop **4.74.0**, packaged Engine **29.4.3**;
this is not a new running-engine query. Raw stdout and hashes are recorded in the
[Docker recovery API evidence review](Docker-Recovery-API-Review.md).

No matching Engine API schema or implementation was located in the checked local
material. Help establishes command descriptions, **not** engine incarnation lifetime,
HTTP completion/cancellation semantics, or retained terminal/negative request receipts.
This is an evidence gap, not a proof that every Docker API lacks those features.
**Native recovery/receipt adapter implementation stays blocked.** CID files, names,
labels, wait/events and CLI timeouts cannot be promoted to the model's receipt oracle.

Only builtin help/version was invoked, with the fixed trusted executable/endpoint
argument, empty disposable config and minimal environment. No daemon query/mutation
command, pi runtime, resource target, credential read, download or settings change was
issued. The sole exact temp root was removed and independently confirmed absent.
The newly reviewed `--use-api-socket` socket/auth bridge is explicitly not enabled;
current hardened fixture arguments and inspect behavior are unchanged.

Native Windows / Node **22.23.0** on **2026-09-12**: typecheck and doctor smoke passed;
**171 tests passed, 1 POSIX-only skip, 0 failed** (172 cases), including five new
public-evidence/regression tests. New tests only read repository evidence and inspect
synthetic argv; the existing suite retains its previously scoped host-worker tests.
These results validate evidence integrity/scope, not Engine API capabilities.

Its scheduled Windows private-storage/local-IPC API review is now recorded above;
the next native experiment is scoped file-only, with pipe authentication still pending. Backend identity/receipt proof remains a blocked
dependency; no workaround, native recovery adapter or supervisor-loss experiment is
authorized. Guard is Locked / not active; gateway remains deferred and all full gates
remain pending. The current pi process is unprotected.

## Earlier continuation: command-owner / uncertain-operation receipt model

Added the [command-owner design and deterministic experiment](Command-Owner-Receipts-Design.md),
`guard-host/command-owner-model.ts` and **24 new tests**. One simulated owner serializes
bounded cleanup requests and acknowledged intent/delivery commits. Replacement rejects
old senders, but transport-delayed requests may still be accepted, and accepted work
may finish after replacement. No actual process is stopped or restarted by this model.

Exact request-bound terminal receipts are recorded separately from fresh postcondition
observations. Duplicate/out-of-order receipts cannot roll back the ledger; a return
without the expected stop/removal state cannot settle. Repeated empty inventories,
missing receipts, historical creates without identity and possibly committed delivery
markers stay unresolved. Eight mocked commit cuts preserve uncertainty without
resubmission; all reports remain Locked / not active / canLaunch false / non-executable.

**The fake issuer's terminal/negative receipt lookup is not an established Docker
capability.** Epoch authority, private storage, atomic checkpoints and reload are
in-memory assumptions, not native fencing, authenticated IPC or durability evidence.
Synthetic quiescence does not mean stopped: a rejected stop can leave the resource
running. No adapter or existing runtime probe consumes these model reports.

On **2026-09-12**, native Windows typecheck and doctor CLI smoke passed; **166 tests
passed, 1 POSIX-only skip, 0 failed** (167 cases). New tests perform no filesystem,
process, networking, Docker or pi operations. The full suite still includes its
previously scoped disposable host-worker tests. No new native store/Docker/pi fixture,
installation, credential inspection or host settings change occurred.

Its scheduled local backend evidence review is now recorded above; required
engine-incarnation/receipt guarantees remain unverified, blocking a native recovery
adapter while independent Windows storage/IPC feasibility work can continue. No supervisor-loss test or real recovery executor
is authorized. Provider gateway remains deferred; no full gate advances and the
current pi process is unprotected.

## Earlier continuation: native Windows synthetic store / fake engine passed

The separately scoped [Windows store prototype](Windows-Store-Prototype.md) passed
**15 checks**, exit **0**, on **2026-09-12**, Node **22.23.0**, Windows PowerShell
**5.1.26100.9444** / CLR **4.0.30319.42000**. System PowerShell Authenticode was
**Valid / Microsoft**. No Docker, pi runtime, provider, real project, networking,
installation or host settings change was involved.

A retained PowerShell file worker owns both the data file's exclusive
`FileShare.None` handle and all writes. Two native processes demonstrated sharing
violation 32 with a live positive owner; release and a single checkpointed kill of
**only the disposable file worker** allowed a fresh native open. The trusted
controller stayed alive. All workers exited; all six exact synthetic temp roots
were removed and separately confirmed absent.

Bounded hash-linked frames require whole-file compare, body flush, marker flush and
exact readback. No torn tail is silently rolled back to a previous frame. Explicitly
injected short writes/flush failures are not actual failing-disk observations. A
pre-final-flush exception left complete bytes through disposal but no acknowledgement;
the **fake** engine did not replay an effect. Mock epoch/head/liveness/one-shot checks
are not Docker fencing, operation quiescence or durable external-effect receipts.

**Power-loss durability, NTFS alias/race safety, private production storage,
installation-wide command authority, authenticated high-water checkpoints and real
restart recovery remain unproven.** Whole valid-prefix replay is a demonstrated
limitation, not prevented by the hash chain. Reports remain Locked / not active /
canLaunch false / gateway deferred / durability not proven.

Native typecheck and doctor CLI smoke passed; **142 tests passed, 1 POSIX-only skip,
0 failed** (143 cases), including 14 new store/protocol/transport tests. Those unit
tests do not execute the native store fixture, Docker or pi; real sharing evidence
comes from the separate opt-in run. Its scheduled command-owner / uncertain-operation
receipt design and bounded fake-engine experiment are now recorded above. No supervisor kill,
Docker Desktop/WSL disruption or real recovery executor is authorized. No full gate
advances; the current pi process remains unprotected.

## Earlier continuation: restart-reconciliation design and offline model

Added [durable ownership/restart-reconciliation design](Restart-Reconciliation-Design.md),
`guard-host/reconciliation-model.ts` and 17 pure tests. The model validates a
canonical bounded journal, immutable identity and lifecycle transitions, then
proposes one **non-executable** stop/record/remove step from synthetic evidence.
It never proposes create/start/resume, accepts no guest authority, and keeps all
decisions Locked / not active / canLaunch false / gateway deferred.

The design separates durable commit, exclusive command fencing, request quiescence,
engine identity and fresh exact-resource observations. An uncertain create with an
empty inventory stays unresolved; repeated polling is not proof that it cannot
appear later. A hash chain alone cannot detect replay of a complete valid prefix;
the model additionally checks a separately supplied commit head, without pretending
that this authenticates storage or prevents whole-store rollback.

Native Windows typecheck and doctor CLI smoke passed; **128 tests passed,
1 POSIX-only skip, 0 failed** (129 cases). The 17 new model tests cover all crash
cut points, malformed/bounded journals, missing or stale ownership, invalid fences,
engine changes, uncertain/late creates, exact identity, cleanup receipts, profile
drift, revived work, tombstones and journal exhaustion. They perform no file I/O,
Docker calls, networking, process termination or pi imports.

**No durable journal store, native mutex/fencing service, engine observation adapter,
watchdog, recovery CLI or supervisor-loss runtime test exists.** Current probes are
unchanged; no new Docker/pi run, credential inspection, download, installation or
host settings change occurred in that continuation. Its scheduled Windows API review
and synthetic harness are now recorded above, not a production recovery service.
Do not kill a supervisor,
restart the daemon or stop Desktop/WSL. Gateway and all full gates remain pending.
The current pi process remains unprotected.

## Earlier continuation: expanded whole-agent lifecycle fixture passed

On **2026-09-12**, the expanded `guard:probe-agent` passed **all 35 checks**, exit
**0**, on native Windows / Node **22.23.0**, Engine **29.4.3**, Desktop Linux / WSL2.
Container and host-temp cleanup returned `removed`; a separate corrected-path
nonce-label query confirmed absence and its own temp cleanup. The approved image,
382-file vendor inventory and hardened profile were unchanged. See
[lifecycle scope and native evidence](Agent-Lifecycle-Prototype.md).

The added 15 decisions exercise real public SDK runtime new/resume/fork/clone,
in-place tree/reload and post-reload tool work, cancellation of five transition
forms, active stream/tool abort, explicit steering/follow-up queue clearing, and
extension tool/hook/shutdown failures. Only four synthetic guest-tmpfs sessions are
persisted; no host history or alternate workspace is imported. Every replacement
gets fresh explicit resources/settings/model and extension bindings. Stale extension
appends must fail. A separate exec verifies bounded transcript/event records,
actual pre/post-cancel effects and absent blocked writes before host engine stop.

Important observations: a throwing tool's earlier guest write remains; queue
revocation is explicit, not inferred from abort; a detached child still advances
after session disposal/shutdown failure. Cooperative SDK lifecycle behavior is not
an isolation boundary. The surviving host controller stops/removes the container
and independently verifies original synthetic source/canary bytes.

Native typecheck and doctor CLI smoke passed; **111 tests passed, 1 POSIX-only skip,
0 failed** (112 cases), including seven new lifecycle verifier/schema tests. Unit
checks do not execute pi or Docker; this real-backend evidence comes from the
separately confirmed native fixture. No downloads, installs, credentials, real
project admission, host apply, broader network targets or host settings changed.

Next: durable host ownership/restart-reconciliation design before any supervisor-
loss test. Broader lifecycle/revocation, uncooperative extensions, cross-workspace
separation, compaction/transport paths, network variants and packet-level evidence
remain unproven. Gateway work stays deferred; private classifications stay local.
**No full phase gate advanced; the current pi process is not protected.**

## Earlier continuation: synthetic network/IPC primitive passed

On **2026-09-12**, the new `guard:probe-network` **two-container Node-only primitive**
passed all **21 checks**, exit **0**, on native Windows / Node **22.23.0**, Engine
**29.4.3**, Desktop Linux / WSL2 with the retained approved Node image. Primary,
peer and host-temp cleanup returned `removed`. Separate bounded nonce-label queries
confirmed both containers absent and cleaned up their own temporary client config.
See [scope and native evidence](Network-IPC-Prototype.md).

Both profiles are inspected before either starts; no security flag was relaxed.
Guest-local TCP/UDP echo and an explicit local DNS responder establish positive
controls. Fixed TEST-NET TCP/UDP/DNS, IPv6/mapped IPv4, resolved-address and controlled
HTTP redirect attempts require explicit OS denials; timeouts are inconclusive.
The peer's TCP/UDP/Unix echo services are independently verified alive before and
after the primary test, while inaccessible from the primary. Network/IPC/PID/mount
namespace identities differ and the peer shared-memory marker remains absent from
the primary. These are synthetic observations, not packet capture or real host/LAN/
cloud-service/gateway acceptance. No pi, project data, credential, host listener,
system DNS query, installation or host setting change was involved.

Added three host modules, an opt-in script, runbook and **13 tests**. Native Windows
typecheck and doctor CLI smoke passed; **104 tests passed, 1 POSIX-only skip,
0 failed** (105 cases). New tests use fake sockets/DNS bytes and Docker fakes—no
host network connections or real container operations. They cover error/timeout/
positive-control distinctions, strict schemas, peer liveness/namespace changes,
cancellation and independent cleanup even when one resource is ambiguous or fails.

Next: whole-agent session transitions, cancellation and extension-failure checks
with synthetic data. Durable ownership/reconciliation design must precede any
supervisor-loss experiment; broader network variants/packet-level proof remain
pending. Gateway work stays deferred, private classifications stay local, and no
full phase gate advanced. The current pi process is not protected.

## Earlier continuation: controlled worker loss and supervisor recovery passed

The new `guard:probe-recovery` **Node-only primitive** passed all **five checks**
on native Windows / Node **22.23.0**, Engine **29.4.3**, Desktop Linux / WSL2, with
the retained approved image. Worker exit, container removal and host temp cleanup
were confirmed; a separate bounded nonce-label query confirmed container absence.
See [scope and native evidence](Worker-Loss-Prototype.md).

The supervisor owns/creates one hardened container; a disposable worker starts
only that existing immutable ID. After settled Docker calls and independently
checked readiness, the worker is forcibly terminated and reaped. **The guest
parent and detached child continue running after worker loss.** A surviving
supervisor then stops the container through engine SIGKILL and ownership-checks
removal. This demonstrates controlled worker-loss recovery, not automatic guest
stop or protection after supervisor/daemon loss. No pi, project data, credentials,
network probes, host mounts or installations are involved in this new primitive.

Added five host modules, an opt-in package script, 12 tests and a runbook. Native
Windows typecheck and doctor CLI smoke passed; **91 tests passed, 1 POSIX-only
skip, 0 failed** (92 cases). Tests cover Docker fakes and actual synthetic worker
force-kill/exit-hook absence, IPC schemas/duplicates, output/deadline bounds,
cancellation, early exit, failed spawn and ownership/cleanup failures.

Next: broader adversarial network/IPC and whole-agent lifecycle tests. Design
durable ownership records and restart reconciliation before deliberately losing
the supervisor; do not disrupt Desktop/WSL/daemon under the current fixture scope.
Gateway work stays deferred, private classifications stay local, and no full phase
gate advanced. The current pi process is not protected.

## Earlier continuation: native offline whole-agent fixture passed

On **2026-09-12**, after the engine became responsive, the unchanged native
`guard:probe-agent` fixture returned **exit 0**, **all 20 checks passed**, container
and host cleanup **removed**. A separate bounded nonce-label query confirmed the
successful container absent and cleaned up its own temporary client configuration.
The first retry in this continuation had still blocked at `engine`; later selected
process/metadata checks observed Desktop/backend running and a responsive daemon.
No Desktop/service start or settings change was performed by the agent.

Observed successful backend: Docker Desktop Linux / WSL2, Engine **29.4.3**, retained
approved image `sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553`.
The real pi **0.85.1** SDK/tool/inline-extension loop ran in the Node 24 guest with
clean explicit resources and the three-file synthetic snapshot. Detached-child,
single-reload, independent effects, host-owned SIGKILL and host source/canary
checks passed. The guest-only bundled-SDK adapter is now tested for this fixed
sequence, not a general supported SDK deployment. See [native pass evidence](Windows-Offline-Agent-Run.md).

Native Windows typecheck and doctor CLI smoke passed again; **79 tests passed,
1 POSIX-only skip, 0 failed**. No source-code, dependency, runtime-pin or security-
profile changes were required. Unit tests remain separate from real-backend evidence.

**Next: broader synthetic adversarial network/IPC, lifecycle and controller-loss/
recovery experiments.** Active settings/trust assumptions and private classifications
(local only) remain outstanding; gateway work stays deferred. The successful
offline fixture does not prove production admission, NTFS race safety, all ingestion
routes or a supported backend. **No full gate advanced; the current pi process
is not protected.**

## Earlier continuation: native offline-agent attempt blocked at engine

The continuation is now **native Windows / Node 22.23.0**, PowerShell
**5.1.26100.9444**, non-elevated. The expected Docker CLI **29.4.3** and its valid
Docker Inc signature were rechecked. Typecheck and doctor CLI smoke passed;
**79 tests passed, 1 POSIX-only skip, 0 failed** (80 cases), including pinned runtime
collection and the Windows synthetic junction/hard-link/ADS cases. Doctor returned
**exit 2 / Locked**.

The native `guard:probe-agent` invocation returned **exit 2**, blocked at `engine`
with `DOCKER_COMMAND_FAILED`, zero checks, container cleanup `not-needed` and host
cleanup `removed`. Desktop/backend process counts were zero; a bounded clean-client
query confirmed a missing engine pipe / unavailable daemon. No container, guest pi,
tool, extension or network probe started. The approved local image could not be
reverified while the engine was unavailable. See [native attempt evidence](Windows-Offline-Agent-Run.md).

**Next: start the already-installed Docker Desktop, wait for its Linux/WSL2 engine,
and retry the offline-agent runbook.** Desktop/services were not started or
reconfigured by this continuation. No runtime acceptance or phase gate passed;
gateway work stays deferred, private classifications stay local, and there is no
host-pi fallback. The current pi process is not protected.

## Earlier continuation: offline whole-agent runner prepared on Linux

That continuation was on **Linux / Node 24.17.0**, without Docker or a Windows
shell on PATH. The previously confirmed Windows setup does not need reconfirmation.
No new Docker or pi runtime was started here and no credentials were inspected.

The opt-in `guard:probe-agent` runner now implements pinned runtime transfer over
stdin, a synthetic sanitized copy, an offline pi SDK/tool/inline-extension sequence,
detached-child checks, host-owned stop, independent synthetic host verification and
ownership-checked cleanup. The guest-only bundled-SDK distribution adapter and all
real-runtime checks remain **unverified**. See [Offline Agent Prototype](Offline-Agent-Prototype.md)
for exact effects, runtime inventory, limits and the native PowerShell command.

Typecheck and doctor CLI smoke passed; **79 tests passed, 1 Windows ADS case skipped,
0 failed** (80 cases). New tests use fakes, an in-memory bootstrap filesystem,
fixed pinned artifact reads and syntax-only checks; they do not execute pi or
network probes. Actual doctor and agent-probe invocations return **exit 2 / Locked**
on this host. No full phase gate advanced. Gateway work remains deferred; private
classifications stay local, and production admission/apply/containment are pending.

## Earlier continuation: provider deferred, offline copy fixture passed

The operator deferred provider/authentication-method selection and gateway work.
Do not ask for those details again while continuing independent offline checks.
The requirement is still pending, not waived or counted as a successful gate.

A separate **host-only synthetic-copy experiment** is implemented and passed on
native Windows Node **22.23.0**: all **7 checks**, exit **0**, cleanup **removed**.
It creates its own source, exports only three fixed files into a fresh copy,
checks bounded packet integrity and detached edits/deletions, and never accepts a
real project path. Actual synthetic Windows hard links, directory junctions and
an alternate-stream case passed. This is **not** production admission, NTFS race
safety or independent guest containment. See [scope/evidence](Synthetic-Copy-Prototype.md).

Latest validation: typecheck and doctor CLI smoke passed; **63 tests passed,
0 failed, 1 POSIX-only skip** (64 cases, including 16 new copy tests). No new pi or
Docker runtime was started and no further provisioning occurred in this work.
Installed pi SDK/resource/provider documentation and runtime packaging were
investigated for the next offline whole-agent experiment; no runtime proof was
obtained from that research. The current pi process is still not protected.

Next: whole-agent offline container startup with clean resources/environment and
a synthetic admitted copy, followed by independent containment/network/lifecycle
and stop proofs. Provider/gateway validation remains deferred and the full Guard
Phase 0 gate remains incomplete. Private classifications stay local.

## Earlier continuation: native Windows Docker fixture passed

The coding session now runs on **Windows 11 Home Single Language 25H2,
`26200.9445`**, Node `22.23.0`, npm `12.0.2`, and PowerShell `5.1.26100.9444`.
Observed installed versions: Docker Desktop `4.74.0.227015`, Docker CLI `29.4.3`
(valid Docker Inc signature), and WSL `2.7.3.0`. The process is not elevated;
Windows reports a hypervisor present. Local pi/pi-tui remain `0.85.1`.

The initial engine/image blockers are preserved in the earlier Windows record.
After explicit download approval, the official Node image was provisioned with an
empty Docker client configuration/environment allowlist. A Docker 29 strict
lookup issue for omitted optional image metadata was fixed using schema-reviewed
`index` lookups; nonempty volume/hook declarations remain denied.

The native fixture then returned **exit 0, all ten checks passed, cleanup
removed**, on Engine **29.4.3**, Docker Desktop Linux, kernel
`6.6.114.1-microsoft-standard-WSL2`. A separate scoped query confirmed the fixture
container was gone. The approved image is retained locally; its Node metadata is
`24.21.0` (the fixture checks running major version 24). No pi runtime was launched.
Remaining active settings and whole-agent containment are unverified.

Windows typecheck and doctor CLI smoke passed. After three query/validation
regression tests, the unit suite passed **47 tests, with one POSIX-only test
skipped and zero failures**. Doctor still returns Locked.
Explicit `npm.cmd` fixes the observed PowerShell/npm argument-forwarding failure;
the runbook and CLI help now use it on Windows, with help regression assertions.
See [native Windows pass evidence](Windows-Docker-Fixture-Pass.md) for the
sanitized report, image digest, version matrix, command and scope of each check.

That run left whole-agent sanitized-copy and synthetic host-canary/network/lifecycle
proof, plus fake-credential gateway compatibility pending. The subsequent offline
copy result above is a separate preparation step, not completion of those checks.
Provider work has now been deferred by the operator. No full phase gate has
advanced, and no further download or settings change is implicitly approved.

## Initial Linux baseline (historical)

The operator had confirmed **Windows 11 Home**, **Docker Desktop and WSL2
installed**, and **mainly Node.js development**. The observations in this table
are from the earlier Linux implementation session, not the current Windows run.
Build/runtime versions and active settings were unverified at that point; the
current Windows evidence above supersedes those discovery gaps where stated.

| Item | Observation |
|---|---|
| Intended user host | **Windows 11 Home**, confirmed by the operator; exact build pending |
| Operator-reported runtime | Docker Desktop and WSL2 installed; versions/settings not yet verified |
| Earlier implementation host | Linux x64, kernel `6.12.95-cloud-amd64` |
| Node / npm | v24.17.0 / 11.13.0 |
| Local pi coding agent / pi-tui | 0.85.1 / 0.85.1 (`npm ls --depth=0`) |
| Installed pi documentation baseline | 0.85.1, matching the local peer dependencies |
| Docker, Podman | Not found in searched PATH; installation elsewhere/daemon state not inferred |
| QEMU x86_64/aarch64, WSL CLI | Not found in searched PATH |
| Docker Sandboxes (`sbx`), OpenShell | Not found in searched PATH |
| Windows build, runtime versions, privileges/settings | Remain to be verified on the actual Windows host; Home edition is confirmed |
| Required guest/native Windows toolchains | Mainly Node.js development confirmed; Linux Node.js is the prototype target |
| Intended provider/gateway authentication compatibility | Not tested; no credentials inspected |
| Target terminal/font/window size | Not supplied; real Windows terminal tests not run |
| Prototype / supported PHI backend | Docker Desktop WSL2 Linux prototype; **no validated production backend** |
| Original package extension/theme entry points | Still absent; this is not an install-ready pi package |

PATH discovery checks only fixed candidate filenames using filesystem metadata.
A CLI file is not proof of its version, trustworthiness, running daemon, usable
virtualization, or correct isolation. No candidate is executed, not even with
`--version`; an executable found in an untrusted directory is not trusted code.

## Implemented diagnostic

```bash
npm run guard:doctor
npm run guard:doctor -- --help
npm run --silent guard:doctor -- --json
```

Exit codes:

- `0`: help displayed; **not** a security readiness result.
- `2`: diagnostic collected; protected launch is unavailable (**Locked**).
- `64`: unsupported arguments; no discovery performed.
- `1`: unexpected collection failure; no success or raw error details emitted.

`guard-host/doctor.ts` is a host-side setup diagnostic, **not a launcher, broker,
Guard extension, or OS security boundary**. There is no path to launch pi, pass a
command to a runtime, enable a fallback, or mint an approval. It always reports
`canLaunch: false` and `protection: not-active`. It does not constrain any existing
process. Do not use diagnostic JSON as containment evidence or an authorization
token in a future controller.

Discovery reads OS/runtime metadata and only the PATH environment value. It does
not load pi, extensions, project settings, sessions, authentication, `.env` files,
or arbitrary configuration. It does not read candidate executable contents or
execute commands. Only candidate IDs and availability leave the discovery layer;
full PATH values, filenames from private folders, and raw errors are not reported.

The search is capped at 65,536 PATH characters and 128 entries. Relative, empty,
control-bearing, UNC/device and unsupported Windows entries are skipped;
truncation/skips produce an incomplete-search indication. An inaccessible metadata
probe becomes `unknown`, not proven absence. Windows `.exe`/`.cmd`/`.bat`
construction is tested as data, not as command execution or proof of NTFS safety.
Discovery is not a complete OS installation inventory. Filesystem metadata probes
may be slow on mounted filesystems; this is not a production process supervisor.

## Architecture/API review

The installed pi README and full `extensions.md`, `tui.md`, `containerization.md`,
`security.md`, `windows.md`, `environment-variables.md`, `settings.md`,
`providers.md`, and `packages.md` were reviewed. Relevant installed examples
`protected-paths.ts`, `sandbox/index.ts`, and `gondolin/index.ts` were also read.
These findings guide later prototypes; documentation review is not runtime proof.

- **Whole-agent isolation is necessary.** pi and its extensions run with their
  process's OS permissions. Project trust and `tool_call` hooks are not a sandbox;
  resource/context loading can occur before an extension starts.
- **Do not copy the sandbox example as PHI Guard.** It wraps Bash on Linux/macOS,
  leaves the host pi process unrestricted, and has a local fallback on
  disabled/uninitialized paths. It does not meet required Windows support.
- **Do not copy the Gondolin example's mount model.** It routes tools to a VM while
  leaving pi/extensions on the host, and exposes the entire cwd read/write. PHI
  requires omission of sensitive content before admission and reviewed application.
- **Plain Docker documentation is not the approved PHI configuration.** Its sample
  mounts the original workspace and passes real credentials to the container.
  Those conveniences conflict with this project's staged-copy/credential boundary.
- **Docker Desktop WSL2 Linux is now the provisional prototype target.** The
  operator's Home/Node.js setup and reviewed Docker vendor documentation motivate
  this choice. The fixed disposable Node fixture has now passed on native Windows;
  whole-agent proof and production selection remain pending. OpenShell and Docker
  Sandboxes have not been selected or installed. See the
  [prototype runbook](Docker-Prototype.md) for vendor references and limitations.
- **Mode enforcement needs final execution checks.** Tool provenance metadata and
  active-tool APIs exist; later hooks can mutate arguments after preflight, and
  parallel calls have separate preflight/execution phases. `user_bash` needs its
  replacement-result/operations API, not the `tool_call` return shape. These still
  need the Modes Phase 0 runtime prototype and Windows check-runner validation.
- **A production sidebar is not established.** Documented UI APIs provide
  header/footer/editor/widget/custom-overlay slots, not a verified transcript
  width-reservation hook. TUI primitives alone do not prove docking. No private
  layout has been patched and no fallback has been silently selected. The TUI
  prototype, terminal testing, and layout approval remain pending.

## Docker feasibility work after operator clarification

`guard-host/docker-spec.ts`, `docker-probe.ts`, and `probe-docker.ts` implement an
explicitly opted-in Windows-only fixture. They pin an existing local Node image,
force a local Docker pipe/clean client config, inspect restrictions before start,
validate fixed guest results, and ownership-check cleanup. They do not import the
project, launch pi, pull images, or create a production Guard permission grant.
Fakes test policy, lifecycle, cancellation, malformed settings, and cleanup; local
Node subprocess tests verify bounded output and direct argument handling. The
real native Windows Node fixture has now completed successfully and been removed;
no whole-agent container had been implemented or started in that earlier work.
The subsequent opt-in offline runner now has its own native Windows real-backend
pass: all 20 checks and cleanup, after initial engine blockers. This is still a
fixed synthetic experiment, not complete whole-agent Guard acceptance.

## Initial validation (Linux, historical)

Current native Windows results are listed above and in the linked evidence file.
The following table preserves the earlier Linux run, not a current-host claim.

| Check | Result | Scope |
|---|---|---|
| `npm run typecheck` | Passed | Host diagnostics, Docker fixture prototype and tests under strict TypeScript |
| `npm test` | 45 passed, 0 failed, 0 skipped; exit 0 | Discovery/report/CLI tests, Docker fakes, bounded local Node subprocess tests |
| `npm run test:smoke` | Passed | Doctor text/JSON/help/rejection exit codes; synthetic executable is not run |
| `npm run guard:doctor -- --json` | Exit 2, expected | Actual Linux host inventory; Locked, no validated backend |
| `npm run guard:probe-docker -- --help` | Passed | New CLI help; no Docker operations |
| Docker probe with valid synthetic arguments on this Linux host | Exit 2, expected | `DOCKER_WINDOWS_HOST_REQUIRED`; no Docker operations |

Not run in that Linux validation / not claimed: whole-agent isolation, snapshot
exclusion, host patch application, provider streaming/OAuth proxying, network/IPC containment, NTFS
aliases/reparse/race behavior, native Windows execution/cancellation, workflow
modes, editor/inspector rendering, real terminal smoke, clean pi installation,
tarball acceptance, or independent security review. The smoke script is currently
**CLI-only**; it must gain dedicated TUI coverage when that implementation exists.

## Gate decision

**Do not advance beyond Guard Phase 0 or advertise protection.** Initial
platform/toolchain questions are answered, and installed Windows/runtime versions
are now observed. The separately approved image download and primitive fixture
have passed on the confirmed Windows 11 Home setup. The offline whole-agent fixture
has since passed the expanded 35-check lifecycle revision and cleanup. Separate
worker-loss (5) and network/IPC (21) primitives pass their fixed scopes. Design
durable ownership/restart reconciliation before any supervisor-loss test; no
supervisor/daemon/WSL disruption is authorized. Broader synthetic lifecycle and
network tests remain pending; these passes do not establish production revocation,
crash recovery or full lifecycle coverage.
Keep provider identity/authentication method and gateway validation
**deferred / pending** until revisited; an offline deterministic provider cannot
satisfy gateway acceptance. Neither the Docker Node fixture, the separate host-side
copy fixture nor the combined offline-agent fixture satisfies the complete gate. Record the exact tested product/version/config
matrix and unresolved gaps before choosing a supported backend. No virtualization
installation, host ACL/trust change, credential exposure, or unrestricted fallback
is an acceptable substitute for that proof.
