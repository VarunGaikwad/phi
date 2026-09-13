# Guard Phase 0: offline whole-agent experiment

## Status — native offline fixture passed, full Guard gate incomplete

Order **01** continues. On **2026-09-12**, the expanded `guard:probe-agent` passed
**all 35 checks** on native Windows / Node **22.23.0**, Docker Desktop Linux / WSL2,
Engine **29.4.3**, using the retained approved Node image. Exit **0**, container and
host cleanup **removed**; a separate bounded query confirmed container absence.
See [lifecycle revision and native evidence](Agent-Lifecycle-Prototype.md).

The [earlier 20-check run](Windows-Offline-Agent-Run.md) established the SDK/tool/
inline-extension loop, synthetic copy, detached child, single reload and host stop.
The current revision adds 15 decisions for guest-only persisted session transitions,
subsequent reload work, cancellation/queue clearing and extension failures. Runtime
pins and container restrictions are unchanged. **These are fixed offline results,
not the full Guard Phase 0 gate or a production backend.** No host-pi fallback.

Latest native Windows validation: typecheck and doctor CLI smoke passed;
**111 tests passed, 1 POSIX-only skip, 0 failed** (112 cases), including Windows ADS.
The 16 original agent tests and seven new lifecycle tests use Docker fakes,
in-memory filesystems, fixed vendor-file reads and syntax-only Node checks.
**No pi SDK, extension, guest tool, container or network probe is executed by those
unit tests.** Runtime evidence comes from the separately opted-in native fixture.

The earlier [Windows Node fixture](Windows-Docker-Fixture-Pass.md) and
[host-only copy fixture](Synthetic-Copy-Prototype.md) remain separate passing
results. The combined experiment now has its own real-backend evidence; its pass
is not inferred from those earlier fixtures or the unit tests.

Every report remains **Locked / protection not active / canLaunch false**.
Provider/authentication-method selection and gateway acceptance remain
**deferred**, not passed. Orders 02–18 and all original unchecked acceptance items
remain pending. The current pi process is not protected.

## Fixed scope and effects

Files: `guard-host/agent-runtime.ts`, `agent-runtime-inventory.json`,
`agent-spec.ts`, `agent-probe.ts`, `probe-agent.ts`, `guest/offline-agent.ts`, and
`tests/guard-agent.test.ts` and `tests/guard-agent-lifecycle.test.ts`.

With explicit `--confirm` and a trusted installed `docker.exe`, the command:

1. Rejects non-Windows execution before runtime/file collection. Accepts no
   workspace, shell, provider, credential, mount, endpoint or image argument.
2. Reads only the pinned installed runtime artifacts described below. It never
   imports or executes pi on the host. Missing/changed artifacts block rather than
   triggering installation, rebuilding, or an unpinned fallback.
3. Creates a disposable `phi-agent-probe-` host temp directory containing an empty
   Docker client configuration, the existing literal synthetic project fixture,
   and one random **synthetic** outside-project canary. Its canary bytes are never
   included in the guest packet. Only three known drive-bridge spellings of that
   disposable canary path are sent, not personal-file paths.
4. Admits exactly `README.md`, `package.json`, and `src/index.js` with the existing
   **synthetic-only** copy helper. Protected examples, history, configuration,
   startup resources and dependency fixtures remain excluded. This is not a
   production project importer or NTFS race-safe admission service.
5. Uses the same local Docker pipe, empty client config and environment allowlist
   as the primitive fixture. Resolves only the existing `node:24-bookworm-slim`
   image to an immutable ID; requires Desktop/Linux/WSL2 metadata and rejects image
   volumes/hooks. **No download, build, tag, install or saved-setting change.**
6. Creates one nonce-named/labeled container with the primitive restrictions:
   non-root UID/GID 1000, no capabilities, no-new-privileges, read-only root,
   private namespaces, `--network=none`, no host mounts/devices/ports, no restart,
   no healthcheck/persistent Docker logging, 64 processes, one CPU, 512 MiB memory
   and no additional container swap. Only the same three bounded tmpfs areas are
   used; no runtime or source directory is mounted from the host.
7. Independently inspects configuration before starting a fixed idle Node parent,
   then rechecks the running container. The parent deliberately ignores SIGTERM.
8. Sends a **maximum 16 MiB JSON packet over Docker exec stdin**, not shell text,
   command-line base64, `docker cp`, or archive extraction. The bootstrap checks
   the whole-packet SHA-256, nonce, schema, individual hashes/encodings, duplicate
   and unsafe paths, and copy limits before materialization. It writes fresh
   regular runtime files under `/home/node/runtime` and the three approved files
   under `/workspace`. It refuses existing runtime/workspace contents.
