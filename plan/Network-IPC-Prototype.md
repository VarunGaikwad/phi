# Guard Phase 0: synthetic network/IPC primitive

## Status and scope

**Passed on native Windows, 2026-09-12: all 21 checks, exit 0; both containers and
host temp data removed.** Separate bounded nonce-label queries confirmed both
containers absent. This independent order 01 experiment extends network/IPC
evidence beyond the [offline-agent fixture](Offline-Agent-Prototype.md).
It uses **two Node-only containers**, not pi, model traffic, personal files or real
project data. It does not replace provider/gateway acceptance, which stays deferred.
No full phase gate advances. All reports remain **Locked / not active / canLaunch
false**; this does not protect the current pi process.

Files: `guard-host/network-spec.ts`, `network-probe.ts`, `probe-network.ts`,
`tests/guard-network.test.ts`. No pi SDK or public pi API is changed or imported.

## Fixed effects

With explicit confirmation on native Windows and the trusted installed Docker CLI:

1. Use the same fixed local Docker pipe, empty disposable client configuration,
   environment allowlist and Desktop Linux / WSL2 engine checks as earlier fixtures.
   Resolve the already-approved local Node image to one immutable ID; reject image
   volumes/hooks. No pull, build, install, Docker network creation, settings change,
   daemon restart or host/WSL service control.
2. Create one **peer** and one **primary** container, with different random nonce
   identities. Independently inspect **both** before starting either. Each retains
   the unchanged profile: network none, UID/GID 1000, capabilities dropped,
   no-new-privileges, read-only root, private namespaces, no host mounts/devices/
   ports, no restart/log persistence, three bounded tmpfs areas, 64 processes,
   one CPU and 512 MiB memory with no additional container swap. The pair's total
   limits are two CPUs / 1 GiB memory, not an unbounded fleet.
3. Only the peer guest binds fixed synthetic services: TCP and UDP on its own
   `127.0.0.1:40381`, a Unix socket at `/workspace/peer.sock`, and a nonce marker at
   `/dev/shm/phi-network-peer`. Its startup requires Linux Node 24, clean environment,
   non-root identity, no capabilities/no-new-privileges, read-only root and only
   internal loopback interfaces. None of these ports or paths is exposed to Windows.
4. A controller-issued peer exec checks all three echo services and its marker,
   before the primary test. The supervisor compares `/proc/self/ns/{net,ipc,pid,mnt}`
   identities from separate fixed execs and requires all four namespaces to differ.
   Namespace identifiers are validated in memory, not included in the final report.
5. The primary guest checks local **positive controls**: TCP echo, UDP echo, and an
   actual DNS A lookup through its own loopback-only synthetic responder. The name
   is fixed `phi-fixture.invalid`; the only answer is `192.0.2.1`. A private Node
   Resolver is pointed at this responder before any query; system DNS servers are
   not queried or reconfigured. The responder is bounded to 512-byte queries for
   this one question and never forwards requests or resolves arbitrary names.
6. Attempt fixed TCP destinations `192.0.2.1`, `2001:db8::1`, and IPv4-mapped
   `::ffff:192.0.2.1`, on port 40382; fixed UDP IPv4/IPv6 destinations on port 40382;
   and one synthetic DNS packet to documentation-only `192.0.2.53:53`. Require an
   explicit `ENETUNREACH`, `EHOSTUNREACH`, `EACCES` or `EPERM`. Success, response,
   `ECONNREFUSED`, unknown error, API argument failure or timeout cannot pass as
   an **egress** denial. UDP send success without a response is inconclusive.
7. Verify that the locally resolved A address remains unreachable. Serve and
   receive one guest-local HTTP 302 to fixed `http://192.0.2.1:40382/fixture`, validate
   that exact Location, and attempt the fixed destination with a real HTTP client.
   The destination must fail with the same explicit egress errors. This tests one
   controlled redirect path, not an arbitrary URL-following proxy or gateway.
