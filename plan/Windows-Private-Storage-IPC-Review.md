# Guard Phase 0: Windows private-storage and local-IPC API review

## Result and bounded scope

Reviewed installed Node/.NET API descriptions and **actual Windows PowerShell runtime
reflection**. Constructed four **synthetic security descriptors in memory**, checked
their bytes independently, and scoped the next native file experiment. No file ACL was
read/applied, secured file/directory or pipe created, actual user identity queried,
client impersonated, service installed, credential inspected or Docker command issued.

Files added:

- `guard-host/review-windows-security.ps1`: fixed reflection / memory-only producer.
- `guard-host/windows-security-descriptor.ts`: strict synthetic-profile byte verifier.
- `tests/guard-windows-security.test.ts`: 12 tests including native memory-only replay.
- [Recorded native evidence](evidence/Windows-Security-API-Memory.json).

All results stay **Locked / not active / canLaunch false / executable false / gateway
deferred / nativePrivacyProven false / accessCheckPerformed false**. This is not an
ACL enforcement test, IPC authentication implementation, production storage adapter,
NTFS race proof or recovery service. The current pi process remains unprotected;
no full gate advances and orders 02–18 remain pending.

The [Docker identity/receipt evidence gap](Docker-Recovery-API-Review.md) still blocks
real recovery integration. This independent work does not supply a substitute oracle.

## Reviewed material and runtime mismatch

Installed reference pack, read as documentation only:
`C:\Program Files\dotnet\packs\Microsoft.NETCore.App.Ref\8.0.15\ref\net8.0`:

- `System.IO.FileSystem.AccessControl.xml`: security-at-create APIs, existing-directory
  behavior and handle-based ACL access.
- `System.IO.Pipes.AccessControl.xml`: security-at-create APIs, inheritability, explicit
  pipe rights, automatic `Synchronize` and `CreateNewInstance` implications.
- `System.IO.Pipes.xml`: `CurrentUserOnly`, server/client constructors, identity-name
  lookup, impersonation and asynchronous connection methods.
- `System.Security.AccessControl.xml`: protected inheritance, owner/group, descriptor
  serialization, DACL/control flags and ACEs.
- `System.Runtime.xml`: `CreateNew`, reparse attributes and handle inheritability.
- `System.Security.Principal.Windows.xml`: numeric SID construction and current-user
  identity/query/disposal APIs as documentation; no real identity method was invoked.

Also reviewed installed Node type descriptions for `fs.open`/permissions, `net`
listen options and child-process pipe/handle behavior. They are API descriptions,
not a review of Windows libuv/native source or proof of its ACL implementation.

**Do not copy .NET 8 API assumptions into Windows PowerShell 5.1.** Actual reflection
on PowerShell **5.1.26100.9444**, CLR **4.0.30319.42000**, found:

| Surface | Actual Framework observation | Consequence |
|---|---|---|
| `FileStream` constructor accepting `FileSecurity`, rights, share, options | Present | Candidate for security-at-file-creation, not proof of path safety or privacy |
| `Directory.CreateDirectory(path, DirectorySecurity)` | Present | Do not use a successful return as proof of exclusive creation; existing-directory behavior must be handled |
| `NamedPipeServerStream` constructors accepting `PipeSecurity` | Present, including inheritability/additional-rights overloads | Explicit descriptor construction is possible; no pipe was opened |
| `FileStream.GetAccessControl()` / `PipeStream.GetAccessControl()` | Present | Candidate for same-handle readback; not exercised on an OS object |
| `PipeOptions` | Only `None`, `Asynchronous`, `WriteThrough` | `CurrentUserOnly` and `FirstPipeInstance` are **not named members** of this runtime enum |
| Public server peer methods | `GetImpersonationUserName`, `RunAsClient`; no matching `ProcessId` method | Names/impersonation are not exact-process authentication; no peer-PID binding implemented |
| `FileOptions` | No named no-follow/open-reparse-point member | Reparse attributes and path prechecks are not a handle-safe ancestor traversal contract |