9. Imports pi **only inside the guest**, after checking Linux/Node 24, UID/GID,
   cwd, capabilities/no-new-privileges and the exact allowlisted environment.
   Uses memory-only credentials/settings and an initial in-memory session;
   disables discovery of extensions, skills, prompts, themes and context files;
   supplies a literal system prompt and empty append prompt list. Controller-owned
   inline extensions are explicit. The added lifecycle runtime persists only
   synthetic guest-tmpfs sessions, never host history. `PI_OFFLINE=1` and telemetry opt-out supplement the
   network namespace; they are not treated as firewalls.
10. Runs one deterministic, in-memory provider sequence through the real pi
    `createAgentSession()` / `session.prompt()` loop: built-in read, edit, write,
    bash spawning Node, and the explicit extension's direct filesystem/process
    checks. No `tool_call` permission hook is relied on for containment. The
    synthetic package has no install/test hooks to execute.
11. Checks absent excluded files and common host bridges, denied reads/writes to
    the controller's synthetic canary mappings and immutable guest-root targets,
    loopback-only interfaces, and connection failures to documentation-only
    IPv4/IPv6 TEST-NET addresses. A timeout or unexpected network error fails;
    no real provider, LAN service, cloud metadata or personal file is contacted.
12. Creates a detached guest Node child that ignores SIGTERM and writes a
    heartbeat. Checks initial agent completion/reload, then runs the fixed
    [lifecycle sequence](Agent-Lifecycle-Prototype.md): synthetic new/resume/fork/
    clone/tree/reload, subsequent tool work, stream/tool cancellation with explicit
    queue clearing, and deliberate extension tool/hook/shutdown failures. No host
    history import or automatic resumption of cancelled work.
13. Validates all **32 fixed guest checks**, then uses a separate controller-issued
    exec to check actual copy/lifecycle effects, four bounded guest session files,
    exact event order, excluded-file absence and a live, advancing detached
    heartbeat. This verifier shares guest privilege; it is independent of the pi
    result but is not tamper-proof against a compromised guest.
14. Rechecks ownership/configuration and issues host-owned engine **SIGKILL**,
    then requires `wait` exit 137 and an exited/non-running/non-OOM state with PID
    zero. The stop does not depend on guest pi cancellation or extension cleanup.
15. Ownership-checks name/image/ID/label before forced removal and checks absence.
    Cleanup has separate deadlines and is attempted after failure/cancellation.
    An uncertain create or failed/ambiguous removal cannot pass. An independent
    host verifier compares all original synthetic source bytes and the random
    canary, including after a failed guest check. Host mutation fails the report.
16. Removes its host temp directory, checks absence, and reports `hostCleanup`
    separately from container cleanup. Only then emits a sanitized final report.

There are **35 required checks** in a current successful report: 32 guest checks
plus `independentGuestEffects`, `hostStop`, and `hostFixturesUnchanged`. All passed
in the recorded lifecycle revision; the earlier report had 20. This does not cover
the remaining acceptance below.
Docker operations have 15-second limits and 128 KiB output caps. The bootstrap's input deadline is 10 seconds.
Output contains fixed decisions/check IDs, engine/image identity and a synthetic
container name, not raw errors, canary contents, context, manifests or host paths.

## Runtime packaging decision

The normal npm SDK entry has a large transitive dependency tree, including optional
native/platform-specific components. Copying the checkout or all `node_modules`
is not the chosen solution.

The checked-in inventory pins **382 vendor files / 9,591,638 original bytes** from
this checkout's installed pi **0.85.1** distribution:

- pi's published `dist/bundle` JavaScript files and two built-in theme assets;
- its package metadata;
- Chord **0.85.1**'s standalone public `context` entry and package metadata;
- TypeBox **1.3.7**'s four referenced public subpaths and their relative module
  closure (214 modules), plus metadata;
- Undici **8.9.0**'s entry, library JavaScript and metadata.

Paths, lengths and SHA-256 values are fixed in
`guard-host/agent-runtime-inventory.json`; no runtime directory discovery expands
this list. Candidate files and ancestors must be ordinary/non-linked; multiply
linked files are refused. Reads are bounded and hash checked before transfer.
These pins establish agreement with the inspected installed bytes, **not registry
signature verification, malware absence, an independent code audit or NTFS race
safety**. No personal configuration or credential store is inventoried.

The guest-only pi metadata is a small **version-pinned distribution adapter**:
public `@earendil-works/pi-coding-agent` imports resolve to the vendor's published
bundled SDK index rather than its normal unbundled SDK index. No vendor JavaScript
is patched, no private pi classes are imported, and the host installation remains
unchanged. The adapter is experimental, now runtime-tested for this fixed offline
sequence only; it is not a claim that pi documents this as its normal SDK
deployment contract or that other SDK features/toolchains have been validated.

