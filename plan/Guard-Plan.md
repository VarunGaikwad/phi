# PHI Guard System Plan

> Status: VM/container isolation and reviewed working copies are approved. Windows 11 Home, Docker Desktop/WSL2, and mainly Node.js development are confirmed. Phase 0 diagnostics and an opt-in [Docker fixture prototype](Docker-Prototype.md) are implemented. After explicit image-download approval, the [native Windows Node fixture](Windows-Docker-Fixture-Pass.md) passed all ten checks and cleanup on Engine 29.4.3 / Desktop Linux / WSL2. A separate [host-only synthetic-copy fixture](Synthetic-Copy-Prototype.md) passed seven checks and cleanup; it is not production admission or race-safety proof. Provider/gateway work is deferred at the operator's request, not passed. An [offline whole-agent runner](Offline-Agent-Prototype.md) is now implemented and locally unit-tested, but its native Windows/Docker run is pending. Whole-agent containment and backend acceptance remain unproven; no fixture completes Phase 0. See [Execution Order](Execution-Order.md) and [Phase 0 Findings](Phase-0-Findings.md).
>
> Companions: [Modes Plan](Modes-Plan.md) and [TUI Plan](TUI-Plan.md).
>
> **This document does not enable protection. The current pi process is not made safe by saving a plan.**

## 1. Goal, approved direction, and default policy

The agent must not be able to read, search, upload, overwrite, rename, or delete the user's personal or protected important files. Protection must cover indirect access through commands, scripts, dependencies, and extensions—not only the `read`, `edit`, and `write` tools.

The user approved:

- **VM or container isolation** for PHI.
- **Windows host support** as a requirement, not an optional future feature.
- **An isolated project working copy**, with explicit user review/approval before changes are applied back to the real project.

The specific backend/product and supported guest toolchains must still be selected and tested. The user does not need to switch the host operating system to Linux to use this design.

Default policy recommendations within that approved architecture:

| Concern | Recommended policy |
|---|---|
| Accessible project data | Only an explicitly approved workspace snapshot, excluding protected files |
| Everything else on the host | Deny by default; never mount the user's home or whole drive |
| Sensitive files inside the project | Deny read and write; omit from the agent's workspace |
| Shells, tests, and interpreters | Run inside the same enforced isolation boundary |
| Strong protection | Require a validated OS-enforced backend before launching the agent |
| Backend failure or missing support | Lock/refuse execution; never fall back to local unrestricted tools |
| Code and Debug | Work automatically on permitted files in the isolated working copy |
| Applying changes to the host | Trusted, reviewed, path-checked apply operation; no blind directory synchronization |
| Hard-denied personal/secret files | No agent-facing “Allow once” bypass |
| Network | Deny tool network by default; narrowly broker model-provider traffic |
| Policy changes | Trusted host-side user action, outside the agent's writable environment |
| Relationship to modes | Guard is always applicable, not a sixth workflow mode; mode permission cannot override Guard |

The protection goal, isolation approach, Windows requirement, and reviewed-copy workflow are confirmed. The remaining policy details are design recommendations. This approval records architectural choices; it does not authorize installing virtualization, changing Windows security settings, or migrating files during this documentation task.

### Scope of the promise

Protect data outside the approved workspace and explicitly protected data within it. The guard cannot automatically know that an innocently named source file contains a personal document or that a secret was copied into an otherwise approved file. Workspace selection, protected rules, and review of what is shared remain important.

Do not promise protection against a compromised host OS, hypervisor vulnerability, a defect in the trusted broker, or information the user deliberately pastes/shares with the model. These limitations must be explicit without weakening protection against ordinary agent mistakes, prompt injection, or arbitrary guest-side code.

## 2. Why an extension-only guard is insufficient

Pi extensions execute with the pi process's OS permissions. A `tool_call` handler can block supported tool invocations, but it is not an OS security boundary.

Examples of bypasses that a filename check alone does not stop:

- `bash`, PowerShell, Python, Node.js, or a test script reading a private file directly.
- A dependency install hook or child process reading environment credentials.
- An extension calling `node:fs`, spawning a process, or using an external service directly.
- `grep`, directory traversal, image loading, or attachment expansion reading data without a `read` tool call.
- Startup configuration, resources, credentials, context files, and session restoration loading data before a guard extension starts.
- A symlink, junction, hard link, alternate path spelling, or Git object exposing protected bytes through an apparently allowed path.
- A process reaching a host service, Docker socket, shared clipboard, or Windows interoperability bridge.

Findings from the installed examples:

- `protected-paths.ts` only blocks `write`/`edit` using path substring checks. It does not prevent reads or command-based access.
- `sandbox/index.ts` demonstrates Bash sandboxing on Linux/macOS. The inspected example does not support native Windows, leaves pi itself outside the command sandbox, and delegates to local Bash when sandboxing is disabled/uninitialized. That fallback is unacceptable for this requirement.
- `gondolin/index.ts` demonstrates routing several built-in tools through a micro-VM, with the entire host cwd mounted read/write. That alone does not hide project secrets or constrain host-running extensions. Its comments require QEMU and Node.js >=23.6.0; it is not a verified drop-in backend for this setup.

Use these examples to learn public APIs, not as proof of complete personal-file protection.

### Architectural consequence

Keep the native pi agent and TUI, but add a **trusted launcher/controller plus an isolated runtime** for strong protection. The extension supplies policy-aware tools, mode integration, and status; the OS boundary supplies containment.

