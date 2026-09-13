import { probeFileAcl } from "./acl-probe.ts";
const USAGE = `Usage: ${process.platform === "win32" ? "npm.cmd" : "npm"} run guard:probe-acl -- --confirm [--json]\n`;
export async function runAclCli(args: readonly string[], io: { out(text: string): void; error(text: string): void }): Promise<number> {
  if (args.length === 1 && args[0] === "--help") {
    io.out(USAGE + "Opt-in Windows FILE-ONLY ACL experiment. Creates two synthetic temp files with creation-time DACLs; uses current-user SID locally without output; same-user reader positive/denial controls. No existing ACL changes, ACL repair, identity switching, pipe listener, process kill, Docker/pi or real project. NOT production privacy or cross-user isolation. Read plan/Windows-File-ACL-Prototype.md first.\n"); return 0;
  }
  if (!args.includes("--confirm") || args.some(arg => !["--confirm", "--json"].includes(arg)) || new Set(args).size !== args.length) { io.error(USAGE); return 64; }
  const controller = new AbortController(); const cancel = () => controller.abort();
  const timer = setTimeout(cancel, 45000); process.on("SIGINT", cancel); process.on("SIGTERM", cancel);
  try {
    const report = await probeFileAcl(controller.signal);
    io.out(args.includes("--json") ? JSON.stringify(report, null, 2) + "\n"
      : `File ACL fixture: ${report.probe}; ${report.checks.length} checks. Guard LOCKED / NOT active; production privacy NOT proven.\nStage: ${report.stage}; worker cleanup: ${report.workerCleanup}; temp cleanup: ${report.hostCleanup}\nFixture: ${report.fixtureName ?? "none"}\n${report.rule ?? ""}${report.failedCheck ? " / " + report.failedCheck : ""}\n`);
    return report.probe === "passed" ? 0 : report.probe === "blocked" ? 2 : 1;
  } finally { clearTimeout(timer); process.off("SIGINT", cancel); process.off("SIGTERM", cancel); }
}
if (import.meta.main) process.exitCode = await runAclCli(process.argv.slice(2), {
  out: text => { process.stdout.write(text); }, error: text => { process.stderr.write(text); },
});