The 383rd runtime file is PHI's own guest fixture, stripped of TypeScript types by
Node on the host. This does not execute its imports. Native clipboard, image
processing, Jiti module loading, optional websocket accelerators, esbuild, package
hooks, Git, ripgrep and arbitrary toolchains are not provisioned. Inline extension
factories do not require loading external extension modules. Missing functionality
must fail, not cause downloads or host execution. Native tools, TUI, attachments,
images and third-party extension loading need separate tests/provisioning decisions.
A static dependency review found no missing literal relative-module references;
that is not dynamic-load or runtime proof.

Do not automatically regenerate pins following a mismatch. Review the installed
version/source and any intended inventory change first. This experiment is not
an npm redistribution or the final PHI launcher/package design.

## Native Windows run (expanded 35 checks and cleanup passed)

The [initial native record](Windows-Offline-Agent-Run.md) preserves engine blockers
and the 20-check retry; the [lifecycle record](Agent-Lifecycle-Prototype.md) documents
the current 35-check pass. Review both experiment scopes. Runs require the already-installed
Docker Desktop's Linux/WSL2 engine to be ready. No installation, image download,
engine switch or settings change is implicitly approved.

Review this scope first. From native PowerShell in the checkout, with Desktop's
Linux/WSL2 engine already running and the previously approved Node image retained:

```powershell
$docker = (Get-Command docker.exe -CommandType Application).Source
npm.cmd run --silent guard:probe-agent -- --docker "$docker" --confirm --json
```

The executable lookup is not signature verification. Use a known trusted
installed Docker CLI; the command does not start Desktop or change its settings.
Use `npm.cmd` explicitly for the already-observed PowerShell forwarding issue.
`--help` is safe on any host.

Exit codes: **0** help or fixture/cleanup success, **2** blocked before container
creation, **1** runtime/verification/cleanup failure, **64** invalid/missing
arguments or consent. Success still cannot authorize production Guard execution.

On `AGENT_RUNTIME_*`, inspect the version/pins locally; do not reinstall or update
blindly. On guest/bootstrap failure, the report deliberately withholds raw context
and paths. Diagnose using additional bounded synthetic checks, not broad logging
of credentials or an unrestricted host run. Do not relax security flags just to
make an unsupported runtime work.

For `cleanup: unconfirmed`, inspect the reported `phi-phase0-<nonce>` container in
Docker Desktop, verify its nonce label/name/image, and remove **only that fixture**.
Never prune. Force-killing the controller, losing the daemon or powering off can
leave the container and/or synthetic temp directory behind. No crash-resilient
watchdog, broker-expiry protocol or production recovery service is claimed.

## Remaining acceptance

The successful native offline run does not complete Guard Phase 0:

- Provider gateway/fake-credential compatibility stays deferred. The finite
  in-memory event source proves neither HTTP streaming nor authentication/OAuth.
- Protected categories and additional private paths still need local finalization.
- Active Desktop settings, VM sharing/trust assumptions, native toolchains and
  the supported backend matrix remain to be finalized.
- A separate [Node-only network/IPC primitive](Network-IPC-Prototype.md) passed 21
  synthetic checks with guest-local TCP/UDP/DNS/redirect controls and live peer
  isolation. Broader protocol variants, real host/LAN probes, packet-level proof
  and gateway compatibility remain unproven.
- Supervisor-loss/restart recovery and full lifecycle behavior are unproven. A
  separate [Node-only worker-loss primitive](Worker-Loss-Prototype.md) passed five
  checks: the guest survived worker death, then a surviving supervisor stopped and
  removed it. That primitive does not test pi/session failure paths or supervisor
  loss. The added whole-agent lifecycle sequence now passes its fixed SDK session/
  cancellation/failure scope, but not hung extensions, cross-workspace transitions,
  production policy revocation, controller loss or restart reconciliation.
- Production link/reparse/alias/race-safe admission and reviewed host apply are
  not implemented. The synthetic copy helper must not become that importer.
- A guest result/heartbeat is not trusted authorization or complete hostile-guest
  attestation. No kernel/hypervisor exploit resistance or secure erasure is claimed.
- Native terminal/TUI transport, every implicit ingestion route, workflow modes
  and independent security review remain later gates.

## API references reviewed

Installed pi 0.85.1: full `docs/sdk.md`, `custom-provider.md`, `extensions.md`,
`environment-variables.md`, `settings.md`, `providers.md`, `packages.md`,
`session-format.md`, `containerization.md`, and related `tui.md`; SDK full-control
and custom-provider examples. Version-matched SDK/resource-loader/model-runtime,
extension and stream types/implementations were inspected to check actual startup
and reload semantics. The Docker restrictions and create/exec/lifecycle approach
build on the [vendor/API references already recorded](Docker-Prototype.md#references-reviewed).
