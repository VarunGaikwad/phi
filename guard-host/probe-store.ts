import { probeSyntheticStore } from "./store-probe.ts";
const USAGE = `Usage: ${process.platform === "win32" ? "npm.cmd" : "npm"} run guard:probe-store -- --confirm [--json]\n`;
export async function runStoreCli(args: readonly string[], io: { out(text: string): void; error(text: string): void }): Promise<number> {
  if (args.length === 1 && args[0] === "--help") {
    io.out(USAGE + "Windows-only disposable synthetic journal / FAKE-engine experiment. Uses fixed system PowerShell and disposable fixture files, holds exclusive file handles, injects write/flush failures and force-kills ONLY its own file worker at one checkpoint. No Docker, pi, credentials, real projects, downloads, host apply or settings changes. NOT durable recovery or Guard acceptance. Read plan/Windows-Store-Prototype.md first.\n"); return 0;
  }
  if (!args.includes("--confirm") || args.some(arg => !["--confirm", "--json"].includes(arg)) || new Set(args).size !== args.length) { io.error(USAGE); return 64; }
  const controller = new AbortController(); const cancel = () => controller.abort();
  const timer = setTimeout(cancel, 90_000);
  process.on("SIGINT", cancel); process.on("SIGTERM", cancel);
  try {
    const report = await probeSyntheticStore(controller.signal);
    io.out(args.includes("--json") ? JSON.stringify(report, null, 2) + "\n"
      : `Synthetic store fixture: ${report.probe}; ${report.checks.length} checks. Guard LOCKED / NOT active; durability NOT proven.\nWorker cleanup: ${report.workerCleanup}; temp cleanup: ${report.hostCleanup}\nFixtures: ${report.fixtureNames.join(", ") || "none"}\n${report.rule ?? ""}\n`);
    return report.probe === "passed" ? 0 : report.probe === "blocked" ? 2 : 1;
  } finally { clearTimeout(timer); process.off("SIGINT", cancel); process.off("SIGTERM", cancel); }
}
if (import.meta.main) process.exitCode = await runStoreCli(process.argv.slice(2), {
  out: text => { process.stdout.write(text); }, error: text => { process.stderr.write(text); },
});
