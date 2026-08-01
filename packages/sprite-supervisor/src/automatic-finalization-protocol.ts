import { AUTOMATIC_SPRITE_FINALIZATION_PROTOCOL_VERSION } from "./automatic-finalization-types.js";

export function automaticSpriteFinalizationProtocolSummary() {
  return {
    schemaVersion: "1.0" as const,
    protocolVersion: AUTOMATIC_SPRITE_FINALIZATION_PROTOCOL_VERSION,
    purpose:
      "Compile a complete sprite-production workflow that chooses a governed provider background, rejects fake transparency, binds optional 3D rig and direction references, finalizes every candidate at exact runtime dimensions, verifies the complete family, and emits release-ready evidence.",
    backgroundModes: [
      "auto",
      "native-alpha",
      "green-matte",
      "magenta-matte",
      "black-additive",
      "opaque-preserve",
    ],
    backgroundRules: [
      "Native alpha is allowed only for an explicitly allow-listed adapter and still requires decoded alpha proof.",
      "Auto matte selection compares green and magenta against the approved palette and chooses the lower-collision colour.",
      "Black additive mode is limited to particles, effects, decals, or emission-owned assets and must prove a predominantly black border with non-black content.",
      "Opaque preserve mode may not silently flatten a transparent candidate into a black plate.",
      "Checkerboards, transparency grids, flat mattes, halos, and unrelated RGB beneath alpha remain blocking failures.",
    ],
    threeDBridgeRules: [
      "3D references are bound by repository, exact revision hash, and immutable artifact IDs rather than by mutable filesystem paths.",
      "Pre-rendered 2.5D work requires a render-rig artifact, camera manifest, and full authored direction coverage.",
      "Direction renders are provider pose controls; depth renders are depth controls; materials remain material references.",
      "The bridge defaults to EVAVO-STUDIO/evavo-3d-studio but does not depend on unfinished internal implementation details.",
    ],
    finalizationRules: [
      "Every candidate is resized and optimized from the mastered source before deterministic selection.",
      "Every selected family source must retain lineage to a finalization-ready candidate.",
      "Every declared 3D artifact must pass descriptor and content verification.",
      "Complete family verification remains mandatory and cannot be replaced by a strong individual-frame score.",
      "Release evidence is emitted only when all blocking frame, layer, family, transparency, and provenance gates pass.",
    ],
    executionBoundary:
      "REST and MCP validate and compile only. Explicit CLI or authenticated runtime submission starts the durable supervisor. Provider credentials remain worker-only, and finalization does not deploy or mutate unrelated repositories.",
  };
}
