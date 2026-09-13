# Guard Phase 0: installed Windows pipe contract / implementation review

## Result

**Partial contract evidence, not listener acceptance.** Static inspection of the
installed Framework and .NET 8 implementations corrects an important ambiguity:
Framework has no named `FirstPipeInstance` option, **but its normal server constructor
with `maxNumberOfServerInstances = 1` adds the same `0x80000` first-instance bit**.
Do not infer missing constructor behavior merely from an enum inventory.

Neither inspected managed creation path establishes the required explicit local-only
rejection and exact peer/process-lifetime binding. No listener, connection, service,
impersonation, current-identity query, Docker command or pi runtime was started.
All records remain **Locked / not active / canLaunch false / executable false /
gateway deferred / peerBindingProven false**. The current pi process is unprotected;
order 01 is still in progress and orders 02–18 remain pending.

Companions: [earlier API/memory review](Windows-Private-Storage-IPC-Review.md),
[file-only ACL pass](Windows-File-ACL-Prototype.md),
[Docker recovery evidence gap](Docker-Recovery-API-Review.md),
[execution order](Execution-Order.md).

## Scope and reproducible artifacts

- `guard-host/review-pipe-metadata.ps1`: fixed, read-only metadata producer. Only
  two pinned targets; default .NET 8, optional `-Framework`. No arbitrary path input.
- `guard-host/static-cil.ts`: bounded static instruction decoder, **not an evaluator,
  CLR verifier, decompiler, native ABI verifier or authorization component**.
- `tests/guard-pipe-metadata.test.ts`: 13 offline evidence/decoder regression tests.
- Raw [Framework metadata](evidence/Framework-Pipe-Metadata.json) and
  [.NET 8 metadata](evidence/Dotnet-8-Pipe-Metadata.json), including method bodies,
  enum constants, import declarations, public/private method attributes and symbols.
- Reproducible selected [Framework IL](evidence/Framework-Pipe-Selected-IL.txt) and
  [.NET 8 IL](evidence/Dotnet-8-Pipe-Selected-IL.txt): 8 and 12 selected bodies.

Public `PEReader`, `GetMetadataReader`, `GetMethodBody`, `GetILBytes` and metadata
handle APIs were reviewed in the installed .NET 8 reference XML. The actual reader
libraries are the installed SDK **8.0.408 `tools/net472`** binaries compatible with
PowerShell's Framework CLR, not the .NET 8 reference assemblies loaded for execution.
Five SDK libraries and both targets were SHA-256 pinned and Authenticode checked
**Valid / Microsoft**. Target assemblies are opened as byte streams; no target pipe
constructor, private method or native import is invoked. Framework `System.Core`
is already used by PowerShell itself: this does **not** claim that every other method
in that assembly was absent from the host's ordinary runtime activity.

The SDK's installed `Microsoft.NET.Build.Tasks.dll.config` explicitly redirects
`System.Runtime.CompilerServices.Unsafe` to **6.0.0.0**. The reader uses a public,
process-local `AssemblyResolve` callback for **only** the observed old identity
`4.0.4.1 / b03f5f7f11d50a3a`, returning the already pinned/signed SDK 6.0 assembly.
The callback is removed in `finally`; no machine/application config is modified.
No Unsafe API is called directly, SDK build task invoked, helper compiled, package
restored, runtime installed or private reflection/native interop added.

Bounds: each target at most **2 MiB**, each recorded pipe-method body **8 KiB**,
producer JSON **256 KiB**; outer process **20 seconds / 300,000 output bytes**,
minimal `SystemRoot`/`OS` environment, ignored stdin, no profile or shell expansion.
Only public installed files and repository artifacts were read/written. No disposable
OS object fixture was needed; file streams closed and reader processes exited 0.

To limit evidence size, symbol candidates come from overlapping four-byte windows
in the selected types' IL. **Those candidates alone are not call evidence.** The
independent decoder establishes instruction boundaries, operand widths and branch
targets. The text renderer resolves symbols only for actual token operands, not
integer constants or branch offsets. Unresolved strings/generic tokens remain numeric;
signature blobs are retained without pretending to be a complete ABI decoder.
All **219** recorded pipe method bodies decode; this does not verify stack typing,
exception regions, native machine code or Windows kernel behavior.

The installed Windows Kits `NETFXSDK` tree was searched to depth four for
`namedpipeapi.h`, `winbase.h` and pipe-named files; no matches. A bounded .NET packs
filename search found no Windows SDK/PInvoke-named files. This is **not** a claim
that Windows lacks these APIs or that every SDK/doc location was searched. No online
fetch, system-wide file search or download was used to bypass missing evidence.

## Findings and remaining contract gates

