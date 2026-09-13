// Declarative Docker integration review for the uncooperative guest experiment.
// No command is executed here; callers must supply their own separately reviewed
// runner. This module is not a launch authorization or recovery adapter.
import { createAgentFixtureArgs } from "./agent-spec.ts";
import { TMPFS, PROBE_LABEL } from "./docker-spec.ts";
import { planUncooperativeController, type ControllerCommand } from "./uncooperative-controller.ts";

export const UNCOOPERATIVE_PROFILE = Object.freeze({
  user: "1000:1000", workingDir: "/workspace", network: "none", ipc: "private", pid: "private",
  readOnly: true, privileged: false, capDrop: "ALL", noNewPrivileges: true, restart: "no",
  autoRemove: false, mounts: 0, devices: 0, ports: 0, healthcheck: "none", memory: 512 * 1024 * 1024,
  pidsLimit: 64, tmpfs: Object.freeze({ ...TMPFS }),
});
export interface DockerIntegrationStep {
  readonly name: "create" | "inspect-created" | "start" | "inspect-running" | "guest" | "abort" | "verify" | "stop" | "wait" | "inspect-stopped" | "remove";
  readonly args: readonly string[];
  readonly cancellable: boolean;
  readonly ownershipRequired: boolean;
}
export class UncooperativeDockerIntegrationError extends Error {
  readonly rule = "UNCOOPERATIVE_DOCKER_INTEGRATION_INVALID";
  constructor() { super("UNCOOPERATIVE_DOCKER_INTEGRATION_INVALID"); }
}
function checkId(id: string): void { if (!/^[a-f0-9]{64}$/.test(id)) throw new UncooperativeDockerIntegrationError(); }
function step(name: DockerIntegrationStep["name"], args: readonly string[], cancellable: boolean): DockerIntegrationStep {
  if (args.length === 0 || args.length > 64 || args.some(a => typeof a !== "string" || /\0/.test(a))) throw new UncooperativeDockerIntegrationError();
  return { name, args: [...args], cancellable, ownershipRequired: name !== "create" };
}
export function planUncooperativeDockerIntegration(imageId: string, nonce: string, containerId: string): readonly DockerIntegrationStep[] {
  if (!/^sha256:[a-f0-9]{64}$/.test(imageId) || !/^[a-f0-9]{32}$/.test(nonce)) throw new UncooperativeDockerIntegrationError();
  checkId(containerId);
  const create = createAgentFixtureArgs(imageId, nonce);
  const controller = planUncooperativeController(nonce, containerId);
  return [
    step("create", create, true),
    step("inspect-created", ["container", "inspect", "--format", "{{json .}}", containerId], true),
    step("start", ["container", "start", containerId], true),
    step("inspect-running", ["container", "inspect", "--format", "{{json .}}", containerId], true),
    ...controller.slice(0, 3).map(c => step(c.step as "guest" | "abort" | "verify", c.args, c.cancellable)),
    ...controller.slice(3).map(c => step(c.step === "inspect" ? "inspect-stopped" : c.step, c.args, false)),
  ];
}
export function validateUncooperativeDockerPlan(steps: readonly DockerIntegrationStep[], imageId: string, nonce: string, containerId: string): void {
  const expected = planUncooperativeDockerIntegration(imageId, nonce, containerId);
  if (steps.length !== expected.length || steps.some((s, i) => s.name !== expected[i].name || s.cancellable !== expected[i].cancellable
    || s.ownershipRequired !== expected[i].ownershipRequired || s.args.join("\u0001") !== expected[i].args.join("\u0001")))
    throw new UncooperativeDockerIntegrationError();
  if (steps.some(s => s.args.some(a => a.includes("--privileged") || a.includes("--network=host") || a.includes("--pid=host") || a.includes("--volume") || a.includes("--mount"))))
    throw new UncooperativeDockerIntegrationError();
  if (!steps[0].args.includes("--label") || !steps[0].args.includes(`${PROBE_LABEL}=${nonce}`) || !steps[0].args.includes(imageId)) throw new UncooperativeDockerIntegrationError();
  if (steps.slice(1).some(s => !s.ownershipRequired || !s.args.includes(containerId))) throw new UncooperativeDockerIntegrationError();
}
export function validateUncooperativeCleanup(steps: readonly DockerIntegrationStep[]): void {
  const cleanup = steps.filter(s => ["stop", "wait", "inspect-stopped", "remove"].includes(s.name));
  if (cleanup.length !== 4 || cleanup.some(s => s.cancellable || !s.ownershipRequired)) throw new UncooperativeDockerIntegrationError();
  const ids = cleanup.map(s => s.args.find(a => /^[a-f0-9]{64}$/.test(a)));
  if (ids.some(id => id === undefined) || new Set(ids).size !== 1) throw new UncooperativeDockerIntegrationError();
  if (cleanup.some(s => s.name === "remove" && !s.args.includes("--force"))) throw new UncooperativeDockerIntegrationError();
}
