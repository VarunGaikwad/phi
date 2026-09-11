import { arch, platform, release } from "node:os";
import { discoverTooling, type ToolingObservation } from "./discovery.ts";

export interface HostObservation {
  platform: string;
  architecture: string;
  osRelease: string;
  nodeVersion: string;
}

export interface PreflightBlocker {
  id: string;
  action: string;
}

export interface GuardPreflight {
  version: 1;
  kind: "phi-guard-preflight";
  state: "locked";
  protection: "not-active";
  canLaunch: false;
  validatedBackends: readonly [];
  host: HostObservation;
  tooling: ToolingObservation;
  blockers: PreflightBlocker[];
}

/** Diagnostic facts are never containment evidence or an authorization grant. */
export function assessPreflight(host: HostObservation, tooling: ToolingObservation): GuardPreflight {
  const blockers: PreflightBlocker[] = [];
  if (host.platform !== "win32") {
    blockers.push({
      id: "G0_WINDOWS_HOST_REQUIRED",
      action: "Run Phase 0 acceptance on the intended Windows host; this host cannot validate Windows support.",
    });
  }
  if (!tooling.commands.some((tool) => tool.availability === "found")) {
    blockers.push({
      id: "G0_BACKEND_TOOLING_UNCONFIRMED",
      action: "No candidate CLI was found in the searched PATH. Confirm available VM/container tooling with the operator; do not auto-install it.",
    });
  }
  blockers.push(
    {
      id: "G0_WINDOWS_SETUP_REQUIRED",
      action: "Verify the target Windows build, runtime versions, virtualization availability, and installation/privilege constraints. Operator-reported setup is recorded in plan/Phase-0-Findings.md, not inferred from this process.",
    },
    {
      id: "G0_GUEST_TOOLCHAINS_REQUIRED",
      action: "Validate the intended project toolchains in the guest. Linux Node.js is the current prototype target; native Windows-only requirements need a different validated guest.",
    },
    {
      id: "G0_PROTECTED_POLICY_REQUIRED",
      action: "Finalize protected categories and additional private paths locally with the operator; do not share private filenames or contents with the model.",
    },
    {
      id: "G0_NO_VALIDATED_BACKEND",
      action: "The Docker Desktop/WSL2 fixture probe is implemented, but no production whole-agent PHI backend is validated. A passing fixture alone cannot authorize launch.",
    },
    {
      id: "G0_CONTAINMENT_NOT_TESTED",
      action: "Prove sanitized-copy launch, denied synthetic read/write canaries, clean environment, process/network isolation, and emergency stop with independent host checks.",
    },
    {
      id: "G0_PROVIDER_GATEWAY_NOT_TESTED",
      action: "Test the intended provider/authentication flow through a constrained gateway using fake credentials; keep real credentials outside the guest.",
    },
  );

  return {
    version: 1,
    kind: "phi-guard-preflight",
    state: "locked",
    protection: "not-active",
    canLaunch: false,
    validatedBackends: [],
    host,
    tooling,
    blockers,
  };
}

export async function collectPreflight(): Promise<GuardPreflight> {
  const host: HostObservation = {
    platform: platform(),
    architecture: arch(),
    osRelease: release(),
    nodeVersion: process.version,
  };
  // Read only PATH, never pi settings, sessions, auth files, or credential values.
  // Windows environment lookup is case-insensitive in Node's main thread.
  const tooling = await discoverTooling(host.platform, process.env.PATH);
  return assessPreflight(host, tooling);
}

function label(value: string): string {
  // OS metadata is plain diagnostic text, not terminal markup.
  return value.replace(/[^a-zA-Z0-9 ._+\-]/g, "?").slice(0, 96);
}

export function formatPreflight(report: GuardPreflight): string {
  const lines = [
    "PHI Guard preflight: LOCKED",
    "Protection is NOT active. This diagnostic does not restrict the current pi process.",
    "Protected launch is unavailable; candidate CLI presence never proves isolation.",
    "",
    `Host: ${label(report.host.platform)} ${label(report.host.architecture)} ${label(report.host.osRelease)}`,
    `Node: ${label(report.host.nodeVersion)}`,
    "",
    "Candidate tooling (PATH metadata only; nothing executed):",
    ...report.tooling.commands.map((tool) => `  ${tool.command}: ${tool.availability}`),
    `Search scope: ${report.tooling.search.directoriesChecked} absolute PATH directories; ${report.tooling.search.complete ? "complete" : "incomplete"}`,
    "No versions, daemons, virtualization features, or containment have been verified.",
    "",
    "Required before proceeding:",
    ...report.blockers.map((blocker) => `  ${blocker.id}: ${blocker.action}`),
    "",
    "Next: resolve Guard Phase 0. See plan/Execution-Order.md and plan/Phase-0-Findings.md.",
  ];
  return lines.join("\n") + "\n";
}
