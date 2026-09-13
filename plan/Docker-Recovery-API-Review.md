# Guard Phase 0: installed Docker recovery API evidence review

## Result — local CLI reviewed; required backend contract NOT established

Follow-up to the [command-owner/receipt design](Command-Owner-Receipts-Design.md).
Reviewed installed public Docker materials and **11 builtin help/version invocations**.
This establishes a version-matched **CLI surface**, not a version-matched Engine HTTP
contract, stable engine incarnation or a durable request-receipt service.

**Do not implement a native recovery/receipt adapter from this evidence.** The fake
engine's terminal/negative lookup remains an unproven backend capability. Missing
local source is an evidence gap, not proof that every Docker API lacks a feature.
No new runtime module, recovery CLI, package script or dependency was added.

Guard remains **Locked / protection not active / canLaunch false / non-executable**;
gateway remains deferred. No full phase gate advances, orders 02–18 remain pending,
and the current pi process is unprotected.

## Exact local evidence and collection scope

Public installed materials only, under `C:\Program Files\Docker\Docker`:

- `resources/componentsVersion.json`: Desktop **4.74.0**, build **227015**, packaged
  CLI/Engine **29.4.3**. Package metadata is not a new observation of a running engine.
- Fixed `resources/bin/docker.exe`: Authenticode rechecked **Valid / Docker Inc** at
  **2026-09-12T21:34:36+09:00**. Offline `--version`: **29.4.3, build 055a478**.
- Binary SHA-256:
  `f527c90b0961cec328a9ac07bdc7530408dad89708e0502c82f1f088b3e777b4`.
- Components file SHA-256:
  `d16b05d88f953c4d0b05c512252384270c22d36888e85cdf807a8d5efbd9211f`.
- Bounded filename search (maximum depth four) for Markdown, YAML, OpenAPI/Swagger
  and license names in that installation. No matching Engine API schema or source
  implementation was located in the checked material. License component names are
  not API semantics and were not promoted into source review.
- Read only the **229,694-byte JSON file index** of the installed frontend's
  `resources/app.asar`. No index path matched `openapi`, `swagger`, `dockerode`,
  `docker-modem` or `engine-api`. No archived code was executed/extracted and no
  absence claim is made about arbitrary minified bundles or unsearched locations.
- Did not mount/read the installed ISO/VHDX/WSL data archive, run a packaged daemon,
  inspect personal Docker configuration/credentials, or search user directories.

Raw public stdout, per-output hashes and collection metadata are retained in
[Docker-29.4.3-CLI-Help.json](evidence/Docker-29.4.3-CLI-Help.json). Completion was
**2026-09-12T12:36:50.089Z** (**21:36:50+09:00**), native Windows / Node **22.23.0**.
Every command exited **0**. The exact trailing argument lists were:

```text
--version
container --help
container create --help
container start --help
container stop --help
container rm --help
container inspect --help
container wait --help
events --help
version --help
info --help
```

Each used the fixed trusted executable, direct argv, the existing
`npipe:////./pipe/docker_engine` endpoint argument, a fresh empty synthetic Docker
config and `dockerClientEnvironment()`'s minimal environment. No image/container
operand, plugin command, target path, actual `info`/`version` query, event stream,
container mutation, external endpoint or provider operation was requested. These
are **help-only calls**, not execution of the listed actions. No packet/pipe trace
was collected, so the record describes invoked commands, not hostile-client attestation.
The public help's networking/auth/mount examples are text, not approved targets/flags.

Each call had a five-second timeout and 64 KiB output bound. No timeout or forced
termination occurred. The sole temporary directory
`phi-cli-review-1c7c7f11a6da379f15ba85e6bb3c422d-Wlkygh` and its empty config were removed;
a separate native Node `lstat` required **ENOENT** for that exact directory. No directory
contents or unrelated resources were inspected by that verifier.

The first collector attempt had an inline Windows path-escaping error during binary
read, before any temp creation or Docker invocation. Correcting that literal to forward
slashes allowed the collection above; no trust check, endpoint or restriction changed.

Hashes bind this recorded sample for regression review; they do not authenticate a
future installation, prevent coordinated evidence rewriting or authorize execution.

## Capability map