If the solution must remain an extension inside an unrestricted host pi process, label it **Limited: application checks only**. It does not meet the strong “the agent cannot access my personal files” requirement. Do not silently substitute this weaker design.

## 3. Threat model and trust boundaries

### Protect

- Personal documents, desktop/download folders, cloud-synced personal folders, photos, financial records, and other projects.
- SSH/GPG keys, cloud credentials, browser profiles, password-manager data, tokens, and private certificates.
- Sensitive files within the selected project, including environment files, local credentials, data dumps, and user-designated important files.
- Host pi authentication, settings, private prompts, history, and sessions from unrelated work.
- Host configuration and Guard policy from unauthorized modification.

### Treat as untrusted

- Model-generated tool calls and paths.
- Repository instructions, downloaded files, logs, build scripts, and dependency lifecycle hooks.
- Guest extensions, custom tools, and code executed by the agent.
- Agent-produced patch bundles and requests to change permission.
- Saved session metadata that claims an earlier approval or a different workspace.

### Trusted computing base

- The host OS and chosen isolation mechanism.
- A small host-side controller/broker that validates workspace admission and patch application.
- A separate credential/provider gateway if host secrets are required for model authentication.
- The operator's host-side policy and approval interface.

The broker must expose narrow operations—not arbitrary host `readFile`, shell execution, URL fetching, or directory mounting. Minimize its privileges and dependencies, validate its inputs independently, and test it as a security-sensitive component.

A guest PHI extension may improve behavior, but it is not trusted to grant itself host access.

## 4. Architecture: isolate the whole agent

```text
TRUSTED HOST
  User-controlled policy and approvals
                 |
                 v
  Guard controller / scoped I/O broker
    - Approve one project and its shared files
    - Exclude sensitive and important data before copying
    - Verify backend health and policy revision
    - Review and apply allowed project changes
    - Hold private credentials outside the guest
                 |
                 | approved snapshot + narrow authenticated channels
                 v
ISOLATED RUNTIME
  Native pi + PHI TUI + workflow modes
  Built-in tools + extensions + shells + tests
  Approved workspace copy + isolated temp/cache/home

NOT EXPOSED TO THE GUEST
  Host home, personal folders, secret files, host auth/session stores,
  host process memory/handles, arbitrary drives, privileged host APIs
```

### 4.1 Before launching pi

Containment must exist **before** pi loads resources, extensions, session data, or user attachments.

1. Load host-owned Guard policy and validate its version.
2. Require the user to select a specific project root. Do not infer authority from the process cwd or a repository file.
3. Reject overly broad roots such as an entire drive, user profile, or Documents folder. A specific project beneath a personal folder can be admitted without exposing its parent or siblings.
4. Build an admission manifest of allowed project files; apply protected rules before opening file content.
5. Construct a sanitized working copy and an isolated home, cache, temp, and session location.
6. Provision only vetted runtime binaries/resources and approved PHI packages. Do not import the host's global extensions or configuration wholesale.
7. Configure mounts, permissions, process/network restrictions, and credential channels.
8. Run controller-owned containment probes using synthetic fixtures.
9. Launch native pi only after the required checks pass.

A late `session_start` hook cannot retroactively protect data that was already loaded. Enabling Guard in an existing unrestricted process must require a controlled restart, not merely changing a badge.

### 4.2 Isolation requirements

- No user-home, whole-drive, host temp, host dependency-cache, or credential-directory mounts.
- No direct writable bind mount of the original project for the approved strict working-copy design.
- No inherited host file descriptors/handles, agent sockets, Docker engine socket, privileged devices, or broad host IPC endpoints.
- No administrator/root-on-host privileges, privileged container mode, or host PID/network namespace sharing.
- No automatic clipboard, drag/drop, personal folder sharing, or host URI/file opening integrations.
- Every subprocess remains inside the boundary, including escaped/detached child processes and commands invoked by extensions.
- Runtime libraries/toolchains can be supplied through a controlled image or explicitly approved runtime paths; “workspace only” does not mean programs can run without an OS/runtime.
- Ask/Review project data is read-only; Plan additionally has a separate plan-artifact output area; Code/Debug may modify admitted workspace files. Temp/cache writes are separate from project mutation permission.
- A mode change may narrow the boundary; widening it requires a controlled policy transition. Recreate workers/mounts when the backend cannot safely change permissions in place.

### 4.3 Credentials and model access

Do not mount the host's `auth.json`, password store, SSH agent, cloud credentials, or whole environment so pi can authenticate.

Recommended direction:

- A host-side credential service performs the specifically authorized provider authentication.
- The guest receives only a short-lived, session-scoped capability for a constrained model gateway, not the underlying provider credential.
- The gateway limits provider/model destinations, methods, operations, request sizes, and usage. It must not become an arbitrary network proxy or file reader.
- Configure the isolated pi runtime to use that gateway while preserving the user's intended model/provider identity in the UI.
- Verify provider-specific streaming, OAuth, refresh, error handling, and compatibility in the backend prototype. Do not assume all providers can be transparently proxied.
- Never resolve agent-supplied `!command` credential configuration on the host. Only operator-configured credential resolution is eligible for trusted host execution.

A secret present in the same unrestricted guest process/environment as arbitrary tool code should be treated as accessible to that code. A “hidden” tool description or output redaction does not change that.

