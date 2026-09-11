# PHI execution order and progress

## Status

**Guard Phase 0 is in progress; Windows/backend acceptance is pending. The three plans are NOT complete.**

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
| 01 | [Guard](Guard-Plan.md) 0 | Select and prove a Windows-compatible whole-agent backend, sanitized-copy workflow, fake-credential gateway, and synthetic containment checks | **Started / awaiting Windows run**; Docker Node fixture implemented, full backend gate not passed |
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
| G0-D10 | Revalidate order 01 on execution continuation | Typecheck, all 45 tests and doctor CLI smoke passed again. Actual host remains Linux without Docker or a Windows shell on PATH; doctor returned exit 2 / Locked and the Docker CLI rejected a synthetic invocation with exit 2 / `DOCKER_WINDOWS_HOST_REQUIRED` before Docker operations. No container was started and no phase gate advanced; the next action remains the native Windows fixture run below. |

These are **preparatory Phase 0 subtasks**, not substitutes for the original Guard
Phase 0 exit criteria. None of the original unchecked backend, isolation, Windows,
workflow, or TUI acceptance items has been marked complete.

## Current stop condition and next action

A Docker Desktop/WSL2 Node fixture is now implemented, but no production PHI
backend is validated. This coding environment is Linux without a detected Docker
CLI. Passing mocks cannot prove Windows containment or provider proxying.

The operator confirmed **Windows 11 Home, Docker Desktop and WSL2 installed,
mainly Node.js development**. The provisional prototype is a Linux Node guest on
Desktop's WSL2 engine, not a bare WSL agent or a host-running pi tool wrapper.
Do not ask to reconfirm the supplied setup.

To continue order 01:

1. Run the opt-in [Docker fixture](Docker-Prototype.md) from native Windows PowerShell and inspect its sanitized JSON result. The probe creates/removes only its own synthetic container; no host mounts, project execution, credentials or automatic image pulls.
2. Record actual Windows build, Docker Desktop/Engine and WSL versions, active settings, and any privilege constraints. Reported installation does not establish current engine health/containment.
3. After the primitive fixture passes, prototype whole-agent launch with a sanitized copy and the remaining synthetic host read/write, network and lifecycle checks. A fixture pass does not advance the full gate.
4. For the fake-credential gateway prototype, establish the intended provider identity and authentication **method**, never keys/tokens/auth files.
5. Finalize protected categories/additional private paths **locally**. Do not paste private names or contents into model context.

VM/container isolation and reviewed working copies are already approved; do not
ask to reconfirm them. `npm run guard:doctor -- --json` remains a metadata-only
inventory aid; `guard:probe-docker` is a separate explicit runtime fixture. Neither
can authorize a production Guard launch or substitute for the full Phase 0 proof.

For order 03, also collect the terminal/font/usual size and approve either a
proven public-API dock or the explicitly described on-demand inspector fallback.

No virtualization, dependencies, project trust, host permissions, terminal
settings, credentials, or publishing configuration were changed in this execution.
No protected runtime has been started; **the current pi process is not protected
by these changes**.
