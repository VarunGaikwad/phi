// Fixed offline experiment profile. Not a production launch or guest-facing API.
import { win32 } from "node:path";
import { copyHash, validateSyntheticSnapshot, type SyntheticCopyFile } from "./synthetic-copy.ts";
import { MAX_AGENT_PACKET_BYTES, validateRuntimePath } from "./agent-runtime.ts";
import { createFixtureArgs, fixtureCommand, inspectFixture, object, requireProbe } from "./docker-spec.ts";

export const AGENT_CHECK_IDS = [
  "cleanEnvironment", "snapshotMatch", "sdkVersion", "resourcesExplicit", "extensionDirect",
  "deniedReads", "deniedWrites", "noHostBridges", "networkInterfaces", "networkProbes",
  "detachedChild", "builtInRead", "builtInEdit", "builtInWrite", "shellChild", "agentLoop", "sessionLifecycle",
] as const;
export const IDLE_AGENT_FIXTURE = "process.on('SIGTERM',()=>{});setInterval(()=>{},1000);";
export function agentEnvironment(): string[] {
  return ["-i", "PATH=/usr/local/bin:/usr/bin:/bin", "HOME=/home/node", "TMPDIR=/tmp",
    "PI_CODING_AGENT_DIR=/home/node/.pi/agent", "PI_CODING_AGENT_SESSION_DIR=/home/node/.pi/sessions",
    "PI_OFFLINE=1", "PI_TELEMETRY=0", "PI_PACKAGE_DIR=/home/node/runtime/node_modules/@earendil-works/pi-coding-agent"];
}
export function agentFixtureCommand(nonce: string): string[] {
  fixtureCommand(nonce); // Same strict nonce validation as the primitive fixture.
  return [...agentEnvironment(), "/usr/local/bin/node", "-e", IDLE_AGENT_FIXTURE, nonce];
}
export function createAgentFixtureArgs(imageId: string, nonce: string): string[] {
  const primitive = createFixtureArgs(imageId, nonce);
  return [...primitive.slice(0, -fixtureCommand(nonce).length), ...agentFixtureCommand(nonce)];
}
export function inspectAgentFixture(value: unknown, nonce: string, imageId: string, state: "created" | "running" = "created"): string {
  const id = inspectFixture(value, nonce, imageId, agentFixtureCommand(nonce), state);
  if (state === "running") {
    const actual = object(object(value).State);
    requireProbe(actual.Running === true && Number.isSafeInteger(actual.Pid) && (actual.Pid as number) > 0
      && actual.OOMKilled === false && actual.Error === "", "AGENT_RUNNING_UNCONFIRMED");
  }
  return id;
}

/** Only the controller's disposable canary, through three known drive-bridge spellings. */
export function syntheticCanaryPaths(hostFile: string): string[] {
  requireProbe(/^[a-z]:\\/i.test(hostFile) && win32.basename(hostFile) === "denied.txt", "AGENT_CANARY_PATH_INVALID");
  const drive = hostFile[0].toLowerCase();
  const tail = hostFile.slice(3).replaceAll("\\", "/");
  requireProbe(!/[\x00-\x1f\x7f]/.test(tail) && tail.split("/").every((part) => part && part !== "." && part !== ".."), "AGENT_CANARY_PATH_INVALID");
  return [`/mnt/${drive}/${tail}`, `/run/desktop/mnt/host/${drive}/${tail}`, `/host_mnt/${drive}/${tail}`];
}

export function buildAgentPacket(runtime: SyntheticCopyFile[], snapshot: unknown, nonce: string, deniedPaths: string[]): Buffer {
  fixtureCommand(nonce);
  const admitted = validateSyntheticSnapshot(snapshot);
  requireProbe(runtime.length === 383 && deniedPaths.length === 3
    && deniedPaths.every((path) => path.startsWith("/") && path.endsWith("/denied.txt") && path.length < 1024), "AGENT_PACKET_INVALID");
  const seen = new Set<string>();
  for (const file of runtime) {
    validateRuntimePath(file.path);
    requireProbe(!seen.has(file.path.toLowerCase()) && (file.path === "fixture.mjs" || file.path.startsWith("node_modules/")), "AGENT_RUNTIME_PATH_DENIED");
    seen.add(file.path.toLowerCase());
    requireProbe(Number.isSafeInteger(file.bytes) && file.bytes > 0 && file.bytes <= 5 * 1024 * 1024
      && typeof file.base64 === "string" && file.base64.length <= 7 * 1024 * 1024, "AGENT_RUNTIME_TOO_LARGE");
    const bytes = Buffer.from(file.base64, "base64");
    requireProbe(bytes.length === file.bytes && bytes.toString("base64") === file.base64 && copyHash(bytes) === file.sha256, "AGENT_RUNTIME_PIN_MISMATCH");
  }
  requireProbe(seen.has("fixture.mjs"), "AGENT_PACKET_INVALID");
  const packet = Buffer.from(JSON.stringify({ version: 1, nonce, runtime, snapshot: admitted, deniedPaths }));
  requireProbe(packet.length <= MAX_AGENT_PACKET_BYTES, "AGENT_PACKET_TOO_LARGE");
  return packet;
}