If the selected provider cannot work without exposing protected host credentials, report the incompatibility and block that configuration rather than quietly weakening the boundary.

## 5. Workspace and protected-file policy

### 5.1 Policy classes

| Class | Read/search/list/export | Write/delete/rename | How admitted |
|---|---|---|---|
| Ordinary approved project file | Allowed within declared scope | According to mode and operation policy | Admission manifest |
| User-designated read-only reference | Allowed only as explicitly shared data | Denied | Trusted operator selection |
| Protected/private file | Denied | Denied | Never exposed through an agent approval |
| Outside approved roots | Denied | Denied | No implicit access; use a separate trusted import workflow for shareable data |
| Isolated runtime/temp/cache | Minimum runtime access | Bounded runtime access | Controller-provisioned resources |
| Host Guard policy, credentials, audit storage | No guest access | No guest access | Trusted controller only |

“Important” defaults to private/denied. If the user wants a particular important reference to be readable but immutable, that is a distinct, explicit choice—not the default.

### 5.2 Suggested protected categories

Use the broad outside-workspace denial first. Known sensitive categories provide extra defense for files accidentally placed inside the project:

- `.env` and `.env.*`; a file named `.env.example` is not automatically proven safe.
- Private key/certificate bundles and known secret/credential files.
- SSH/GPG/cloud/Kubernetes/Docker authentication data.
- `.npmrc`, `.pypirc`, `.netrc`, Git credential stores, and configuration carrying tokens or credential commands.
- Database dumps, personal datasets, backups, and opaque archives unless explicitly admitted as safe project fixtures.
- Browser profiles, password stores, financial/personal documents, and user-designated protected subdirectories.
- Host pi authentication, sessions, private prompt/configuration directories, and Guard control files.

Do not automatically deny every public certificate or harmless test fixture forever. A trusted operator may classify a sanitized public fixture for admission. That is a policy/admission action, not an agent-facing override for a real private key.

Safety rules:

- A tracked file, `.gitignore` entry, friendly filename, or trusted project does not establish that data is safe to share.
- Configure additional private paths locally. The user should not have to paste sensitive filenames or file contents into the model conversation.
- Do not scan the user's home looking for private documents. Deny unapproved roots without reading their content.
- An optional local scanner can flag possible secrets in candidate shared files before admission. It must not send candidates to a model or promise perfect detection.
- The manifest is a disclosure decision: everything admitted may be read by guest code and, when used as context, sent to the chosen model provider.

### 5.3 Git and historical copies

Excluding `.env` from the working tree is insufficient if its contents remain in exported Git objects, patches, caches, archives, or old sessions.

- Do not export the host `.git` object store, worktree pointers, alternates, reflogs, hooks, or credential-bearing configuration by default.
- Initialize disposable guest metadata if needed for local diffing, without copying host hooks/configuration/history.
- Obtain branch/status or selected historical comparisons through a constrained broker operation that restricts paths and omits protected data.
- Disable external diff/text conversion, pagers, hooks/helpers where relevant, arbitrary revisions/options, and any route to unrestricted `git show` of host objects.
- Exclude caches, backups, archived worktrees, and old transcript exports that may duplicate denied data.
- If safe historical review cannot be provided, say it is unavailable; do not copy the entire repository history to preserve convenience.

## 6. Policy composition and approval rules

For an operation to proceed, every applicable layer must permit it:

```text
Allowed = healthy required isolation
          AND admitted resource
          AND no hard deny
          AND current workflow capability
          AND required exact-operation authorization
```

A permission from one layer never cancels a denial from another.

- Guard applies in Ask, Plan, Code, Debug, and Review.
- Plan approval grants execution of the approved task, not permission to read personal files.
- Shell/test approval permits a command **inside the existing boundary**, not a host shell or an expanded filesystem view.
- Selecting Code/Debug does not admit another project, credentials, or protected paths.
- A repository-local setting, skill, prompt, custom tool, or model response cannot weaken host policy.
- Project configuration may tighten rules or propose requirements for operator review; normal pi project-trust approval is not authority to widen Guard scope.
- Deny takes precedence over allow. Invalid rules, unknown resource types, or an unverified backend fail closed.

### 6.1 No quick override for private data

A denied request for an SSH key, personal document, host credential store, or protected project file returns a generic denial with a rule identifier. It must not offer the agent a convenient “Allow once” path.

If more context is genuinely needed, the user can create a sanitized excerpt or use a trusted host import flow to review and share specific non-private data. Never give the guest access to the source directory as a shortcut.

After content has been deliberately shared, revocation cannot make the model/provider forget it. Explain this before importing data; do not market revocation as undoing disclosure.

### 6.2 Trusted approvals

Guard scope changes and host patch application require a host-controlled approval channel. A dialog rendered by a potentially compromised guest extension is not sufficient authorization.

- Agent requests are proposals; the controller independently identifies the operation and target.
- Bind a grant to operation, resource identity, session/runtime ID, mode revision, Guard policy revision, content/profile fingerprint, and expiry.
- Default to cancel. No response, closed UI, timeout, missing UI, or stale data is not approval.
- Consume one-shot grants once, atomically; do not persist reusable grants in pi sessions.
- Do not allow a request to add a mount, supply an arbitrary host path, alter proxy destinations, disable the guard, or spawn a host command.
- Revoke grants on policy changes, workspace changes, mode changes where applicable, restart, and session replacement.
- Keep the host approval interface visibly separate from guest-controlled terminal text so a fake guard dialog is not treated as authoritative.

