// Fixed Phase 0 Node-only network/IPC experiment. Never run guest code on the host.
import { createFixtureArgs, fixtureCommand, inspectFixture, object, requireProbe, DockerProbeError } from "./docker-spec.ts";

export const EGRESS_ERRORS = ["ENETUNREACH", "EHOSTUNREACH", "EACCES", "EPERM"] as const;
export const NETWORK_GUEST_CHECKS = [
  "cleanRuntime", "loopbackTcpControl", "loopbackUdpControl", "dnsResolutionControl",
  "tcpIpv4Denied", "tcpIpv6Denied", "tcpMappedIpv4Denied", "udpIpv4Denied", "udpIpv6Denied",
  "dnsUdpEgressDenied", "resolvedAddressDenied", "httpRedirectDenied", "peerTcpDenied", "peerUdpDenied",
  "peerUnixDenied", "peerSharedMemoryAbsent", "privilegedBridgesAbsent",
] as const;
export const NETWORK_CHECK_IDS = ["peerAliveBefore", "separateNamespaces", ...NETWORK_GUEST_CHECKS, "peerAliveAfter", "hostStop"] as const;
export const PEER_PORT = 40381;

// Kept separately for VM tests with synthetic socket objects, not host networking.
export const NETWORK_SOCKET_HELPERS = String.raw`
function tcpDenied(options,codes){return new Promise(resolve=>{
 let socket,done=false;const timer=setTimeout(()=>finish(false),1000);
 function finish(ok){if(done)return;done=true;clearTimeout(timer);if(socket)socket.destroy();resolve(ok)}
 try{socket=net.createConnection(options);socket.on('connect',()=>finish(false));socket.on('error',e=>finish(codes.includes(e.code)))}catch{finish(false)}
})}
function udpAttempt(type,host,port,payload,codes,echo){return new Promise(resolve=>{
 let socket,done=false;const timer=setTimeout(()=>finish(false),1000);
 function finish(ok){if(done)return;done=true;clearTimeout(timer);if(socket)try{socket.close()}catch{}resolve(ok)}
 try{socket=dgram.createSocket(type);socket.on('error',e=>finish(!echo&&codes.includes(e.code)));
 socket.on('message',m=>finish(echo&&m.length<=128&&m.equals(payload)));
 socket.connect(port,host,err=>{if(done)return;if(err){finish(!echo&&codes.includes(err.code));return}
  socket.send(payload,err=>{if(err)finish(!echo&&codes.includes(err.code))})});
 }catch{finish(false)}
})}
function tcpEcho(options,expected){return new Promise(resolve=>{
 let socket,done=false,data='';const timer=setTimeout(()=>finish(false),1000);
 function finish(ok){if(done)return;done=true;clearTimeout(timer);if(socket)socket.destroy();resolve(ok)}
 try{socket=net.createConnection(options);socket.on('error',()=>finish(false));socket.on('data',chunk=>{data+=chunk.toString('utf8');if(data.length>128)finish(false)});socket.on('end',()=>finish(data===expected))}catch{finish(false)}
})}
`;
const COMMON = String.raw`
const fs=require('node:fs'),net=require('node:net'),dgram=require('node:dgram'),http=require('node:http');
const nonce=process.argv[1];const requireOK=x=>{if(!x)throw Error('NETWORK_CHECK_FAILED')};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function context(){
 requireOK(/^[a-f0-9]{32}$/.test(nonce)&&process.platform==='linux'&&process.getuid()===1000&&process.getgid()===1000&&Number(process.versions.node.split('.')[0])===24&&process.cwd()==='/workspace');
 requireOK(Object.keys(process.env).sort().join(',')==='HOME,PATH,PI_CODING_AGENT_DIR,PI_CODING_AGENT_SESSION_DIR,PI_OFFLINE,TMPDIR');
 const status=fs.readFileSync('/proc/self/status','utf8');requireOK(/^NoNewPrivs:\s+1$/m.test(status)&&/^CapEff:\s+0+$/m.test(status));
 requireOK(Object.entries(require('node:os').networkInterfaces()).every(([name,entries])=>name==='lo'&&entries.every(e=>e.internal)));
 let denied=false;try{fs.writeFileSync('/phi-network-root-write','synthetic')}catch(e){denied=['EROFS','EACCES','EPERM'].includes(e.code)}requireOK(denied);
}
const namespaces=()=>Object.fromEntries(['net','ipc','pid','mnt'].map(name=>[name,fs.readlinkSync('/proc/self/ns/'+name)]));
const absent=path=>{try{fs.lstatSync(path);return false}catch(e){return ['ENOENT','ENOTDIR'].includes(e.code)}};
function listen(server,options){server.on('error',()=>process.exit(1));return new Promise(resolve=>server.listen(options,resolve))}
function bind(socket,port){socket.on('error',()=>process.exit(1));return new Promise(resolve=>socket.bind(port,'127.0.0.1',resolve))}
const marker='PHI_NETWORK_'+nonce;
` + NETWORK_SOCKET_HELPERS;
const PEER_START = COMMON + `
(async()=>{context();process.on('SIGTERM',()=>{});
 const echo=s=>{s.on('error',()=>{});s.end(marker)};
 await listen(net.createServer(echo),{host:'127.0.0.1',port:${PEER_PORT}});
 const udp=dgram.createSocket('udp4');udp.on('message',(m,r)=>{if(m.length<=128)udp.send(m,r.port,r.address)});await bind(udp,${PEER_PORT});
 await listen(net.createServer(echo),{path:'/workspace/peer.sock'});
 fs.writeFileSync('/dev/shm/phi-network-peer',nonce,{flag:'wx'});
 fs.writeFileSync('/workspace/peer-ready',nonce,{flag:'wx'});
})().catch(()=>process.exit(1));
`;
export const NETWORK_IDLE = "process.on('SIGTERM',()=>{});setInterval(()=>{},1000);";
export const NETWORK_NAMESPACE_QUERY = COMMON + "context();process.stdout.write(JSON.stringify({version:1,nonce,namespaces:namespaces()}));";
export const NETWORK_PEER_VERIFY = COMMON + `
setTimeout(()=>process.exit(1),6000);
(async()=>{context();for(let i=0;i<30&&!fs.existsSync('/workspace/peer-ready');i++)await sleep(100);
 requireOK(fs.readFileSync('/workspace/peer-ready','utf8')===nonce&&fs.readFileSync('/dev/shm/phi-network-peer','utf8')===nonce);
 requireOK((await Promise.all([tcpEcho({host:'127.0.0.1',port:${PEER_PORT}},marker),udpAttempt('udp4','127.0.0.1',${PEER_PORT},Buffer.from(marker),[],true),tcpEcho({path:'/workspace/peer.sock'},marker)])).every(Boolean));
 process.stdout.write(JSON.stringify({version:1,nonce,healthy:true,namespaces:namespaces()}),()=>process.exit(0));
})().catch(()=>process.exit(1));
`;
export const DNS_FIXTURE_HELPERS = String.raw`
const question=Buffer.concat(['phi-fixture','invalid'].map(s=>Buffer.concat([Buffer.from([s.length]),Buffer.from(s)])).concat([Buffer.from([0,0,1,0,1])]));
const dnsQuery=Buffer.concat([Buffer.from([0x50,0x48,1,0,0,1,0,0,0,0,0,0]),question]);
function dnsAnswer(m){
 if(m.length>512||m.length<12+question.length||(m.readUInt16BE(2)&0xf800)!==0||m.readUInt16BE(4)!==1||m.readUInt16BE(6)!==0||m.readUInt16BE(8)!==0||!m.subarray(12,12+question.length).equals(question))return;
 const header=Buffer.from([0,0,0x81,0x80,0,1,0,1,0,0,0,0]);m.copy(header,0,0,2);
 return Buffer.concat([header,question,Buffer.from([0xc0,0x0c,0,1,0,1,0,0,0,0,0,4,192,0,2,1])]);
}
`;
export const NETWORK_PRIMARY = COMMON + DNS_FIXTURE_HELPERS + `
const deniedCodes=${JSON.stringify(EGRESS_ERRORS)};
const target='http://192.0.2.1:40382/fixture';
function httpRequest(url,denial){return new Promise(resolve=>{
 let request,done=false;const timer=setTimeout(()=>finish(false),1000);
 function finish(ok){if(done)return;done=true;clearTimeout(timer);if(request)request.destroy();resolve(ok)}
 try{request=http.get(url,{agent:false},response=>{const ok=!denial&&response.statusCode===302&&response.headers.location===target;response.destroy();finish(ok)});
 request.on('error',e=>finish(denial&&deniedCodes.includes(e.code)))}catch{finish(false)}
})}
setTimeout(()=>process.exit(1),11000);
(async()=>{
 context();const checks={cleanRuntime:true};const check=(id,ok)=>{requireOK(ok===true);checks[id]=true};
 const tcp=net.createServer(s=>{s.on('error',()=>{});s.end(marker)});await listen(tcp,{host:'127.0.0.1',port:0});
 try{check('loopbackTcpControl',await tcpEcho({host:'127.0.0.1',port:tcp.address().port},marker))}finally{await new Promise(r=>tcp.close(r))}
 const udp=dgram.createSocket('udp4');udp.on('message',(m,r)=>{if(m.length<=128)udp.send(m,r.port,r.address)});await bind(udp,0);
 try{check('loopbackUdpControl',await udpAttempt('udp4','127.0.0.1',udp.address().port,Buffer.from(marker),[],true))}finally{await new Promise(r=>udp.close(r))}
 const dns=dgram.createSocket('udp4');dns.on('message',(m,r)=>{const answer=dnsAnswer(m);if(answer)dns.send(answer,r.port,r.address)});await bind(dns,0);
 const resolver=new (require('node:dns').promises.Resolver)({timeout:1000,tries:1});let resolved;
 try{resolver.setServers(['127.0.0.1:'+dns.address().port]);resolved=await resolver.resolve4('phi-fixture.invalid');check('dnsResolutionControl',resolved.length===1&&resolved[0]==='192.0.2.1')}
 finally{resolver.cancel();await new Promise(r=>dns.close(r))}
 check('tcpIpv4Denied',await tcpDenied({host:'192.0.2.1',port:40382},deniedCodes));
 check('tcpIpv6Denied',await tcpDenied({host:'2001:db8::1',port:40382},deniedCodes));
 check('tcpMappedIpv4Denied',await tcpDenied({host:'::ffff:192.0.2.1',port:40382},deniedCodes));
 check('udpIpv4Denied',await udpAttempt('udp4','192.0.2.1',40382,Buffer.from(marker),deniedCodes,false));
 check('udpIpv6Denied',await udpAttempt('udp6','2001:db8::1',40382,Buffer.from(marker),deniedCodes,false));
 check('dnsUdpEgressDenied',await udpAttempt('udp4','192.0.2.53',53,dnsQuery,deniedCodes,false));
 check('resolvedAddressDenied',await tcpDenied({host:resolved[0],port:40382},deniedCodes));
 const redirect=http.createServer((_req,res)=>{res.writeHead(302,{Location:target});res.end()});await listen(redirect,{host:'127.0.0.1',port:0});
 try{const received=await httpRequest('http://127.0.0.1:'+redirect.address().port,false);requireOK(received);check('httpRedirectDenied',await httpRequest(target,true))}
 finally{redirect.closeAllConnections();await new Promise(r=>redirect.close(r))}
 check('peerTcpDenied',await tcpDenied({host:'127.0.0.1',port:${PEER_PORT}},['ECONNREFUSED']));
 check('peerUdpDenied',await udpAttempt('udp4','127.0.0.1',${PEER_PORT},Buffer.from(marker),['ECONNREFUSED'],false));
 check('peerUnixDenied',absent('/workspace/peer.sock')&&await tcpDenied({path:'/workspace/peer.sock'},['ENOENT']));
 check('peerSharedMemoryAbsent',absent('/dev/shm/phi-network-peer'));
 check('privilegedBridgesAbsent',['/var/run/docker.sock','/run/docker.sock','/run/containerd/containerd.sock','/mnt/c','/mnt/wsl','/run/desktop','/run/host','/proc/sys/fs/binfmt_misc/WSLInterop'].every(absent));
 process.stdout.write(JSON.stringify({version:1,nonce,checks}),()=>process.exit(0));
})().catch(()=>{process.stdout.write('{"error":"NETWORK_GUEST_FAILED"}',()=>process.exit(1))});
`;

