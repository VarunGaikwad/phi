# Guard Phase 0: Docker Desktop / WSL2 fixture prototype

## Target and decision

The operator confirmed **Windows 11 Home**, **Docker Desktop and WSL2 installed**,
and **mainly Node.js development**. This resolves the initial platform/toolchain
questions. Do not ask to reconfirm those choices.

**Provisional prototype choice:** Docker Desktop's WSL2 Linux engine with a
Linux Node.js guest. Windows Home is a Linux-container target; this design does
not require upgrading to Pro or installing Hyper-V. Native Windows build tools
are not covered by this candidate. Actual Windows build and installed Docker
Desktop/CLI and WSL versions are now recorded in
[native Windows execution evidence](Windows-Phase-0-Run.md). On retry, Engine
**29.4.3**, Docker Desktop Linux and WSL2 kernel metadata were observed. Remaining
active settings and the complete containment boundary are unverified.

After the initial engine/image blockers, the operator explicitly approved the
Node image download. The corrected native fixture **passed all ten checks and
cleanup** on Engine 29.4.3. See [pass evidence](Windows-Docker-Fixture-Pass.md) for
image identity, the Docker 29 optional-field formatting fix, and remaining gaps.
The fixture container was removed; the approved image remains local. This is
**not a supported production backend yet**; the [execution queue](Execution-Order.md)
remains in Guard Phase 0.

The operator subsequently deferred provider/authentication-method and gateway
work. A separate [host-only synthetic-copy experiment](Synthetic-Copy-Prototype.md)
passed seven checks and cleanup. It is not connected to this container fixture,
not a production admission service, and not whole-agent or NTFS race-safety proof.
The subsequent [offline whole-agent runner](Offline-Agent-Prototype.md) now has an
independent [native Windows pass](Windows-Offline-Agent-Run.md): all **20 checks**,
including real SDK/tool/inline-extension execution, synthetic copy, host stop and
cleanup. This does not establish production admission, complete containment or
full lifecycle/recovery. Retain gateway acceptance as deferred.

## What has been implemented

`npm run guard:probe-docker` is an **opt-in host-side fixture runner**, separate
from the metadata-only `guard:doctor`. It has no agent tool, guest broker, pi
launcher, workspace importer, host patch apply, or provider credentials.

With explicit `--confirm`, a trusted installed `docker.exe`, and an existing local
`node:24-bookworm-slim` image, it:

1. Requires a Windows process. It cannot execute through an unrestricted Linux
   fallback, an agent-supplied shell, or a WSL shell bridge.
2. Creates an empty temporary Docker client configuration and allowlisted client
   environment. It does not load the user's Docker context, auth configuration,
   credential helpers or proxy environment. The chosen Docker executable itself
   is part of the host trust boundary, not made trustworthy by its filename.
3. Connects only to the local `npipe:////./pipe/docker_engine` endpoint. It ignores
   `DOCKER_HOST`/`DOCKER_CONTEXT` inheritance and never changes the saved context.
4. Checks engine metadata for Docker Desktop, Linux, and a WSL2 kernel hint. This
   is compatibility evidence, not an OS security attestation or exact WSL version.
5. Looks up only the local Node image, rejects declared volumes/on-build hooks,
   resolves the tag to its immutable image ID, and creates by ID with `--pull=never`.
   The query uses `index` for the two schema-defined optional image fields so
   Docker 29 can return explicit nulls when they are omitted; nonempty values are
   still denied. No image is pulled, built, retagged, removed, or installed by the probe.
6. Creates one randomly named/labeled container with UID/GID 1000, all capabilities
   dropped, no-new-privileges, read-only root, private IPC/cgroup namespaces,
   non-host PID/UTS namespaces, `runc`, `--network=none`, no published ports,
   no host/volume mounts, no devices, no healthcheck, no persistent logging, no
   restart, and limits of 64 processes, one CPU, and 512 MiB memory/no extra swap.
7. Supplies only bounded tmpfs areas for `/workspace`, `/tmp`, and `/home/node`.
   These are **not** host bind mounts. A fixed `/usr/bin/env -i` command clears
   image environment variables before starting the trusted Node fixture.
