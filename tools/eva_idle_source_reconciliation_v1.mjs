import { createHash } from "node:crypto";

export const EVA_IDLE_SOURCE_RECONCILIATION_VERSION =
  "evavo.eva-idle-source-reconciliation.v1";

const SHA = /^sha256:[0-9a-f]{64}$/u;
const ARTIFACT = /^artifact_[0-9a-f]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/u;

const AUTHORITY = Object.freeze({
  sourceSemanticAssignment: false,
  providerExecution: false,
  localExecution: false,
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
        .filter(([, entry]) => entry !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  }
  return value;
}

function digest(value) {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex")}`;
}

function safeId(value, code) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) fail(code, String(value));
  return value;
}

function sha(value, code) {
  if (typeof value !== "string" || !SHA.test(value)) fail(code, String(value));
  return value;
}

function artifact(value, code) {
  if (typeof value !== "string" || !ARTIFACT.test(value)) fail(code, String(value));
  return value;
}

function integer(value, minimum, maximum, code) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(code, String(value));
  }
  return value;
}

function validateIdleProfile(entry) {
  const profileEntry = record(entry, "EVA_IDLE_PROFILE_ENTRY_INVALID");
  if (profileEntry.clipId !== "idle-primary") fail("EVA_IDLE_PROFILE_REQUIRED");
  const profile = record(profileEntry.plan, "EVA_IDLE_PROFILE_INVALID");
  safeId(profile.profileId, "EVA_IDLE_PROFILE_ID_INVALID");
  sha(profile.contentDigest, "EVA_IDLE_PROFILE_DIGEST_INVALID");
  if (!Array.isArray(profile.drawings) || profile.drawings.length < 2) {
    fail("EVA_IDLE_PROFILE_DRAWINGS_INVALID");
  }
  const request = record(profile.request, "EVA_IDLE_PROFILE_REQUEST_INVALID");
  if (request.subject?.subjectId !== "eva-female") fail("EVA_IDLE_CHARACTER_INVALID");
  if (request.subject?.identityLockId !== "eva-female-identity-lock") {
    fail("EVA_IDLE_IDENTITY_LOCK_INVALID");
  }
  if (request.delivery?.alphaRequired !== true || request.delivery?.trim !== false) {
    fail("EVA_IDLE_DELIVERY_INVALID");
  }
  return profile;
}

function normalizeCandidate(value, profile, index) {
  const item = record(value, `EVA_IDLE_REVIEWED_SOURCE_INVALID:${index}`);
  safeId(item.sourceId, `EVA_IDLE_SOURCE_ID_INVALID:${index}`);
  safeId(item.reviewDecisionId, `EVA_IDLE_REVIEW_DECISION_ID_INVALID:${index}`);
  sha(item.reviewDecisionDigest, `EVA_IDLE_REVIEW_DECISION_DIGEST_INVALID:${index}`);
  sha(item.inspectionEvidenceDigest, `EVA_IDLE_INSPECTION_DIGEST_INVALID:${index}`);
  artifact(item.artifactId, `EVA_IDLE_ARTIFACT_ID_INVALID:${index}`);
  sha(item.contentDigest, `EVA_IDLE_CONTENT_DIGEST_INVALID:${index}`);
  integer(item.byteLength, 1, Number.MAX_SAFE_INTEGER, `EVA_IDLE_BYTE_LENGTH_INVALID:${index}`);
  if (item.mediaType !== "image/png") fail("EVA_IDLE_MEDIA_TYPE_INVALID", String(index));
  integer(item.width, 1, 8192, `EVA_IDLE_WIDTH_INVALID:${index}`);
  integer(item.height, 1, 8192, `EVA_IDLE_HEIGHT_INVALID:${index}`);
  if (item.meaningfulAlpha !== true) fail("EVA_IDLE_ALPHA_REQUIRED", item.sourceId);
  if (item.reviewStatus !== "sealed" || item.decision !== "keep") {
    fail("EVA_IDLE_SOURCE_NOT_SEALED_KEEP", item.sourceId);
  }
  if (item.identityLockId !== profile.request.subject.identityLockId) {
    fail("EVA_IDLE_SOURCE_IDENTITY_LOCK_MISMATCH", item.sourceId);
  }
  if (item.identityRevision !== profile.request.subject.identityRevision) {
    fail("EVA_IDLE_SOURCE_IDENTITY_REVISION_MISMATCH", item.sourceId);
  }
  if (!Array.isArray(item.eligibleDrawingIds) || item.eligibleDrawingIds.length < 1) {
    fail("EVA_IDLE_ELIGIBILITY_INVALID", item.sourceId);
  }
  const drawingIds = new Set(profile.drawings.map((drawing) => drawing.id));
  const eligibleDrawingIds = [];
  for (const id of item.eligibleDrawingIds) {
    safeId(id, "EVA_IDLE_ELIGIBLE_DRAWING_ID_INVALID");
    if (!drawingIds.has(id)) fail("EVA_IDLE_ELIGIBLE_DRAWING_UNKNOWN", id);
    if (!eligibleDrawingIds.includes(id)) eligibleDrawingIds.push(id);
  }
  const priority = item.reusePriority === undefined
    ? 100
    : integer(item.reusePriority, 0, 1000, "EVA_IDLE_REUSE_PRIORITY_INVALID");
  return Object.freeze({
    sourceId: item.sourceId,
    reviewDecisionId: item.reviewDecisionId,
    reviewDecisionDigest: item.reviewDecisionDigest,
    inspectionEvidenceDigest: item.inspectionEvidenceDigest,
    artifactId: item.artifactId,
    contentDigest: item.contentDigest,
    byteLength: item.byteLength,
    mediaType: "image/png",
    width: item.width,
    height: item.height,
    meaningfulAlpha: true,
    identityLockId: item.identityLockId,
    identityRevision: item.identityRevision,
    eligibleDrawingIds: Object.freeze(eligibleDrawingIds),
    reusePriority: priority,
  });
}

