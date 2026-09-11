import { collectPreflight, formatPreflight, type GuardPreflight } from "./preflight.ts";

export const LOCKED_EXIT_CODE = 2;
export const USAGE_EXIT_CODE = 64;
const USAGE = `Usage: ${process.platform === "win32" ? "npm.cmd" : "npm"} run guard:doctor -- [--json | --help]\n`;

interface DoctorIO {
  out(text: string): void;
  error(text: string): void;
}

/** Host-side diagnostic only. There is intentionally no launch or bypass operation. */
export async function runDoctor(
  args: readonly string[],
  io: DoctorIO,
  collect: () => Promise<GuardPreflight> = collectPreflight,
): Promise<number> {
  if (args.length > 1 || (args.length === 1 && !["--json", "--help"].includes(args[0]))) {
    // Do not echo arguments: unexpected arguments can contain credentials/host paths.
    io.error(USAGE);
    return USAGE_EXIT_CODE;
  }
  if (args[0] === "--help") {
    io.out(USAGE + "Read-only setup diagnostics; never launches pi or enables protection.\nExit 2 means protected launch is unavailable.\n");
    return 0;
  }

  try {
    const report = await collect();
    io.out(args[0] === "--json" ? JSON.stringify(report, null, 2) + "\n" : formatPreflight(report));
    return LOCKED_EXIT_CODE;
  } catch {
    io.error(args[0] === "--json"
      ? JSON.stringify({ version: 1, state: "locked", canLaunch: false, error: "PHI_PREFLIGHT_FAILED" }) + "\n"
      : "PHI_PREFLIGHT_FAILED: protected launch unavailable; diagnostic collection failed.\n");
    return 1;
  }
}

if (import.meta.main) {
  process.exitCode = await runDoctor(process.argv.slice(2), {
    out: (text) => { process.stdout.write(text); },
    error: (text) => { process.stderr.write(text); },
  });
}
