import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { ModifiedFile, PhiState } from "./state.ts";

type FileMark = { status: ModifiedFile["status"]; path: string; hash: string };

function normalizeStatus(raw: string): ModifiedFile["status"] {
  if (raw.includes("R")) return "R";
  if (raw.includes("D")) return "D";
  if (raw.includes("A") || raw === "??") return "A";
  if (raw.includes("M")) return "M";
  return "?";
}

function cleanGitPath(path: string): string {
  const renamed = path.includes(" -> ") ? path.slice(path.lastIndexOf(" -> ") + 4) : path;
  return renamed.replace(/^"|"$/g, "");
}

async function hashPath(path: string): Promise<string> {
  try {
    const data = await readFile(path);
    return createHash("sha256").update(data).digest("hex");
  } catch {
    return "<missing>";
  }
}

export class SessionFileTracker {
  private baseline = new Map<string, FileMark>();
  private directBaseline = new Map<string, string>();
  private touched = new Set<string>();
  private disposed = false;
  private generation = 0;

  constructor(private pi: ExtensionAPI, private cwd: string, private state: PhiState) {}

  async initialize(): Promise<void> {
    const initial = await this.gitSnapshot();
    this.baseline = new Map(initial.files.map(file => [file.path, file]));
    this.state.update({ branch: initial.branch, files: [] });
  }

  async notePath(rawPath: unknown): Promise<void> {
    if (typeof rawPath !== "string" || !rawPath) return;
    const absolute = isAbsolute(rawPath) ? rawPath : resolve(this.cwd, rawPath.replace(/^@/, ""));
    const display = relative(this.cwd, absolute) || rawPath;
    if (!this.directBaseline.has(display)) this.directBaseline.set(display, await hashPath(absolute));
    this.touched.add(display);
  }

  async refresh(): Promise<void> {
    if (this.disposed) return;
    const run = ++this.generation;
    const current = await this.gitSnapshot();
    if (this.disposed || run !== this.generation) return;

    const changed = new Map<string, ModifiedFile>();
    for (const file of current.files) {
      const before = this.baseline.get(file.path);
      if (!before || before.hash !== file.hash || before.status !== file.status) {
        changed.set(file.path, { path: file.path, status: file.status });
      }
    }

    for (const path of this.touched) {
      if (changed.has(path)) continue;
      const absolute = resolve(this.cwd, path);
      const before = this.directBaseline.get(path) ?? "<missing>";
      const now = await hashPath(absolute);
      if (now !== before) changed.set(path, { path, status: before === "<missing>" ? "A" : now === "<missing>" ? "D" : "M" });
    }

    this.state.update({
      branch: current.branch,
      files: [...changed.values()].sort((a, b) => a.path.localeCompare(b.path)),
    });
  }

  dispose(): void {
    this.disposed = true;
    this.generation++;
  }

  private async gitSnapshot(): Promise<{ branch?: string; files: FileMark[] }> {
    const [status, branch] = await Promise.all([
      this.pi.exec("git", ["status", "--porcelain=v1", "--untracked-files=normal"], { cwd: this.cwd, timeout: 5_000 }),
      this.pi.exec("git", ["branch", "--show-current"], { cwd: this.cwd, timeout: 5_000 }),
    ]);
    if (status.code !== 0) return { files: [] };
    const marks: FileMark[] = [];
    for (const line of status.stdout.split(/\r?\n/)) {
      if (line.length < 4) continue;
      const code = line.slice(0, 2);
      const path = cleanGitPath(line.slice(3));
      marks.push({ status: normalizeStatus(code), path, hash: await hashPath(resolve(this.cwd, path)) });
    }
    return { branch: branch.code === 0 ? branch.stdout.trim() || undefined : undefined, files: marks };
  }
}
