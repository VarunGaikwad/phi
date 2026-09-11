# PHI

Implementation of the [Guard](plan/Guard-Plan.md), [Modes](plan/Modes-Plan.md), and
[TUI](plan/TUI-Plan.md) plans has started in dependency order. See
[Execution Order](plan/Execution-Order.md) for every phase and its status.

**Current status: Guard Phase 0 prototype; real Windows validation pending. No
protection, workflow modes, theme, or PHI terminal UI is active. This checkout is
not yet an install-ready pi package.**
The manifest's future `extensions/phi.ts` and `themes/phi.json` entry points remain
unchanged; do not install/publish the scaffold as a completed product.

## Available now: read-only setup diagnostics

From this checkout, using Node.js >=22.19.0 (tested here with v24.17.0):

```bash
npm run guard:doctor
npm run --silent guard:doctor -- --json
```

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

The initial OS/edition/runtime/toolchain questions are answered. Next, run the
opt-in fixture on the confirmed Windows setup and record actual versions/settings.
Then continue whole-agent sanitized-copy and fake-provider gateway validation;
the intended provider/authentication **method** will be needed, never credentials.
Private path classifications stay local. VM/container isolation and reviewed
working copies are already approved.

See [Phase 0 findings](plan/Phase-0-Findings.md) for verified results, limitations,
and the inputs required before continuing.
