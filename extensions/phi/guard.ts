import { isAbsolute, relative, resolve, sep } from "node:path";
import type { ExtensionAPI, ExtensionContext, ToolCallEvent } from "@earendil-works/pi-coding-agent";

// These directories are almost never useful to inspect as source and can be
// enormous. Keeping this at the tool-call boundary also covers MCP/extensions
// that use Pi's native read/search tools.
const IGNORED_DIRECTORIES = new Set([
  ".git", ".hg", ".svn", "node_modules", "vendor", "dist", "build",
  "coverage", "target", ".next", ".nuxt", ".venv", "__pycache__",
  ".pytest_cache", ".mypy_cache", ".cache",
]);

const SECRET_NAMES = new Set([
  ".env", ".env.local", ".env.development", ".env.production",
  ".npmrc", ".pypirc",
]);

function pathFromInput(event: ToolCallEvent): string | undefined {
  if (event.toolName !== "read" && event.toolName !== "grep" && event.toolName !== "find") return undefined;
  const path = (event.input as { path?: unknown }).path;
  return typeof path === "string" ? path : undefined;
}

function blockedReason(rawPath: string, cwd: string): string | undefined {
  const path = rawPath.replace(/^@/, "");
  const absolute = isAbsolute(path) ? resolve(path) : resolve(cwd, path);
  const rel = relative(cwd, absolute);
  const parts = rel.split(sep).filter(Boolean).map(part => part.toLowerCase());

  if (parts.some(part => IGNORED_DIRECTORIES.has(part))) {
    return "generated, dependency, cache, or VCS files are excluded from automatic inspection";
  }

  const name = parts.at(-1) ?? "";
  if (SECRET_NAMES.has(name) || name.endsWith(".pem") || name.endsWith(".key")) {
    return "credential and private-key files are excluded from automatic inspection";
  }

  return undefined;
}

/** Prevent broad read/search calls from flooding the model context with noise. */
export function registerPhiReadGuard(pi: ExtensionAPI): void {
  pi.on("tool_call", (event, ctx: ExtensionContext) => {
    if (process.env.PHI_READ_GUARD === "off") return;
    if (event.toolName !== "read" && event.toolName !== "grep" && event.toolName !== "find") return;

    const rawPath = pathFromInput(event);
    if (!rawPath) return;
    const reason = blockedReason(rawPath, ctx.cwd);
    if (!reason) return;

    return {
      block: true,
      reason: `PHI read guard: ${reason} (${rawPath}). Set PHI_READ_GUARD=off to disable this guard.`,
    };
  });
}