| Requirement | What the local evidence actually says | Recovery status |
|---|---|---|
| Engine incarnation survives neither unnoticed replacement nor rollback | Package/CLI version is 29.4.3; `info` describes system-wide information and `version` describes version information. Neither help defines identity lifetime, reset/restore behavior or an authenticated incarnation | **Not established**; do not hash endpoint/version into an authoritative engine fingerprint |
| Correlate a create request before it can have effects | `create --name` assigns a container name; `--label` sets metadata; `--cidfile` writes the container ID to a file | Resource naming/ID output only; not a durable engine request key, atomic local commit or protection against lost response |
| Prove a request was never accepted | No negative-receipt semantics are specified by the reviewed help | **Not established**; missing ID/file/response/lookup/scan cannot become `rejected-before-accept` |
| Recover a terminal result by unique request ID after client loss | Reviewed command inputs use containers, images, timestamps or formatting options; no reviewed text specifies the model's retained terminal-request lookup | **Not established**, not a global proof of API absence; no terminal receipt adapter |
| Retract in-flight requests when a client dies or epoch changes | `start --attach` forwards signals; `stop --timeout` describes seconds before killing the container | These describe command/container behavior, not transport cancellation, queue drain or daemon-side request revocation |
| Establish create/start/stop/remove HTTP status/body/completion behavior | CLI help names operations and options, but no reviewed matching Engine schema/implementation specifies response status/body or post-return work | **Not established**; do not invent HTTP 2xx/4xx/5xx mappings or infer quiescence from exit 0 |
| Independently observe exact resource state | `inspect` displays container details; `wait` blocks until containers stop and prints exit codes | Useful observation surfaces, not a create receipt or proof that a delayed request cannot later arrive; prior native fixture observations retain their limited scopes |
| Use events as a durable request ledger | `events` provides real-time server events with `--since`/`--until` timestamps | No reviewed retention, completeness, unique request binding, replay or exactly-once guarantee; missing events are not negative receipts |
| Use `docker container commit` as an operation checkpoint | Help says it creates an image from a container's changes | Unrelated to the operation ledger; never use it as a receipt mechanism |
| Make the guest a command owner by exposing the socket | `create --use-api-socket` says it binds the API socket and required auth | **Forbidden by the existing isolation profile**, not a recovery solution |

No name reservation, `--cidfile`, event replay, timeout or CLI exit can bridge the
unproven interval between server acceptance and a crash-safe locally committed
receipt merely by being combined with the mock epoch.

## Binding implementation decisions

1. Keep `planReconciliation()` and `CommandOwnerFixture` **disconnected** from real
   Docker observations/commands. Do not produce their `fence`, `committedHead`,
   `operationsQuiescent` or fake terminal receipts from this help evidence.
2. Keep uncertain create/start delivery unresolved, retain ownership claims and
   deny new launch. Repeated empty inventories or arbitrary polling durations do
   not establish that a delayed request can never appear.
3. Do not claim the existing fixed pipe and selected `inspectEngine()` version/OS
   metadata authenticate an engine incarnation. No `docker info` identity field
   was collected or analyzed for restart/reset behavior in this continuation.
4. Preserve current hardened create arguments. **Never add `--use-api-socket`**,
   socket/auth mounts, `--cidfile` into real-project paths, privileged execution,
   relaxed networking or new permissions to compensate for the missing receipt.
5. Do not treat new help options as security acceptance. No new inspect field or
   engine wire schema is inferred from a CLI flag name. Existing independent
   mount/profile checks and host-owned cleanup remain unchanged.
6. Native supervisor-loss testing, daemon/WSL disruption and production recovery
   remain prohibited under current scope. An unresolved operation can leave work
   running; this is a containment/availability gap, not a passing cleanup outcome.

## Validation

Added **five evidence/regression tests** in `tests/guard-docker-evidence.test.ts`:
version/scope pins, exact bounded help-only command set, output hashes and non-personal
content, actual CID/name/label/wait/events descriptions, and a regression that the
shared hardened argv builder does not add the newly reviewed socket/auth bridge.
The tests read only the public repository evidence; they never execute Docker.
These checks validate the recorded evidence and unchanged argv policy, **not Engine
API capabilities**.

Native Windows / Node **22.23.0**, PowerShell invocation at
**2026-09-12T21:42:17+09:00**: typecheck and doctor CLI smoke passed; **171 tests passed,
1 POSIX-only skip, 0 failed** (172 cases), including all five new evidence tests.
The full suite still includes its previously scoped disposable host-worker and
PowerShell syntax tests. No new runtime fixture or supervisor-loss experiment was run.

## Next independent work / blocked dependency

**Blocked dependency:** recovery adapter implementation needs version-matched Engine
API/source evidence plus runtime-safe validation of identity, transport and terminal
semantics. The checked local material is insufficient. Do not download/install or
broaden targets just to bypass that gap; do not ask for credentials or gateway details.
A future availability design may have to retain unresolved requests rather than
promise an unavailable negative/terminal oracle.

**Independent continuation:** the [Windows security API/memory review](Windows-Private-Storage-IPC-Review.md)
now passes 12 new tests; the subsequent [file-only ACL fixture](Windows-File-ACL-Prototype.md)
passes 10 native checks with verified cleanup, not cross-user/process isolation or
production privacy. Next is reviewing supported native pipe namespace/local-only /
peer-binding contracts; no listener/service or recovery adapter is established. Existing `FileShare.None` success does not establish
DACL privacy, alias-safe admission, peer identity or exclusive engine-command access.
This is prerequisite work, not permission to connect an IPC service to Docker, change
existing ACLs/settings, install a service or terminate a supervisor. Provider/gateway
work remains deferred and all full phase gates remain pending.
