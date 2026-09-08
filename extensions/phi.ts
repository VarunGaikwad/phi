import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerPhiMode } from "./phi/mode.ts";
import { registerPhiReadGuard } from "./phi/guard.ts";
import { registerPhiTui } from "./phi/tui.ts";

export default function phi(pi: ExtensionAPI) {
  const modeController = registerPhiMode(pi);
  registerPhiReadGuard(pi);
  registerPhiTui(pi, modeController);
}
