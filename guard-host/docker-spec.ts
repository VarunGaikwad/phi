// Phase 0 fixture configuration, not a production agent backend or authorization API.
export const DOCKER_ENDPOINT = "npipe:////./pipe/docker_engine";
export const PROBE_LABEL = "com.preapexis.phi.phase0";
export const LOCAL_NODE_IMAGE = "node:24-bookworm-slim";
export const TMPFS = {
  "/workspace": "rw,noexec,nosuid,nodev,size=67108864,mode=0700,uid=1000,gid=1000",
  "/tmp": "rw,noexec,nosuid,nodev,size=16777216,mode=1777",
  "/home/node": "rw,noexec,nosuid,nodev,size=16777216,mode=0700,uid=1000,gid=1000",
} as const;

export class DockerProbeError extends Error {
  constructor(readonly rule: string) { super(rule); }
}
export function requireProbe(condition: unknown, rule: string): asserts condition {
  if (!condition) throw new DockerProbeError(rule);
}
export function object(value: unknown): Record<string, unknown> {
  requireProbe(value !== null && typeof value === "object" && !Array.isArray(value), "DOCKER_INVALID_RESPONSE");
  return value as Record<string, unknown>;
}
function empty(value: unknown): boolean {
  return value === null || (typeof value === "object" && value !== undefined && Object.keys(value).length === 0);
}
function same(actual: unknown, expected: unknown): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

// Only controller-owned synthetic paths are probed. No personal file canaries,
// project data, external service requests, or model/provider traffic are used.
export const NODE_FIXTURE = String.raw`
const fs = require('node:fs');
const os = require('node:os');
const cp = require('node:child_process');
const checks = {};
function check(id, fn) { try { checks[id] = fn() === true; } catch { checks[id] = false; } }
function deniedWrite(path) {
  try { fs.writeFileSync(path, 'synthetic'); return false; }
  catch (e) { return ['EROFS', 'EACCES', 'EPERM'].includes(e.code); }
}
check('nodeRuntime', () => Number(process.versions.node.split('.')[0]) === 24);
check('nonRoot', () => process.getuid() === 1000 && process.getgid() === 1000);
check('noPrivileges', () => {
  const status = fs.readFileSync('/proc/self/status', 'utf8');
  return /^NoNewPrivs:\s+1$/m.test(status) && /^CapEff:\s+0+$/m.test(status);
});
check('readOnlyRoot', () => deniedWrite('/phi-phase0-root-write'));
check('workspace', () => {
  fs.writeFileSync('/workspace/fixture.txt', 'approved synthetic fixture');
  return fs.readFileSync('/workspace/fixture.txt', 'utf8') === 'approved synthetic fixture';
});
check('noHostBridges', () => ['/var/run/docker.sock', '/run/docker.sock', '/run/desktop', '/mnt/c', '/mnt/wsl', '/run/host', '/proc/sys/fs/binfmt_misc/WSLInterop'].every(p => !fs.existsSync(p)));
check('noProjectHistory', () => !fs.existsSync('/workspace/.git') && !fs.existsSync('/workspace/.env'));
check('noNetworkInterface', () => Object.entries(os.networkInterfaces()).every(([name, entries]) => name === 'lo' && entries.every(e => e.internal)));
check('cleanEnvironment', () => Object.keys(process.env).sort().join(',') === 'HOME,PATH,PI_CODING_AGENT_DIR,PI_CODING_AGENT_SESSION_DIR,PI_OFFLINE,TMPDIR');
check('childContained', () => cp.execFileSync(process.execPath, ['-e',
  "const fs=require('node:fs');let denied=false;try{fs.writeFileSync('/phi-phase0-child-write','synthetic')}catch(e){denied=['EROFS','EACCES','EPERM'].includes(e.code)};fs.writeFileSync('/workspace/child.txt','child');process.stdout.write(String(denied && process.getuid()===1000 && !fs.existsSync('/var/run/docker.sock')));"
], {encoding:'utf8', timeout:3000, maxBuffer:1024, env:process.env}) === 'true');
process.stdout.write(JSON.stringify({version:1, nonce:process.argv[1], checks})+'\n');
process.exitCode = Object.values(checks).every(Boolean) ? 0 : 1;
`;