The host user remains in control through trusted configuration and process launch. The agent does not receive an `unguarded` flag, disable tool, or self-service administrator endpoint.

## 7. Path and file-operation safety

Path checks support the boundary; they do not replace it. The controller must also treat guest patch paths as hostile.

Required handling:

- Resolve against a fixed approved root, not an agent-controlled cwd.
- Use component-aware containment checks; `C:/Projects/phi-other` is not inside `C:/Projects/phi`.
- Normalize and validate separators, relative paths, case behavior, Unicode, and Windows drive semantics without assuming every filesystem is case-insensitive.
- Reject traversal, drive-relative paths, UNC/device paths, NT namespace tricks, alternate data streams, reserved device names, and unsupported path forms.
- Account for Windows junctions/reparse points, symlinks, mount points, and short-name aliases.
- Do not follow directory links during workspace export. Reject unsupported reparse/link types rather than guessing their target.
- A hard link can expose the same bytes under an allowed name without changing `realpath()`. Reject multiply linked files in initial strict admission/apply flows unless an audited backend can validate their provenance.
- For new files, validate existing ancestors and the intended parent, not only the nonexistent final path.
- Use handle-based/no-follow operations and file identity checks where the platform supports them. Revalidate before committing effects.
- Avoid check-then-open races. If the host implementation cannot uphold the required path guarantees, restrict that operation/backend rather than claiming a string check is sufficient.
- Queue the whole read/validate/mutate operation per canonical target and handle concurrent user edits.

A safe snapshot/exporter must enforce these checks **before copying content**. Masking filenames in a guest listing after a secret was copied is too late.

## 8. Whole-agent access coverage

| Access route | Required coverage |
|---|---|
| `read`, `edit`, `write` | Guarded scope and final execution checks; only admitted guest data |
| `ls`, `find`, `grep`, globbing/indexing | Do not traverse/read denied data and then filter results afterward |
| Bash, PowerShell, Node, Python, builds/tests | Entire process tree stays inside required isolation |
| User `!` and `!!` | Same isolated backend; preserve context-exclusion behavior but do not bypass Guard |
| Custom/MCP tools and subagents | Disabled unless scoped/compatible; no host service with broader file authority |
| Direct extension filesystem/process calls | Contained because the whole pi runtime is isolated, not just selected tools |
| `@file`, images, attachments, path completion | Resolve only in the admitted guest view; host imports are explicit and reviewed |
| Startup settings/extensions/skills/context | Controlled resources and isolated home from before process startup |
| Session restore, compaction, history | Per-workspace isolated session data; no automatic host-history import |
| Git tools and status UI | Sanitized constrained metadata/diffs; no general host repository object access |
| Export/share/external editor | Guarded guest artifacts only; no automatic host path/URL opening or uploads |
| Tool output, logs, transcript caches | No protected bytes should enter these pipelines; secondary filtering is not the primary boundary |

### 8.1 Clean runtime environment

Construct an allowlisted environment rather than inheriting `process.env` wholesale:

- Controlled runtime `PATH`, isolated home/temp/cache locations, and necessary locale/terminal variables.
- No personal cloud tokens, SSH agent handles, Git credential helpers, host config paths, browser/session credentials, or arbitrary proxy settings.
- No host shell startup files, `NODE_OPTIONS`, Python startup hooks, or similar executable environment inheritance.
- Explicit, vetted compiler/toolchain needs can be admitted as runtime dependencies—not by sharing all of AppData or the home directory.
- Set isolated pi configuration/session locations using supported mechanisms such as `PI_CODING_AGENT_DIR` and `PI_CODING_AGENT_SESSION_DIR`.
- Do not leak the host session file path through shell metadata. Guest session paths, if exposed, must remain inside the guest's scope; consider disabling unnecessary session-environment injection.
- Disable automatic update/install/telemetry paths in the restricted runtime as appropriate. `PI_OFFLINE` helps control startup operations but is not a network firewall.

### 8.2 Network and host services

- Enforce egress in the backend/firewall, not only by removing a `fetch` tool.
- Separate the necessary model gateway from arbitrary tool networking. If the backend cannot reliably distinguish processes, expose only a constrained gateway API to the whole guest.
- Additional dependency/network access requires a scoped operator-approved policy, with bounded destinations and lifetime.
- Block access to cloud metadata, unintended loopback/host/LAN endpoints, privileged sockets, and Windows interop bridges.
- Validate destination resolution, redirects, IPv4/IPv6, and DNS behavior; no arbitrary forward proxy or open CONNECT tunnel.
- Allowlisting a domain alone does not prevent exfiltration to an attacker-controlled URL on that domain. Prefer narrowly defined broker operations and keep denied data unexposed in the first place.
- A model request necessarily shares its included approved context with the selected provider. This plan does not claim zero disclosure of intentionally shared project code.

## 9. Safely bringing changes back

Approved strict workflow:

1. The operator admits a sanitized project snapshot.
2. Code/Debug automatically edit and test permitted files in that isolated copy.
3. PHI presents a patch/change manifest, including deletions and generated artifacts.
4. The trusted host controller independently reconstructs the proposed effect and shows it for review.
5. On approval, the controller applies only authorized regular-file changes inside the original approved project root.

The apply operation must:

