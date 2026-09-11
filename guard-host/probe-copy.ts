import { probeSyntheticCopy, type SyntheticCopyReport } from "./synthetic-copy.ts";

const USAGE = `Usage: ${process.platform === "win32" ? "npm.cmd" : "npm"} run guard:probe-copy -- --confirm [--json]\n`;
interface CopyProbeIO { out(text: string): void; error(text: string): void }

export async function runCopyProbeCli(
  args: readonly string[], io: CopyProbeIO,
  probe: () => Promise<SyntheticCopyReport> = probeSyntheticCopy,
): Promise<number> {
  if (args.length === 1 && args[0] === "--help") {
    io.out(USAGE + "Offline synthetic-copy fixture in a disposable host temp directory. No project path is accepted.\nNever launches pi, runs copied code, starts Docker, downloads, reads real credentials, or applies changes to a project.\nThis is NOT isolation/admission acceptance. Guard stays Locked. See plan/Synthetic-Copy-Prototype.md.\n");
    return 0;
  }
  if (!args.includes("--confirm") || args.length !== new Set(args).size
    || args.some((arg) => arg !== "--confirm" && arg !== "--json")) {
    io.error(USAGE);
    return 64;
  }
  try {
    const report = await probe();
    io.out(args.includes("--json") ? JSON.stringify(report, null, 2) + "\n" : [
      `Synthetic copy fixture: ${report.probe.toUpperCase()}`,
      "Guard remains LOCKED / protection NOT active. No pi runtime was launched.",
      `Stage: ${report.stage}; cleanup: ${report.cleanup}; checks: ${report.checks.length}`,
      ...(report.rule ? [`Rule: ${report.rule}`] : []),
      "This does not prove production admission, containment, or NTFS race safety.", "",
    ].join("\n"));
    return report.probe === "passed" && report.cleanup === "removed" ? 0 : 1;
  } catch {
    io.error(args.includes("--json")
      ? JSON.stringify({ version: 1, state: "locked", protection: "not-active", canLaunch: false, rule: "COPY_FIXTURE_FAILED" }) + "\n"
      : "COPY_FIXTURE_FAILED: Guard protection is NOT active.\n");
    return 1;
  }
}

if (import.meta.main) {
  process.exitCode = await runCopyProbeCli(process.argv.slice(2), {
    out: (text) => { process.stdout.write(text); },
    error: (text) => { process.stderr.write(text); },
  });
}
