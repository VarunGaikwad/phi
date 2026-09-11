# Guard Phase 0: native Windows Docker fixture passed

Recorded **2026-09-11**, after the operator explicitly approved downloading the
official Node image and rerunning the disposable fixture. Companions:
[execution queue](Execution-Order.md), [earlier Windows attempts](Windows-Phase-0-Run.md),
and [fixture runbook](Docker-Prototype.md).

**This passes the primitive Node fixture only. Guard Phase 0 is not complete,
production launch remains unavailable, and the current pi process is not protected.**

## Approved provisioning and observed configuration

The signed Docker Inc executable at the expected installation location was
rechecked. The approved pull used the fixed local Docker named pipe, a temporary
empty Docker client configuration, and an allowlisted client environment; saved
host Docker credentials, contexts and credential helpers were not loaded. The
image remains in Docker's local image store. No npm dependencies were installed,
Docker/WSL settings changed, or unrelated resources removed.

| Item | Observed result |
|---|---|
| Windows | Home Single Language 25H2, `10.0.26200.9445`, x64; non-elevated controller |
| Host Node / PowerShell | `22.23.0` / `5.1.26100.9444` |
| Docker Desktop installed product | `4.74.0.227015` |
| Docker CLI / running Engine | `29.4.3` / `29.4.3` |
| Engine OS / kernel | Docker Desktop Linux / `6.6.114.1-microsoft-standard-WSL2` |
| Installed WSL | `2.7.3.0` (earlier version query) |
| Explicit image source | `docker.io/library/node:24-bookworm-slim` |
| Pull digest / inspected image ID | `sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553` |
| Image platform | Linux / amd64 |
| Image Node version metadata | `24.21.0`; the running fixture independently checks major version 24 |

The reported pull digest matched the image's official Node repository digest.
Creation used the inspected immutable image ID, not the mutable tag. This verifies
the selected source/identity, not immunity from image/kernel/runtime defects.

## Compatibility defect found and fixed

The first post-download attempt still stopped at `local-image` with
`DOCKER_COMMAND_FAILED` (synthetic report name
`phi-phase0-c6dace00a48c549c8e5a40ecafc81b50`; no container created). A read-only
reproduction identified a strict Go-template lookup failure for the omitted
`Config.Volumes` key, not a missing image.

Reviewed schema references:

- [OCI ImageConfig](https://github.com/opencontainers/image-spec/blob/main/specs-go/v1/config.go)
  declares `Volumes` with `omitempty`.
- [Docker image extensions](https://github.com/moby/docker-image-spec/blob/main/specs-go/v1/image.go)
  declare `OnBuild` with `omitempty`.

`guard-host/docker-probe.ts` now uses `index .Config "Volumes"` and
`index .Config "OnBuild"` in the fixed image query, emitting explicit JSON nulls
for absent optional keys. Required metadata is still required, nonempty volumes
and hooks still deny creation, and the independent before-start inspection,
resource/namespace restrictions and cleanup checks are unchanged. No general
missing-field tolerance or API downgrade was introduced.

Three regression tests cover the query shape, explicit normalized-field
requirements, and refusal before creation for nonempty/incomplete image config.
The real Windows probe below validates the actual Go-template/runtime behavior;
unit fakes alone cannot do that.

## Successful native fixture

```powershell
$docker = (Get-Command docker.exe -CommandType Application).Source
npm.cmd run --silent guard:probe-docker -- --docker "$docker" --confirm --json
```

Exit **0**, sanitized result:

```json
{
  "version": 1,
  "kind": "phi-docker-fixture-probe",
  "state": "locked",
  "protection": "not-active",
  "canLaunch": false,
  "probe": "passed",
  "stage": "complete",
  "cleanup": "removed",
  "containerName": "phi-phase0-f780df3df787cbf4b00e985e80f2b031",
  "checks": [
    "nodeRuntime",
    "nonRoot",
    "noPrivileges",
    "readOnlyRoot",
    "workspace",
    "noHostBridges",
    "noProjectHistory",
    "noNetworkInterface",
    "cleanEnvironment",
    "childContained"
  ],
  "engine": {
    "serverVersion": "29.4.3",
    "wsl2KernelObserved": true
  },
  "imageId": "sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553"
}
```

The probe independently inspected restrictions before start, verified the fixed
checks/nonce and successful exit state, and ownership-checked removal. A separate
bounded label-filtered query afterward also found no remaining container for this
nonce. No host/project mounts, real credentials, project scripts or pi runtime
were supplied; the fixture ran Node only, with networking disabled. Temporary
empty Docker client configurations were removed. The approved image was retained.

## Validation and remaining gate

- `npm run typecheck`: passed.
- `npm test`: **47 passed, 0 failed, 1 POSIX-only skip** (48 test cases).
- `npm run test:smoke`: passed; doctor CLI only, not a TUI test.
- Native Docker fixture: **10 checks passed**, exit 0, cleanup removed.
- Post-run label-filtered query: successful fixture absent.

**Orders 02–18 remain pending.** Next is a whole-agent sanitized-copy prototype,
independent synthetic host read/write canaries, startup/environment and
network/lifecycle/stop checks, and a fake-credential provider gateway. Determine
the intended provider identity and authentication **method** (API key or OAuth /
login, for example), never keys, tokens or authentication files. Protected
categories and additional private-path classifications stay local.

Still unproven: whole-agent resource/session/attachment containment, link-safe
admission and NTFS races, host apply, provider streaming/authentication
compatibility, adversarial egress/IPC, emergency stop, native terminal behavior,
and independent broker review. The ten primitive checks do not establish these.