8. From the primary, attempt the peer's loopback TCP/UDP service address. Require
   `ECONNREFUSED` for these **peer-separation** checks, not a timeout; any connection/
   response fails. Require the peer Unix socket to be absent and its connect attempt
   to return `ENOENT`, and the peer shared-memory marker to be absent. The primary's
   positive-control servers have already been closed before these attempts.
9. Check absence of fixed privileged socket/WSL/host bridge paths using metadata
   only. Do not connect to an actual Docker/containerd/host service. Recheck the
   peer's live echo services/marker and unchanged namespace identities afterward,
   so a dead peer cannot explain apparent isolation.
10. Independently recheck both running profiles, engine-SIGKILL both, and require
    wait exit 137 / non-running / PID zero / no OOM or state error. Ownership-check
    name/ID/image/nonce-label before removing each and verify absence separately.
    Failure cleaning one must not skip the other. Cleanup has separate deadlines
    and ignores cancellation of the main experiment. Remove/check host temp data.

There are **21 required checks**, all passed in the recorded native run:
17 fixed primary checks plus `peerAliveBefore`,
`separateNamespaces`, `peerAliveAfter`, and `hostStop`. Both container cleanup
outcomes and host-temp cleanup are required separately. The guest results are
independent of a model/extension but not tamper-proof hostile-guest attestation.

Only guest-loopback and documentation-only TEST-NET addresses are contacted. No
Windows listener, host/LAN IP, cloud metadata endpoint, real provider or public
DNS server is tested. Guest port binds do not publish host ports. Active network
traffic occurs only in the explicit Docker fixture, never ordinary unit tests.

## Bounds and native command

Docker calls retain 15-second deadlines and 128 KiB output caps. Socket attempts
have 1-second limits; a timeout is failure/inconclusive, never a passing denial.
The primary exec has an 11-second hard deadline. Peer verification waits at most
3 seconds for startup and has a 6-second hard deadline. Command lengths are tested
against conservative native Windows argv bounds. Raw errors, packet contents,
namespace IDs and file data are not included in final reports.

With the already-installed Desktop Linux/WSL2 engine running and approved image
retained, from native PowerShell after reviewing this scope:

```powershell
$docker = (Get-Command docker.exe -CommandType Application).Source
npm.cmd run --silent guard:probe-network -- --docker "$docker" --confirm --json
```

Use a known trusted, signature-checked CLI. `--help` has no fixture effects. There
are no URL, DNS server, host-service, network-policy, image or project overrides.
Exit **0**: help or successful fixture/cleanup; **2**: blocked before container
creation; **1**: fixture/cleanup failure; **64**: invalid arguments/absent consent.
None authorizes production Guard launch.

If cleanup is unconfirmed, inspect only the two reported synthetic identities and
verify their labels/names/image before targeted removal. Never prune. Supervisor
loss or daemon outage can still leave resources behind; this fixture does not
implement durable recovery. Do not deliberately disrupt Desktop/WSL or the daemon.

## Native run evidence and development validation

The known Docker executable location and valid Docker Inc signature were rechecked
before the command above. The native Windows Node **22.23.0** controller used Engine
**29.4.3**, Desktop Linux / WSL2 metadata, and the retained approved immutable Node
image. No restriction, namespace flag, DNS setting or image was changed to pass.

Exit **0**, sanitized report:

```json
{
  "version": 1,
  "kind": "phi-network-ipc-probe",
  "coverage": "synthetic-network-ipc-only",
  "gateway": "deferred",
  "state": "locked",
  "protection": "not-active",
  "canLaunch": false,
  "probe": "passed",
  "stage": "complete",
  "checks": [
    "peerAliveBefore",
    "separateNamespaces",
    "cleanRuntime",
    "loopbackTcpControl",
    "loopbackUdpControl",
    "dnsResolutionControl",
    "tcpIpv4Denied",
    "tcpIpv6Denied",
    "tcpMappedIpv4Denied",
    "udpIpv4Denied",
    "udpIpv6Denied",
    "dnsUdpEgressDenied",
    "resolvedAddressDenied",
    "httpRedirectDenied",
    "peerTcpDenied",
    "peerUdpDenied",
    "peerUnixDenied",
    "peerSharedMemoryAbsent",
    "privilegedBridgesAbsent",
    "peerAliveAfter",
    "hostStop"
  ],
  "containerName": "phi-phase0-d9163b2f9f3cc9b3ab07c88eb08bf4c8",
  "peerName": "phi-phase0-447e9808d20f3c0897265b16f23655d5",
  "cleanup": "removed",
  "peerCleanup": "removed",
  "engine": {
    "serverVersion": "29.4.3",
    "wsl2KernelObserved": true
  },
  "imageId": "sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553",
  "hostCleanup": "removed"
}
```

A separate bounded verifier queried only these two nonce labels and confirmed both
containers absent. Its own empty client configuration/temp directory was removed
and checked absent. The image remains local. No host listener, project data,
credential, external provider, host/LAN/cloud endpoint, installation, image pull,
Desktop/WSL settings change or pi runtime was involved in this primitive.

Native Windows typecheck and doctor CLI smoke passed; `npm.cmd test` reported
**104 passed, 0 failed, 1 POSIX-only skip** (105 cases). The **13 new tests** cover
unchanged profiles/argv bounds, strict schemas, peer liveness/namespaces, two-resource
ownership/cleanup/cancellation, and TCP/UDP helpers with fake sockets. They verify
that unexpected responses, timeouts, send success and wrong error codes cannot
pass as denials. DNS packet tests cover the fixed question/response and malformed,
oversized or response-as-query input. New unit tests open **no host sockets** and
start no containers; real-backend evidence comes only from the explicit run above.

Next: whole-agent session/cancellation/extension-failure lifecycle checks with
synthetic data, plus durable ownership/reconciliation design before supervisor-
loss tests. Network variants and gateway proof below remain incomplete. No full
phase gate advanced; the current pi process remains unprotected.

## Remaining coverage and reference basis

Not established: packet-capture-level proof, real host/LAN/cloud-service probes,
DNS rebinding or redirect variants, TLS/DoH/DoT/CONNECT, gateway destination/auth
policy, IPv6 loopback positive control, raw sockets, abstract Unix sockets or
SysV IPC APIs, Windows named-pipe/clipboard bridges, kernel/hypervisor exploit
resistance, ECI/sharing settings, all pi tools/session/lifecycle routes, production
admission/NTFS race safety, supervisor-loss/restart reconciliation or host apply.
Private network namespaces do not make services in the **same** guest private
from arbitrary tools; the positive controls deliberately demonstrate that access.

API basis: existing [Docker profile review](Docker-Prototype.md#references-reviewed)
and passing lifecycle fixtures; installed Node `dns/promises` and `dgram` API
comments for independent Resolver/server selection, connected UDP and callback/
error behavior. Reference documentation:

- [Node DNS](https://nodejs.org/docs/latest-v24.x/api/dns.html),
  [UDP](https://nodejs.org/docs/latest-v24.x/api/dgram.html),
  [TCP/Unix sockets](https://nodejs.org/docs/latest-v24.x/api/net.html),
  [HTTP](https://nodejs.org/docs/latest-v24.x/api/http.html).
- [IPv4 TEST-NET](https://www.rfc-editor.org/rfc/rfc5737),
  [IPv6 documentation prefix](https://www.rfc-editor.org/rfc/rfc3849),
  [reserved .invalid](https://www.rfc-editor.org/rfc/rfc2606),
  [DNS message format](https://www.rfc-editor.org/rfc/rfc1035).

No new pi APIs or extension hooks are used. The earlier whole-agent pi/security
review remains applicable; a host tool-routing extension or relaxed Docker profile
is not substituted for the tested boundary.