- Reapply all protected-path and mode/operation rules, even if the guest claims they passed.
- Bind to the reviewed patch hash and verify expected original file hashes.
- Stop on concurrent host edits instead of overwriting them.
- Reject links, reparse points, path remapping, out-of-scope targets, unauthorized deletions, and writes to Guard/credential/control files.
- Avoid extracting an untrusted archive directly into the host workspace; validate individual entries and use bounded regular-file operations.
- Never mirror the whole guest directory with an unrestricted delete/sync command.
- Apply explicit deletion permission rules and preserve unrelated user work.
- Use a journal/atomic-per-file strategy and report partial application accurately; do not promise a multi-file atomic transaction without implementing one.
- Keep any recovery copies in protected controller-owned storage. Backups are not a substitute for access control and must not become readable by the guest.
- Never execute hooks, builds, package scripts, or generated code on the host as part of applying a patch.

This changes where Code/Debug work, not their useful workflows: ordinary edits/checks remain automatic in the isolated copy. User review/approval before host application is a confirmed requirement, not an optional or still-undecided safeguard.

Direct host-project editing can be evaluated later through an audited filtered filesystem/backend. Do not mount the entire project read/write and claim that guest-side `.env` checks protect secrets from arbitrary commands.

## 10. Windows support and backend selection

**Windows host support is required.** PHI must offer a usable Windows launch, terminal, controller, and file-review/apply workflow while the agent runs inside the validated VM/container boundary. Do not assume the Unix sandbox example works here or that an installed shell provides isolation.

### Windows compatibility contract

- Provide a documented Windows setup and launch path, including supported Windows versions/editions, runtime prerequisites, and any required privileges. Exact supported combinations are determined by testing, not assumed from the presence of Docker, WSL, or a VM application.
- Keep the native pi TUI usable from the Windows host terminal, including input, resize, cancellation, streaming, and trusted host approvals. The user must not need a Linux host or an unrestricted host pi fallback.
- Implement and test controller-side path validation, workspace admission, and patch application with actual Windows filesystem semantics, including NTFS aliases/reparse points, file locking, and concurrent edits.
- Map approved Windows workspace paths to guest paths through controller-owned mappings. Do not grant the guest access to host drives to make paths look identical.
- Preserve file bytes/encoding and existing line endings unless the approved patch intentionally changes them; do not import guest ownership/permissions or silently normalize the whole project during apply.
- Linux guests may serve compatible cross-platform projects. A task requiring Windows-specific APIs, build tools, or PowerShell modules needs a validated Windows-capable guest/toolchain; a Linux container is not automatically equivalent to native Windows execution.
- If a project requires an unsupported guest capability, stop and explain the limitation. Never run the missing command directly on the host to work around it.
- Disabled virtualization, incompatible OS editions, or restricted installation privileges must produce actionable setup diagnostics and a Locked state, not a false protection badge.

### Backend candidates

| Candidate | Potential role | Gate before recommending it as supported |
|---|---|---|
| Dedicated VM, including an appropriate Windows VM when native tools are needed | Strong whole-agent boundary with explicit data transfer | Validate availability, sharing defaults, process/network isolation, TUI transport, and controller integration |
| Hardened container on a suitable VM-backed runtime | Practical isolated workspace for compatible projects | No privileged mode, host sockets/home mounts/drive bridges; validate real containment and toolchain compatibility |
| WSL2-based execution | Possible component of a future backend | Default WSL and Windows drive/interop access are not sufficient; do not call WSL alone a sandbox |
| Native Windows restricted process/account/AppContainer design | Possible lower-overhead future backend | Requires dedicated Windows security work and tests for ACLs, tokens, processes, IPC, filesystem, and network behavior |
| Gondolin example | Reference for VM tool routing | Verify platform/runtime support and extend architecture beyond a whole-cwd tool mount |
| Extension hooks or Node permission flags alone | Limited application defense | Not a substitute for a verified OS boundary against arbitrary executed code |

A Windows Job Object can help manage a process tree; it does not itself provide a private-file access policy. PowerShell execution policy is not a filesystem security boundary. A container/VM is only as safe as its mounts, bridges, privileges, and exposed services.

**Next technical step:** prototype a whole-agent VM/container-backed runtime on Windows using the approved sanitized working-copy workflow. Verify the Windows version/edition, virtualization/installation constraints, and required guest toolchains, then record the selected backend and its tested support matrix. VM/container use itself does not need reconfirmation. Do not install or enable virtualization as part of this documentation update.

## 11. Guard state and TUI

Guard status is separate from the workflow mode:

```text
Code · MiMo V2.5 Free                       OpenCode Zen
Guard: ISOLATED   Workspace: approved copy   Private files: denied
```

Proposed states:

| State | Meaning | Execution behavior |
|---|---|---|
| Starting | Policy/snapshot/backend still being prepared | Do not launch agent work |
| Isolated | Required controller/backend checks passed | Only scoped operations |
| Limited | Application-level checks without verified OS containment | Warning; not acceptable as an automatic fallback for this requirement |
| Locked | Missing/invalid policy, unavailable backend, lost controller, or failed validation | Deny new operations; stop/revoke isolated work as appropriate |

