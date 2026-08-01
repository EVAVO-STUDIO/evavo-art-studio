import { AUTOMATIC_SPRITE_WORKFLOW_PROTOCOL_VERSION } from "./automatic-types.js";

export function automaticSpriteWorkflowProtocolSummary() {
  return {
    schemaVersion: "1.0" as const,
    protocolVersion: AUTOMATIC_SPRITE_WORKFLOW_PROTOCOL_VERSION,
    purpose:
      "Expand one verified art-direction contract and complete sprite-production plan into bounded provider, target-size mastering, deterministic selection, compare-and-swap promotion and complete family-verification tasks.",
    productionRules: [
      "Every authored direction receives an approved direction master before clip frames.",
      "Every clip key pose depends on the approved direction master.",
      "Every in-between frame depends on approved previous and next key poses.",
      "Every provider task produces exactly one candidate; ranking compares two to eight independently retained candidates.",
      "Provider source canvases are chroma-mastered and deterministically resized to the exact sprite dimensions before selection.",
      "Every selected candidate is promoted through an immutable selection record and a fresh compare-and-swap reference.",
      "Every selected frame and retained visible layer is reconstructed and verified as one complete family before release evidence.",
    ],
    supportedLayerRules: [
      "identity-core is always produced per authored frame.",
      "Separate visible costume, hair, shadow, equipment, weapon, effect and emission layers require approved role-specific reference artifacts.",
      "Engine sidecars, guides, runtime rigs and unsupported visible roles remain explicitly deferred rather than silently omitted.",
      "Automatic family verification retains explicit z-order, blend mode, registration tolerance and occlusion relationships.",
    ],
    failClosedRules: [
      "The art-direction contract is rehashed and must match the sprite plan binding exactly.",
      "Derived mirrored directions are blocked until a deterministic geometry-preserving mirror worker is available or every direction is authored.",
      "Existing named-reference generations are not overwritten; revisions use the existing repair and compare-and-swap workflow.",
      "Missing required layer references, unsupported family roles, missing neighbour key poses, task ceilings and non-transparent targets block compilation.",
      "Ambiguous deterministic selection or promotion becomes supervisor review-required rather than accepting the highest score blindly.",
    ],
    taskKinds: [
      "art.candidate.generate",
      "art.candidate.master-alpha",
      "art.candidate.select",
      "art.candidate.promote",
      "sprite.family.verify",
      "art.sprite-production.supervise",
    ],
    executionBoundary:
      "Validation and compilation never call a provider. Explicit CLI submission or an authenticated runtime operation starts the durable supervisor. Provider credentials remain on provider workers and no quality threshold is relaxed by the compiler.",
  };
}