This does not prove that lower-level Windows mechanisms are absent. It means the
reviewed managed interface does not establish the required contract. Do not cast
undocumented flag integers, use private reflection/P/Invoke, compile an unreviewed
helper or install another runtime to bypass that gap under this scope.

The .NET 8 description of `CurrentUserOnly` checks user/elevation on Windows. Even
where available, **same user is not the same trusted process**. Neither a random pipe
name, a claimed PID, `maxInstances = 1`, a socket `exclusive` option nor an epoch label
substitutes for verified endpoint ownership and peer binding.

**Subsequent correction/qualification:** the [static implementation review](Windows-Pipe-Contract-Review.md)
finds that Framework's normal one-instance constructor does add the first-instance
bit, despite the absent enum member. The earlier enum inventory must not be read as
proof that this constructor behavior is absent. Explicit local-only enforcement and
exact connected-instance/process-lifetime binding still remain unestablished; no pipe
method was invoked in the static review and no listener was created.

## Memory descriptor findings

The producer uses the deliberately invented numeric SID
`S-1-5-21-100-200-300-1001`. It does not resolve an account name or read a token.
Descriptors are never passed to a file/pipe constructor or applied to any resource.

Two positive profiles were generated by native .NET:

- **File:** protected explicit DACL, synthetic owner/group, one allow ACE for the
  synthetic SID; file full-control mask **0x1f01ff**.
- **Pipe:** same synthetic ownership, one explicit read/write allow ACE; resulting
  mask **0x12019b**, including the automatically added `Synchronize` bit.

Native `PipeAccessRights.FullControl` includes **CreateNewInstance**; the explicit
read/write rule does not. Do not grant clients broad rights merely to simplify pipe
connection. This mask check is **not effective-access evaluation**: object ownership,
owner rights, token privileges and the ability to rewrite a DACL remain separate.
An owner/user-scoped DACL is not containment against hostile code with that same
Windows identity or against privileged administrators.

The producer also generated **null** and **empty** DACL descriptors. They differ:
a `DACL_PRESENT` flag can coexist with a zero DACL offset in the recorded null form.
That bit alone cannot establish a usable, explicit private ACL. Empty DACL is not
classified as permissive; it is rejected because it does not match the intended
usable synthetic profile. No actual Windows access check was performed for either.

The independent TypeScript verifier accepts only the two synthetic profiles:

- At most **4 KiB**, revision 1, protected/present/self-relative control flags.
- Exact invented owner/group/ACE SID, one explicit non-inherited allow ACE and exact
  profile rights; no SACL/defaulted/extra/inherited ACEs.
- Bounded, aligned, disjoint descriptor components, exact sizes, no unreferenced tail.
- Rejects truncation, offset overflow/aliasing, wrong masks/SIDs and null/empty ACLs.
- Always returns a non-executable, not-private-proven report.

It is **not a general Windows security-descriptor parser**, effective-access engine
or production authorization routine. It is fixed to an invented SID, not parameterized
for actual principals. Do not reuse it to validate real host ACLs by supplying a
caller-selected SID.

## Storage and IPC decisions

1. Node `mode: 0700` / `0600` and `chmod` do not establish Windows user/group DACL
   privacy. The installed `fs.open` description explicitly limits Windows permission
   manipulation. `FileShare.None` proves a sharing-mode exclusion, not DACL privacy.
2. Supply a reviewed DACL **at creation**, not create-with-defaults then repair via
   `SetAccessControl`. The latter has an exposure interval and changes an existing
   object's ACL. Never clear/repair real project, temp-parent or installation ACLs.
3. Use `CreateNew` for a synthetic file leaf; existing-file collision must fail without
   truncation or mutation. A prior `exists`/`lstat` check is not atomic creation.
4. Hold and validate the same file handle across rights/readback/I/O as appropriate.
   Protected inheritance and an exact descriptor are not ancestor/reparse/hard-link,
   remote/synced-storage, antivirus-race or power-loss guarantees.
5. Keep Node worker stdio scoped as existing trusted fixture plumbing. Do not relabel
   it authenticated service IPC. No new named-pipe listener is ready to implement:
   first-instance ownership, local-only rejection, handle inheritance, peer identity,
   process-lifetime binding and least-privilege client behavior need a reviewed contract.