export const CHECK_IDS = [
  "nodeRuntime", "nonRoot", "noPrivileges", "readOnlyRoot", "workspace", "noHostBridges",
  "noProjectHistory", "noNetworkInterface", "cleanEnvironment", "childContained",
] as const;

export function fixtureCommand(nonce: string): string[] {
  requireProbe(/^[a-f0-9]{32}$/.test(nonce), "DOCKER_INVALID_NONCE");
  return [
    "-i", "PATH=/usr/local/bin:/usr/bin:/bin", "HOME=/home/node", "TMPDIR=/tmp",
    "PI_CODING_AGENT_DIR=/home/node/.pi/agent", "PI_CODING_AGENT_SESSION_DIR=/home/node/.pi/sessions",
    "PI_OFFLINE=1", "/usr/local/bin/node", "-e", NODE_FIXTURE, nonce,
  ];
}

export function createFixtureArgs(imageId: string, nonce: string): string[] {
  requireProbe(/^sha256:[a-f0-9]{64}$/.test(imageId), "DOCKER_INVALID_IMAGE_ID");
  return [
    "container", "create", "--name", `phi-phase0-${nonce}`, "--label", `${PROBE_LABEL}=${nonce}`,
    "--pull=never", "--network=none", "--read-only", "--user=1000:1000", "--cap-drop=ALL",
    "--security-opt=no-new-privileges=true", "--ipc=private", "--cgroupns=private", "--runtime=runc",
    "--pids-limit=64", "--memory=536870912", "--memory-swap=536870912", "--cpus=1",
    "--init", "--restart=no", "--no-healthcheck", "--log-driver=none", "--stop-timeout=2",
    "--workdir=/workspace", "--entrypoint=/usr/bin/env",
    ...Object.entries(TMPFS).flatMap(([path, options]) => ["--tmpfs", `${path}:${options}`]),
    imageId, ...fixtureCommand(nonce),
  ];
}

export function inspectImage(value: unknown): string {
  const image = object(value);
  requireProbe(typeof image.Id === "string" && /^sha256:[a-f0-9]{64}$/.test(image.Id), "DOCKER_INVALID_IMAGE_ID");
  requireProbe(image.Os === "linux", "DOCKER_LINUX_IMAGE_REQUIRED");
  const config = object(image.Config);
  // Inherited VOLUME declarations create persistent anonymous volumes, even with no -v.
  requireProbe(empty(config.Volumes), "DOCKER_IMAGE_VOLUMES_DENIED");
  requireProbe(empty(config.OnBuild), "DOCKER_IMAGE_HOOKS_DENIED");
  return image.Id;
}

export function inspectEngine(value: unknown) {
  const engine = object(value);
  requireProbe(engine.OSType === "linux" && engine.OperatingSystem === "Docker Desktop", "DOCKER_DESKTOP_LINUX_REQUIRED");
  requireProbe(typeof engine.KernelVersion === "string" && /microsoft.*wsl2/i.test(engine.KernelVersion), "DOCKER_WSL2_ENGINE_UNCONFIRMED");
  requireProbe(typeof engine.ServerVersion === "string" && engine.ServerVersion.length <= 64 && /^\d+\.\d+\.\d+[a-zA-Z0-9.+-]*$/.test(engine.ServerVersion), "DOCKER_VERSION_UNCONFIRMED");
  return { serverVersion: engine.ServerVersion as string, wsl2KernelObserved: true as const };
}

/** Also used before cleanup: never delete resources merely because they share a name. */
export function ownedContainer(value: unknown, nonce: string, imageId: string): string {
  const info = object(value);
  requireProbe(typeof info.Id === "string" && /^[a-f0-9]{64}$/.test(info.Id), "DOCKER_CONTAINER_ID_INVALID");
  const config = object(info.Config);
  requireProbe(info.Name === `/phi-phase0-${nonce}` && object(config.Labels)[PROBE_LABEL] === nonce && config.Image === imageId && info.Image === imageId, "DOCKER_OWNERSHIP_MISMATCH");
  return info.Id;
}

