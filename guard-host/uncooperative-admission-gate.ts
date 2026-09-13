// Pure admission gate for a future executable uncooperative adapter.
// CLI return values, empty scans and names are intentionally insufficient.
export const REQUIRED_RECEIPT_FACTS = ["engineIncarnation", "createReceipt", "stopReceipt", "removeReceipt", "freshStopObservation", "freshRemovalObservation", "recoveryAuthority"] as const;
export type ReceiptFact = typeof REQUIRED_RECEIPT_FACTS[number];
export interface ReceiptEvidence { readonly version: 1; readonly facts: Readonly<Record<ReceiptFact, boolean>>; readonly transportRevoked: boolean; readonly exactResourceBinding: boolean; }
export interface AdmissionResult { readonly executableAdapter: "blocked" | "eligible"; readonly state: "locked"; readonly protection: "not-active"; readonly canLaunch: false; readonly missing: readonly ReceiptFact[]; readonly reason: "backend-receipts-unproven" | "all-required-facts-present"; }
export class AdmissionGateError extends Error { readonly rule = "UNCOOPERATIVE_ADMISSION_INVALID"; constructor() { super("UNCOOPERATIVE_ADMISSION_INVALID"); } }
export function evaluateUncooperativeAdmission(evidence: unknown): AdmissionResult {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) throw new AdmissionGateError();
  const e = evidence as Record<string, unknown>; if (Object.keys(e).sort().join(",") !== "exactResourceBinding,facts,transportRevoked,version") throw new AdmissionGateError();
  if (e.version !== 1 || typeof e.transportRevoked !== "boolean" || typeof e.exactResourceBinding !== "boolean" || !e.facts || typeof e.facts !== "object" || Array.isArray(e.facts)) throw new AdmissionGateError();
  const facts = e.facts as Record<string, unknown>; if (Object.keys(facts).sort().join(",") !== [...REQUIRED_RECEIPT_FACTS].sort().join(",")) throw new AdmissionGateError();
  if (REQUIRED_RECEIPT_FACTS.some(fact => typeof facts[fact] !== "boolean")) throw new AdmissionGateError();
  const missing = REQUIRED_RECEIPT_FACTS.filter(fact => facts[fact] !== true);
  const eligible = missing.length === 0 && e.transportRevoked === true && e.exactResourceBinding === true;
  return { executableAdapter: eligible ? "eligible" : "blocked", state: "locked", protection: "not-active", canLaunch: false,
    missing: [...missing], reason: eligible ? "all-required-facts-present" : "backend-receipts-unproven" };
}
export function unprovenEvidence(): ReceiptEvidence {
  return { version: 1, facts: Object.fromEntries(REQUIRED_RECEIPT_FACTS.map(fact => [fact, false])) as Record<ReceiptFact, boolean>, transportRevoked: false, exactResourceBinding: false };
}
