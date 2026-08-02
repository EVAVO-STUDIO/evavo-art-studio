import { AUTOMATIC_SPRITE_WORKFLOW_PROTOCOL_VERSION } from "./automatic-types.js";

export function automaticSpriteWorkflowProtocolSummary() {
  return {
    schemaVersion: "1.0" as const,
    protocolVersion: AUTOMATIC_SPRITE_WORKFLOW_PROTOCOL_VERSION,
    purpose:
      "Expand one verified art-direction contract and complete sprite-production plan into bounded provider, target-size mastering, deterministic derivation, selection, compare-and-swap promotion and complete family-verification tasks.",
    productionRules: [
      "Every authored direction receives an approved direction master before clip frames.",
      "Every clip key pose depends on the approved direction master.",
      "Every authored in-between depends on approved previous and next key poses.",
      "Automatic release requires direction masters, every key pose and every runtime frame; partial frame families use a separate planning workflow.",
      "Layer frames use the selected current body frame as base-image while retaining distinct previous and next key-pose controls for in-betweens.",
      "Every provider task produces exactly one candidate; ranking compares two to eight independently retained candidates.",
      "Every provider source canvas receives deterministic target-size mastering to the exact sprite dimensions before selection.",
      "Planner-approved derived directions use an exact full-canvas RGBA reflection only after the source master is selected.",
      "Every selected or deterministically derived master retains immutable proof before complete family verification.",
      "Every selected frame and retained visible layer is reconstructed and verified as one complete family before release evidence.",
    ],
    mirrorRules: [
      "Mirroring is allowed only when the compiled plan marks the target direction as safely derived from one authored source direction.",
      "The worker reflects every RGBA pixel across the full canvas without trimming, resampling, alpha changes or hidden-RGB loss.",
      "A second reflection must reconstruct the exact source RGBA bytes.",
      "Asymmetry, held items, equipment or costume swaps, unsupported normal maps, readable text, unsafe cameras, directional lighting, historical handedness or an incorrectly centred integer pivot block derivation.",
      "Even- and odd-width canvases are supported when the pivot uses floor(width/2).",
      "Every source, derived master and mirror-evidence artifact is independently reverified by the family worker.",
      "Family-level horizontal-mirror proof is a mandatory release role whenever a derived direction is present.",
    ],
    supportedLayerRules: [
      "identity-core is always produced per authored frame.",
      "Separate visible costume, hair, shadow, equipment, weapon, effect and emission layers require approved role-specific reference artifacts.",
      "Engine sidecars, guides, runtime rigs and unsupported visible roles remain explicitly deferred rather than silently omitted.",
      "Automatic family verification retains explicit z-order, blend mode, registration tolerance and occlusion relationships.",
      "A safely derived frame mirrors every retained visible layer from the matching authored source frame.",
    ],
    failClosedRules: [
      "The art-direction contract is rehashed and must match the sprite plan binding exactly.",
      "Derived directions compile only through the deterministic geometry-preserving mirror worker; unsafe derivations remain blocked.",
      "Existing named-reference generations are not overwritten; revisions use the existing repair and compare-and-swap workflow.",
      "Missing required layer references, unsupported family roles, missing neighbour key poses, incomplete derived sources, task ceilings and incompatible targets block compilation.",
      "Ambiguous deterministic selection or promotion becomes supervisor review-required rather than accepting the highest score blindly.",
      "No mirror task may relax frame-quality, transparency, lineage or complete-family gates.",
    ],
    taskKinds: [
      "art.candidate.generate",
      "art.candidate.master-alpha",
      "art.candidate.finalize-adaptive",
      "art.candidate.select",
      "art.candidate.promote",
      "sprite.family.verify",
      "art.sprite-production.supervise",
    ],
    executionBoundary:
      "Validation and compilation never call a provider. Explicit CLI submission or an authenticated runtime operation starts the durable supervisor. Provider credentials remain on provider workers and no quality threshold is relaxed by the compiler.",
  };
}