/** Independent engine inspection before start; no trust in create arguments alone. */
export function inspectFixture(value: unknown, nonce: string, imageId: string): string {
  const info = object(value);
  const id = ownedContainer(info, nonce, imageId);
  const config = object(info.Config);
  const host = object(info.HostConfig);
  requireProbe(object(info.State).Status === "created", "DOCKER_UNEXPECTED_CONTAINER_STATE");
  requireProbe(config.User === "1000:1000" && config.WorkingDir === "/workspace" && same(config.Entrypoint, ["/usr/bin/env"]) && same(config.Cmd, fixtureCommand(nonce)), "DOCKER_COMMAND_MISMATCH");
  requireProbe(empty(config.Volumes) && same(object(config.Healthcheck).Test, ["NONE"]), "DOCKER_IMAGE_EFFECTS_DENIED");
  requireProbe(host.Privileged === false && host.ReadonlyRootfs === true && same(host.CapDrop, ["ALL"]) && empty(host.CapAdd) && same(host.SecurityOpt, ["no-new-privileges=true"]), "DOCKER_PRIVILEGE_POLICY_MISMATCH");
  requireProbe(host.NetworkMode === "none" && host.IpcMode === "private" && host.CgroupnsMode === "private" && host.PidMode === "" && host.UTSMode === "" && host.UsernsMode === "" && host.Runtime === "runc", "DOCKER_NAMESPACE_POLICY_MISMATCH");
  requireProbe(host.Memory === 536870912 && host.MemorySwap === 536870912 && host.NanoCpus === 1e9 && host.PidsLimit === 64 && host.Init === true && host.AutoRemove === false && host.PublishAllPorts === false, "DOCKER_LIMIT_POLICY_MISMATCH");
  requireProbe(object(host.RestartPolicy).Name === "no" && object(host.LogConfig).Type === "none", "DOCKER_LIFECYCLE_POLICY_MISMATCH");
  for (const key of ["Binds", "VolumesFrom", "Devices", "DeviceRequests", "DeviceCgroupRules", "Links", "ExtraHosts", "PortBindings", "GroupAdd", "Dns", "DnsOptions", "DnsSearch"]) {
    requireProbe(empty(host[key]), "DOCKER_HOST_ACCESS_DENIED");
  }
  // Docker's HostConfig declares these with json:",omitempty". Absence means
  // empty for these specific fields, not for required security booleans/limits.
  for (const key of ["Mounts", "Sysctls", "StorageOpt", "Annotations"]) {
    requireProbe(host[key] === undefined || empty(host[key]), "DOCKER_HOST_ACCESS_DENIED");
  }
  const tmpfs = object(host.Tmpfs);
  requireProbe(Object.keys(tmpfs).length === Object.keys(TMPFS).length && Object.entries(TMPFS).every(([path, options]) => tmpfs[path] === options), "DOCKER_TMPFS_POLICY_MISMATCH");
  requireProbe(info.Mounts === null || (Array.isArray(info.Mounts) && info.Mounts.every((mount: unknown) => {
    const m = object(mount);
    return m.Type === "tmpfs" && m.Source === "" && typeof m.Destination === "string" && Object.hasOwn(TMPFS, m.Destination);
  })), "DOCKER_MOUNT_DENIED");
  requireProbe(same(Object.keys(object(object(info.NetworkSettings).Networks)), ["none"]), "DOCKER_NETWORK_DENIED");
  return id;
}

export function inspectFixtureResult(value: unknown, nonce: string): void {
  const result = object(value);
  const checks = object(result.checks);
  requireProbe(result.version === 1 && result.nonce === nonce && Object.keys(checks).length === CHECK_IDS.length && CHECK_IDS.every((id) => checks[id] === true), "DOCKER_GUEST_CHECK_FAILED");
}
