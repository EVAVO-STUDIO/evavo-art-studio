import { createHash } from "node:crypto";

import {
  assertAnimationProductionProfileIntegrity,
  nextAnimationProductionBatch,
} from "./animation_production_profile_canonical_v1.mjs";

export const EVA_IDLE_REVIEWED_SOURCE_GENERATION_ADAPTER_VERSION =
  "evavo.eva-idle-reviewed-source-generation-adapter.v1";

const SHA = /^sha256:[0-9a-f]{64}$/u;
const ARTIFACT = /^artifact_[0-9a-f]{64}$/u;
const AUTHORITY = Object.freeze({
  providerExecution: false,
  localAiExecution: false,
  automaticCreativeApproval: false,
  drawingMediaAdmission: false,
  artifactPromotion: false,
  targetRepositoryMutation: false,
  gitCommit: false,
  gitPush: false,
  runtimeActivation: false,
  publication: false,
  deployment: false,
});

function fail(code, detail) {
  throw new Error(detail ? `${code}:${detail}` : code);
}
function record(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  return value;
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([, child]) => child !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => [key, canonical(child)]));
  }
  return value;
}
function digest(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex")}`;
}
function falseAuthority(value, code) {
  const authority = record(value, code);
  if (Object.values(authority).some((entry) => entry !== false)) fail(code);
}
function validBinding(value, code) {
  const binding = record(value, code);
  if (!ARTIFACT.test(binding.artifactId ?? "") || !SHA.test(binding.contentDigest ?? "") || binding.mediaType !== "image/png") fail(code);
  if (!Number.isSafeInteger(binding.width) || !Number.isSafeInteger(binding.height) || binding.width < 1 || binding.height < 1) fail(code);
  return binding;
}
function validateBridge(bridge, profile) {
  const value = record(bridge, "EVA_IDLE_GENERATION_BRIDGE_INVALID");
  if (
    value.schema !== "evavo.eva-idle-source-review-bridge.v1" ||
    value.characterId !== "eva-female" ||
    value.clipId !== "idle-primary" ||
    value.profileId !== profile.profileId ||
    value.profileDigest !== profile.contentDigest ||
    !Array.isArray(value.reviewedSources) ||
    !Array.isArray(value.referenceBindings)
  ) fail("EVA_IDLE_GENERATION_BRIDGE_INVALID");
  falseAuthority(value.authority, "EVA_IDLE_GENERATION_BRIDGE_AUTHORITY_INVALID");
  for (const binding of value.referenceBindings) validBinding(binding, "EVA_IDLE_GENERATION_REFERENCE_BINDING_INVALID");
  return value;
}
function reviewedSourceMap(bridge, drawings) {
  const known = new Set(drawings.map((drawing) => drawing.id));
  const byDrawing = new Map();
  for (const source of bridge.reviewedSources) {
    record(source, "EVA_IDLE_GENERATION_REVIEWED_SOURCE_INVALID");
    if (
      source.reviewStatus !== "sealed" || source.decision !== "keep" ||
      !ARTIFACT.test(source.artifactId ?? "") || !SHA.test(source.contentDigest ?? "") ||
      !SHA.test(source.inspectionEvidenceDigest ?? "") || source.mediaType !== "image/png" ||
      source.meaningfulAlpha !== true || !Array.isArray(source.eligibleDrawingIds)
    ) fail("EVA_IDLE_GENERATION_REVIEWED_SOURCE_INVALID", source.sourceId);
    for (const drawingId of source.eligibleDrawingIds) {
      if (!known.has(drawingId)) fail("EVA_IDLE_GENERATION_REUSED_DRAWING_UNKNOWN", drawingId);
      if (byDrawing.has(drawingId)) fail("EVA_IDLE_GENERATION_REUSED_DRAWING_AMBIGUOUS", drawingId);
      byDrawing.set(drawingId, source);
    }
  }
  return byDrawing;
}
function poseMap(profile) {
  return new Map(profile.drawings.map((drawing) => [drawing.poseId, drawing]));
}
function supplemental(bridge, drawingId) {
  const values = bridge.supplementalReferencesByDrawing?.[drawingId] ?? [];
  if (!Array.isArray(values)) fail("EVA_IDLE_GENERATION_SUPPLEMENTAL_REFERENCES_INVALID", drawingId);
  return values.map((entry) => {
    const value = validBinding(entry, "EVA_IDLE_GENERATION_SUPPLEMENTAL_REFERENCE_INVALID");
    if (typeof value.role !== "string" || !value.role || typeof value.sourceFrameId !== "string" || !value.sourceFrameId || !SHA.test(value.sourceReviewDigest ?? "")) {
      fail("EVA_IDLE_GENERATION_SUPPLEMENTAL_REFERENCE_INVALID", drawingId);
    }
    return Object.freeze({ ...value });
  });
}
function sourceBinding(source) {
  return Object.freeze({
    artifactId: source.artifactId,
    contentDigest: source.contentDigest,
    mediaType: source.mediaType,
    width: source.width,
    height: source.height,
  });
}

