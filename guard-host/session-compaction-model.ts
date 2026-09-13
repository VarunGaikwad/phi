// Pure, non-executable compaction boundary model. Summaries are untrusted data.
export const MAX_SUMMARY_BYTES = 16 * 1024;
export const MAX_MESSAGES = 128;
export interface SessionBoundary { readonly sessionId: string; readonly workspace: string; readonly policyEpoch: number; readonly messages: readonly string[]; readonly summary?: string; }
export interface CompactionProposal { readonly sessionId: string; readonly workspace: string; readonly policyEpoch: number; readonly retained: readonly string[]; readonly summary: string; readonly executable: false; }
export class SessionCompactionModelError extends Error { readonly rule = "SESSION_COMPACTION_MODEL_INVALID"; constructor() { super("SESSION_COMPACTION_MODEL_INVALID"); } }
function validBoundary(s: SessionBoundary): void {
  if (!/^session-[a-f0-9]{16}$/.test(s.sessionId) || !/^workspace-[a-f0-9]{8}$/.test(s.workspace) || !Number.isSafeInteger(s.policyEpoch) || s.policyEpoch < 0
    || s.messages.length > MAX_MESSAGES || s.messages.some(m => typeof m !== "string" || Buffer.byteLength(m) > 4096)
    || s.summary !== undefined && Buffer.byteLength(s.summary) > MAX_SUMMARY_BYTES) throw new SessionCompactionModelError();
}
export function createSessionBoundary(): SessionBoundary { const s = { sessionId: "session-0000000000000000", workspace: "workspace-00000000", policyEpoch: 0, messages: ["PHI_SYNTHETIC_USER"] }; validBoundary(s); return s; }
export function proposeCompaction(s: SessionBoundary, summary: string, retain: readonly string[]): CompactionProposal {
  validBoundary(s); if (typeof summary !== "string" || Buffer.byteLength(summary) === 0 || Buffer.byteLength(summary) > MAX_SUMMARY_BYTES || retain.length > MAX_MESSAGES || retain.some(m => !s.messages.includes(m))) throw new SessionCompactionModelError();
  if (/SYNTHETIC_SECRET|credential|token|password|execute|launch|host path|docker/i.test(summary)) throw new SessionCompactionModelError();
  return { sessionId: s.sessionId, workspace: s.workspace, policyEpoch: s.policyEpoch, retained: [...retain], summary, executable: false };
}
export function acceptCompaction(s: SessionBoundary, p: CompactionProposal): SessionBoundary {
  validBoundary(s); if (!p || p.executable !== false || p.sessionId !== s.sessionId || p.workspace !== s.workspace || p.policyEpoch !== s.policyEpoch) throw new SessionCompactionModelError();
  if (p.retained.some(m => !s.messages.includes(m)) || Buffer.byteLength(p.summary) > MAX_SUMMARY_BYTES) throw new SessionCompactionModelError();
  const next = { ...s, messages: [...p.retained], summary: p.summary }; validBoundary(next); return next;
}
export function rejectStaleCompaction(s: SessionBoundary, p: CompactionProposal): void { if (p.sessionId !== s.sessionId || p.workspace !== s.workspace || p.policyEpoch !== s.policyEpoch) throw new SessionCompactionModelError(); }
export function advancePolicy(s: SessionBoundary): SessionBoundary { validBoundary(s); const next = { ...s, policyEpoch: s.policyEpoch + 1 }; validBoundary(next); return next; }
export function validateCompactionBoundary(s: SessionBoundary): void { validBoundary(s); }
