// Pure model for workspace/policy drift fencing. No filesystem, guest, Docker or
// authorization operation is performed; decisions are non-executable evidence.
export interface ScopeAuthority { readonly workspace: string; readonly policyEpoch: number; readonly tokenEpoch: number; readonly admittedPaths: readonly string[]; readonly fenced: boolean; }
export interface ScopeRequest { readonly workspace: string; readonly policyEpoch: number; readonly tokenEpoch: number; readonly path: string; }
export class PolicyScopeModelError extends Error { readonly rule = "POLICY_SCOPE_MODEL_INVALID"; constructor() { super("POLICY_SCOPE_MODEL_INVALID"); } }
function pathOk(path: string): boolean { return /^[a-zA-Z0-9_./-]{1,128}$/.test(path) && !path.split("/").some(p => p === ".." || p === ""); }
function valid(a: ScopeAuthority): void { if (!/^workspace-[a-f0-9]{8}$/.test(a.workspace) || !Number.isSafeInteger(a.policyEpoch) || a.policyEpoch < 0 || !Number.isSafeInteger(a.tokenEpoch) || a.tokenEpoch < 0 || a.admittedPaths.length > 16 || a.admittedPaths.some(p => !pathOk(p)) || a.fenced && a.admittedPaths.length !== 0) throw new PolicyScopeModelError(); }
export function createScopeAuthority(workspace = "workspace-00000000"): ScopeAuthority { const a = { workspace, policyEpoch: 0, tokenEpoch: 0, admittedPaths: ["README.md", "src/index.js"], fenced: false } as ScopeAuthority; valid(a); return a; }
export function requestFor(a: ScopeAuthority, path: string): ScopeRequest { if (a.fenced || !a.admittedPaths.includes(path) || !pathOk(path)) throw new PolicyScopeModelError(); return { workspace: a.workspace, policyEpoch: a.policyEpoch, tokenEpoch: a.tokenEpoch, path }; }
export function acceptRequest(a: ScopeAuthority, r: ScopeRequest): void { if (!r || typeof r !== "object" || Object.keys(r).sort().join(",") !== "path,policyEpoch,tokenEpoch,workspace" || a.fenced || r.workspace !== a.workspace || r.policyEpoch !== a.policyEpoch || r.tokenEpoch !== a.tokenEpoch || !a.admittedPaths.includes(r.path) || !pathOk(r.path)) throw new PolicyScopeModelError(); }
export function advancePolicy(a: ScopeAuthority, admittedPaths: readonly string[]): ScopeAuthority { const next = { ...a, policyEpoch: a.policyEpoch + 1, admittedPaths: [...admittedPaths] }; valid(next); return next; }
export function replaceWorkspace(a: ScopeAuthority, workspace: string): ScopeAuthority { const next = { ...a, workspace, tokenEpoch: a.tokenEpoch + 1, admittedPaths: [] }; valid(next); return next; }
export function fenceScope(a: ScopeAuthority): ScopeAuthority { const next = { ...a, fenced: true, admittedPaths: [] }; valid(next); return next; }
export function rotateToken(a: ScopeAuthority): ScopeAuthority { const next = { ...a, tokenEpoch: a.tokenEpoch + 1 }; valid(next); return next; }
export function validateScopeAuthority(a: ScopeAuthority): void { valid(a); }