- “Isolated” must be based on controller/backend evidence, not merely an extension being loaded.
- The guest badge is informational; the trusted host controller is authoritative if guest code can spoof UI output.
- Show scope, backend, protected category count, network policy, and blocked-operation counts without revealing personal file contents or unnecessary host paths.
- Keep the requested mode/model/provider row intact; Guard belongs in its own small status row/panel.
- Provide generic model-facing denials such as `GUARD_PRIVATE_RESOURCE` or `GUARD_OUTSIDE_WORKSPACE`, without confirming whether a guessed private filename exists.
- Avoid repeatedly prompting after a hard denial. Explain that a sanitized user-provided example is the supported alternative.
- Never offer an agent-facing `guard off` or `allow all` command.

Proposed commands through the existing `/phi` dispatcher:

| Command | Role |
|---|---|
| `/phi guard` | Show controller-reported state and effective scope |
| `/phi guard explain` | Explain protection boundaries and why an operation was blocked |
| `/phi guard check` | Request a synthetic-fixture backend check; no personal-file probes |
| `/phi guard events` | Show sanitized recent audit summaries |

Actual host-policy editing, file import, patch approval, and emergency stop belong to trusted host controls, not guest slash-command strings. The UI implementation must make that distinction clear.

### Audit and emergency stop

- Record operation class, decision, rule ID, session/workspace ID, policy revision, backend, and timestamp.
- Do not log secret bytes, environment values, file contents, full sensitive paths, or unbounded raw commands.
- Store full security audit records outside guest-readable/writable roots; expose only sanitized summaries to pi.
- Bound log size/retention and escape terminal control sequences.
- Provide a host-owned stop control that revokes broker capabilities and stops the isolated process tree even if guest pi ignores cancellation.
- Stopping cannot undo completed writes to the guest, already-applied host patches, or data already deliberately disclosed.

## 12. Lifecycle, failures, and configuration

### Failure behavior

- Missing/invalid policy: refuse protected launch.
- Unsupported backend or failed self-check: Locked, not local execution.
- Broker disconnection or expired capability: deny new broker operations; stop or expire guest execution according to the backend protocol.
- Extension unload/crash: OS containment remains; any required mediated operation fails closed.
- Unknown tool/provider/MCP backend: deny until a scoped adapter is verified.
- Permission revocation: invalidate grants, stop affected processes, close capabilities, and recreate the guest when necessary. Do not rely only on updating UI state.

### Session behavior

- `/new`, `/resume`, `/fork`, `/clone`, `/tree`, and `/reload` must not change admitted host scope or restore earlier broader guard settings.
- Mode state may follow the active conversation branch; Guard policy is current host-owned policy, not a historical session preference.
- A session's recorded cwd cannot automatically admit a new host project. The controller must approve a new workspace and construct its view.
- Resume only isolated, correctly scoped sessions by default. Importing an old unrestricted transcript needs explicit review because it may already contain private data.
- Keep separate per-workspace runtime homes, caches, histories, and capabilities; do not leak data between projects.
- Policy changes increment a controller-owned epoch and invalidate stale requests/approvals. Existing file handles and running processes must be considered, not just subsequent tool calls.

### Configuration

Host Guard configuration lives outside all agent-writable roots. Repository files can propose narrower constraints but cannot remove host denials, enable host access, select an unguarded backend, or authorize network destinations.

Illustrative configuration intent, **not an implemented schema**:

```json
{
  "version": 1,
  "requiredProtection": "isolated",
  "workspace": "C:/Projects/phi",
  "workspaceAccess": "staged",
  "outsideWorkspace": "deny",
  "sensitiveFiles": "deny-read-write",
  "toolNetwork": "deny",
  "modelNetwork": "provider-broker-only",
  "hostApply": "review",
  "onBackendFailure": "lock"
}
```

Do not store API keys, real private-file contents, or reusable approval tokens in this configuration or a project plan. Validate policy versions and use additive denials/intersection for restrictions, not normal project-overrides-global merging.

## 13. Implementation structure and phases

### Proposed structure

```text
guard-host/
  launcher.ts           # Provision and start the protected pi runtime
  controller.ts         # Authoritative policy, epochs, and lifecycle
  policy.ts             # Pure resource/action decisions
  paths.ts              # Platform-aware identities and safe operations
  admission.ts          # Snapshot manifest and protected-file exclusion
  apply.ts              # Reviewed, conflict-checked patch application
  approvals.ts          # Trusted operator authorization
  provider-gateway.ts   # Scoped model requests, credentials stay on host
  audit.ts              # Bounded, private event storage
  backends/
    types.ts
    selected-backend.ts # Implement only after feasibility testing
extensions/
  phi/
    guard/
      index.ts          # Mode/tool/status integration, not the OS boundary
      client.ts         # Narrow controller protocol
      tools.ts          # Guard-aware dispatch and useful denials
      state.ts          # Controller-reported status
    components/
      guard-panel.ts
      guard-status.ts
tests/
  guard-policy.test.ts
  guard-paths.test.ts
  guard-protocol.test.ts
  guard-admission.test.ts
  guard-apply.test.ts
  guard-lifecycle.test.ts
  guard-isolation/      # Disposable backend integration fixtures
```

These paths are proposals. The launcher/controller packaging and any native helper must be explicitly designed; a `guard-host` TypeScript folder alone does not supply OS enforcement.

Integrate through public pi APIs where appropriate: tool operations/factories, `tool_call`, `user_bash`, `setActiveTools`, session events, and UI hooks. Share the mode permission engine without making it the authority for protected host resources. Tool rendering must delegate to the **already guarded backend**, never create an unrestricted local fallback.

### Phase 0 — Select and prove a Windows-compatible backend

