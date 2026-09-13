# PHI execution order and progress

## Status

**Guard Phase 0 is in progress. Passing native Windows fixtures: Node (10 checks), host-only copy (7), expanded offline whole-agent/copy/lifecycle (35), controlled worker loss (5), synthetic network/IPC (21), host-only synthetic store/fake-engine (15), and file-only same-user ACL controls (10), all with verified cleanup. These are fixed-experiment results, not a production backend. Worker-loss recovery requires a surviving supervisor. Restart-reconciliation and command-owner/receipt models are tested offline and native file-sharing/readback checks pass, but private production storage, durable checkpoints, real engine fencing and actual restart recovery remain unimplemented; installed CLI help does not establish the required Engine identity/receipt contract, and Windows security reflection/memory tests do not prove native privacy or IPC authentication; broader lifecycle, network and policy work remain. Provider/gateway work stays deferred, not passed. No full gate has advanced. The three plans are NOT complete.**

Latest [pipe implementation review](Windows-Pipe-Contract-Review.md): both installed
Framework and .NET 8 add a first-instance bit for a one-instance server. This corrects
the enum-only ambiguity, not native namespace/peer acceptance. Explicit local-only
rejection and exact process-lifetime binding remain unestablished; no listener created.

All three source plans have been read in full. They are companion requirements,
not independent jobs to run alphabetically. Their dependency order is **Guard →
Modes → TUI**, with early feasibility gates and shared integration/release work.
File timestamps do not establish an implementation order.

The repository started this execution with only plans, package metadata,
TypeScript configuration, and installed dependencies. No old implementation has
been restored wholesale. The historical “documentation task” handoffs in the
source plans describe their creation, not completion of their implementation.

## Chronological work queue

This is a sequential execution schedule. Complete each exit gate before advancing;
never treat a pending platform test or approval as passed. The Phase 0 checks come
before production work to avoid building on an unsupported backend or layout.

| Order | Source phase | Deliverable / exit gate | Current status |
|---|---|---|---|
| 01 | [Guard](Guard-Plan.md) 0 | Select and prove a Windows-compatible whole-agent backend, sanitized-copy workflow, fake-credential gateway, and synthetic containment checks | **Primitive (10), host-only copy (7), and expanded offline whole-agent/copy/lifecycle (35) checks passed** on Windows with cleanup; **worker-loss (5) and synthetic network/IPC (21) primitives passed**; worker recovery requires surviving supervisor; reconciliation and command-owner/receipt models tested offline, **synthetic Windows store/fake-engine (15) passed**; local CLI/API evidence review leaves identity/receipt contract unverified; Windows security reflection/memory tests and **native file-only ACL controls (10) pass**, not production privacy; private durable storage/real fencing/recovery pending; broader containment/policy gaps remain; gateway deferred, not passed |
| 02 | [Modes](Modes-Plan.md) 0 | Demonstrate tool provenance/exclusions, restricted tools, plan-writer prototype, and Windows check-runner behavior | Pending 01 |
| 03 | [TUI](TUI-Plan.md) 0 | Audit/prototype public layout APIs, test terminal behavior, obtain supported layout/overlay approval | Pending 02; terminal/layout decisions also outstanding |
| 04 | Guard 1 | Deny-by-default policy, link-safe admission manifest/export, policy revisions, protocol validation, private audit | Pending 01–03 |
| 05 | Guard 2 | Isolate the whole runtime, clean environment, constrained credentials/network/IPC, no local fallback, host stop | Pending 04 |
| 06 | Guard 3 | Trusted patch review/apply, exact grants, conflicts/deletions/links, revocation and recovery | Pending 05 |
| 07 | Modes 1 | Shared controller, Ask/Code, approval boundary, branch-aware persistence and safe transitions | Pending 02, 06 |
| 08 | Modes 2 | Restricted revisioned plan artifacts, approve/refine/Code handoff, paused task progress | Pending 07 |
| 09 | Modes 3 | Debug and Review workflows, exact diagnostic exceptions, non-automatic suggestions | Pending 08 |
| 10 | TUI 1 | Validated Midnight theme, native editor shell, effective mode/model/provider row, narrow/ASCII handling | Pending 03, 09 |
| 11 | TUI 2 | Canonical usage/cost aggregation, reasoning coverage, model reconciliation, measured response rate | Pending 10 |
| 12 | TUI 3 | Collapsible inspector in the approved layout, namespaced controls, draft/focus/resize behavior | Pending 11 |
| 13 | Modes 4 | Connect real mode policy, progress and permission dialogs to the PHI composer/controls | Pending 12 |
| 14 | Guard 4 | Controller-evidenced status and scoped tools, modes, attachments, sessions, exports and lifecycle integration | Pending 06, 13 |
| 15 | TUI 4 | Activity and optional conflict-safe tool polish; never replace a guarded backend with local tools | Pending 14 |
| 16 | Guard 5 | Adversarial real-backend and native Windows tests, independent broker review, documented support matrix | Pending 15 |
| 17 | Modes 5 | All workflow, runtime-mode, lifecycle, extension compatibility and Windows acceptance tests | Pending 16 |
| 18 | TUI 5 | Real terminal acceptance, package contents/clean install/removal, documentation and release preparation | Pending 17 |

Guard and workflow permissions are intersections: a mode, plan approval, tool
renderer, or project setting cannot override a Guard denial. Modes do not depend
on a permanent sidebar. The inspector fallback requires approval; no private TUI
layout monkey-patching is authorized by this schedule.

## Work actually executed

