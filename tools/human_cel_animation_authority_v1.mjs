#!/usr/bin/env node

import { createHash } from "node:crypto";

export const HUMAN_CEL_AUTHORITY_PROTOCOL_VERSION = "2026-09-09.10";
export const HUMAN_CEL_AUTHORITY_KIND = "evavo.human-cel-animation-authority.v1";
export const HUMAN_CEL_CRAFT_AUTHORITY_ID = "evavo-human-cel-craft-v1";
export const HUMAN_CEL_ALLOWED_MOTION_STYLES = Object.freeze([
  "limited-cel",
  "full-cel",
]);

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/;
const REQUIRED_EXPORTS = Object.freeze([
  "createHumanCelProductionAuthority",
  "assertHumanCelProductionAuthorityBinding",
  "createStrictHumanCelRenderPrompt",
  "assertStrictHumanCelRenderPromptIntegrity",
  "createHumanCelShotLanguageDirective",
  "createHumanCelLightingDirective",
  "createHumanCelColourPaintDirective",
  "createHumanCelCleanupInkDirective",
  "createHumanCelTimingDirective",
  "createHumanCelPerformanceDirective",
  "createHumanCelEnvironmentStagingDirective",
  "createHumanCelCompositingDirective",
  "evaluateHumanCelDrawingContinuity",
  "evaluateHumanCelAntiGenericReview",
  "evaluateHumanCelFinishReview",
  "evaluateHumanCelColourReview",
  "evaluateHumanCelCompositeReview",
  "evaluateHumanCelCinematographyReview",
  "evaluateHumanCelPerformanceReview",
  "evaluateHumanCelEnvironmentReview",
  "evaluateHumanCelQualityGate",
  "createHumanCelQualityReceipt",
  "assertHumanCelQualityReceiptBinding",
  "reviewHumanCelArtefact",
]);

function fail(code, detail) {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  }
  return value;
}

function sha256(value) {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex")}`;
}

function object(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  return value;
}

function nonBlank(value, code) {
  if (typeof value !== "string" || !value.trim()) fail(code);
  return value.trim();
}

function safeId(value, code) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) fail(code);
  return value;
}

function nonEmptyArray(value, code, minimum = 1) {
  if (!Array.isArray(value) || value.length < minimum) fail(code);
  return value;
}

function validateAnimationRequest(request) {
  object(request, "HUMAN_CEL_AUTHORITY_REQUEST_INVALID");
  safeId(request.id, "HUMAN_CEL_AUTHORITY_REQUEST_ID_INVALID");
  if (!Number.isSafeInteger(request.revision) || request.revision < 1) {
    fail("HUMAN_CEL_AUTHORITY_REQUEST_REVISION_INVALID");
  }

  const style = object(request.style, "HUMAN_CEL_AUTHORITY_STYLE_INVALID");
  if (!HUMAN_CEL_ALLOWED_MOTION_STYLES.includes(style.motionStyle)) {
    fail("HUMAN_CEL_AUTHORITY_CEL_MOTION_STYLE_REQUIRED", style.motionStyle);
  }
  nonBlank(style.lineTreatment, "HUMAN_CEL_AUTHORITY_LINE_TREATMENT_REQUIRED");
  nonEmptyArray(style.shapeLanguage, "HUMAN_CEL_AUTHORITY_SHAPE_LANGUAGE_REQUIRED", 2);
  nonEmptyArray(style.antiGenericTraits, "HUMAN_CEL_AUTHORITY_ANTI_GENERIC_TRAITS_REQUIRED", 3);
  nonEmptyArray(style.exclusions, "HUMAN_CEL_AUTHORITY_EXCLUSIONS_REQUIRED", 3);

  const subject = object(request.subject, "HUMAN_CEL_AUTHORITY_SUBJECT_INVALID");
  safeId(subject.subjectId, "HUMAN_CEL_AUTHORITY_SUBJECT_ID_INVALID");
  safeId(subject.identityLockId, "HUMAN_CEL_AUTHORITY_IDENTITY_LOCK_INVALID");
  nonEmptyArray(subject.silhouetteAnchors, "HUMAN_CEL_AUTHORITY_SILHOUETTE_ANCHORS_REQUIRED", 2);
  nonEmptyArray(subject.costumeAnchors, "HUMAN_CEL_AUTHORITY_COSTUME_ANCHORS_REQUIRED", 1);
  nonBlank(subject.anatomyRule, "HUMAN_CEL_AUTHORITY_ANATOMY_RULE_REQUIRED");

  const camera = object(request.camera, "HUMAN_CEL_AUTHORITY_CAMERA_INVALID");
  safeId(camera.profileId, "HUMAN_CEL_AUTHORITY_CAMERA_PROFILE_INVALID");
  if (!["locked", "authored"].includes(camera.motion)) {
    fail("HUMAN_CEL_AUTHORITY_CAMERA_MOTION_INVALID");
  }
  nonBlank(camera.framing, "HUMAN_CEL_AUTHORITY_CAMERA_FRAMING_REQUIRED");

  const performance = object(request.performance, "HUMAN_CEL_AUTHORITY_PERFORMANCE_INVALID");
  nonBlank(performance.intent, "HUMAN_CEL_AUTHORITY_PERFORMANCE_INTENT_REQUIRED");
  nonBlank(performance.weight, "HUMAN_CEL_AUTHORITY_PERFORMANCE_WEIGHT_REQUIRED");
  nonBlank(performance.tempo, "HUMAN_CEL_AUTHORITY_PERFORMANCE_TEMPO_REQUIRED");
  nonEmptyArray(
    performance.continuityAnchors,
    "HUMAN_CEL_AUTHORITY_CONTINUITY_ANCHORS_REQUIRED",
    2,
  );

  if (
    !Array.isArray(request.targets) ||
    !request.targets.some(
      (target) => target === "cel-sequence" || target === "video-sequence",
    )
  ) {
    fail("HUMAN_CEL_AUTHORITY_CEL_OR_VIDEO_TARGET_REQUIRED");
  }
}

