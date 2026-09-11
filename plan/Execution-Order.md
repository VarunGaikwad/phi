# PHI execution order and progress

## Status

**Guard Phase 0 is in progress. The native Windows Docker Node fixture passed all 10 checks and cleanup. A separate host-only synthetic-copy fixture passed 7 checks and cleanup. Provider/gateway work is deferred at the operator's request, not passed. Whole-agent/backend acceptance remains pending. The three plans are NOT complete.**

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
| 01 | [Guard](Guard-Plan.md) 0 | Select and prove a Windows-compatible whole-agent backend, sanitized-copy workflow, fake-credential gateway, and synthetic containment checks | **Primitive and host-only copy fixtures passed** separately on Windows; whole-agent/copy integration pending; gateway deferred, not passed |
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
new [host-only synthetic-copy experiment](Synthetic-Copy-Prototype.md) passed its
seven checks, but it is not integrated with the container or pi, and does not
prove production admission or NTFS race safety.

To continue order 01:

1. Prototype **whole-agent offline launch with a synthetic sanitized copy**, clean startup/resources/environment, and the remaining independent synthetic host read/write, network, lifecycle and stop checks. Neither existing fixture advances the full gate. Do not reuse the copy helper as a production importer.
2. Keep fake-credential gateway acceptance explicitly **deferred / pending**. When revisited, establish the intended provider identity and authentication **method**, never keys/tokens/auth files. A deterministic offline provider cannot substitute for this proof.
3. Finalize protected categories/additional private paths **locally**. Do not paste private names or contents into model context.
4. Windows build, installed Desktop/CLI and WSL versions, non-elevated process status, engine/kernel and image identity are recorded. Verify remaining active settings/constraints and the whole-agent toolchain before selecting a supported backend. No further downloads, installations, mounts or settings changes are implicitly approved.

VM/container isolation and reviewed working copies are already approved; do not
ask to reconfirm them. `npm run guard:doctor -- --json` remains a metadata-only
inventory aid; `guard:probe-docker` is a separate explicit runtime fixture. Neither
can authorize a production Guard launch or substitute for the full Phase 0 proof.

For order 03, also collect the terminal/font/usual size and approve either a
proven public-API dock or the explicitly described on-demand inspector fallback.

One explicitly approved official Node Docker image was downloaded and retained;
one synthetic Node container completed and was removed. Subsequent host-only copy
fixtures created and removed only disposable synthetic data. No npm dependencies,
virtualization settings, project trust, host permissions, terminal settings,
credentials or publishing configuration were changed. No protected **pi** runtime
has been started; **the current pi process is not protected by these changes**.
