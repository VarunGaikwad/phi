# PHI

Implementation of the [Guard](plan/Guard-Plan.md), [Modes](plan/Modes-Plan.md), and
[TUI](plan/TUI-Plan.md) plans has started in dependency order. See
[Execution Order](plan/Execution-Order.md) for every phase and its status.

**Current status: Guard Phase 0 prototype; the native Windows Docker Node fixture
passed all ten checks and cleanup. A separate host-only synthetic-copy fixture also
passes. Provider/gateway testing is deferred; whole-agent/backend acceptance remains pending. No
protection, workflow modes, theme, or PHI terminal UI is active. This checkout is
not yet an install-ready pi package.**
The manifest's future `extensions/phi.ts` and `themes/phi.json` entry points remain
unchanged; do not install/publish the scaffold as a completed product.

## Available now: read-only setup diagnostics

From this checkout, using Node.js >=22.19.0 (tested with v24.17.0 on Linux and
v22.23.0 on Windows):

```bash
npm run guard:doctor
npm run --silent guard:doctor -- --json
```

In Windows PowerShell use `npm.cmd` explicitly, especially when forwarding flags:
`npm.cmd run --silent guard:doctor -- --json`.

The diagnostic reports OS/runtime metadata, fixed candidate CLI availability on
PATH, and outstanding requirements. It does **not** execute discovered programs,
install anything, launch pi, read credentials/project data, or enable protection.
CLI availability is not proof of containment. No production backend is validated,
so diagnostic runs return **exit 2 / Locked / protection not active**. Help
(`npm run guard:doctor -- --help`) returns 0; invalid arguments return 64 and
unexpected collection failures return 1.

Running the diagnostic does not restrict an existing pi process. Its JSON is not
a security attestation or permission grant. Do not substitute an unrestricted
local agent when protected launch is unavailable.

## Next feasibility check: opt-in Docker fixture

Confirmed target: **Windows 11 Home + Docker Desktop/WSL2 + Node.js development**.
A Linux Node.js container is the provisional prototype, not a supported backend yet.

The new `guard:probe-docker` command can test a single disposable container on the
Windows host. It requires explicit consent, a trusted `docker.exe`, and an existing
local `node:24-bookworm-slim` image. It does not pull images, mount host/project
files, expose credentials, or launch pi. It independently checks container settings
before starting a fixed synthetic fixture and ownership-checks cleanup afterward.

Read [Docker Prototype](plan/Docker-Prototype.md) for the command, exact effects,
recovery, limitations and remaining acceptance tests. Even a successful fixture
leaves Guard **Locked / not active**. Ordinary `npm test` never starts Docker.

## Offline check: synthetic working copy

`guard:probe-copy` creates a disposable synthetic source, copies only three fixed
approved files, excludes synthetic secrets/history/startup resources, and checks
that editing/deleting copied files leaves the source unchanged. It accepts **no
project path**, executes no copied code, starts no Docker/pi runtime, and makes no
host apply. It is **not a production importer or containment/race-safety proof**.

```powershell
npm.cmd run --silent guard:probe-copy -- --confirm --json
```

The native Windows run passed **7 checks and cleanup**, still Locked. See
[Synthetic Copy Prototype](plan/Synthetic-Copy-Prototype.md) for effects and limits.

## Development checks

Using the existing checkout's development dependencies:

```bash
npm run typecheck
npm test
npm run test:smoke
```

The smoke command needs Python 3 and currently tests **only the doctor CLI**, not
the TUI or isolation. Tests use disposable synthetic fixtures, not personal files,
real credentials, package installations, or production services. No dependency or
virtualization installation is performed by these checks.

## Next requirement

The operator-approved official Node image was downloaded, a Docker 29 metadata
query issue was fixed, and the native fixture passed **10 checks** with verified
container removal. The approved image remains in Docker's local store. See
[Windows fixture pass evidence](plan/Windows-Docker-Fixture-Pass.md).
After the separate copy experiment, typecheck and CLI smoke passed;
**63 tests passed, 1 POSIX-only test skipped, 0 failed**.

Next is whole-agent **offline** startup and sanitized-copy integration. The
operator deferred provider/authentication-method and gateway work; it stays
pending, not passed, and need not be selected for independent offline checks.
Private path classifications stay local. VM/container isolation and reviewed
working copies are already approved. No full phase gate has advanced.

See [Phase 0 findings](plan/Phase-0-Findings.md) for verified results, limitations,
and the inputs required before continuing.