export function humanCelAuthorityDigestInput(authority) {
  return {
    protocolVersion: authority.protocolVersion,
    kind: authority.kind,
    request: authority.request,
    authority: authority.authority,
    requiredPractices: authority.requiredPractices,
    prohibitedSubstitutions: authority.prohibitedSubstitutions,
    qualityGates: authority.qualityGates,
    handoff: authority.handoff,
    boundary: authority.boundary,
  };
}

export function compileHumanCelAnimationAuthority(request) {
  validateAnimationRequest(request);

  const base = {
    protocolVersion: HUMAN_CEL_AUTHORITY_PROTOCOL_VERSION,
    kind: HUMAN_CEL_AUTHORITY_KIND,
    request: {
      id: request.id,
      revision: request.revision,
      subjectId: request.subject.subjectId,
      identityLockId: request.subject.identityLockId,
      cameraProfileId: request.camera.profileId,
      motionStyle: request.style.motionStyle,
      targets: [...request.targets],
    },
    authority: {
      craftAuthority: HUMAN_CEL_CRAFT_AUTHORITY_ID,
      mode: "human-cel-authored",
      draftsmanshipPriority: "strict",
      cleanupInk: "strict",
      colourPaint: "strict",
      colourReview: "strict",
      antiGenericEnforcement: "strict",
      timingAuthenticity: "strict-cel",
      performanceActing: "strict",
      opticalCompositing: "strict",
      compositeReview: "strict",
      preferredPromptCompiler: "createStrictHumanCelRenderPrompt",
      requiredQualityGate: "evaluateHumanCelQualityGate",
      requiredQualityReceipt: "createHumanCelQualityReceipt",
      canonicalApprovalHelper: "reviewHumanCelArtefact",
      requiredPersistenceGate: "strict-human-cel-promotion-receipt-gate",
      requiredPersistedStateIntegrity: "canonical-snapshot-render-job-integrity",
      requiredStandaloneEvidenceStoreIntegrity:
        "integrity-aware-strict-envelope-and-quality-receipt-defaults",
      requiresExactProductionAuthority: true,
      requiresCandidateEnvelopeProvenance: true,
      requiresPersistencePromotionGate: true,
      requiresPersistedStateIntegrity: true,
      requiresStandaloneEvidenceStoreIntegrity: true,
    },
    requiredPractices: [
      "lock identity to approved model-sheet anchors before generating or drawing motion",
      "author keys and complex-motion breakdowns before in-betweens",
      "preserve identical drawings across held exposures",
      "clean from construction with intentional contour hierarchy, closed paint regions and stable held ink rather than auto-tracing generated noise",
      "author local colour, palette roles, cel-shadow families and material-specific highlights before grading or optical treatment",
      "run dedicated colour-script review for local colour, palette, grade, shadow, material and dialogue-paint stability",
      "derive camera and composition from shot purpose, geography and continuity rather than poster staging",
      "derive shadows, highlights and reflections from named light sources and material response",
      "author gaze, thought, blink, mouth, facial construction and held-body acting as deliberate substitutions rather than continuous idle motion",
      "composite registered production layers and allow optical effects only when source, depth and authored duration justify them",
      "run dedicated optical-composite review for registration, mattes, interpolation, bloom, weather depth, held-frame noise and authored discontinuities",
      "require deterministic finish, colour, composite, cinematography, performance and environment evidence before manual approval",
      "bind strict production to one exact Cel Animation Studio work-order and direction chain",
      "require every strict candidate to cite the exact strict-envelope digest in source provenance",
      "create one quality receipt bound to the exact candidate bytes and strict envelope after complete craft review",
      "require the public Cel Store to recompute canonical snapshot and render-job state before trusting strict promotion evidence",
      "require standalone strict-envelope and quality-receipt stores to default to the same canonical snapshot/render-job integrity rather than a weaker base Store",
      "use reviewHumanCelArtefact as the canonical strict review helper while Store persistence independently rechecks strict evidence",
    ],
    prohibitedSubstitutions: [
      "one-pass anime filtering",
      "independent per-frame regeneration",
      "generic optical-flow or frame interpolation over authored timing",
      "morphing between key drawings",
      "auto-traced vector-uniform cleanup or random line wobble used to fake hand drawing",
      "blanket blue-night wash black-multiply-everything shadow generic teal-orange grading universal rim light or universal gloss substituted for colour scripting",
      "skipping dedicated colour-script review because the final image looks attractive",
      "constant idle body bob timer-like blinking or mouth flapping used as generic life motion",
      "blanket bloom full-frame weather overlays motion blur interpolation or fake film VHS damage substituted for registered optical compositing",
      "skipping dedicated optical-composite review because the final render looks cinematic",
      "generated pseudo-lettering",
      "using the convenience or base render compiler to satisfy a strict human-cel-authored production claim",
      "persisting a strict approved candidate without a current zero-blocker candidate-byte quality receipt",
      "trusting hand-edited render-job or snapshot state because digest strings merely look valid",
      "constructing standalone strict-envelope or quality-receipt stores with weaker default state validation",
    ],
    qualityGates: [
      "exact human-cel production authority binding",
      "strict human-cel render prompt envelope integrity",
      "candidate provenance contains the exact strict-envelope digest",
      "canonical persisted production-snapshot integrity",
      "canonical persisted render-job integrity and revision-one lifecycle admission",
      "integrity-aware standalone strict evidence Store defaults",
      "construction-first cleanup and stable ink inspection",
      "palette-role local-colour cel-shadow and material-highlight inspection",
      "dedicated colour-script review",
      "shot-language and composition inspection",
      "source-based lighting and cel-shadow inspection",
      "X-sheet exposure and hold inspection",
      "authored acting gaze blink facial construction and mouth-substitution inspection",
      "registered optical compositing and source-motivated effects inspection",
      "dedicated optical-composite review",
      "frame-pair drawing continuity inspection",
      "anti-generic artifact inspection",
      "line paint lighting and matte finish inspection",
      "cinematography geography and camera inspection",
      "functional environment and detail hierarchy inspection",
      "manual department approval before promotion",
      "exact candidate-byte-bound zero-blocker quality receipt",
      "Studio Store strict human-cel persistence promotion gate",
    ],
    handoff: {
      targetRepository: "EVAVO-STUDIO/cel-animation-studio",
      package: "@evavo/cel-core",
      minimumPackageVersion: "0.39.0",
      contractsPackage: "@evavo/cel-contracts",
      minimumContractsPackageVersion: "0.15.0",
      storePackage: "@evavo/cel-store",
      minimumStorePackageVersion: "0.28.0",
      requiredStoreBehavior: "strict-human-cel-promotion-receipt-gate",
      requiredStoreIntegrity: "canonical-snapshot-render-job-integrity",
      requiredStandaloneEvidenceStoreIntegrity:
        "integrity-aware-strict-envelope-and-quality-receipt-defaults",
      requiredExports: [...REQUIRED_EXPORTS],
    },
    boundary: {
      providerExecutionIncluded: false,
      creativeApprovalIncluded: false,
      repositoryMutationIncluded: false,
      publicationIncluded: false,
    },
  };

  const contentDigest = sha256(base);
  return {
    ...base,
    authorityId: `human_cel_authority_${contentDigest.slice(-24)}`,
    contentDigest,
  };
}

