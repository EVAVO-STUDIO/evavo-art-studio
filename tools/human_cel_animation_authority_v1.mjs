#!/usr/bin/env node

import { createHash } from "node:crypto";

export const HUMAN_CEL_AUTHORITY_PROTOCOL_VERSION = "2026-09-09.5";
export const HUMAN_CEL_AUTHORITY_KIND = "evavo.human-cel-animation-authority.v1";
export const HUMAN_CEL_CRAFT_AUTHORITY_ID = "evavo-human-cel-craft-v1";
export const HUMAN_CEL_ALLOWED_MOTION_STYLES = Object.freeze([
  "limited-cel",
  "full-cel",
]);

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/;

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
  return `sha256:${createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex")}`;
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
  nonEmptyArray(performance.continuityAnchors, "HUMAN_CEL_AUTHORITY_CONTINUITY_ANCHORS_REQUIRED", 2);

  if (!Array.isArray(request.targets) || !request.targets.some((target) => target === "cel-sequence" || target === "video-sequence")) {
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
      antiGenericEnforcement: "strict",
      timingAuthenticity: "strict-cel",
      preferredPromptCompiler: "createStrictHumanCelRenderPrompt",
      requiredQualityGate: "evaluateHumanCelQualityGate",
      requiredQualityReceipt: "createHumanCelQualityReceipt",
      requiredApprovalPath: "reviewHumanCelArtefact",
      requiresExactProductionAuthority: true,
      requiresCandidateEnvelopeProvenance: true,
    },
    requiredPractices: [
      "lock identity to approved model-sheet anchors before generating or drawing motion",
      "author keys and complex-motion breakdowns before in-betweens",
      "preserve identical drawings across held exposures",
      "separate line, flat colour, shade, highlight, effects and composite evidence",
      "derive camera and composition from shot purpose, geography and continuity rather than poster staging",
      "derive shadows, highlights and reflections from named light sources and material response",
      "review adjacent drawings for anatomy, contact, prop scale, perspective, light and detail topology continuity",
      "reject duplicates, pseudo-text, repeated stamped patterns, temporal detail crawl and fake analogue degradation",
      "require deterministic finish, cinematography and environment review evidence before manual department approval",
      "create one Cel Animation Studio production authority bound to the exact work-order and direction digests before strict prompt compilation",
      "invalidate strict prompt authority whenever work order, direction, request, task or stage identity changes",
      "require every strict candidate to cite the exact strict-envelope digest in source provenance",
      "create one quality receipt bound to the exact candidate bytes and strict envelope after every complete craft review",
      "approve strict human-cel candidates only through the receipt-enforcing Cel Animation Studio artefact review path",
    ],
    prohibitedSubstitutions: [
      "one-pass anime filtering",
      "independent per-frame regeneration",
      "generic optical-flow or frame interpolation over authored timing",
      "morphing between key drawings",
      "random line jitter or global line boil",
      "random film grain or damage used to fake handmade provenance",
      "unmotivated rim light, blanket bloom or generic cyan-magenta grading",
      "generated pseudo-lettering",
      "using the convenience or base render compiler to satisfy a strict human-cel-authored production claim",
      "approving a strict human-cel candidate through the generic artefact review path without a current quality receipt",
    ],
    qualityGates: [
      "exact human-cel production authority binding",
      "strict human-cel render prompt envelope integrity",
      "candidate provenance contains the exact strict-envelope digest",
      "human cel craft prompt inspection",
      "shot-language and composition inspection",
      "source-based lighting and cel-shadow inspection",
      "X-sheet exposure and hold inspection",
      "frame-pair drawing continuity inspection",
      "anti-generic artifact inspection",
      "line paint lighting and matte finish inspection",
      "cinematography geography and camera inspection",
      "functional environment and detail hierarchy inspection",
      "manual department approval before promotion",
      "exact candidate-byte-bound zero-blocker quality receipt",
      "strict receipt-enforcing artefact approval",
    ],
    handoff: {
      targetRepository: "EVAVO-STUDIO/cel-animation-studio",
      package: "@evavo/cel-core",
      minimumPackageVersion: "0.35.0",
      requiredExports: [
        "createHumanCelProductionAuthority",
        "assertHumanCelProductionAuthorityBinding",
        "createStrictHumanCelRenderPrompt",
        "assertStrictHumanCelRenderPromptIntegrity",
        "createHumanCelShotLanguageDirective",
        "createHumanCelLightingDirective",
        "createHumanCelTimingDirective",
        "createHumanCelEnvironmentStagingDirective",
        "evaluateHumanCelDrawingContinuity",
        "evaluateHumanCelAntiGenericReview",
        "evaluateHumanCelFinishReview",
        "evaluateHumanCelCinematographyReview",
        "evaluateHumanCelEnvironmentReview",
        "evaluateHumanCelQualityGate",
        "createHumanCelQualityReceipt",
        "assertHumanCelQualityReceiptBinding",
        "reviewHumanCelArtefact",
      ],
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
    authority.authority?.preferredPromptCompiler !== "createStrictHumanCelRenderPrompt" ||
    authority.authority?.requiredQualityGate !== "evaluateHumanCelQualityGate" ||
    authority.authority?.requiredQualityReceipt !== "createHumanCelQualityReceipt" ||
    authority.authority?.requiredApprovalPath !== "reviewHumanCelArtefact" ||
    authority.authority?.requiresExactProductionAuthority !== true ||
    authority.authority?.requiresCandidateEnvelopeProvenance !== true
  ) {
    fail("HUMAN_CEL_AUTHORITY_CRAFT_BINDING_INVALID");
  }
  if (authority.handoff?.targetRepository !== "EVAVO-STUDIO/cel-animation-studio") {
    fail("HUMAN_CEL_AUTHORITY_HANDOFF_INVALID");
  }
  if (authority.handoff?.minimumPackageVersion !== "0.35.0") {
    fail("HUMAN_CEL_AUTHORITY_CORE_VERSION_INVALID");
  }
  for (const required of [
    "createHumanCelQualityReceipt",
    "assertHumanCelQualityReceiptBinding",
    "reviewHumanCelArtefact",
  ]) {
    if (!authority.handoff?.requiredExports?.includes(required)) {
      fail("HUMAN_CEL_AUTHORITY_PROMOTION_EXPORT_MISSING", required);
    }
  }
  if (authority.boundary?.providerExecutionIncluded !== false || authority.boundary?.creativeApprovalIncluded !== false) {
    fail("HUMAN_CEL_AUTHORITY_BOUNDARY_INVALID");
  }
  const expected = sha256(humanCelAuthorityDigestInput(authority));
  if (authority.contentDigest !== expected) fail("HUMAN_CEL_AUTHORITY_DIGEST_MISMATCH");
  if (authority.authorityId !== `human_cel_authority_${expected.slice(-24)}`) {
    fail("HUMAN_CEL_AUTHORITY_IDENTITY_MISMATCH");
  }
  return true;
}