export type NetworkRole = "primary" | "peer";
export function networkCommand(role: NetworkRole, nonce: string): string[] {
  requireProbe(role === "primary" || role === "peer", "NETWORK_ROLE_INVALID");
  const command = fixtureCommand(nonce);
  command[command.length - 2] = role === "primary" ? NETWORK_IDLE : PEER_START;
  return command;
}
export function createNetworkArgs(role: NetworkRole, imageId: string, nonce: string): string[] {
  return [...createFixtureArgs(imageId, nonce).slice(0, -fixtureCommand(nonce).length), ...networkCommand(role, nonce)];
}
export function inspectNetwork(value: unknown, role: NetworkRole, nonce: string, imageId: string, state: "created" | "running"): string {
  const id = inspectFixture(value, nonce, imageId, networkCommand(role, nonce), state);
  if (state === "running") {
    const actual = object(object(value).State);
    requireProbe(actual.Running === true && Number.isSafeInteger(actual.Pid) && (actual.Pid as number) > 0 && actual.OOMKilled === false && actual.Error === "", "NETWORK_RUNNING_UNCONFIRMED");
  }
  return id;
}
export function networkExecArgs(id: string, nonce: string, script: string): string[] {
  requireProbe(/^[a-f0-9]{64}$/.test(id) && [NETWORK_PRIMARY, NETWORK_NAMESPACE_QUERY, NETWORK_PEER_VERIFY].includes(script), "NETWORK_COMMAND_INVALID");
  return ["container", "exec", "--workdir=/workspace", id, "/usr/bin/env", ...fixtureCommand(nonce).slice(0, -4), "/usr/local/bin/node", "-e", script, nonce];
}
export function networkJson(text: string): unknown {
  requireProbe(Buffer.byteLength(text) <= 128 * 1024, "DOCKER_RESPONSE_TOO_LARGE");
  try { return JSON.parse(text); } catch { throw new DockerProbeError("NETWORK_INVALID_JSON"); }
}
export function inspectNetworkResult(value: unknown, nonce: string): void {
  const result = object(value), checks = object(result.checks);
  requireProbe(Object.keys(result).sort().join(",") === "checks,nonce,version" && result.version === 1 && result.nonce === nonce
    && Object.keys(checks).length === NETWORK_GUEST_CHECKS.length && NETWORK_GUEST_CHECKS.every(id => checks[id] === true), "NETWORK_GUEST_CHECK_FAILED");
}
export function inspectNamespaces(value: unknown, nonce: string, peer = false): Record<string, string> {
  const result = object(value), ns = object(result.namespaces);
  requireProbe(Object.keys(result).sort().join(",") === (peer ? "healthy,namespaces,nonce,version" : "namespaces,nonce,version")
    && result.version === 1 && result.nonce === nonce && (!peer || result.healthy === true), "NETWORK_PEER_UNCONFIRMED");
  requireProbe(Object.keys(ns).sort().join(",") === "ipc,mnt,net,pid" && Object.entries(ns).every(([key, v]) => typeof v === "string"
    && new RegExp(`^${key}:\\[[0-9]{1,20}\\]$`).test(v)), "NETWORK_NAMESPACE_INVALID");
  return ns as Record<string, string>;
}
