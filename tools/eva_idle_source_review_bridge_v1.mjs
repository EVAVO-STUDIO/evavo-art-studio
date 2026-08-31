import { createHash } from "node:crypto";

export const EVA_IDLE_SOURCE_REVIEW_BRIDGE_VERSION =
  "evavo.eva-idle-source-review-bridge.v1";
export const EVA_IDLE_SOURCE_MATERIALIZATION_REQUEST_VERSION =
  "evavo.eva-idle-source-materialization-request.v1";

const SHA = /^sha256:[0-9a-f]{64}$/u;
const RAW_SHA = /^[a-f0-9]{64}$/u;
const ARTIFACT = /^artifact_[0-9a-f]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/u;
const AUTHORITY = Object.freeze({
  providerExecution: false,
  localExecution: false,
  sourceMutation: false,
  semanticAssignment: false,
  automaticCreativeApproval: false,
  drawingMediaAdmission: false,
  artifactPromotion: false,
  targetRepositoryMutation: false,
  gitCommit: false,
  gitPush: false,
  runtimeActivation: false,
  publication: false,
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
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonical(child)]),
    );
  }
  return value;
}
function digest(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex")}`;
}
function rawDigest(value) {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}
function safeId(value, code) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) fail(code, String(value));
  return value;
}
function qualityScore(quality) {
  return Number((
    quality.identity * 0.27 +
    quality.anatomy * 0.18 +
    quality.hands * 0.18 +
    quality.alpha * 0.08 +
    quality.registration * 0.14 +
    quality.continuity * 0.15
  ).toFixed(6));
}
function verifySourceReview(value) {
  const finalization = record(value, "EVA_IDLE_BRIDGE_FINALIZATION_INVALID");
  if (
    finalization.schema !== "evavo_eva_source_reconciliation_finalization_v1" ||
    finalization.characterId !== "eva-female" ||
    typeof finalization.reviewPlanSha256 !== "string" ||
    !RAW_SHA.test(finalization.reviewPlanSha256) ||
    typeof finalization.draftSha256 !== "string" ||
    !RAW_SHA.test(finalization.draftSha256) ||
    typeof finalization.finalizationSha256 !== "string" ||
    !RAW_SHA.test(finalization.finalizationSha256)
  ) fail("EVA_IDLE_BRIDGE_FINALIZATION_INVALID");
  const reconciliation = record(finalization.reconciliation, "EVA_IDLE_BRIDGE_RECONCILIATION_INVALID");
  const expected = rawDigest({
    reviewPlanSha256: finalization.reviewPlanSha256,
    draftSha256: finalization.draftSha256,
    reconciliation,
  });
  if (expected !== finalization.finalizationSha256) {
    fail("EVA_IDLE_BRIDGE_FINALIZATION_HASH_MISMATCH");
  }
  if (
    reconciliation.schema !== "evavo_eva_source_reconciliation_v1" ||
    reconciliation.characterId !== "eva-female" ||
    !Array.isArray(reconciliation.decisions)
  ) fail("EVA_IDLE_BRIDGE_RECONCILIATION_INVALID");
  return { finalization, reconciliation };
}
function verifyReusePlan(value, finalization) {
  const plan = record(value, "EVA_IDLE_BRIDGE_REUSE_PLAN_INVALID");
  if (
    plan.schema !== "evavo_eva_source_reuse_plan_v1" ||
    plan.characterId !== "eva-female" ||
    plan.reviewPlanSha256 !== finalization.reviewPlanSha256 ||
    typeof plan.planSha256 !== "string" ||
    !RAW_SHA.test(plan.planSha256) ||
    !Array.isArray(plan.targets)
  ) fail("EVA_IDLE_BRIDGE_REUSE_PLAN_INVALID");
  const { planSha256, ...body } = plan;
  if (rawDigest(body) !== planSha256) fail("EVA_IDLE_BRIDGE_REUSE_PLAN_HASH_MISMATCH");
  const target = plan.targets.find((entry) => entry.clipId === "idle-primary");
  if (!target) fail("EVA_IDLE_BRIDGE_IDLE_TARGET_MISSING");
  return { plan, target };
}
function idleDrawings(profileEntry) {
  const entry = record(profileEntry, "EVA_IDLE_BRIDGE_PROFILE_ENTRY_INVALID");
  if (entry.clipId !== "idle-primary") fail("EVA_IDLE_BRIDGE_IDLE_PROFILE_REQUIRED");
  const profile = record(entry.plan, "EVA_IDLE_BRIDGE_PROFILE_INVALID");
  if (profile.request?.state !== "approved" || profile.quality?.promotable !== true) {
    fail("EVA_IDLE_BRIDGE_PROFILE_NOT_APPROVED");
  }
  const byPose = new Map(profile.drawings.map((drawing) => [drawing.poseId, drawing]));
  for (const poseId of ["rest", "inhale", "exhale", "settle"]) {
    if (!byPose.has(poseId)) fail("EVA_IDLE_BRIDGE_POSE_MISSING", poseId);
  }
  return { profile, byPose };
}
function usefulDecision(decision) {
  if (decision.disposition === "body-drawing") {
    return decision.roles.includes("neutral-anchor") || decision.roles.includes("idle-key");
  }
  if (["pose-reference", "regional-reference"].includes(decision.disposition)) {
    return decision.roles.some((role) => [
      "pose-reference",
      "silhouette-reference",
      "face-reference",
      "hair-reference",
      "left-hand-reference",
      "right-hand-reference",
      "costume-reference",
    ].includes(role));
  }
  return false;
}
function normalizeMaterialized(value, index) {
  const item = record(value, `EVA_IDLE_BRIDGE_MATERIALIZED_INVALID:${index}`);
  safeId(item.frameId, `EVA_IDLE_BRIDGE_FRAME_ID_INVALID:${index}`);
  if (typeof item.sourceSha256 !== "string" || !RAW_SHA.test(item.sourceSha256)) {
    fail("EVA_IDLE_BRIDGE_SOURCE_SHA_INVALID", item.frameId);
  }
  if (typeof item.artifactId !== "string" || !ARTIFACT.test(item.artifactId)) {
    fail("EVA_IDLE_BRIDGE_ARTIFACT_INVALID", item.frameId);
  }
  if (typeof item.contentDigest !== "string" || !SHA.test(item.contentDigest)) {
    fail("EVA_IDLE_BRIDGE_CONTENT_DIGEST_INVALID", item.frameId);
  }
  if (typeof item.inspectionEvidenceDigest !== "string" || !SHA.test(item.inspectionEvidenceDigest)) {
    fail("EVA_IDLE_BRIDGE_INSPECTION_DIGEST_INVALID", item.frameId);
  }
  if (item.mediaType !== "image/png" || item.meaningfulAlpha !== true) {
    fail("EVA_IDLE_BRIDGE_MEDIA_INVALID", item.frameId);
  }
  for (const key of ["byteLength", "width", "height"]) {
    if (!Number.isSafeInteger(item[key]) || item[key] < 1) {
      fail("EVA_IDLE_BRIDGE_MEDIA_METADATA_INVALID", `${item.frameId}:${key}`);
    }
  }
  return Object.freeze({ ...item });
}
function referenceBinding(source) {
  return Object.freeze({
    artifactId: source.artifactId,
    contentDigest: source.contentDigest,
    mediaType: "image/png",
    width: source.width,
    height: source.height,
  });
}
function supplementalReference(source, decision, role) {
  return Object.freeze({
    role,
    artifactId: source.artifactId,
    contentDigest: source.contentDigest,
    mediaType: "image/png",
    width: source.width,
    height: source.height,
    sourceFrameId: decision.frameId,
    sourceReviewDigest: digest({
      frameId: decision.frameId,
      sourceSha256: decision.sourceSha256,
      disposition: decision.disposition,
      roles: decision.roles,
      quality: decision.quality,
    }),
  });
}