8. Independently inspects the created container **before starting it**. A changed,
   unexpected, missing required, or unsafe setting blocks execution. Specifically
   documented Docker `omitempty` fields can be absent when empty; required safety
   booleans and limits cannot. Unsupported configurations are not silently relaxed.
9. Runs fixed synthetic checks for Node 24, non-root identity, effective
   capabilities/no-new-privileges, denied root writes, allowed tmpfs workspace
   writes, missing common host/interop/socket bridges, blank project history,
   loopback-only interfaces, an allowlisted guest environment, and child-process
   restrictions. Neither actual personal files nor real remote services are probed.
10. Cross-checks guest results/nonce and Docker exit state. Cleanup uses the
    controller-generated label, then verifies name/image/ID/label before forced
    removal, and checks disappearance afterward. It never runs `prune` or deletes
    unrelated resources. Cancellation does not cancel the separate cleanup attempt.

Docker operations have 15-second deadlines and 128 KiB output limits. Commands use
structured arguments and `shell: false`, including executable paths containing
spaces. Raw Docker errors, inspection data, environment values, and host paths
are not included in reports. The report contains synthetic container identity,
image ID, engine version, fixed check IDs, cleanup status, and generic rule IDs.
The image must be a trusted, reviewed local Node image; a digest ensures identity,
not that arbitrary image code is trustworthy.

## Run on the Windows host

Use **native Windows PowerShell in the repository folder**, with Docker Desktop
already running in Linux/WSL2 mode and Node.js >=22.19.0 available. No administrator
rights, virtualization changes, or installation are performed by this command.

First locate and verify your trusted Docker Desktop executable. The command below
is a convenience lookup, not signature verification; use an explicit known install
path instead if PATH may contain untrusted programs.

```powershell
$docker = (Get-Command docker.exe -CommandType Application).Source
npm.cmd run --silent guard:probe-docker -- --docker "$docker" --confirm --json
```

`--confirm` authorizes only the documented disposable fixture, not project
execution, general host commands, networking, or a production Guard launch.
Use **`npm.cmd` explicitly in Windows PowerShell**. On the tested PowerShell 5.1 /
npm 12.0.2 combination, unqualified `npm` failed to forward the separator and npm
rejected `--docker` / `--confirm` with `EUNKNOWNCONFIG`, before the probe ran.
`--silent` keeps npm's script banner out of JSON stdout; Node may still emit its
experimental-types warning on stderr. On other shells,
`npm run --silent guard:probe-docker -- ...` remains available. `--help` is safe on
any host and creates nothing.

An existing local official `node:24-bookworm-slim` image is required. If absent,
the probe stops at `local-image` rather than downloading anything. If you choose
to provision that image, this is a **separate operator-approved network/download
operation**, not part of the probe:

```powershell
# OPTIONAL download, only after reviewing/approving this operation yourself:
& $docker --host npipe:////./pipe/docker_engine pull node:24-bookworm-slim
```

Review the image source/digest and rerun the probe afterward. The tag is only a
local lookup; the container uses the resolved immutable ID. No user credentials
are ever copied into the container. Docker's host-side download authentication,
if used manually, remains an operator action outside the fixture runner.

### Results and exit codes

- `0`: fixture checks **and cleanup** passed (or help displayed).
- `2`: blocked before container work, e.g. non-Windows host or missing engine/image.
- `1`: setup, inspection, execution, cancellation, or cleanup failed.
- `64`: invalid/missing arguments or consent; no host inspection/execution.

Even a successful fixture reports **`state: locked`, `protection: not-active`,
`canLaunch: false`**. It cannot enable Guard or advance the complete Phase 0 gate.
Share the sanitized JSON report to continue development; do not paste auth files,
keys/tokens, private filenames, or unfiltered `docker inspect` / `docker info`.

### Failures and recovery

- `DOCKER_DESKTOP_LINUX_REQUIRED` / `DOCKER_WSL2_ENGINE_UNCONFIRMED`: verify the
  actual Desktop engine/settings. The probe does not switch engines or modify WSL.
