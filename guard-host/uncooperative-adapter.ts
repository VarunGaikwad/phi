// Review-only adapter contract. Deliberately contains no runner, CLI or Docker call.
// An executable adapter is blocked until durable operation receipts and recovery
// cleanup are established.
import { planUncooperativeDockerIntegration, validateUncooperativeCleanup, validateUncooperativeDockerPlan, type DockerIntegrationStep } from "./uncooperative-docker-integration.ts";
export interface AdapterReview {
  readonly state: "locked"; readonly protection: "not-active"; readonly canLaunch: false;
  readonly executable: false; readonly gateway: "deferred";
  readonly executableAdapter: "blocked"; readonly reason: "operation-receipts-and-recovery-cleanup-unproven";
  readonly plan: readonly DockerIntegrationStep[];
}
export class UncooperativeAdapterReviewError extends Error {
  readonly rule = "UNCOOPERATIVE_ADAPTER_REVIEW_INVALID";
  constructor() { super("UNCOOPERATIVE_ADAPTER_REVIEW_INVALID"); }
}
export function reviewUncooperativeAdapter(imageId: string, nonce: string, containerId: string): AdapterReview {
  const plan = planUncooperativeDockerIntegration(imageId, nonce, containerId);
  validateUncooperativeDockerPlan(plan, imageId, nonce, containerId);
  validateUncooperativeCleanup(plan);
  if (plan.some(step => step.args.some(arg => /docker\.sock|--privileged|--network=host|--pid=host|prune/i.test(arg))))
    throw new UncooperativeAdapterReviewError();
  return { state: "locked", protection: "not-active", canLaunch: false, executable: false, gateway: "deferred",
    executableAdapter: "blocked", reason: "operation-receipts-and-recovery-cleanup-unproven", plan: plan.map(step => ({ ...step, args: [...step.args] })) };
}
