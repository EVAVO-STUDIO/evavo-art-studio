import { AUTOMATIC_SPRITE_FINALIZATION_PROTOCOL_VERSION } from "./automatic-finalization-types.js";

export function automaticSpriteFinalizationProtocolSummary() {
  return {
    schemaVersion: "1.0" as const,
    protocolVersion: AUTOMATIC_SPRITE_FINALIZATION_PROTOCOL_VERSION,
    purpose:
      "Compile a complete sprite-production workflow that chooses a governed provider background, rejects fake transparency, binds optional 3D rig and direction references, applies bounded deterministic pixel repair, derives only planner-approved mirror-safe directions, proves every selected source over hostile backgrounds, verifies the complete family, and emits release-ready evidence.",
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
    adaptiveRepairRules: [
      "Ordinary mastering writes a tolerant pre-adaptive source so diagnostic evidence is retained even when quality gates fail.",
      "Fully transparent RGB and matte-contaminated partial-alpha edge RGB receive at most the configured bounded deterministic repair passes.",
      "The repair kernel preserves visible opaque pixels, alpha, silhouette, canvas, pivots, timing, identity, and style locks.",
      "Missing alpha, fake checkerboards, baked mattes, crop failures, and pipeline geometry drift are never painted over by the local repair kernel.",
      "Unresolved failures emit an immutable machine-readable repair plan and stop for provider repair or named review without lowering thresholds.",
    ],
    mirrorRules: [
      "Only directions already marked safely derived by the sprite plan may enter deterministic horizontal reflection.",
      "The exact selected authored master is reflected only after adaptive finalization, selection and immutable promotion evidence.",
      "The worker preserves canvas size, alpha and transparent RGB and performs no trim or resampling.",
      "Readable text, labels, glyphs and logos must be prohibited because horizontal reflection reverses them.",
      "Even- and odd-width canvases use the centred integer pivot floor(width/2).",
      "Double reflection must reconstruct the exact source RGBA bytes, and the complete family worker repeats that proof independently.",
      "Derived masters remain connected through bounded ancestry to the selected authored source and its adaptive hostile-background proof.",
      "A family horizontal-mirror proof artifact is mandatory for release whenever derived directions exist.",
    ],
    proofRules: [
      "Every adaptive candidate emits a PNG proof sheet over black, white, grey, green, magenta, and any additional declared hostile backgrounds.",
      "Every selected family source must retain immutable lineage to a passed adaptive candidate and its passed proof artifact.",
      "The family verifier emits separate adaptive and horizontal-mirror proof evidence when both boundaries apply.",
      "Adaptive and deterministic-mirror family proof evidence are required release roles, not optional diagnostic output.",
    ],
    threeDBridgeRules: [
      "3D references are bound by repository, exact revision hash, and immutable artifact IDs rather than by mutable filesystem paths.",
      "Pre-rendered 2.5D work requires a render-rig artifact, camera manifest, and full authored direction coverage.",
      "Direction renders are provider pose controls; depth renders are depth controls; materials remain material references.",
      "The bridge defaults to EVAVO-STUDIO/evavo-3d-studio but does not depend on unfinished internal implementation details.",
    ],
    finalizationRules: [
      "Every candidate is resized and optimized from the mastered source before deterministic selection.",
      "Every declared 3D artifact must pass descriptor and content verification.",
      "Complete family verification remains mandatory and cannot be replaced by a strong individual-frame score.",
      "Release evidence is emitted only when all blocking frame, layer, family, transparency, adaptive-proof, mirror-proof and provenance gates pass.",
      "Task and tick budgets are recalculated after adaptive and deterministic mirror jobs are inserted so the workflow cannot outgrow its declared limits silently.",
    ],
    executionBoundary:
      "REST and MCP validate and compile only. Explicit CLI or authenticated runtime submission starts the durable supervisor. Provider credentials remain worker-only, and finalization does not deploy or mutate unrelated repositories.",
  };
}