6. `GetImpersonationUserName` returns an account name, not a retained-process identity.
   `RunAsClient` executes while impersonating a peer; do not call it as a casual trust
   check or permit file/engine work inside an unreviewed impersonation callback.
7. Never expose Docker's socket/auth, invoke arbitrary paths/commands or turn a
   successfully parsed descriptor into a broker grant or recovery receipt.

## Subsequent disposable native experiment — original reviewed scope

The [file-only ACL fixture](Windows-File-ACL-Prototype.md) has since been implemented,
reviewed and passed **10 native checks**, exit 0, with both workers exited and the
exact temp root independently confirmed absent. No existing ACL change or process
kill occurred. This does not promote this earlier memory review into a privacy/IPC
proof. The original scope below is preserved. The subsequent bounded pipe contract
review linked above is complete, with partial evidence and remaining blockers, not
listener acceptance. Independent guest-only uncooperative-extension scope/design
work is next; a listener still requires sufficient supported native contract evidence.

Proceed **file-only first**. Pipe listeners remain out of scope until their missing
ownership/local-only/peer-binding contracts have been reviewed. The future file
harness must be reviewed as code before its explicit opt-in run:

- One fresh, nonce-named temp root, only fixed synthetic bytes and exact child names;
  no caller-selected root/path, existing ACL modification, real project or credential.
- Read only the current process's user SID locally if needed for creation-time rules;
  never emit it, account names, token bytes/claims, privilege lists or parent paths.
  No impersonation, logon, privilege adjustment or account creation. Dispose the
  identity-query object. The memory-only helper above does not perform this query.
- Create an allow-read fixture and a separate deny-read control **with their intended
  descriptors at creation**. Read back the ACL through the retained file handle;
  verify exact owner, protected inheritance and expected ACEs locally.
- Separately test `CreateNew` collision against the harness's own existing file and
  require original bytes/ACL unchanged. Do not rely on `Directory.CreateDirectory`
  to report an exclusive namespace claim or silently adopt a pre-existing directory.
- After the writer is closed, a retained disposable read-only child must successfully
  read the allow fixture and receive native **access denied**, not sharing violation,
  on the deny-read control. A timeout or absent file is not a passing denial.
- Those same-user controls would demonstrate requested-operation enforcement only;
  **not cross-user isolation or containment against a same-user DACL owner**. Such
  stronger tests require a separately reviewed identity/token/peer experiment.
- Bound requests/output/deadlines and wait for child/handle closure before cleanup.
  Only exact owned fixtures may be removed. No ACL reset/take-ownership fallback:
  uncertain cleanup preserves and reports the exact synthetic basename.
- No deliberate process kill, pipe server, Docker/WSL operation, service, download,
  installation, native compilation or broad resource cleanup in this first scope.

A passing future file harness would still not validate production admission,
installation-wide command authority, authenticated IPC, durable checkpoints or
restart recovery. The [Engine receipt gap](Docker-Recovery-API-Review.md) remains
independent, and gateway work remains operator-deferred.

## Native evidence and development validation

The fixed system PowerShell signature was rechecked **Valid / Microsoft**. Native
memory-only collection completed at **2026-09-12T12:58:22.045Z** (**21:58:22+09:00**),
Node **22.23.0**, exit **0**, with no temporary data fixtures to clean up. Public
reflection strings, the four synthetic descriptor byte arrays and source SHA-256 are
recorded in [Windows-Security-API-Memory.json](evidence/Windows-Security-API-Memory.json).
The source hash is an evidence consistency check, not authenticated supply-chain trust.

Native PowerShell validation at **2026-09-12T22:06:54+09:00**: typecheck and doctor CLI
smoke passed; **183 tests passed, 1 POSIX-only skip, 0 failed** (184 cases), including
all **12 new tests**. The Windows replay test invokes only the fixed memory/reflection
producer, never a secured-object constructor or identity query. Existing tests retain
their separately scoped disposable host-worker behavior; these new tests perform no
deliberate termination, network access, Docker or pi execution.