function usableFor(candidate, drawing, profile, reserved, used) {
  if (reserved.has(candidate.artifactId) || used.has(candidate.artifactId)) return false;
  if (!candidate.eligibleDrawingIds.includes(drawing.id)) return false;
  const canvas = profile.request.delivery.canvas;
  return candidate.width === canvas.width && candidate.height === canvas.height;
}

function candidateInput(profile, drawing, source) {
  const selection = {
    adapter: "eva-reviewed-source-reuse-v1",
    profileDigest: profile.contentDigest,
    drawingId: drawing.id,
    sourceId: source.sourceId,
    artifactId: source.artifactId,
    contentDigest: source.contentDigest,
    reviewDecisionDigest: source.reviewDecisionDigest,
  };
  return Object.freeze({
    artifactId: source.artifactId,
    contentDigest: source.contentDigest,
    byteLength: source.byteLength,
    mediaType: "image/png",
    width: source.width,
    height: source.height,
    meaningfulAlpha: true,
    providerRequestDigest: digest(selection),
    providerResponseDigest: source.contentDigest,
    inspectionEvidenceDigest: source.inspectionEvidenceDigest,
    adapterId: "eva-reviewed-source-reuse-v1",
  });
}

export function compileEvaIdleSourceReconciliation(input) {
  const value = record(input, "EVA_IDLE_RECONCILIATION_INPUT_INVALID");
  const profile = validateIdleProfile(value.profileEntry);
  if (!Array.isArray(value.reviewedSources)) fail("EVA_IDLE_REVIEWED_SOURCES_INVALID");
  const sources = value.reviewedSources.map((item, index) =>
    normalizeCandidate(item, profile, index),
  );
  const reserved = new Set(value.reservedArtifactIds ?? []);
  for (const id of reserved) artifact(id, "EVA_IDLE_RESERVED_ARTIFACT_INVALID");

  const sorted = [...sources].sort(
    (a, b) => a.reusePriority - b.reusePriority || a.sourceId.localeCompare(b.sourceId),
  );
  const used = new Set();
  const selections = [];
  const unresolvedDrawingIds = [];
  for (const drawing of [...profile.drawings].sort((a, b) => a.ordinal - b.ordinal)) {
    const source = sorted.find((candidate) => usableFor(candidate, drawing, profile, reserved, used));
    if (!source) {
      unresolvedDrawingIds.push(drawing.id);
      continue;
    }
    used.add(source.artifactId);
    selections.push(Object.freeze({
      drawingId: drawing.id,
      drawingOrdinal: drawing.ordinal,
      sourceId: source.sourceId,
      reviewDecisionId: source.reviewDecisionId,
      reviewDecisionDigest: source.reviewDecisionDigest,
      candidate: candidateInput(profile, drawing, source),
    }));
  }

  const body = {
    schema: EVA_IDLE_SOURCE_RECONCILIATION_VERSION,
    characterId: "eva-female",
    clipId: "idle-primary",
    profileId: profile.profileId,
    profileDigest: profile.contentDigest,
    reviewedSourceCount: sources.length,
    reusedDrawingCount: selections.length,
    unresolvedDrawingCount: unresolvedDrawingIds.length,
    selections,
    unresolvedDrawingIds,
    nextRoute: unresolvedDrawingIds.length
      ? "route-unresolved-drawings"
      : "compile-ledger-candidate-receipts",
    rules: {
      sealedKeepDecisionRequired: true,
      exactIdentityRevisionRequired: true,
      exactCanvasRequired: true,
      meaningfulAlphaRequired: true,
      oneReviewedArtifactPerUniqueDrawing: true,
      semanticEligibilityComesOnlyFromSealedReview: true,
      filenameAndTimestampSemanticsForbidden: true,
    },
    authority: AUTHORITY,
  };
  return Object.freeze({
    ...body,
    contentDigest: digest(body),
  });
}