export function compileEvaIdleSourceMaterializationRequest(input) {
  const value = record(input, "EVA_IDLE_BRIDGE_INPUT_INVALID");
  const { finalization, reconciliation } = verifySourceReview(value.sourceReviewFinalization);
  verifyReusePlan(value.reusePlan, finalization);
  const selected = reconciliation.decisions
    .filter(usefulDecision)
    .sort((a, b) => a.frameId.localeCompare(b.frameId));
  const body = {
    schema: EVA_IDLE_SOURCE_MATERIALIZATION_REQUEST_VERSION,
    characterId: "eva-female",
    clipId: "idle-primary",
    reviewPlanSha256: finalization.reviewPlanSha256,
    finalizationSha256: finalization.finalizationSha256,
    sourceFrames: Object.freeze(selected.map((decision) => Object.freeze({
      frameId: decision.frameId,
      sourceSha256: decision.sourceSha256,
      disposition: decision.disposition,
      roles: decision.roles,
      requiredOutput: Object.freeze({
        mediaType: "image/png",
        width: 1024,
        height: 1536,
        meaningfulAlpha: true,
        trim: false,
      }),
    }))),
    rules: Object.freeze({
      sourceBytesMustRemainImmutable: true,
      deterministicCopyOrPreservationFirstMasteringPreferred: true,
      sourceReviewDoesNotEqualArtifactAdmission: true,
      inspectionEvidenceRequiredPerMaterializedArtifact: true,
    }),
    authority: AUTHORITY,
  };
  return Object.freeze({ ...body, contentDigest: digest(body) });
}