| Requirement | Installed evidence | Decision / limit |
|---|---|---|
| Creation-time security descriptor | Framework public security constructor calls `GetSecAttrs`, then `CreateNamedPipe`; .NET 8 also passes descriptor/security attributes at creation | Candidate mechanism. Earlier file ACL results do not prove pipe access checks |
| First-instance namespace claim | Framework `Create` `0x060004dd` and .NET 8 `Create` `0x060000bf` add `0x80000` when maximum instances is one; .NET 8 enum names that value `FirstPipeInstance` | Positive implementation evidence without an absent-flag cast. Native collision/error/held-handle/recreation behavior still untested; not authenticated server ownership |
| Explicit local-only rejection | Both selected paths build pipe mode as `(transmissionMode << 2) \| (transmissionMode << 1)`; reviewed Byte/Message inputs 0/1 produce only 0/6 | No explicit remote-rejection mechanism established by these call paths. Choosing local server name `.` restricts that client target, not which clients the server admits. Do not substitute firewall/Desktop assumptions or same-owner ACLs |
| Handle inheritance | Both implementations use explicit `HandleInheritability` to populate `SECURITY_ATTRIBUTES`; non-inheritable mode avoids setting the inheritance bit | Candidate at-create inheritance control, not proof against duplication, delegated handles, launch-time leaks or hostile same-user processes |
| Least-privilege client access | Framework specific-rights constructor `0x060004f1` stores the requested `PipeAccessRights` mask directly in `m_access`; `Connect` supplies that mask to the native client-open wrapper | Prefer an explicitly reviewed mask in a future design. Direction-based constructors instead request generic access bits; no actual client access check tested |
| Client versus server rights | Prior memory evidence distinguishes read/write from `CreateNewInstance`; .NET 8 current-user-only creation grants owner full control `0x1f019f`, including instance creation | Current-user-only is not a client-only least-privilege DACL. Do not broaden clients to full control merely to make connection succeed |
| Current-user check | .NET 8 client `ValidateRemotePipeUser` reads pipe owner and compares it to `WindowsIdentity.Owner`; Framework has no named current-user-only option | Owner comparison, not exact-process identity. No real token queried here, and no assumption about this operator's owner SID |
| Peer PID / process lifetime | No `GetNamedPipeClientProcessId`, `GetNamedPipeServerProcessId`, `OpenProcess` or `GetProcessTimes` import in either checked assembly inventory; selected managed types expose no public peer PID/handle method | Required supported binding remains unestablished. This bounded absence is not global Win32 API absence |
| Impersonation | `RunAsClient` / username lookup remain present | Not used. No filesystem/engine operation may run in a peer impersonation callback under this scope |

The Framework constructor rejects non-enum option bits with mask `0x3fffffff`.
Casting the newer `0x80000` enum flag would therefore be both unreviewed and the wrong
way to obtain the behavior already present for a one-instance server. This correction
does **not** relax the earlier requirement: one instance alone is not peer binding,
installation-wide authority or protection against namespace reuse after handle close.

Import names are recorded literally: Framework declares unsuffixed `CreateNamedPipe`,
whereas .NET 8 records `CreateNamedPipeW`. Native charset/symbol resolution must not be
silently inferred as if both metadata tables contained the same declaration. Import
presence and call-site IL do not establish all native ABI, cancellation or kernel
security contracts.

Even a future native peer-PID query would be insufficient by itself. The design must
bind the **particular connected instance** to a retained, independently trusted process
lifetime, handle PID reuse and disconnect/reconnect races, and define the threat model
for inherited/duplicated/delegated pipe handles. A PID supplied in a JSON frame, account
name, executable path, epoch or repeated same-PID query is not that proof. Channel
closure also does not revoke engine requests already sent or accepted.

## Collection and validation record

Final collections, both exit **0**, system PowerShell **Valid / Microsoft**,
PowerShell **5.1.26100.9444 / CLR 4.0.30319.42000**, Node **22.23.0**:

| Target | Observation (UTC) | SHA-256 |
|---|---|---|
| `.NET 8.0.15/System.IO.Pipes.dll`, file version `8.0.1525.16413` | `2026-09-12T21:55:06.988Z` | `8e1285a55eb5d1091947b60856bdf3a29b4f65e6e3d043f7b0e96b08b2d2ca29` |
| Framework GAC `System.Core.dll`, file version `4.8.9347.0` | `2026-09-12T21:55:10.530Z` | `fd1097aed825d392a5dc8d19384381d4bb2a43498ea1c9d917f5d80c66600e1b` |

The raw records contain **119 / 100** pipe method bodies and **26 / 184** assembly-wide
native import declarations respectively. Hashes bind recorded artifacts, not an
independent trust root or authenticated future runtime attestation.

Initial metadata collection failed before returning a reader because the SDK's older
Unsafe dependency identity was unresolved in PowerShell. Preloading alone also failed.
After reading the installed SDK redirect policy, the narrow transient resolver above
fixed only metadata-reader dependency loading. No pipe workaround or runtime install
was used. An initial offline regression incorrectly expected the suffixed native import
name in both records; it was corrected to assert the actual distinct declarations.
Neither failed attempt was counted as successful native security evidence.

Native validation at **2026-09-13T06:59:03+09:00**: typecheck and doctor CLI smoke
passed; **209 tests passed, 1 POSIX-only skip, 0 failed** (210 cases), including
**13 new tests**. New tests read repository evidence and decode bytes only; they do
not rerun the metadata collector, create IPC, execute target code or query identity.
The existing suite retains its separately reviewed synthetic-worker/memory scopes.

## Stop condition and next independent work

**No listener/service or production IPC adapter is authorized by this review.**
Before one is designed/run, obtain a reviewed supported contract for explicit remote
rejection and exact connected-instance/process-lifetime binding, alongside native
namespace collision and least-privilege/inheritance validation. Do not cast absent
flags, invoke private imports, install another runtime, create accounts, change existing
ACLs/settings or expose Docker to fill the gap.

The installed-material review is now complete within its bounded scope; do not keep
repeating it as if it could prove the missing contracts. Continue order 01 independently
by reviewing the pure [guest-only uncooperative-extension containment model](Uncooperative-Extension-Prototype.md),
then review the fixed guest/verifier scripts and design controller wiring only after
separate code/deadline/ownership/cleanup review. Keep the surviving supervisor and host-owned stop boundary; this is
not supervisor-loss recovery, production admission or authorization to execute
guest/pi code on the host.

The [Docker incarnation/receipt gap](Docker-Recovery-API-Review.md) remains a separate
blocker. Native durable authority/checkpoints and recovery prerequisites remain unmet;
no supervisor/daemon/Desktop/WSL disruption, receipt fabrication, gateway acceptance or
full phase advancement is implied.