- [x] Record user approval for VM/container isolation with mandatory Windows host support.
- [x] Record user approval for an isolated working copy and reviewed host application.
- [ ] Verify Windows version/edition, virtualization and installation constraints, and required native/guest toolchains before choosing the backend.
- [ ] Finalize default protected classes and locally configured additional important paths.
- [ ] Prototype whole-agent launch, clean environment, no host mounts/bridges, and model-gateway compatibility using fake credentials.
- [ ] Prove denied read/write behavior with synthetic files and independent controller checks.
- [ ] Document the backend's trust boundary and unresolved gaps before calling it supported.

**Exit:** a reproducible backend meeting the file-privacy boundary, not just a successful shell launch.

### Phase 1 — Host policy and workspace admission

- [ ] Implement deny-by-default policy composition and protected-resource classification.
- [ ] Build the bounded, link-safe snapshot exporter and manifest.
- [ ] Separate runtime resources from shared project data; omit sensitive Git/history/cache material.
- [ ] Add immutable host policy, revisioning, private audits, and protocol validation.

**Exit:** denied content is never admitted into the guest view.

### Phase 2 — Execution, credentials, and network containment

- [ ] Run pi, tools, extensions, shells, checks, and subprocesses in the boundary.
- [ ] Configure per-workspace home/temp/cache/session directories and environment allowlisting.
- [ ] Implement constrained provider access and keep real host credentials outside the guest.
- [ ] Enforce network/IPC restrictions and broker capability limits.
- [ ] Remove every automatic unsandboxed fallback and implement host emergency stop.

**Exit:** arbitrary guest code cannot read protected host fixtures or reach privileged host channels.

### Phase 3 — Safe host apply and operator controls

- [ ] Build trusted diff review, exact patch authorization, path/identity checks, and conflict handling.
- [ ] Preserve unrelated host edits; reject protected targets, aliases, links, and unauthorized deletions.
- [ ] Provide explicit sanitized import without directory-wide grants.
- [ ] Implement revocation, expiry, stale-epoch rejection, and interrupted-apply recovery reporting.

**Exit:** permitted coding work can return to the host without turning the broker into a general host file API.

### Phase 4 — Modes and TUI integration

- [ ] Apply Guard restrictions in every workflow and runtime mode.
- [ ] Make Plan/Code approvals subordinate to Guard; approved checks remain isolated.
- [ ] Add status/panel/denial UI without leaking sensitive paths.
- [ ] Verify attachment, session, export, external-editor, and renderer behavior against the scoped runtime.
- [ ] Test reload, branching, workspace changes, and guest extension failures.

**Exit:** useful modes remain available, and displayed protection matches verified backend state.

### Phase 5 — Adversarial validation and release

- [ ] Run policy, path, protocol, admission/apply, lifecycle, and real-backend tests.
- [ ] Review the privileged broker and boundary configuration independently.
- [ ] Test native Windows-specific paths and the selected backend on the user's supported setup.
- [ ] Document setup, limitations, failure recovery, updates, and removal without changing personal-file permissions automatically.
- [ ] Release strong-protection claims only for tested backend/version/configuration combinations.

**Exit:** a documented, independently testable boundary; no claim of universal or perfect security.

## 14. Security test matrix

Use disposable synthetic canary files, fake credentials, and local test endpoints. **Never validate the guard by trying to read the user's actual personal files or credentials.**

For denied fixtures, assert that contents are not read into guest memory or copied into the snapshot, tool output, streamed chunks, transcript, cache, audit summaries, patch previews, or captured model requests. Also assert that denied host files remain unchanged. “The final answer omitted the secret” is not a passing isolation test.

| Area | Required cases |
|---|---|
| Default scope | Parent/sibling project, home, another drive, personal directory, and overly broad workspace selection |
| Sensitive in-project data | Environment file, private key, credential config, protected ordinary-name file, and safe explicitly admitted fixture |
| Indirect reads/writes | Bash, PowerShell, Node/Python filesystem access, child processes, package hooks, tests, and direct extension calls |
| File tools | Read/edit/write, recursive grep, find/list, glob/index, image loading, and path completion |
| Aliases and Windows paths | Traversal, mixed separators, case behavior, prefix collision, drive-relative syntax, UNC/device paths, ADS, short names, and reserved names |
| Link behavior | Symlink/junction/reparse escape, hard-linked canary, directory link traversal, and alias swaps during export/apply |
| Historical copies | Git objects/alternates, worktree pointers, old diffs, caches, backups, archives, and prior session data |
| Startup/attachments | Resource discovery before hooks, malicious project settings, parent context files, `@file`, images, and imported legacy sessions |
| Environment/credentials | No host token/env inheritance, shell profiles, agent sockets, credential helpers, real auth file, or host session path exposure |
| Host channels | Docker/VM sockets, privileged IPC, Windows interop, host process/handle access, clipboard sharing, and automatic host file/URI opening |
| Network | Direct egress, redirects, DNS/IPv6 bypass, loopback/LAN/cloud metadata, unapproved proxy destinations, and gateway abuse |
| Broker | Authentication, replay, stale epochs, forged guest approvals, arbitrary host paths/commands, malformed/oversized messages, and concurrency |
| Host apply | Changed source hash, protected target, link replacement, archive traversal, unauthorized deletion, partial failure, and unrelated dirty files |
| Failure handling | Backend missing/crash, failed self-test, extension unload, controller loss, expired grants, timeouts, and emergency stop |
| Lifecycle | All five modes, queued work, mode switch, new/resume/fork/clone/tree/reload, workspace switch, and policy revocation |
| Information disclosure | Generic denials do not reveal private-file existence/content; audit/status/UI contain no secret marker |
| Usability | Normal read/plan/code/debug/review tasks succeed on admitted files; no need to disable Guard to do ordinary work |
| Windows host experience | Setup/launch/stop, terminal input/resize, trusted approvals, host-to-guest paths, NTFS behavior, encoding/line endings, and safe failure for unsupported guest toolchains |

