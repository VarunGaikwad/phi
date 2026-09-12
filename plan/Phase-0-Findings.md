# Phase 0 findings: primitive fixture passed, whole-agent gate incomplete

Companions: [execution queue](Execution-Order.md), [Guard](Guard-Plan.md),
[Modes](Modes-Plan.md), [TUI](TUI-Plan.md).

## Current continuation: offline whole-agent runner prepared, native run pending

This continuation is back on **Linux / Node 24.17.0**, without Docker or a Windows
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
The current continuation implements an opt-in offline runner but still has no
whole-agent Docker execution evidence.

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
have passed on the confirmed Windows 11 Home setup. Continue the whole-agent
backend proof by running the newly implemented offline whole-agent fixture with
synthetic copies and host canaries on native Windows. Keep provider identity/authentication method and gateway validation
**deferred / pending** until revisited; an offline deterministic provider cannot
satisfy gateway acceptance. Neither the Docker Node fixture nor the separate
host-side copy fixture satisfies the complete gate. Record the exact tested product/version/config
matrix and unresolved gaps before choosing a supported backend. No virtualization
installation, host ACL/trust change, credential exposure, or unrestricted fallback
is an acceptable substitute for that proof.