- `DOCKER_COMMAND_FAILED` at `local-image`: verify the required local image exists.
  At `engine`, verify Desktop is running and the selected executable/pipe works.
  This was the first native Windows result: Desktop/backend were not running and
  the local pipe was missing. Start Desktop through the trusted UI, wait for its
  Linux/WSL2 engine, then retry; the probe never starts Desktop or changes settings.
- Inspection mismatch: stop and report the sanitized rule/stage. Do not remove
  security flags until the actual API/version difference has been investigated.
- `cleanup: unconfirmed`: use Docker Desktop to inspect the reported synthetic
  `phi-phase0-<nonce>` container. Verify its ownership label/name and remove **only
  that fixture**. Never use a broad prune command. An interrupted create may
  complete after a failed check; absence at one instant is not promised cleanup.
- Force-killing the host process, daemon failure, or machine power loss can prevent
  automatic cleanup. This prototype is not the production emergency-stop service.
  Docker client temp files may remain after interruption; they contain an empty
  probe config, not imported authentication. Normal completion removes them.

## Limits and remaining Phase 0 proof

The fixture starts **Node only, not pi**. A successful check does not establish:

- Whole-agent startup/resource/session/attachment containment or native TUI transport.
- Sanitized admission/export, link/junction/hard-link/NTFS race safety, protected
  project-file exclusion, historical-copy filtering, or reviewed host apply.
- Provider gateway streaming/OAuth compatibility or credential confidentiality in
  the eventual model-enabled runtime. This fixture has no model network at all.
- Adversarial network/DNS/IPv6/host-service isolation beyond inspected `none`
  networking and observed loopback-only interfaces; no packet-level proof is claimed.
- Kernel/hypervisor exploit resistance, ECI enablement, or independence from other
  WSL distributions sharing the WSL kernel. Docker Desktop/WSL and the trusted image
  remain part of the prototype's trust assumptions.
- Production resource sizing/toolchain compatibility. `noexec` tmpfs works for this
  Node fixture but native project binaries/toolchains need a separately tested layout.
- Guaranteed erasure from swap: tmpfs can be backed by VM swap; memory settings are
  resource restrictions, not a secure-erasure mechanism.

The primitive fixture has passed on the recorded Windows setup, but before
selecting a supported backend, implement the whole-agent sanitized-copy prototype with fake-provider
credentials, independent synthetic host read/write canaries, lifecycle/stop tests,
and the remaining Guard matrix. Record exact tested versions/configuration and
remaining gaps. Provider integration is currently **deferred by the operator**,
not passed. When revisited it needs the intended provider identity and
**authentication method only**, never the credential itself. A deterministic
offline provider can support agent/tool testing but cannot complete gateway proof.

## References reviewed

Vendor documentation informs the prototype, not a support claim:

- [Docker Desktop Windows requirements](https://docs.docker.com/desktop/setup/install/windows-install/)
  — Windows Home supports Linux containers; Windows containers require another edition.
- [Docker Desktop WSL2](https://docs.docker.com/desktop/features/wsl/)
  — engine selection, shared-kernel/interop boundaries, and stricter-isolation options.
- [Docker container create](https://docs.docker.com/reference/cli/docker/container/create/)
  and [run](https://docs.docker.com/reference/cli/docker/container/run/)
  — create-before-start, read-only root, namespaces, resource limits, no-healthcheck and never-pull.
- [Docker tmpfs](https://docs.docker.com/engine/storage/tmpfs/)
  — ownership/options, lifetime, memory/swap limitations.
- [Docker contexts](https://docs.docker.com/engine/manage-resources/contexts/)
  — endpoint/config/environment precedence; do not inherit a remote context.
- Moby `api/types/container/hostconfig.go` / `config.go` — required versus omitted
  inspection fields. These are reviewed schemas, not code imported by PHI.
- [OCI ImageConfig](https://github.com/opencontainers/image-spec/blob/main/specs-go/v1/config.go)
  and [Docker image extensions](https://github.com/moby/docker-image-spec/blob/main/specs-go/v1/image.go)
  — optional `Volumes` / `OnBuild`; validated against the actual Docker 29 query.
- pi 0.85.1 `docs/containerization.md` and the earlier [API review](Phase-0-Findings.md)
  — do not substitute a host tool-routing extension or whole-project bind mount.
