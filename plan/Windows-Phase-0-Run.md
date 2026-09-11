# Guard Phase 0: initial native Windows execution attempts

Recorded **2026-09-11** while continuing order 01 in
[Execution Order](Execution-Order.md). This is an observed failed precondition,
**not a passed containment test or a supported-backend claim**.

**Historical record:** this file preserves the initial engine/image blockers.
The operator subsequently approved the download and the corrected fixture passed
all 10 checks and cleanup. See [current pass evidence](Windows-Docker-Fixture-Pass.md).
Whole-agent Guard acceptance remains pending.

## Host and installed tooling (initial run)

Only selected OS/runtime metadata, executable signature/version fields, and fixed
Docker process/service states were collected. No user configuration, credentials,
private files, Docker contexts, or WSL distribution contents were inspected.

| Item | Observed result |
|---|---|
| Native process | Windows x64 (`process.platform: win32`), invoked through Windows PowerShell |
| Windows edition | Microsoft Windows 11 Home Single Language |
| Windows release/build | 25H2, `10.0.26200.9445` |
| PowerShell | `5.1.26100.9444` |
| Node / npm | `v22.23.0` / `12.0.2` |
| Local pi coding agent / pi-tui | `0.85.1` / `0.85.1` |
| Local TypeScript | `5.9.3` |
| Hypervisor present | `true`, reported by Windows; not containment proof |
| Current process elevated | `false`; no elevation was requested |
| Docker CLI | Official Program Files install location; Authenticode `Valid`, signer Docker Inc; file version `29.4.3` |
| Docker Desktop | Installed executable product version `4.74.0.227015` |
| WSL | `2.7.3.0`, reported kernel `6.6.114.1-1` |
| Docker Desktop/backend processes | Neither running at the time of inspection |
| Docker service | `com.docker.service`: `Stopped`; service state alone does not establish WSL-engine health |
| Local Docker endpoint | Engine metadata query failed: missing named pipe / daemon unavailable |
| Engine version, active engine/settings, local Node image | Unverified: probe could not reach the engine |

The WSL CLI's version is not evidence that Docker is currently using that kernel.
No engine switch, WSL launch/configuration change, service start, installation, or
image download was performed. Other installation/privilege constraints remain
unverified.

## First native PowerShell command and outcome

The original runbook's unqualified `npm` invocation failed with npm
`EUNKNOWNCONFIG` (`--docker` and `--confirm`) before the probe ran. Explicit
`npm.cmd` preserved the argument forwarding on this PowerShell/npm combination:

```powershell
$docker = (Get-Command docker.exe -CommandType Application).Source
# The selected executable's install location and Docker Inc signature were checked.
npm.cmd run --silent guard:probe-docker -- --docker "$docker" --confirm --json
```

The native probe returned **exit 2** with this sanitized result:

```json
{
  "version": 1,
  "kind": "phi-docker-fixture-probe",
  "state": "locked",
  "protection": "not-active",
  "canLaunch": false,
  "probe": "blocked",
  "stage": "engine",
  "cleanup": "not-needed",
  "containerName": "phi-phase0-2ce9a79d2edd03194db365f2e686617c",
  "checks": [],
  "rule": "DOCKER_COMMAND_FAILED"
}
```

The container name was generated for the report; **no container was created or
started**. The probe stopped before the local-image query and removed its empty
temporary client configuration. There was no host mount, project execution,
provider request, or image pull.

A follow-up bounded, metadata-only engine query used the same local endpoint,
empty client configuration and allowlisted environment. Its output/error stayed
local; only fixed classifications were emitted: exit 1, missing pipe and daemon
unavailable, no timeout/access-denied/API-version/template-error indication.
An earlier ad-hoc diagnostic did not execute successfully and was not used as
engine evidence. No raw Docker error or inspection output was saved here.

## Development validation (earlier run)

| Check | Actual result | Scope |
|---|---|---|
| `npm run typecheck` | Passed | Strict TypeScript for current source/tests |
| `npm test` | 44 passed, 0 failed, 1 skipped; exit 0 | 45 tests; only POSIX executable-permission test skipped on Windows |
| `npm run test:smoke` | Passed | Doctor CLI on Windows with a synthetic candidate that must not execute |
| `npm run --silent guard:doctor -- --json` (Git Bash) and `npm.cmd run --silent guard:doctor -- --json` (native PowerShell) | Exit 2 / Locked | Docker and WSL found via metadata; no backend authorization |
| `npm.cmd run --silent guard:probe-docker -- --help` and `npm.cmd run --silent guard:doctor -- --help` (native PowerShell) | Exit 0 | Both CLI entry points/argument forwarding; no Docker operation |
| Confirmed Docker fixture (native PowerShell) | Exit 2 / blocked at `engine` | No container checks ran; cleanup not needed |

After correcting the Windows commands in both CLI help strings and the runbook,
typecheck, all 45 test cases (44 pass / 1 skip), doctor CLI smoke and native
PowerShell help/doctor checks were rerun with the same outcomes. Help tests now
assert the Windows-specific `npm.cmd` spelling. `git diff --check` passed.

These checks do not cover whole-agent launch, Windows containment, sanitized-copy
admission, host read/write canaries, NTFS path/link/race behavior, provider gateway,
emergency stop, workflow modes, TUI or terminal acceptance.

## Retry after operator continuation

The same native PowerShell fixture command was retried. The selected Docker CLI's
expected installation path and valid Docker Inc signature were rechecked. The
engine precondition now passed: Docker Desktop, Linux, Engine **29.4.3**, WSL2
kernel metadata. This is compatibility evidence, not containment proof.

The retry returned **exit 2**:

```json
{
  "version": 1,
  "kind": "phi-docker-fixture-probe",
  "state": "locked",
  "protection": "not-active",
  "canLaunch": false,
  "probe": "blocked",
  "stage": "local-image",
  "cleanup": "not-needed",
  "containerName": "phi-phase0-8cdc064fc048781d8f5526773d9394d5",
  "checks": [],
  "engine": {
    "serverVersion": "29.4.3",
    "wsl2KernelObserved": true
  },
  "rule": "DOCKER_COMMAND_FAILED"
}
```

A separate bounded `image inspect` query for **only** the required local tag,
using the same clean client configuration/environment and local endpoint,
classified the error as **missing image** (exit 1; no timeout, missing-pipe,
access-denied or template-error indication). Raw errors and inspection output
were not exposed. No image was downloaded, container created, or project executed;
temporary empty client configurations were removed. No source code changed in
this retry, so the development-test results above remain from the earlier run.

## Subsequent outcome and remaining gate

The operator explicitly approved the image download; provisioning and the
corrected primitive fixture subsequently passed. See
[Windows Docker fixture pass](Windows-Docker-Fixture-Pass.md) for the exact image,
compatibility fix, ten passing checks and verified cleanup. These earlier failed
attempts remain part of the record, not current blockers.

**Order 01 remains incomplete; orders 02–18 remain pending.** Continue the
whole-agent sanitized-copy and synthetic containment proof. Obtain only the
intended provider identity and authentication **method** for fake-gateway
compatibility work. Additional private-path classification stays local.

No original Guard acceptance checkbox was completed by this run. **The current
pi process is still not protected.**
