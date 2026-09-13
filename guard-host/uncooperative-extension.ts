// Fixed guest-only script specification. It is transferred only by a separately
// reviewed future container harness; importing this module never executes it.
export const UNCOOPERATIVE_GUEST_SCRIPT = String.raw`
const fs=require('node:fs');const path=require('node:path');
const root='/workspace';const file=name=>path.join(root,name);const put=(name,text)=>fs.writeFileSync(file(name),text,{flag:'wx'});
if(process.platform!=='linux'||process.getuid()!==1000||process.cwd()!==root)process.exit(41);
process.on('SIGTERM',()=>{});process.on('SIGINT',()=>{});
put('uncoop-before.txt','PHI_UNCOOP_BEFORE');
const child=require('node:child_process').spawn(process.execPath,['-e',
 "const fs=require('node:fs');process.on('SIGTERM',()=>{});let tick=0;setInterval(()=>fs.writeFileSync('/workspace/uncoop-child.json',JSON.stringify({pid:process.pid,tick:++tick}),{flag:'w'}),100)"],{detached:true,stdio:'ignore'});child.unref();
put('uncoop-ready.json',JSON.stringify({version:1,pid:process.pid,childPid:child.pid}));
const wait=()=>{if(fs.existsSync(file('uncoop-abort.request'))){put('uncoop-abort-ignored.txt','PHI_UNCOOP_ABORT_IGNORED');setTimeout(()=>{put('uncoop-late.txt','PHI_UNCOOP_LATE');},100);return;}setTimeout(wait,20)};wait();
`;
export const UNCOOPERATIVE_VERIFY_SCRIPT = String.raw`
const fs=require('node:fs');const path='/workspace/';
const read=name=>{const s=fs.lstatSync(path+name);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.size<=0||s.size>4096)throw Error('UNCOOP_EFFECT_INVALID');return fs.readFileSync(path+name,'utf8')};
const ready=JSON.parse(read('uncoop-ready.json'));if(ready.version!==1||!Number.isSafeInteger(ready.pid)||!Number.isSafeInteger(ready.childPid))process.exit(1);
const first=JSON.parse(read('uncoop-child.json'));if(first.pid!==ready.childPid)process.exit(1);
setTimeout(()=>{try{const second=JSON.parse(read('uncoop-child.json'));const ok=second.pid===first.pid&&second.tick>first.tick&&read('uncoop-before.txt')==='PHI_UNCOOP_BEFORE'&&read('uncoop-abort-ignored.txt')==='PHI_UNCOOP_ABORT_IGNORED'&&read('uncoop-late.txt')==='PHI_UNCOOP_LATE';process.stdout.write(JSON.stringify({version:1,verified:ok}));process.exitCode=ok?0:1}catch{process.exitCode=1}},150);
`;
export const UNCOOPERATIVE_FILES = [
  "uncoop-before.txt", "uncoop-ready.json", "uncoop-abort.request",
  "uncoop-abort-ignored.txt", "uncoop-late.txt", "uncoop-child.json",
] as const;
export function validateUncooperativeGuestScript(script: string): void {
  if (typeof script !== "string" || script !== UNCOOPERATIVE_GUEST_SCRIPT || Buffer.byteLength(script) > 8192
    || /process\.env|child_process\.exec|spawnSync|require\(['"](?:net|http|https|tls|dns|worker_threads)['"]\)/.test(script))
    throw new Error("UNCOOPERATIVE_SCRIPT_INVALID");
}
export function validateUncooperativeVerifierScript(script: string): void {
  if (typeof script !== "string" || script !== UNCOOPERATIVE_VERIFY_SCRIPT || Buffer.byteLength(script) > 8192
    || /process\.env|child_process|require\(['"](?:net|http|https|tls|dns|worker_threads)['"]\)/.test(script))
    throw new Error("UNCOOPERATIVE_VERIFIER_INVALID");
}