Use real-backend tests in addition to mocked tool guards. Bypassing pi's tool hooks inside a disposable guest must still fail to access denied host fixtures.

Planned validation after implementation exists:

```bash
npm run typecheck
npm test
npm run test:smoke
# Add a dedicated real-backend guard integration command during implementation.
```

No implementation or isolation tests are claimed by this planning document.

### Release acceptance checklist

- [ ] A tested Windows host setup supports protected launch, native pi terminal use, reviewed patch application, cancellation, and emergency stop without unrestricted host execution.
- [ ] Denied personal/important files are neither visible to nor writable by the isolated agent and its descendants.
- [ ] Protected project files are omitted before admission, including tested alias/history routes.
- [ ] All relevant execution and implicit ingestion routes are covered; unknown adapters are blocked.
- [ ] Real provider credentials and host control files remain outside guest authority.
- [ ] Guard denials cannot be overridden by a mode change, approved plan, project trust, or agent-generated approval.
- [ ] No unsupported/failed backend silently executes on the host.
- [ ] Host patch application is narrowly scoped, reviewed, conflict-checked, and does not execute project code.
- [ ] Stop/revocation and session changes do not resurrect stale capabilities or leak another project's data.
- [ ] The UI distinguishes actual isolation from application-only checks and remains accurate on failure.
- [ ] Security claims name tested backends and limitations; the user's real private data was not used for testing.

## 15. Decision record and remaining technical work

| Decision | Direction | Status |
|---|---|---|
| Isolation approach | PHI may use a VM or container; do not substitute extension-only protection | Approved by the user |
| Host platform | PHI must work on Windows, including the controller, terminal, and file workflow | Confirmed requirement |
| Workspace effects | Work in an isolated copy; explicitly review/approve changes before applying them to the real project | Approved by the user |
| Exact backend | Prototype Docker Desktop's WSL2 Linux engine for the confirmed Windows 11 Home / Node.js setup | Provisional candidate; full Phase 0 containment/toolchain validation still pending |
| Sensitive/important file policy | Hard-deny known sensitive categories; configure additional private paths locally and classify safe fixtures explicitly | Recommended defaults; finalize during setup |

Do not ask again whether VM/container use or reviewed working copies are acceptable. The operator has now supplied Windows 11 Home, Docker Desktop and WSL2 installed, and mainly Node.js development. The first native Windows run has recorded the build, installed Desktop/CLI and WSL versions, and non-elevated process status. The retry has now observed running Engine 29.4.3 / Desktop Linux / WSL2 metadata. The operator explicitly approved the Node image download, and the primitive fixture has now passed its ten checks and cleanup. Remaining discovery concerns active settings/constraints; whole-agent launch and containment are still unproven. Provider/authentication-method and gateway work is now deferred by the operator; keep it pending while continuing offline work without requesting those details again. The host-only synthetic-copy experiment has passed, but does not prove integrated admission or NTFS race safety. Actual containment validation must still occur on the Windows host. No need to share private-file contents or credentials for this discovery.

These are approved design choices, not evidence that a backend is installed or protection is active. Installing dependencies, changing ACLs/trust, migrating files, exposing credentials, or starting a protected runtime is outside this documentation update.

## 16. Repository handoff and references

This task creates `plan/Guard-Plan.md` and updates the companion plans to make their permissions subordinate to the requested Guard system. It does not restore deleted implementation files, change dependencies, install a sandbox, inspect personal documents/credential stores, or enable protection in the current session.

The existing mode recommendations remain useful, but their extension-only enforcement is not enough for this stronger privacy requirement. Guard backend feasibility becomes a prerequisite before advertising that the agent cannot access private files. The native pi TUI can remain; the trusted launcher and isolation support are an explicit architectural addition.

References reviewed under the installed pi coding-agent documentation/examples:

- `docs/extensions.md`: full-permission extensions, tool operations, blocking, lifecycle, and user shell interception.
- `docs/windows.md`: Git Bash, PowerShell, and the separate `!`/`!!` path.
- `docs/settings.md`: startup resources, project trust, tool activation, sessions, and shell configuration.
- `docs/environment-variables.md`: process environment, configuration/session locations, and shell session metadata.
- `docs/providers.md`: auth-file/environment resolution and executable credential configuration.
- `docs/session-format.md`, `docs/tui.md`, `docs/keybindings.md`: companion-plan persistence and UI integration references.
- `examples/extensions/protected-paths.ts`
- `examples/extensions/tool-override.ts`
- `examples/extensions/sandbox/index.ts` and `package.json`
- `examples/extensions/gondolin/index.ts`

Candidate backend vendor documentation and concrete platform APIs must be checked during Phase 0. The alternatives listed here are feasibility candidates, not claims that they have been installed, configured, or security-tested on this machine.