| ID | Work | Evidence / result |
|---|---|---|
| G0-D1 | Inspect repository, baseline and available host tooling without installing anything | Linux x64, Node v24.17.0, pi/pi-tui 0.85.1; details in [Phase 0 findings](Phase-0-Findings.md) |
| G0-D2 | Implement repeatable read-only preflight | `guard-host/discovery.ts`, `preflight.ts`, `doctor.ts`; `npm run guard:doctor` |
| G0-D3 | Keep metadata discovery separate from security authorization | No pi launch API or validated production backend; every diagnostic/probe report retains `state: locked`, `protection: not-active`, `canLaunch: false` |
| G0-D4 | Test diagnostics with synthetic executable fixtures, unavailable/error paths, Windows path construction, and CLI failures | 23 tests passed; no candidate executable was run |
| G0-D5 | Run typecheck and CLI smoke | `npm run typecheck` and `npm run test:smoke` passed |
| G0-D6 | Run actual coding-host preflight | Exit **2**, expected Locked result; no candidate CLI found in this Linux environment's searched PATH |
| G0-D7 | Resolve operator's initial platform/toolchain questions | Windows 11 Home, Docker Desktop and WSL2 installed, mainly Node.js development confirmed |
| G0-D8 | Review Docker vendor APIs and implement the next opt-in fixture | `guard-host/docker-spec.ts`, `docker-probe.ts`, `probe-docker.ts`; see [Docker Prototype](Docker-Prototype.md) |
| G0-D9 | Test Docker restrictions, direct argv, failures/cancellation and ownership-checked cleanup | 45 total tests passed, plus typecheck and doctor CLI smoke; [Phase 0 findings](Phase-0-Findings.md). Real Windows run pending |
| G0-D10 | Revalidate order 01 on the earlier Linux continuation | Typecheck, all 45 tests and doctor CLI smoke passed again. That host was Linux without Docker or a Windows shell on PATH; doctor returned exit 2 / Locked and the probe rejected a synthetic invocation with exit 2 / `DOCKER_WINDOWS_HOST_REQUIRED`. No container was started and no phase gate advanced. |
| G0-D11 | Inspect the now-available native Windows host and trusted runtime tooling | Windows 11 Home Single Language 25H2 / `26200.9445`, Node `22.23.0`, Docker Desktop `4.74.0.227015`, signed Docker CLI `29.4.3`, WSL `2.7.3.0`; non-elevated process. See [native Windows evidence](Windows-Phase-0-Run.md). Active engine/settings remain unverified. |
| G0-D12 | Run the opt-in Docker fixture from native PowerShell | Exit **2**, `DOCKER_COMMAND_FAILED` at `engine`, `cleanup: not-needed`. Desktop/backend processes were not running; a bounded follow-up classified the engine failure as a missing pipe / unavailable daemon. No container was created or started. |
| G0-D13 | Correct Windows npm argument forwarding and revalidate | Explicit `npm.cmd` works where the unqualified PowerShell invocation rejected probe flags. Runbook and CLI help updated with regression assertions. Windows typecheck and doctor CLI smoke passed; **44 tests passed, 1 POSIX-only test skipped, 0 failed**. Doctor remains Locked. |
| G0-D14 | Retry the native fixture after the operator requested continuation | Engine **29.4.3**, Docker Desktop Linux and WSL2 metadata passed the engine precondition. Probe returned exit **2** at `local-image`; a bounded query confirmed the required local image was absent. Stopped for separate download approval; see [earlier Windows evidence](Windows-Phase-0-Run.md). |
| G0-D15 | Provision the Node image with explicit operator approval | Downloaded `docker.io/library/node:24-bookworm-slim` using a clean client config/environment; verified official source/digest and Linux/amd64 identity. Image retained locally; no npm dependency or host settings changes. [Pass evidence](Windows-Docker-Fixture-Pass.md). |
| G0-D16 | Correct the Docker 29 image metadata query without relaxing restrictions | Missing optional OCI `Volumes` caused strict template lookup failure. Schema-reviewed `index` lookups now emit explicit nulls for omitted `Volumes`/`OnBuild`; nonempty/incomplete metadata still blocks creation. Three regression tests added. |
| G0-D17 | Run the corrected fixture and final checks on native Windows | Fixture exit **0**, all **10 checks passed**, cleanup **removed**; a separate scoped query confirmed absence. Typecheck and doctor CLI smoke passed; **47 tests passed, 1 POSIX-only skip, 0 failed**. This is not whole-agent acceptance; Guard remains Locked. |
| G0-D18 | Defer provider/gateway work as requested; investigate offline SDK startup | Provider/authentication-method selection and gateway proof stay pending. Installed pi 0.85.1 SDK/resource/provider documentation and distribution metadata reviewed; no pi runtime launched, dependencies installed or credentials inspected. |
| G0-D19 | Implement the separate offline synthetic-copy experiment | `guard-host/synthetic-copy.ts`, `probe-copy.ts`, `tests/guard-copy.test.ts`; fixed synthetic source, three-file allowlist, bounded hash-checked packet, fresh copy, no host apply. This is not a production importer or Windows race-safe admission. [Scope and evidence](Synthetic-Copy-Prototype.md). |
| G0-D20 | Run the copy fixture and native Windows regression checks | Copy CLI exit **0**, all **7 checks passed**, cleanup **removed**. Actual synthetic hard-link/junction and alternate-stream cases passed. Typecheck and doctor CLI smoke passed; **63 tests passed, 1 POSIX-only skip, 0 failed**. No new Docker or pi runtime run; no full gate advanced. |
| G0-D21 | Reinspect the continuation host and version-matched SDK/distribution | Current session is Linux / Node **24.17.0**, without Docker or a Windows shell on PATH. Public SDK/resource/provider APIs and published bundle dependencies reviewed. No pi runtime or credentials loaded. |
| G0-D22 | Implement pinned, bounded runtime transfer preparation | `agent-runtime.ts`, `agent-runtime-inventory.json`: 382 fixed vendor files, 9,591,638 original bytes; no whole dependency-tree copy, downloads, installs, or host pi import. Guest-only bundled-SDK metadata adapter is experimental, not runtime-proven. |
| G0-D23 | Implement the opt-in offline whole-agent/copy runner | `agent-spec.ts`, `agent-probe.ts`, `probe-agent.ts`, `guest/offline-agent.ts`; stdin transfer, synthetic snapshot/canaries, real SDK tool/inline-extension sequence, detached child, independent effects/host checks, engine stop and ownership-checked cleanup. **Implementation only; actual run pending.** [Scope/runbook](Offline-Agent-Prototype.md). |
| G0-D24 | Validate locally without a host-pi fallback | Typecheck and doctor CLI smoke passed; **79 tests passed, 1 Windows ADS skip, 0 failed**. New coverage uses Docker fakes, an in-memory bootstrap filesystem, pinned artifact reads and syntax-only checks. Doctor and agent probe return exit **2 / Locked** here. No Docker/pi runtime or network probe executed; no gate advanced. |
| G0-D25 | Revalidate on the native Windows continuation | Node **22.23.0**, PowerShell **5.1.26100.9444**, non-elevated process; expected Docker CLI **29.4.3** and valid Docker Inc signature rechecked. Typecheck and doctor CLI smoke passed; **79 tests passed, 1 POSIX-only skip, 0 failed**, including pinned runtime collection and Windows synthetic filesystem cases. Doctor exit **2 / Locked**. |
| G0-D26 | Attempt the offline whole-agent fixture from native PowerShell | Exit **2**, `DOCKER_COMMAND_FAILED` at `engine`, zero checks, container cleanup `not-needed`, host cleanup `removed`. Desktop/backend process counts were zero; bounded clean-client follow-up confirmed missing engine pipe / unavailable daemon. No container or guest pi started, no gate advanced. See [native attempt evidence](Windows-Offline-Agent-Run.md). |
| G0-D27 | Retry after operator continuation and observe engine readiness | First retry blocked at `engine`, exit **2**, no container, host cleanup `removed`. Desktop/backend processes were subsequently observed running and a bounded clean-client engine query succeeded. No service start or settings change by the agent. |
| G0-D28 | Complete the native Windows offline whole-agent/copy fixture | Exit **0**, all **20 checks passed** on Engine **29.4.3** / Desktop Linux / WSL2 with the retained approved image. Real pi **0.85.1** SDK/tools/inline extension ran only in the guest; host stop, source/canary verification and container/host cleanup passed. No code/pin/restriction changes. [Pass evidence](Windows-Offline-Agent-Run.md). |
| G0-D29 | Independently confirm absence and rerun native regressions | Separate bounded nonce-label query confirmed the successful container absent; verifier temp cleanup confirmed. Typecheck and doctor CLI smoke passed; **79 tests passed, 1 POSIX-only skip, 0 failed**. Offline experiment passed, but no full gate advanced. |
| G0-D30 | Implement a separate controlled worker-loss primitive | `recovery-spec.ts`, `recovery-worker.ts`, `recovery-worker-client.ts`, `recovery-probe.ts`, `probe-recovery.ts`; supervisor creates/owns one hardened container, worker may only start its immutable ID, readiness requires settled Docker operations, actual forceful worker exit and independent recovery. No pi/project data/network requests or daemon/supervisor disruption. [Scope](Worker-Loss-Prototype.md). |
| G0-D31 | Validate new worker protocol, failure handling and real host termination | **12 new tests**; full native suite **91 passed, 1 POSIX-only skip, 0 failed**. Typecheck and doctor CLI smoke passed. Includes real disposable worker force-kill without exit hook, malformed/duplicate IPC, timeout/output bounds, early exit/failed spawn, cancellation and ownership/cleanup fakes. |
| G0-D32 | Run worker-loss primitive on native Windows and independently verify cleanup | Exit **0**, all **5 checks passed**, worker `exited`, container/host temp `removed`; separate nonce-label query confirmed absence. Engine **29.4.3**, retained approved image. **Guest continued after worker death**; the surviving supervisor stopped it. This is not automatic stop on supervisor loss or full lifecycle acceptance. [Evidence](Worker-Loss-Prototype.md#native-run-evidence-and-development-validation). |
| G0-D33 | Implement a separate two-container synthetic network/IPC primitive | `network-spec.ts`, `network-probe.ts`, `probe-network.ts`; unchanged hardened profiles, guest-local positive TCP/UDP/DNS controls, TEST-NET egress/redirect attempts, namespace/peer socket/shared-memory checks and independent dual cleanup. No pi, host listener, host/LAN/cloud/provider service or system DNS query. [Scope](Network-IPC-Prototype.md). |
| G0-D34 | Validate socket/DNS decisions, peer evidence and dual cleanup without host networking | **13 new tests**; full native suite **104 passed, 1 POSIX-only skip, 0 failed**. Typecheck and doctor CLI smoke passed. Fake sockets prove that timeout, send success, unexpected response or wrong error cannot count as egress denial; bounded DNS, profile/schema, namespace/liveness, cancellation and partial-cleanup cases covered. |
| G0-D35 | Run synthetic network/IPC fixture on native Windows and confirm both containers absent | Exit **0**, all **21 checks passed** on Engine **29.4.3** / retained approved image. Both containers and host temp `removed`; separate bounded queries confirmed both nonce identities absent. Synthetic DNS/redirect, IPv4/IPv6/mapped-address, TCP/UDP and peer IPC evidence only—not packet-level, real host/LAN or gateway acceptance. [Evidence](Network-IPC-Prototype.md#native-run-evidence-and-development-validation). |
| G0-D36 | Review version-matched public SDK lifecycle APIs and extend the offline-agent fixture | Same pinned vendor runtime and hardened profile; real `AgentSessionRuntime` new/resume/fork/clone, in-place tree/reload with subsequent tool work, cancelled transitions, stream/tool abort with explicit queue clearing, deliberate tool/hook/shutdown failures and independent guest transcript/effects checks. [Scope](Agent-Lifecycle-Prototype.md). |
| G0-D37 | Validate the expanded exact schema and independent lifecycle effects without host pi | Seven new tests; native suite **111 passed, 1 POSIX-only skip, 0 failed**. Typecheck and doctor CLI smoke passed. Tests reject missing/stale/false decisions, missing positive effects, forbidden writes, malformed/out-of-scope transcripts and linked/oversized artifacts. |
| G0-D38 | Run expanded offline-agent/lifecycle fixture and independently confirm cleanup | Native PowerShell exit **0**, **all 35 checks passed**, Engine **29.4.3**, retained approved image; container and host temp **removed**. Separate corrected-path nonce-label verifier confirmed absence and its own temp cleanup. Prior guest writes/detached child survive SDK cancellation/failure; host engine stop remains decisive. [Evidence](Agent-Lifecycle-Prototype.md#native-run-evidence-and-development-validation). |
| G0-D39 | Design durable ownership, fencing and stop-only restart reconciliation | [Design](Restart-Reconciliation-Design.md) separates intent commits, authoritative commit heads, exclusive command ownership, quiescent requests and fresh engine observations. No automatic resume, lease stealing, label-only adoption or empty-scan success after uncertain create. Native storage/watchdog/receipt APIs remain to be validated. |
| G0-D40 | Implement and test a bounded pure ownership-journal/reconciliation model | `reconciliation-model.ts`, `tests/guard-reconciliation.test.ts`; 17 new pure tests. Native typecheck and doctor CLI smoke passed; **128 tests passed, 1 POSIX-only skip, 0 failed**. Decisions are Locked/non-executable; no file I/O, Docker/pi run or supervisor loss in the new model tests, no runtime-probe integration or durability claim. |
| G0-D41 | Review Windows storage/fencing APIs and scope a disposable file worker | Node `sync`, .NET `FileShare.None`/`Flush(true)`/locking APIs reviewed; actual PowerShell CLR constructor/flush availability confirmed. Retained worker owns the data handle and I/O; append-only frames avoid unvalidated rename/replace assumptions. Only its own file worker may be interrupted, never a supervisor/Docker/WSL. [Scope and limits](Windows-Store-Prototype.md). |
| G0-D42 | Implement bounded synthetic store, fake-engine receipts and native worker transport | `store-format.ts`, `store-worker.ps1`, `store-worker-client.ts`, `store-probe.ts`, `probe-store.ts`; 14 new tests. Native typecheck/doctor smoke passed; **142 tests passed, 1 POSIX-only skip, 0 failed**. Torn tails, bounds, epoch/head mismatch, valid-prefix rollback limits, mock fencing and transport failures covered. No production storage or engine adapter. |
| G0-D43 | Run host-only Windows store fixture and independently confirm temp cleanup | Trusted system PowerShell **Valid / Microsoft**; exit **0**, **all 15 checks passed**. Real cross-process sharing violation and handle release after one checkpointed file-worker kill; write/flush faults and engine effects are explicitly synthetic. All workers exited; six exact temp directories removed and independently confirmed absent. No Docker/pi run, power-loss claim or full gate advance. [Evidence](Windows-Store-Prototype.md#native-evidence-and-development-validation). |
| G0-D44 | Design single command ownership and uncertain-operation receipt semantics | [Design](Command-Owner-Receipts-Design.md) separates fencing future requests from already-sent/accepted work, intent and delivery commits, terminal receipts and independent postconditions. Receipt lookup absence is never negative proof; a Docker equivalent of the mock oracle is not established. |
| G0-D45 | Implement deterministic delayed-transport/fake-engine owner experiment | `command-owner-model.ts` and 24 tests; bounded retained request ledger, simulated epoch replacement, late acceptance/completion/create, canonical request-bound receipts, stale observations, replay, eight commit cuts and no-effect returns. In-memory only; no filesystem, subprocess/termination, Docker/pi, CLI or native probe integration. |
| G0-D46 | Validate command-owner/receipt model and preserve actual capability gaps | Native Windows typecheck/doctor smoke passed; **166 tests passed, 1 POSIX-only skip, 0 failed** (167 cases). All model reports remain Locked/non-executable, even when quiescent. Mock atomic storage, issuer lookup and authority are not production durability, authenticated IPC, Docker receipts or recovery acceptance. |
| G0-D47 | Review bounded installed Docker material and collect version-matched offline CLI help | Signed Docker Inc CLI **29.4.3 / build 055a478**, Desktop package **4.74.0**; 11 builtin help/version calls with empty synthetic config/minimal environment, all exit 0. No daemon query/mutation command, guest, credential read or download. One temp root removed and independently absent. [Evidence](Docker-Recovery-API-Review.md). |
| G0-D48 | Map receipt/identity requirements without inventing backend guarantees | No matching Engine API schema/implementation located in checked local material. CLI names, CID files, wait/events and timeout help do not establish incarnation identity, transport revocation or retained terminal/negative request receipts. Native recovery adapter remains blocked, not implemented from the fake oracle. New API-socket/auth bridge flag remains forbidden. |
| G0-D49 | Validate recorded CLI evidence and unchanged hardened argv policy | Five new public-evidence/regression tests; native typecheck/doctor smoke passed; **171 tests passed, 1 POSIX-only skip, 0 failed** (172 cases). Tests read repository evidence, never invoke Docker; hashes/scope/command bounds are evidence checks, not Engine API acceptance. |
| G0-D50 | Review private-storage/IPC APIs against actual Windows runtime | Installed Node/.NET descriptions plus PowerShell **5.1.26100.9444 / CLR 4.0.30319.42000** reflection. Security-at-create/handle-ACL APIs exist; `CurrentUserOnly`/`FirstPipeInstance` are not named Framework pipe options. Same-user names/masks are not exact peer authentication. [Review and next file-only scope](Windows-Private-Storage-IPC-Review.md). |
| G0-D51 | Generate and independently check synthetic descriptors in memory | Fixed PowerShell producer and `windows-security-descriptor.ts`; invented SID only, two protected one-ACE profiles plus null/empty controls. No real identity query, ACL application, secured file/pipe, impersonation or Docker. Native memory evidence recorded; reports always Locked/non-executable/privacy not proven. |
| G0-D52 | Validate descriptor bounds/rights and native memory replay | **12 new tests**, native typecheck/doctor smoke passed; **183 tests passed, 1 POSIX-only skip, 0 failed** (184 cases). Truncation, control flags, null/empty ACLs, offset aliasing, ACE/SID/mask drift and source evidence covered. No kernel access-check/privacy or named-pipe acceptance claim. |
| G0-D53 | Implement and review a separate file-only creation-time ACL fixture | `acl-worker.ps1`, `acl-probe.ts`, `probe-acl.ts`; current SID stays local, DACLs supplied only at `CreateNew`, retained-handle ACL checks, collision preservation and separate same-user read-only controls. No existing ACL repair, pipe listener, identity switch, process kill or Docker. [Scope](Windows-File-ACL-Prototype.md). |
| G0-D54 | Validate ACL controller/protocol and fail-closed cleanup behavior offline | **13 new tests**; native typecheck/doctor smoke passed; **196 tests passed, 1 POSIX-only skip, 0 failed** (197 cases). Exact frames, partial failures, cancellation, malformed output, uncertain exit preservation and cleanup overrides tested with trusted mocks; PowerShell syntax-only check does not run ACL worker. |
| G0-D55 | Run native file ACL fixture and independently confirm cleanup | Signed system PowerShell **Valid / Microsoft**; exit **0**, **all 10 checks passed**. Creation-time descriptors, metadata-only handle readback, create collision and native access-denied 5 between positive reads. Both workers exited; exact temp root removed and independently absent. Same-user operation controls, not cross-user/hostile-process isolation or production privacy. [Evidence](Windows-File-ACL-Prototype.md#native-evidence--validation). |
| G0-D56 | Review pinned Framework/.NET 8 pipe implementations without invoking pipe code | Signed installed targets and SDK metadata readers; 219 pipe bodies recorded, no listener, identity query, private interop invocation, compile or install. Framework's one-instance constructor adds the first-instance bit despite its enum lacking that name. [Review](Windows-Pipe-Contract-Review.md). |
| G0-D57 | Record bounded static call-site evidence and preserve remaining IPC blockers | Explicit inheritance/descriptor and specific client-rights plumbing observed; current-owner comparison is not exact peer binding. Reviewed mode builders do not establish local-only rejection; peer PID/lifetime contract remains missing. No listener/service or Docker recovery adapter implemented. |
| G0-D58 | Validate pipe evidence and bounded static IL decoder offline | **13 new tests**; native typecheck/doctor smoke passed; **209 tests passed, 1 POSIX-only skip, 0 failed** (210 cases). Source/target pins, 219 bodies, reproducible selected IL, flags/rights, malformed/truncated operands, branch/switch bounds and mutation isolation checked. No new native IPC security test or full gate advance. |
| G0-D59 | Design bounded guest-only uncooperative-extension containment model | `uncooperative-extension-model.ts` models ignored aborts, explicit queue clearing, late effects, detached-child persistence and surviving host-engine stop. Pure/non-executable; no guest, process, Docker, filesystem, network or supervisor operation. [Scope](Uncooperative-Extension-Prototype.md). |
| G0-D60 | Validate uncooperative-extension model and fail-closed decisions | **13 new tests**; bounds, immutable transitions, deadlines, stop postconditions and absence of authority fields pass. Native typecheck and focused tests passed; no native guest run or full gate advance. |
| G0-D61 | Review fixed guest-only uncooperative-extension script and independent verifier | `uncooperative-extension.ts` defines bounded synthetic `/workspace` effects, ignored signals, detached-child evidence, controller-created abort marker and same-guest PID/tick verifier. Five tests parse and reject path/environment/network/Docker widening. Scripts are not executed. |

| G0-D62 | Validate fixed uncooperative guest script scope without native execution | Focused **18 tests passed** (13 model, 5 script); typecheck passed. No guest, process, filesystem, network, Docker or supervisor operation. Native opt-in run remains pending separate controller-wiring/cleanup review. |
| G0-D63 | Design fixed controller wiring for uncooperative guest experiment | `uncooperative-controller.ts` plans guest/abort/verify and non-cancellable stop/wait/inspect/remove commands; validates positive child evidence, exact exited state and six synthetic cleanup names. Planner only; no command execution. |
| G0-D64 | Validate controller wiring and evidence protocol offline | **27 focused tests passed** (13 model, 5 script, 9 controller); typecheck passed. Invalid IDs/evidence, queue/stop ordering, PID/tick bounds, command widening and cancellable cleanup fail closed. No native guest or Docker run. |
| G0-D65 | Review declarative Docker integration and ownership-bound cleanup wiring | `uncooperative-docker-integration.ts` reuses the hardened profile and plans exact create/inspect/start/guest/abort/verify/stop/wait/inspect/remove sequencing. Cleanup is non-cancellable and every post-create operation binds the exact container ID. No runner or CLI was added. |
| G0-D66 | Validate Docker integration plan without contacting Docker | **34 focused tests passed** (13 model, 5 script, 9 controller, 7 integration); typecheck passed. Immutable image/nonce, profile restrictions, positive verification ordering, ID-bound cleanup and cancellation behavior fail closed. No Docker executable, container or supervisor operation. |
| G0-D67 | Model executable-adapter failure handling without a runner | `uncooperative-execution-model.ts` separates blocked setup, uncertain create, inspect/guest/verifier failure, stop uncertainty and removal uncertainty. Only confirmed stop then confirmed removal can produce an apparent pass; no resource absence is inferred. |
| G0-D68 | Validate adapter failure states and cleanup ordering offline | **44 focused tests passed** (13 model, 5 script, 9 controller, 7 integration, 10 execution-model); typecheck passed. Uncertain operations, invalid ordering, forged postconditions and mutation paths fail closed. No Docker executable, container, process or supervisor operation. |
| G0-D69 | Review executable-adapter boundary and retain a blocked review-only contract | `uncooperative-adapter.ts` exposes only a Locked review of the exact Docker plan; no runner/CLI is exposed because operation receipts and recovery cleanup remain unproven. A runner draft was not retained. |
| G0-D70 | Validate blocked adapter contract offline | **49 focused tests passed** (13 model, 5 script, 9 controller, 7 integration, 10 execution-model, 5 adapter); typecheck passed. No callable runner, Docker executable, container, process or supervisor operation. |
| G0-D71 | Add pure operation-receipt/recovery-cleanup admission gate | `uncooperative-admission-gate.ts` requires engine incarnation, request-bound create/stop/remove receipts, fresh stop/removal observations, recovery authority, transport revocation and exact resource binding. CLI returns, missing responses and empty inventories remain insufficient. |
| G0-D72 | Validate adapter admission gate without backend evidence | **56 focused tests passed** (13 model, 5 script, 9 controller, 7 integration, 10 execution-model, 5 adapter, 7 admission); typecheck passed. Gate remains blocked even with synthetic complete facts because Guard stays Locked. No Docker command or executable adapter. |
| G0-D73 | Model workspace/policy drift fencing independently | `policy-scope-model.ts` binds requests to opaque workspace, policy epoch, token epoch and admitted relative paths; policy/workspace/token changes reject stale requests and workspace replacement clears admission. Pure/non-executable. [Scope](Policy-Scope-Drift-Model.md). |
| G0-D74 | Validate workspace/policy drift model offline | **66 focused tests passed** (56 prior uncooperative, 10 policy-scope); typecheck passed. Traversal/unadmitted paths, stale epochs, workspace replacement, token rotation, explicit fencing and mutation isolation fail closed. No guest, filesystem, Docker or network operation. |
| G0-D75 | Model bounded session compaction and untrusted summary boundaries | `session-compaction-model.ts` binds summaries to session/workspace/policy epochs, retains only existing bounded messages and always marks output non-executable. Policy drift and launch/credential/host-data summary markers fail closed. [Scope](Session-Compaction-Model.md). |
| G0-D76 | Validate session-compaction boundary model offline | **76 focused tests** (66 prior, 10 compaction); typecheck passed. Full native suite pending final validation. No pi runtime, session file, filesystem, Docker or network operation. |
| G0-D77 | Model bounded runtime transport framing independently | `runtime-transport-model.ts` binds frames to nonce/epoch/sequence, handles explicit cancellation and late frames, and rejects malformed/oversized data. Pure/non-executable; no pipe/socket/listener. [Scope](Runtime-Transport-Model.md). |
| G0-D78 | Validate runtime transport model offline | **86 focused tests** (76 prior, 10 transport); typecheck passed. Duplicate/out-of-order/stale frames, cancellation, epoch reset, bounds, mutation isolation and absent authority fail closed. No IPC, Docker or guest operation. |

These are **preparatory Phase 0 subtasks**, not substitutes for the original Guard
Phase 0 exit criteria. None of the original unchecked backend, isolation, Windows,
workflow, or TUI acceptance items has been marked complete.

## Current stop condition and next action

The primitive Docker Desktop/WSL2 Node fixture has now **passed on native Windows**
with Engine 29.4.3 and the explicitly approved official Node image. All 10 checks,
exit-state validation and ownership-checked cleanup passed; the container is gone
and the approved image remains local. See [pass evidence](Windows-Docker-Fixture-Pass.md).
**No production whole-agent PHI backend is validated.** A successful Node fixture
does not prove sanitized admission, provider proxying or the full Guard boundary.

The operator confirmed **Windows 11 Home, Docker Desktop and WSL2 installed,
mainly Node.js development**. The provisional prototype is a Linux Node guest on
Desktop's WSL2 engine, not a bare WSL agent or a host-running pi tool wrapper.
Do not ask to reconfirm the supplied setup.

The operator has now **deferred provider/authentication-method and gateway work**.
Continue independent offline work without prompting for those details again. The
[host-only synthetic-copy experiment](Synthetic-Copy-Prototype.md) passed seven
checks separately. The [offline whole-agent experiment](Offline-Agent-Prototype.md)
has now [passed on native Windows](Windows-Offline-Agent-Run.md): **exit 0, all 20
checks, container and host cleanup removed**. Initial engine blockers are preserved
in the record; a later readiness query succeeded and the unchanged fixture passed.
A separate query confirmed container absence. The pinned bundled-SDK adapter is
runtime-proven for this fixed offline sequence only. Production admission, NTFS
race safety and the complete Guard boundary are not proven.

The separate [worker-loss primitive](Worker-Loss-Prototype.md) passed **five checks**
and all cleanup on native Windows. It deliberately killed only a disposable host
worker after readiness, observed the still-running guest parent/detached child,
then recovered through a surviving supervisor. **Worker death does not itself stop
the Docker guest.** Supervisor loss, daemon failure and restart reconciliation
remain unproven; no pi/session lifecycle was tested by this Node-only primitive.

The separate [synthetic network/IPC primitive](Network-IPC-Prototype.md) passed
**21 checks** using two isolated Node guests, with both cleanups independently
confirmed. It adds guest-local TCP/UDP/DNS controls, TEST-NET and controlled redirect
denials, distinct network/IPC/PID/mount namespaces, and a live peer's inaccessible
loopback services/Unix socket/shared-memory marker. This is not packet-level,
real host/LAN, arbitrary DNS/redirect variant or provider-gateway proof.

The offline-agent fixture has since been [expanded and passed again](Agent-Lifecycle-Prototype.md):
**35 checks**, exit **0**, container/host cleanup **removed**, independent absence
confirmed. The 15 added decisions cover fixed same-workspace guest session controls,
subsequent reload work, stream/tool cancellation with explicit queue clearing and
extension tool/hook/shutdown failures. Four synthetic guest-only session files and
actual effects were checked separately. No runtime pin or containment flag changed.
SDK cancellation/failure does not undo earlier guest writes or stop detached work;
this is not full lifecycle/revocation or restart-recovery acceptance.

The subsequent [restart-reconciliation design and pure model](Restart-Reconciliation-Design.md)
now cover bounded ownership journal bytes and conservative one-step cleanup
proposals. Seventeen new tests pass; no storage, native fencing, engine adapter or
watchdog was implemented in that continuation, and no additional Docker/pi runtime
was run. The model cannot establish durability, exclusive ownership or actual
restart recovery.

The subsequent [Windows synthetic store/fake-engine fixture](Windows-Store-Prototype.md)
passed **15 checks**, exit **0**. Native `FileShare.None` contention and handle release
are real; injected write/flush faults and engine effects are explicitly synthetic.
It killed only its own disposable file worker at a confirmed checkpoint. All workers
exited and all six temporary roots were independently confirmed absent. Private
production storage, power-loss durability, independent high-water checkpoints,
installation-wide command ownership and actual engine receipts remain unproven.

The subsequent [command-owner/receipt design and deterministic experiment](Command-Owner-Receipts-Design.md)
adds **24 passing tests**. Stale owners cannot submit new requests, while already
transport-delayed/accepted work may still finish after replacement. Exact request
receipts plus fresh postconditions are separate from dispatch authority. Empty scans,
missing receipts and commit uncertainty remain unresolved. Its receipt oracle and
atomic memory store are mocks, not established backend capabilities; no new native
runtime fixture or process-loss experiment was run.

The subsequent [installed Docker recovery API evidence review](Docker-Recovery-API-Review.md)
collected **11 offline builtin CLI help/version responses** from signed Docker **29.4.3**.
No daemon query/mutation command was issued. The exact synthetic config directory was
removed and independently confirmed absent. No matching Engine API schema/implementation
was located in the checked material: identity, transport and retained terminal/negative
receipt guarantees stay **not established**. This is not proof of global API absence;
it blocks adapter implementation until sufficient evidence exists.

The subsequent [Windows private-storage/local-IPC review](Windows-Private-Storage-IPC-Review.md)
and **12 new tests** now confirm actual API availability and bounded synthetic
in-memory descriptor profiles. The older Framework runtime does not expose the newer
named pipe options in the reference pack. No real identity, secured object, ACL
application, listener or kernel access check was used in that review.

The subsequently implemented [file-only creation-time ACL fixture](Windows-File-ACL-Prototype.md)
now passes **10 native checks**, exit **0**, with both workers exited and the exact
temp root independently confirmed absent. Creator ACLs are supplied at `CreateNew`;
collision preserves bytes/ACL, and a separate same-user reader gets native access
denied 5 between successful allow-file reads. No existing ACL changed, identity
switched, process killed or pipe/Docker operation occurred. This is not production
privacy, cross-user/process isolation, peer authentication or a Docker receipt adapter.

To continue order 01:

1. **Review the pure [uncooperative-extension containment model](Uncooperative-Extension-Prototype.md), fixed guest script, controller wiring, declarative Docker integration, failure model, blocked adapter contract, admission gate, [policy-drift model](Policy-Scope-Drift-Model.md), [compaction model](Session-Compaction-Model.md) and [transport model](Runtime-Transport-Model.md), then separately establish real operation receipts/recovery cleanup before any executable adapter or native run.** The model requires explicit queue clearing, bounded observation and surviving host-engine stop; it does not authorize process/Docker operations. Never execute guest/pi code on the host. The [bounded installed pipe review](Windows-Pipe-Contract-Review.md) remains partial: one-instance behavior exists in Framework and .NET 8, but local-only rejection and exact peer/process-lifetime binding remain unestablished. Keep listener/service implementation blocked and do not substitute account/PID/epoch claims. The file-only creation-time ACL fixture passes 10 native checks and cleanup, not production privacy or cross-user/process isolation. Do not cast absent Framework flags or introduce unreviewed interop, installs, existing ACL changes or new endpoints to bypass the remaining contract gaps. Keep SID/identity details local. The bounded installed Docker CLI review is complete, but matching Engine API evidence was not found in the checked material, leaving real identity/receipt semantics unverified. Keep recovery adapter implementation blocked; do not fabricate negative/terminal receipts from missing responses, CID files, events or empty scans. Do not download/install or broaden targets to bypass the gap. Native privacy, alias/handle safety and peer authentication can be investigated independently without connecting to Docker or changing existing ACLs/settings. The deterministic owner experiment passes 24 tests but its authority/store/receipt oracle are mocks. The Windows synthetic store fixture passes its limited sharing/readback/fault scope, not private storage, authenticated rollback protection or real engine fencing. Native installation-wide authority, durable commit/checkpoint recovery, private handle-safe Windows storage and uncertain-operation receipts remain prerequisites to any supervisor-loss experiment. Do not integrate the model/store harness as a Docker recovery executor yet. The expanded offline-agent/lifecycle (35), worker-loss (5) and network/IPC (21) fixtures pass their fixed scopes. Broader lifecycle work (uncooperative extensions, cross-workspace/policy changes, compaction and runtime transports) and network variants/packet-level evidence remain pending. Continue bounded offline synthetic work, not production admission. Do not kill the supervisor, stop Desktop/WSL or restart the daemon under the existing fixture scope. Never prune, relax restrictions or launch pi on the host. Do not reuse the copy helper as a production importer.
2. Keep fake-credential gateway acceptance explicitly **deferred / pending**. When revisited, establish the intended provider identity and authentication **method**, never keys/tokens/auth files. A deterministic offline provider cannot substitute for this proof.
3. Finalize protected categories/additional private paths **locally**. Do not paste private names or contents into model context.
4. Windows build, installed Desktop/CLI and WSL versions, non-elevated process status, engine/kernel and image identity are recorded. Verify remaining active settings/constraints and the whole-agent toolchain before selecting a supported backend. No further downloads, installations, mounts or settings changes are implicitly approved.

VM/container isolation and reviewed working copies are already approved; do not
ask to reconfirm them. `npm run guard:doctor -- --json` remains a metadata-only
inventory aid; `guard:probe-docker` is a separate explicit runtime fixture. Neither
can authorize a production Guard launch or substitute for the full Phase 0 proof.

For order 03, also collect the terminal/font/usual size and approve either a
proven public-API dock or the explicitly described on-demand inspector fallback.

One explicitly approved official Node Docker image was downloaded and retained.
The primitive Node container and the subsequent offline pi fixture each completed
and were removed. Host-only copy fixtures also created/removed only disposable
synthetic data. The native offline run used the already-pinned runtime and approved
image without source-code or security-profile changes; host temp cleanup passed.
The subsequent worker-loss primitive added a separate runner/tests and completed
one more Node-only container plus its disposable host worker; both were stopped,
cleanup was confirmed, and the unchanged security profile was reused. The latest
network/IPC primitive added a separate runner/tests, completed two more Node-only
containers, and independently confirmed both removed with host temp cleanup.
The subsequent offline-agent lifecycle extension ran one more guest container,
passed 35 combined checks and independently confirmed its removal. Its synthetic
persisted sessions stayed only in guest tmpfs and were removed with that container.
The following continuation added a reconciliation design, pure byte/decision model
and tests. The following Windows API review and disposable host-only store/fake-engine
harness passed 15 native checks, with all file workers exited and six exact temp roots
independently confirmed absent. The next continuation added the command-owner /
uncertain-operation receipt design, in-memory experiment and 24 deterministic tests;
its new tests perform no I/O or process termination. The following continuation reviewed
installed Docker public materials and collected 11 builtin help/version responses,
not daemon queries or mutations; its one empty-config temp root was independently
confirmed absent. Five new tests read only public repository evidence. The next
continuation reviewed Windows storage/IPC APIs and generated/verified descriptors
only in memory, with 12 new tests and no secured object/pipe/identity query. The latest
file-ACL continuation implemented the opt-in file-only ACL fixture: 10 native checks, two
workers exited, exact temp root independently absent, and 13 new controller tests.
Its actual SID query stayed local; only new synthetic file DACLs were supplied at
creation, with no existing ACL change, identity switch, pipe service or process kill. No production
durable storage, real engine fencing or recovery was implemented; no new guest was launched.
The latest continuation statically reviewed two signed installed pipe implementations:
219 bodies and 20 selected disassemblies, with 13 new offline tests. The following
continuation added a pure uncooperative-extension containment model and 13 tests;
it performs no I/O or process operation. Metadata-reader
dependency resolution was confined to the short-lived reader process; no saved settings,
target pipe calls, listener, real identity query, compilation or installation occurred.
No npm dependencies, virtualization settings, project trust, host permissions,
terminal settings, credentials or publishing configuration were changed. A disposable
**offline guest pi** has now run, but no production PHI runtime is authorized;
**the current pi process is not protected by these changes**.