// Input goes over bounded Docker exec stdin, never command-line base64, a bind
// mount, docker cp/extract, or a host file API. No guest process runs project code
// until the full packet has been checked and materialized as fresh regular files.
export const AGENT_BOOTSTRAP = String.raw`
const fs=require('node:fs');const crypto=require('node:crypto');const path=require('node:path');
const requireOK=x=>{if(!x)throw Error('AGENT_PACKET_INVALID')};
const keys=(o,n)=>requireOK(o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).length===n.length&&n.every(k=>Object.hasOwn(o,k)));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
(async()=>{
  requireOK(process.platform==='linux'&&process.getuid()===1000&&process.cwd()==='/workspace');
  let total=0;const chunks=[];const timer=setTimeout(()=>process.exit(1),10000);
  try{for await(const chunk of process.stdin){total+=chunk.length;requireOK(total<=16777216);chunks.push(chunk)}}finally{clearTimeout(timer)}
  const data=Buffer.concat(chunks);requireOK(hash(data)===process.argv[1]);
  const p=JSON.parse(data);keys(p,['version','nonce','runtime','snapshot','deniedPaths']);
  requireOK(p.version===1&&p.nonce===process.argv[2]&&/^[a-f0-9]{32}$/.test(p.nonce)&&Array.isArray(p.runtime)&&p.runtime.length===383);
  keys(p.snapshot,['version','kind','files']);
  requireOK(p.snapshot.version===1&&p.snapshot.kind==='phi-synthetic-snapshot'&&Array.isArray(p.snapshot.files)&&p.snapshot.files.length===3);
  requireOK(Array.isArray(p.deniedPaths)&&p.deniedPaths.length===3&&p.deniedPaths.every(s=>typeof s==='string'&&s.startsWith('/')&&s.endsWith('/denied.txt')&&s.length<1024&&!/[\x00-\x1f\x7f]/.test(s)&&s.split('/').every(x=>x!=='.'&&x!=='..')));
  const decode=(file)=>{keys(file,['path','bytes','sha256','base64']);requireOK(Number.isSafeInteger(file.bytes)&&file.bytes>=0&&file.bytes<=5242880&&typeof file.base64==='string'&&file.base64.length<=7340032);
    const b=Buffer.from(file.base64,'base64');requireOK(b.length===file.bytes&&b.toString('base64')===file.base64&&hash(b)===file.sha256);return b};
  const safe=s=>typeof s==='string'&&s.length<=240&&s.split('/').every(x=>/^[a-zA-Z0-9_@.-]+$/.test(x)&&x!=='.'&&x!=='..'&&!x.endsWith('.'));
  const seen=new Set();
  const runtime=p.runtime.map(f=>{requireOK(safe(f.path)&&(f.path==='fixture.mjs'||f.path.startsWith('node_modules/'))&&!seen.has(f.path.toLowerCase()));seen.add(f.path.toLowerCase());return [f.path,decode(f)]});
  requireOK(seen.has('fixture.mjs'));
  const allowed=['README.md','package.json','src/index.js'];const shared=new Set();let bytes=0;
  const workspace=p.snapshot.files.map(f=>{requireOK(allowed.includes(f.path)&&!shared.has(f.path));shared.add(f.path);const b=decode(f);bytes+=b.length;requireOK(b.length<=16384&&bytes<=32768);return[f.path,b]});
  requireOK(fs.readdirSync('/workspace').length===0&&!fs.existsSync('/home/node/runtime'));
  fs.mkdirSync('/home/node/runtime',{mode:0o700});
  const put=(root,files)=>{for(const [name,b] of files){const target=path.join(root,name);fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o700});fs.writeFileSync(target,b,{flag:'wx',mode:0o600})}};
  put('/home/node/runtime',runtime);put('/workspace',workspace);
  fs.writeFileSync('/home/node/runtime/input.json',JSON.stringify({nonce:p.nonce,deniedPaths:p.deniedPaths,files:p.snapshot.files.map(({path,sha256})=>({path,sha256}))}),{flag:'wx',mode:0o600});
  await import('file:///home/node/runtime/fixture.mjs');
})().catch(()=>{process.stdout.write('{"error":"AGENT_BOOTSTRAP_FAILED"}\n');process.exitCode=1});
`;

export const VERIFY_AGENT_EFFECTS = String.raw`
const fs=require('node:fs');
const first=JSON.parse(fs.readFileSync('/workspace/detached.json','utf8'));
setTimeout(()=>{try{
 const second=JSON.parse(fs.readFileSync('/workspace/detached.json','utf8'));
 process.kill(second.pid,0);
 const ok=second.pid===first.pid&&second.tick>first.tick
  &&fs.readFileSync('/workspace/result.txt','utf8')==='PHI_WRITE_OK\n'
  &&fs.readFileSync('/workspace/src/index.js','utf8').includes('edited fixture')
  &&['.env','.git','.pi','AGENTS.md','SYSTEM.md','node_modules'].every(x=>!fs.existsSync('/workspace/'+x));
 process.stdout.write(JSON.stringify({verified:ok}));process.exitCode=ok?0:1;
}catch{process.exitCode=1}},350);
`;
export function inspectAgentResult(value: unknown, nonce: string): void {
  const result = object(value);
  const checks = object(result.checks);
  requireProbe(Object.keys(result).sort().join(",") === "checks,nonce,version" && result.version === 1 && result.nonce === nonce
    && Object.keys(checks).length === AGENT_CHECK_IDS.length && AGENT_CHECK_IDS.every((id) => checks[id] === true), "AGENT_GUEST_CHECK_FAILED");
}
