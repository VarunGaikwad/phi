import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { posix, win32 } from "node:path";

// Discovery only: these are candidates to investigate, NOT supported backends.
export const CANDIDATE_COMMANDS = [
  "docker",
  "podman",
  "qemu-system-x86_64",
  "qemu-system-aarch64",
  "wsl.exe",
  "sbx",
  "openshell",
] as const;

export type CandidateCommand = (typeof CANDIDATE_COMMANDS)[number];
export type Availability = "found" | "not-found" | "unknown";
export type CandidateProbe = (path: string, platform: string) => Promise<Availability>;

export interface ToolingObservation {
  commands: Array<{ command: CandidateCommand; availability: Availability }>;
  search: { complete: boolean; directoriesChecked: number };
}

export const MAX_PATH_LENGTH = 65_536;
export const MAX_PATH_ENTRIES = 128;

/** Not a filesystem security validator. Only bounds a metadata-only PATH search. */
export function searchDirectories(platform: string, value: string | undefined) {
  const paths = platform === "win32" ? win32 : posix;
  const directories: string[] = [];
  const seen = new Set<string>();
  let complete = true;
  if (!value || value.length > MAX_PATH_LENGTH) return { directories, complete: false };

  const entries = value.split(paths.delimiter);
  if (entries.length > MAX_PATH_ENTRIES) complete = false;
  for (let entry of entries.slice(0, MAX_PATH_ENTRIES)) {
    if (platform === "win32" && entry.startsWith('"') && entry.endsWith('"')) {
      entry = entry.slice(1, -1);
    }
    // Do not search implicit cwd, relative/drive-relative paths, or UNC/device paths.
    const absolute = platform === "win32" ? /^[a-z]:[\\/]/i.test(entry) : paths.isAbsolute(entry);
    if (!absolute || /^[\\/]{2}/.test(entry) || /[\x00-\x1f\x7f-\x9f]/.test(entry)) {
      complete = false;
      continue;
    }
    if (platform === "win32" && /[:"<>|?*]/.test(entry.slice(2))) {
      complete = false;
      continue;
    }
    entry = paths.normalize(entry);
    const key = platform === "win32" ? entry.toLowerCase() : entry;
    if (!seen.has(key)) {
      seen.add(key);
      directories.push(entry);
    }
  }
  return { directories, complete };
}

async function probeCandidate(path: string, platform: string): Promise<Availability> {
  try {
    // Following an executable symlink for metadata is OK for discovery. Never open
    // content or execute it. This deliberately establishes no trust in the target.
    if (!(await stat(path)).isFile()) return "not-found";
    await access(path, platform === "win32" ? constants.F_OK : constants.X_OK);
    return "found";
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === "ENOENT" || code === "ENOTDIR" ? "not-found" : "unknown";
  }
}

export async function discoverTooling(
  platform: string,
  pathValue: string | undefined,
  probe: CandidateProbe = probeCandidate,
): Promise<ToolingObservation> {
  const paths = platform === "win32" ? win32 : posix;
  const { directories, complete } = searchDirectories(platform, pathValue);
  const commands: ToolingObservation["commands"] = [];
  const visitedDirectories = new Set<string>();
  let searchComplete = complete;

  for (const command of CANDIDATE_COMMANDS) {
    const names = platform === "win32" && !command.endsWith(".exe")
      ? [command + ".exe", command + ".cmd", command + ".bat"]
      : [command];
    let availability: Availability = complete ? "not-found" : "unknown";
    search: for (const directory of directories) {
      visitedDirectories.add(directory);
      for (const name of names) {
        let result: Availability;
        try {
          result = await probe(paths.join(directory, name), platform);
        } catch {
          // Never expose errors containing host paths; incomplete discovery is not absence.
          result = "unknown";
        }
        if (result === "found") {
          availability = "found";
          break search;
        }
        if (result !== "not-found") {
          availability = "unknown";
          searchComplete = false;
        }
      }
    }
    commands.push({ command, availability });
  }

  // Host paths deliberately do not leave the discovery layer.
  return { commands, search: { complete: searchComplete, directoriesChecked: visitedDirectories.size } };
}