export function compileEvaIdleReviewedSourceGenerationState(profileValue, bridgeValue) {
  const profile = record(profileValue, "EVA_IDLE_GENERATION_PROFILE_INVALID");
  assertAnimationProductionProfileIntegrity(profile);
  if (profile.request?.subject?.subjectId !== "eva-female" || profile.request?.delivery?.animationName !== "eva-idle-primary") {
    fail("EVA_IDLE_GENERATION_PROFILE_TARGET_INVALID");
  }
  const bridge = validateBridge(bridgeValue, profile);
  const poses = poseMap(profile);
  for (const poseId of ["rest", "inhale", "exhale", "settle"]) {
    if (!poses.has(poseId)) fail("EVA_IDLE_GENERATION_POSE_MISSING", poseId);
  }
  const rest = poses.get("rest");
  const inhale = poses.get("inhale");
  const exhale = poses.get("exhale");
  const settle = poses.get("settle");
  if (rest.generationClass !== "key-pose" || exhale.generationClass !== "key-pose" || inhale.generationClass !== "breakdown" || settle.generationClass !== "breakdown") {
    fail("EVA_IDLE_GENERATION_CLASSIFICATION_DRIFT");
  }
  const reviewed = reviewedSourceMap(bridge, profile.drawings);
  const requiredReuse = [rest, exhale];
  for (const drawing of requiredReuse) {
    if (!reviewed.has(drawing.id)) fail("EVA_IDLE_GENERATION_REQUIRED_REUSE_MISSING", drawing.poseId);
  }
  if (reviewed.has(inhale.id) || reviewed.has(settle.id)) fail("EVA_IDLE_GENERATION_MISSING_POSE_ALREADY_REUSED");

  const completedDrawingIds = requiredReuse.map((drawing) => drawing.id).sort();
  const nextBatch = nextAnimationProductionBatch(profile, completedDrawingIds);
  if (!nextBatch || nextBatch.phase !== "breakdown") fail("EVA_IDLE_GENERATION_BREAKDOWN_BATCH_NOT_READY");
  const expectedPending = [inhale.id, settle.id].sort();
  if (JSON.stringify([...nextBatch.drawingIds].sort()) !== JSON.stringify(expectedPending)) {
    fail("EVA_IDLE_GENERATION_BATCH_SCOPE_INVALID");
  }
  if (!nextBatch.dependencyDrawingIds.every((drawingId) => completedDrawingIds.includes(drawingId))) {
    fail("EVA_IDLE_GENERATION_DEPENDENCY_NOT_SATISFIED");
  }

  const reusedDrawings = requiredReuse.map((drawing) => {
    const source = reviewed.get(drawing.id);
    return Object.freeze({
      drawingId: drawing.id,
      poseId: drawing.poseId,
      generationClass: drawing.generationClass,
      productionStatus: "reused-reviewed-source",
      generationRequired: false,
      reviewStillRequired: true,
      sourceId: source.sourceId,
      reviewDecisionId: source.reviewDecisionId,
      reviewDecisionDigest: source.reviewDecisionDigest,
      inspectionEvidenceDigest: source.inspectionEvidenceDigest,
      artifact: sourceBinding(source),
    });
  });
  const reusedById = new Map(reusedDrawings.map((entry) => [entry.drawingId, entry]));

  const workOrders = [inhale, settle].map((drawing) => {
    const neighbours = [drawing.previousDrawingId, drawing.nextDrawingId];
    const authoritativeNeighbours = neighbours.map((drawingId) => {
      const reused = reusedById.get(drawingId);
      if (!reused) fail("EVA_IDLE_GENERATION_AUTHORITATIVE_NEIGHBOUR_MISSING", `${drawing.poseId}:${drawingId}`);
      return Object.freeze({
        drawingId,
        poseId: profile.drawings.find((entry) => entry.id === drawingId)?.poseId,
        artifact: reused.artifact,
        inspectionEvidenceDigest: reused.inspectionEvidenceDigest,
      });
    });
    return Object.freeze({
      drawingId: drawing.id,
      poseId: drawing.poseId,
      generationClass: drawing.generationClass,
      role: drawing.role,
      poseIntent: drawing.poseIntent,
      phase: drawing.phase,
      expectedRootOffset: drawing.expectedRootOffset,
      contactAnchor: drawing.contactAnchor,
      groundContactRequired: drawing.groundContactRequired,
      previousDrawingId: drawing.previousDrawingId,
      nextDrawingId: drawing.nextDrawingId,
      dependencyDrawingIds: drawing.dependencyDrawingIds,
      maximumCandidates: nextBatch.maximumCandidatesPerDrawing,
      authoritativeNeighbours: Object.freeze(authoritativeNeighbours),
      identityReference: Object.freeze({ ...bridge.referenceBindings[0] }),
      referenceBindings: Object.freeze(bridge.referenceBindings.map((entry) => Object.freeze({ ...entry }))),
      supplementalReferences: Object.freeze(supplemental(bridge, drawing.id)),
      rules: Object.freeze({
        generateOnlyThisDrawing: true,
        preserveReviewedNeighboursExactly: true,
        preserveIdentityAndCanvasRegistration: true,
        noPixelInterpolationAsCanonicalDrawing: true,
        fullTechnicalAndSequenceReviewStillRequired: true,
      }),
    });
  });

  const body = {
    schema: EVA_IDLE_REVIEWED_SOURCE_GENERATION_ADAPTER_VERSION,
    characterId: "eva-female",
    clipId: "idle-primary",
    profileId: profile.profileId,
    profileDigest: profile.contentDigest,
    sourceReviewFinalizationSha256: bridge.sourceReviewFinalizationSha256,
    sourceReusePlanSha256: bridge.sourceReusePlanSha256,
    completedDrawingIds: Object.freeze(completedDrawingIds),
    reusedDrawings: Object.freeze(reusedDrawings),
    pendingDrawingIds: Object.freeze(expectedPending),
    nextBatch: Object.freeze({ ...nextBatch, drawingIds: Object.freeze([...nextBatch.drawingIds]) }),
    workOrders: Object.freeze(workOrders),
    rules: Object.freeze({
      reviewedReuseMeansGenerationCompleteNotCreativeApproval: true,
      reusedDrawingsMustRemainImmutable: true,
      reusedDrawingsRemainInFinalTechnicalAndSequenceReview: true,
      onlyMissingBreakdownsMayBeGenerated: true,
      dependenciesMustBeReviewedSourceArtifacts: true,
    }),
    authority: AUTHORITY,
  };
  return Object.freeze({ ...body, contentDigest: digest(body) });
}