export function compileEvaIdleSourceReviewBridge(input) {
  const value = record(input, "EVA_IDLE_BRIDGE_INPUT_INVALID");
  const { finalization, reconciliation } = verifySourceReview(value.sourceReviewFinalization);
  const { target } = verifyReusePlan(value.reusePlan, finalization);
  const { profile, byPose } = idleDrawings(value.profileEntry);
  if (!Array.isArray(value.materializedSources)) {
    fail("EVA_IDLE_BRIDGE_MATERIALIZED_SOURCES_INVALID");
  }
  const materialized = value.materializedSources.map(normalizeMaterialized);
  const byFrame = new Map();
  for (const item of materialized) {
    if (byFrame.has(item.frameId)) fail("EVA_IDLE_BRIDGE_MATERIALIZED_DUPLICATE", item.frameId);
    byFrame.set(item.frameId, item);
  }
  const relevant = reconciliation.decisions.filter(usefulDecision);
  for (const decision of relevant) {
    const source = byFrame.get(decision.frameId);
    if (!source || source.sourceSha256 !== decision.sourceSha256) {
      fail("EVA_IDLE_BRIDGE_MATERIALIZED_SOURCE_MISSING", decision.frameId);
    }
    if (
      source.width !== profile.request.delivery.canvas.width ||
      source.height !== profile.request.delivery.canvas.height
    ) fail("EVA_IDLE_BRIDGE_CANVAS_MISMATCH", decision.frameId);
  }

  const reviewDigest = digest({
    reviewPlanSha256: finalization.reviewPlanSha256,
    finalizationSha256: finalization.finalizationSha256,
    reusePlanSha256: value.reusePlan.planSha256,
    clipId: "idle-primary",
  });
  const bodyDecisions = relevant
    .filter((decision) => decision.disposition === "body-drawing")
    .sort((a, b) => qualityScore(b.quality) - qualityScore(a.quality) || a.frameId.localeCompare(b.frameId));
  const reviewedSources = [];
  for (const decision of bodyDecisions) {
    const source = byFrame.get(decision.frameId);
    const eligibleDrawingIds = [];
    if (decision.roles.includes("neutral-anchor")) {
      eligibleDrawingIds.push(byPose.get("rest").id);
    }
    if (decision.roles.includes("idle-key")) {
      eligibleDrawingIds.push(byPose.get("exhale").id);
    }
    if (!eligibleDrawingIds.length) continue;
    reviewedSources.push(Object.freeze({
      sourceId: `eva-reviewed-${decision.frameId}`,
      reviewDecisionId: `eva-source-review:${decision.frameId}`,
      reviewDecisionDigest: digest({ reviewDigest, decision }),
      inspectionEvidenceDigest: source.inspectionEvidenceDigest,
      artifactId: source.artifactId,
      contentDigest: source.contentDigest,
      byteLength: source.byteLength,
      mediaType: "image/png",
      width: source.width,
      height: source.height,
      meaningfulAlpha: true,
      reviewStatus: "sealed",
      decision: "keep",
      identityLockId: profile.request.subject.identityLockId,
      identityRevision: profile.request.subject.identityRevision,
      eligibleDrawingIds: Object.freeze([...new Set(eligibleDrawingIds)]),
      reusePriority: Math.round((1 - qualityScore(decision.quality)) * 1000),
    }));
  }

  const referenceDecisions = relevant
    .filter((decision) => ["pose-reference", "regional-reference"].includes(decision.disposition))
    .sort((a, b) => qualityScore(b.quality) - qualityScore(a.quality) || a.frameId.localeCompare(b.frameId));
  const unresolvedPoseMap = Object.freeze({
    inhale: byPose.get("inhale").id,
    settle: byPose.get("settle").id,
    exhale: byPose.get("exhale").id,
  });
  const supplementalByDrawing = {};
  for (const drawingId of Object.values(unresolvedPoseMap)) supplementalByDrawing[drawingId] = [];
  for (const decision of referenceDecisions) {
    const source = byFrame.get(decision.frameId);
    const role = decision.roles.includes("silhouette-reference")
      ? "reviewed-silhouette-reference"
      : decision.roles.includes("pose-reference")
        ? "reviewed-pose-reference"
        : "reviewed-regional-reference";
    const reference = supplementalReference(source, decision, role);
    for (const drawingId of Object.values(unresolvedPoseMap)) {
      supplementalByDrawing[drawingId].push(reference);
    }
  }
  for (const [drawingId, references] of Object.entries(supplementalByDrawing)) {
    supplementalByDrawing[drawingId] = Object.freeze(references.slice(0, 8));
  }

  const baseReferences = Array.isArray(value.baseReferenceBindings)
    ? value.baseReferenceBindings.map((item) => Object.freeze({ ...item }))
    : [];
  const identityArtifactId = profile.request.subject.identityReferenceArtifactId;
  if (!baseReferences.some((entry) => entry.artifactId === identityArtifactId)) {
    fail("EVA_IDLE_BRIDGE_CANONICAL_IDENTITY_REFERENCE_REQUIRED", identityArtifactId);
  }
  const referenceBindings = [...baseReferences];
  for (const decision of referenceDecisions) {
    const binding = referenceBinding(byFrame.get(decision.frameId));
    if (!referenceBindings.some((entry) => entry.artifactId === binding.artifactId)) {
      referenceBindings.push(binding);
    }
  }

  const body = {
    schema: EVA_IDLE_SOURCE_REVIEW_BRIDGE_VERSION,
    characterId: "eva-female",
    clipId: "idle-primary",
    profileId: profile.profileId,
    profileDigest: profile.contentDigest,
    sourceReviewFinalizationSha256: finalization.finalizationSha256,
    sourceReusePlanSha256: value.reusePlan.planSha256,
    sourceRoute: target.route,
    reviewedSources: Object.freeze(reviewedSources),
    referenceBindings: Object.freeze(referenceBindings),
    supplementalReferencesByDrawing: Object.freeze(supplementalByDrawing),
    routing: Object.freeze({
      restReuseEligible: reviewedSources.some((source) => source.eligibleDrawingIds.includes(byPose.get("rest").id)),
      exhaleReuseEligible: reviewedSources.some((source) => source.eligibleDrawingIds.includes(byPose.get("exhale").id)),
      inhaleRequiresAuthoredWork: true,
      settleRequiresAuthoredWork: true,
      referenceGuidanceAvailable: referenceDecisions.length > 0,
    }),
    authority: AUTHORITY,
  };
  return Object.freeze({ ...body, contentDigest: digest(body) });
}
