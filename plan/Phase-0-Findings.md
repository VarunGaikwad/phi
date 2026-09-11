# Phase 0 findings: backend gate still blocked

Companions: [execution queue](Execution-Order.md), [Guard](Guard-Plan.md),
[Modes](Modes-Plan.md), [TUI](TUI-Plan.md).

## Observed and operator-reported baseline

The operator has confirmed **Windows 11 Home**, **Docker Desktop and WSL2
installed**, and **mainly Node.js development**. The Linux observations below
describe this coding environment, not the operator's Windows installation.
Actual build/runtime versions, settings and containment remain unverified.
The next executable check is the [Docker fixture prototype](Docker-Prototype.md).

| Item | Observation |
|---|---|
| Intended user host | **Windows 11 Home**, confirmed by the operator; exact build pending |
| Operator-reported runtime | Docker Desktop and WSL2 installed; versions/settings not yet verified |
| Host available to this coding session | Linux x64, kernel `6.12.95-cloud-amd64` |
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
  this choice. A fixed disposable Node fixture runner is implemented; actual
  Windows/backend execution and production selection remain pending. OpenShell
  and Docker Sandboxes have not been selected or installed. See the
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
Node subprocess tests verify bounded output and direct argument handling. No real
Docker container has been created in this coding environment.

## Validation actually run

| Check | Result | Scope |
|---|---|---|
| `npm run typecheck` | Passed | Host diagnostics, Docker fixture prototype and tests under strict TypeScript |
| `npm test` | 45 passed, 0 failed, 0 skipped; exit 0 | Discovery/report/CLI tests, Docker fakes, bounded local Node subprocess tests |
| `npm run test:smoke` | Passed | Doctor text/JSON/help/rejection exit codes; synthetic executable is not run |
| `npm run guard:doctor -- --json` | Exit 2, expected | Actual Linux host inventory; Locked, no validated backend |
| `npm run guard:probe-docker -- --help` | Passed | New CLI help; no Docker operations |
| Docker probe with valid synthetic arguments on this Linux host | Exit 2, expected | `DOCKER_WINDOWS_HOST_REQUIRED`; no Docker operations |

Not run / not claimed: whole-agent isolation, snapshot exclusion, host patch
application, provider streaming/OAuth proxying, network/IPC containment, NTFS
aliases/reparse/race behavior, native Windows execution/cancellation, workflow
modes, editor/inspector rendering, real terminal smoke, clean pi installation,
tarball acceptance, or independent security review. The smoke script is currently
**CLI-only**; it must gain dedicated TUI coverage when that implementation exists.

## Gate decision

**Do not advance beyond Guard Phase 0 or advertise protection.** Initial
platform/toolchain questions are answered. Run the opt-in Docker fixture on the
confirmed Windows 11 Home setup, then continue the whole-agent backend proof with
sanitized copies, synthetic host canaries and fake-provider credentials. The
fixture alone does not satisfy the complete gate. Record the exact tested product/version/config
matrix and unresolved gaps before choosing a supported backend. No virtualization
installation, host ACL/trust change, credential exposure, or unrestricted fallback
is an acceptable substitute for that proof.