export function assertHumanCelAnimationAuthorityIntegrity(authority) {
  object(authority, "HUMAN_CEL_AUTHORITY_INVALID");
  if (authority.protocolVersion !== HUMAN_CEL_AUTHORITY_PROTOCOL_VERSION) {
    fail("HUMAN_CEL_AUTHORITY_PROTOCOL_INVALID");
  }
  if (authority.kind !== HUMAN_CEL_AUTHORITY_KIND) {
    fail("HUMAN_CEL_AUTHORITY_KIND_INVALID");
  }
  safeId(authority.authorityId, "HUMAN_CEL_AUTHORITY_ID_INVALID");

  if (
    authority.authority?.craftAuthority !== HUMAN_CEL_CRAFT_AUTHORITY_ID ||
    authority.authority?.mode !== "human-cel-authored" ||
    authority.authority?.cleanupInk !== "strict" ||
    authority.authority?.colourPaint !== "strict" ||
    authority.authority?.colourReview !== "strict" ||
    authority.authority?.performanceActing !== "strict" ||
    authority.authority?.opticalCompositing !== "strict" ||
    authority.authority?.compositeReview !== "strict" ||
    authority.authority?.preferredPromptCompiler !== "createStrictHumanCelRenderPrompt" ||
    authority.authority?.requiredQualityGate !== "evaluateHumanCelQualityGate" ||
    authority.authority?.requiredQualityReceipt !== "createHumanCelQualityReceipt" ||
    authority.authority?.canonicalApprovalHelper !== "reviewHumanCelArtefact" ||
    authority.authority?.requiredPersistenceGate !== "strict-human-cel-promotion-receipt-gate" ||
    authority.authority?.requiredPersistedStateIntegrity !== "canonical-snapshot-render-job-integrity" ||
    authority.authority?.requiredStandaloneEvidenceStoreIntegrity !==
      "integrity-aware-strict-envelope-and-quality-receipt-defaults" ||
    authority.authority?.requiresExactProductionAuthority !== true ||
    authority.authority?.requiresCandidateEnvelopeProvenance !== true ||
    authority.authority?.requiresPersistencePromotionGate !== true ||
    authority.authority?.requiresPersistedStateIntegrity !== true ||
    authority.authority?.requiresStandaloneEvidenceStoreIntegrity !== true
  ) {
    fail("HUMAN_CEL_AUTHORITY_CRAFT_BINDING_INVALID");
  }

  if (authority.handoff?.targetRepository !== "EVAVO-STUDIO/cel-animation-studio") {
    fail("HUMAN_CEL_AUTHORITY_HANDOFF_INVALID");
  }
  if (authority.handoff?.minimumPackageVersion !== "0.39.0") {
    fail("HUMAN_CEL_AUTHORITY_CORE_VERSION_INVALID");
  }
  if (
    authority.handoff?.contractsPackage !== "@evavo/cel-contracts" ||
    authority.handoff?.minimumContractsPackageVersion !== "0.15.0"
  ) {
    fail("HUMAN_CEL_AUTHORITY_CONTRACTS_VERSION_INVALID");
  }
  if (
    authority.handoff?.storePackage !== "@evavo/cel-store" ||
    authority.handoff?.minimumStorePackageVersion !== "0.28.0" ||
    authority.handoff?.requiredStoreBehavior !== "strict-human-cel-promotion-receipt-gate" ||
    authority.handoff?.requiredStoreIntegrity !== "canonical-snapshot-render-job-integrity" ||
    authority.handoff?.requiredStandaloneEvidenceStoreIntegrity !==
      "integrity-aware-strict-envelope-and-quality-receipt-defaults"
  ) {
    fail("HUMAN_CEL_AUTHORITY_STORE_GATE_INVALID");
  }
  for (const required of REQUIRED_EXPORTS) {
    if (!authority.handoff?.requiredExports?.includes(required)) {
      fail("HUMAN_CEL_AUTHORITY_PROMOTION_EXPORT_MISSING", required);
    }
  }
  if (
    authority.boundary?.providerExecutionIncluded !== false ||
    authority.boundary?.creativeApprovalIncluded !== false ||
    authority.boundary?.repositoryMutationIncluded !== false ||
    authority.boundary?.publicationIncluded !== false
  ) {
    fail("HUMAN_CEL_AUTHORITY_BOUNDARY_INVALID");
  }

  const expected = sha256(humanCelAuthorityDigestInput(authority));
  if (authority.contentDigest !== expected) {
    fail("HUMAN_CEL_AUTHORITY_DIGEST_MISMATCH");
  }
  if (authority.authorityId !== `human_cel_authority_${expected.slice(-24)}`) {
    fail("HUMAN_CEL_AUTHORITY_IDENTITY_MISMATCH");
  }
  return true;
}
