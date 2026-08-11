import { freeze } from "./layered-production-internal.js";
import {
  LAYERED_GODOT_PLAN_KIND,
  LAYERED_GODOT_PROTOCOL_VERSION,
  LAYERED_GODOT_REQUEST_KIND,
} from "./layered-production-godot-types.js";

export { compileLayeredGodotIntegrationPlan } from "./layered-production-godot-compiler.js";
export { verifyLayeredGodotIntegrationPlan } from "./layered-production-godot-verification.js";

export function layeredGodotIntegrationProtocolSummary() {
  return freeze({
    schemaVersion: "1.0" as const,
    protocolVersion: LAYERED_GODOT_PROTOCOL_VERSION,
    requestKind: LAYERED_GODOT_REQUEST_KIND,
    planKind: LAYERED_GODOT_PLAN_KIND,
    engine: "Godot 4.6.2" as const,
    rules: freeze([
      "verify the exact production plan and layered assembly manifest before compiling any Godot integration draft",
      "retain every approved or candidate source PNG as its own Texture2D external resource",
      "compile SpriteFrames from exact ordered animation units, FPS, loop state, source hashes and target paths",
      "place Y-sorted actors at their declared ground-contact origin and offset only the visual",
      "emit route, placement, destination, camera, animation and import policy resources as deterministic data",
      "use format=3 TSCN, nearest CanvasItem filtering, lossless textures, disabled mipmaps and integer positions",
      "hash every exact output byte and expose bounded write intents without executing them",
      "keep style-proof assemblies review-only and require an explicit repository writer plus separate runtime activation",
    ]),
    authority: freeze({
      artifactRead: false as const,
      fileWrite: false as const,
      targetRepositoryMutation: false as const,
      runtimeActivation: false as const,
      deployment: false as const,
      gitCommit: false as const,
      gitPush: false as const,
      publication: false as const,
    }),
  });
}
