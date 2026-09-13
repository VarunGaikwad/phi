// Phase 0 worker-loss primitive. No pi import, host project data or production launcher.
import { createFixtureArgs, fixtureCommand, inspectFixture, object, requireProbe } from "./docker-spec.ts";

const HEARTBEAT = String.raw`
const fs=require('node:fs');
function beat(name,nonce){
 if(process.platform!=='linux'||process.getuid()!==1000||process.getgid()!==1000||Number(process.versions.node.split('.')[0])!==24)throw Error('DENIED');
 if(Object.keys(process.env).sort().join(',')!=='HOME,PATH,PI_CODING_AGENT_DIR,PI_CODING_AGENT_SESSION_DIR,PI_OFFLINE,TMPDIR')throw Error('DENIED');
 const status=fs.readFileSync('/proc/self/status','utf8');
 if(!/^NoNewPrivs:\s+1$/m.test(status)||!/^CapEff:\s+0+$/m.test(status))throw Error('DENIED');
 let denied=false;try{fs.writeFileSync('/phi-recovery-root-write','synthetic')}catch(e){denied=['EROFS','EACCES','EPERM'].includes(e.code)}
 if(!denied||['/var/run/docker.sock','/mnt/c','/run/desktop','/mnt/wsl'].some(p=>fs.existsSync(p)))throw Error('DENIED');
 if(!Object.entries(require('node:os').networkInterfaces()).every(([n,es])=>n==='lo'&&es.every(e=>e.internal)))throw Error('DENIED');
 process.on('SIGTERM',()=>{});let tick=0;
 const write=()=>{const target='/workspace/'+name+'.json';fs.writeFileSync(target+'.tmp',JSON.stringify({nonce,pid:process.pid,tick:++tick}));fs.renameSync(target+'.tmp',target)};
 write();setInterval(write,100);
}
`;
export const RECOVERY_NODE = HEARTBEAT + `
beat('parent',process.argv[1]);
const child=require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(HEARTBEAT + "beat('child',process.argv[1]);")},process.argv[1]],{detached:true,stdio:'ignore',env:process.env});
child.on('error',()=>process.exit(1));child.unref();
`;
export function recoveryCommand(nonce: string): string[] {
  const command = fixtureCommand(nonce);
  command[command.length - 2] = RECOVERY_NODE;
  return command;
}
export function createRecoveryArgs(imageId: string, nonce: string): string[] {
  return [...createFixtureArgs(imageId, nonce).slice(0, -fixtureCommand(nonce).length), ...recoveryCommand(nonce)];
}
export function inspectRecovery(value: unknown, nonce: string, imageId: string, state: "created" | "running"): string {
  const id = inspectFixture(value, nonce, imageId, recoveryCommand(nonce), state);
  if (state === "running") {
    const actual = object(object(value).State);
    requireProbe(actual.Running === true && Number.isSafeInteger(actual.Pid) && (actual.Pid as number) > 0
      && actual.OOMKilled === false && actual.Error === "", "RECOVERY_RUNNING_UNCONFIRMED");
  }
  return id;
}
export const VERIFY_RECOVERY = String.raw`
const fs=require('node:fs');const nonce=process.argv[1];const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const read=name=>{const p='/workspace/'+name+'.json';if(fs.statSync(p).size>256)throw Error('INVALID');const v=JSON.parse(fs.readFileSync(p,'utf8'));
  if(Object.keys(v).sort().join(',')!=='nonce,pid,tick'||v.nonce!==nonce||!Number.isSafeInteger(v.pid)||v.pid<=0||!Number.isSafeInteger(v.tick)||v.tick<=0)throw Error('INVALID');process.kill(v.pid,0);return v};
 for(let i=0;i<30&&(!fs.existsSync('/workspace/parent.json')||!fs.existsSync('/workspace/child.json'));i++)await sleep(100);
 const first=[read('parent'),read('child')];await sleep(350);const second=[read('parent'),read('child')];
 const advanced=i=>first[i].pid===second[i].pid&&second[i].tick>first[i].tick;
 if(first[0].pid===first[1].pid||!advanced(0)||!advanced(1))throw Error('INVALID');
 process.stdout.write(JSON.stringify({version:1,nonce,parentAdvanced:true,childAdvanced:true}));
})().catch(()=>{process.exitCode=1});
`;
export function heartbeatArgs(id: string, nonce: string): string[] {
  requireProbe(/^[a-f0-9]{64}$/.test(id), "DOCKER_CONTAINER_ID_INVALID");
  return ["container", "exec", "--workdir=/workspace", id, "/usr/bin/env", ...fixtureCommand(nonce).slice(0, -4),
    "/usr/local/bin/node", "-e", VERIFY_RECOVERY, nonce];
}
export function recoveryJson(text: string): unknown {
  requireProbe(Buffer.byteLength(text) <= 128 * 1024, "DOCKER_RESPONSE_TOO_LARGE");
  try { return JSON.parse(text); } catch { throw new Error("RECOVERY_INVALID_JSON"); }
}
export function checkHeartbeat(value: unknown, nonce: string): void {
  const v = object(value);
  requireProbe(Object.keys(v).sort().join(",") === "childAdvanced,nonce,parentAdvanced,version"
    && v.version === 1 && v.nonce === nonce && v.parentAdvanced === true && v.childAdvanced === true, "RECOVERY_HEARTBEAT_FAILED");
}
export function checkWorkerReady(value: unknown, nonce: string, id: string): void {
  const v = object(value);
  requireProbe(Object.keys(v).sort().join(",") === "id,nonce,version" && v.version === 1 && v.nonce === nonce && v.id === id, "RECOVERY_WORKER_MESSAGE_INVALID");
}
export const RECOVERY_CHECK_IDS = ["workerStartedGuest", "guestTreeAlive", "workerForciblyExited", "guestSurvivesWorkerLoss", "supervisorStop"] as const;
