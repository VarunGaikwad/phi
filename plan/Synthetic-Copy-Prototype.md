# Guard Phase 0: offline synthetic-copy experiment

## Decision and scope

The operator deferred **provider selection/authentication-method and gateway
work**. It remains pending, not passed or removed from the Guard exit gate. Do
not request provider information again during this offline continuation. No
credential, auth file, download, installation, or settings change is needed here.

`guard:probe-copy` is a small **host-side synthetic filesystem experiment**, not
an agent launcher, production admission service, or containment test. It advances
one preparation step of order 01 while provider work is deferred. The earlier
[Docker Node fixture pass](Windows-Docker-Fixture-Pass.md) and this copy experiment
are separate results; they have **not** been integrated into a whole-agent run.

Everything remains **Locked / protection not active / canLaunch false**. The
current host pi process remains unrestricted. Orders 02–18 stay pending.

## Implemented behavior

Files: `guard-host/synthetic-copy.ts`, `guard-host/probe-copy.ts`, and
`tests/guard-copy.test.ts`.

With explicit `--confirm`, the CLI:

1. Creates a fresh `phi-synthetic-copy-` directory under the host's temporary
   directory. The source consists entirely of fixed, synthetic data written by
   the controller. **No project path or file selection argument is accepted.**
2. Admits exactly `README.md`, `package.json`, and `src/index.js`. The source also
   contains synthetic `.env`/`.env.example`, `.npmrc`, Git history/configuration,
   pi auth/startup resources, instruction/system-prompt files, a backup and a
   dependency fixture. None of these additional entries is admitted.
3. Selects the fixed paths before candidate metadata/content access. The snapshot
   helper does not recursively enumerate the source or open excluded entries.
   It checks ordinary-file/directory metadata, rejects observed links and
   multiply-linked files, bounds reads to **16 KiB per file / 32 KiB total**, and
   compares file/ancestor metadata around each read.
4. Creates a bounded packet containing relative names, lengths, SHA-256 hashes
   and canonical base64 bytes. The consumer independently rejects missing/extra
   fields, unsupported versions, unexpected/duplicate paths, invalid encodings,
   bad hashes and oversized contents **before creating a destination**. These
   hashes are corruption/identity checks, not signed approval or secret detection.
5. Creates a new destination; it never merges into or overwrites an existing
   directory, file or link. It writes only fresh ordinary files, not source ACLs,
   links, alternate streams or an entire directory tree. No runtime is packaged.
6. Checks the destination's exact file set and bytes, edits one copied file and
   deletes another. An independent host verifier checks its own original synthetic
   files/canaries remain unchanged. This verifier may read its own excluded
   fixtures; those reads are separate from admission. **No copied code runs and
   no changes are applied back to the source.**
7. Removes the experiment's temporary root on normal completion/failure and
   checks absence afterward. A cleanup failure makes the probe fail. The CLI
   reports fixed check IDs/status only, not paths, contents, hashes, manifests,
   credentials, environment values or raw filesystem errors.

The command does not start Docker, pi, a shell, an extension, package scripts, or
any model request. The existing Docker runner and its restrictions are unchanged.

## Run

From the checkout in Windows PowerShell:

```powershell
npm.cmd run --silent guard:probe-copy -- --confirm --json
```

Use `npm.cmd` explicitly because of the previously observed `npm.ps1` flag
forwarding issue. In Git Bash/POSIX shells, the equivalent is:

```bash
npm run --silent guard:probe-copy -- --confirm --json
```

- `--help`: exit 0, no fixture creation.
- Missing consent, duplicate/unknown flags or any project/path argument: exit 64,
  no fixture creation, no argument values echoed.
- All synthetic checks and cleanup pass: exit 0; **still not Guard acceptance**.
- Fixture/setup/cleanup failure: exit 1; no protected-launch permission.

Force-killing the process or a host failure can leave synthetic temporary files.
This runner is not a production process supervisor or emergency-stop service.
Inspect any remaining experiment directory locally; do not broadly delete temp
folders. No real credentials or project files are copied into these directories.

## Native Windows evidence

On the previously recorded Windows 11 Home host, with native Windows Node
**22.23.0** and npm **12.0.2**, the CLI completed with exit **0**:

```json
{
  "version": 1,
  "kind": "phi-synthetic-copy-probe",
  "state": "locked",
  "protection": "not-active",
  "canLaunch": false,
  "platform": "win32",
  "probe": "passed",
  "stage": "complete",
  "cleanup": "removed",
  "checks": [
    "explicitFileSet",
    "manifestHashes",
    "excludedEntriesAbsent",
    "copyBytesMatch",
    "copyEditDetached",
    "copyDeleteDetached",
    "sourceFixturesUnchanged"
  ]
}
```

The **16 new tests** include actual temporary Windows hard links and directory
junctions, linked-root refusal, existing-destination refusal, and a synthetic NTFS
alternate stream whose bytes are not exported with the primary stream. Separate
pure validation tests reject traversal, ADS path syntax, device names, aliases,
case variants, invalid packets and size/hash/encoding mismatches. These cases
must not be described as complete NTFS alias/reparse coverage.

Validation: `npm run typecheck` and `npm run test:smoke` passed; `npm test` passed
**63 tests, 0 failures, 1 POSIX-only skip** (64 cases). Smoke still covers only the
doctor CLI. Normal tests create no Docker containers. No new provisioning or real
project execution occurred in this continuation.

## Deliberate limits and next work

- **Not production Windows admission.** Node `lstat`/open/metadata comparisons do
  not establish handle-relative traversal, atomic multi-file snapshots, complete
  reparse-point/NTFS alias coverage, destination race safety, or protection from
  concurrent ancestor replacement. POSIX `O_NOFOLLOW` is only additional defense
  where available, not a Windows solution. Do not wire these helpers into a real
  workspace importer or advertise race-safe admission.
- The allowlist is three synthetic filenames, not a configurable protected-path
  policy, local classification UI, secret scanner, policy revision or approval
  record. A hash/friendly filename does not establish that real data is safe.
- This checks ordinary copy separation on the host, **not independent guest
  containment**. No adversarial guest, detached process, egress/IPC probe, packet
  capture, emergency stop, restart/session lifecycle, or reviewed host apply was
  tested. Do not count these seven checks as Docker/whole-agent checks.
- Installed pi **0.85.1** SDK/resource/auth/provider documentation and examples
  were reviewed for the next offline runtime experiment. Explicit resource
  loading, in-memory settings/sessions and a deterministic provider are candidate
  controls, not tested protection. Project trust alone is not a sandbox, and
  normal resource discovery can import unwanted context.
- Linux runtime packaging still needs a vetted, bounded export. The installed
  coding-agent package includes Windows-specific dependencies; copying all of
  `node_modules` or mounting the checkout is not an approved shortcut. No pi
  dependency or bundled entry point was executed during this investigation.

The subsequent [offline whole-agent runner](Offline-Agent-Prototype.md) now has its
own [native Windows pass](Windows-Offline-Agent-Run.md): all **20 checks and cleanup**,
including clean startup/resources/environment, real SDK/tools/inline extension,
synthetic admitted snapshot, detached child, single reload and host stop. These are
separate results from the seven host-only checks above, not production admission
or NTFS race-safety proof. Next are broader adversarial network/IPC and lifecycle/
controller-loss recovery checks. The deterministic provider proves neither gateway
nor streaming/OAuth compatibility. Keep provider/gateway acceptance deferred and
the full Guard Phase 0 gate incomplete.
