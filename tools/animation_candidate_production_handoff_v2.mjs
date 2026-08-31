import { createHash } from "node:crypto";

import { compileAnimationCandidateProductionHandoff } from "./animation_candidate_production_handoff_v1.mjs";

export const ANIMATION_CANDIDATE_PRODUCTION_HANDOFF_V2_VERSION =
  "evavo.animation-candidate-production-handoff.v2";

const SHA = /^sha256:[0-9a-f]{64}$/u;
const ARTIFACT = /^artifact_[0-9a-f]{64}$/u;
const ROLE = /^[a-z][a-z0-9-]{1,63}$/u;
const AUTHORITY = Object.freeze({
  providerExecution: false,
  localExecution: false,
  candidateApproval: false,
  creativeApproval: false,
  artifactPromotion: false,
  repositoryMutation: false,
  gitCommit: false,
  gitPush: false,
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
function normalizeReference(value, index) {
  const item = record(value, `ANIMATION_HANDOFF_V2_REFERENCE_INVALID:${index}`);
  if (typeof item.role !== "string" || !ROLE.test(item.role)) {
    fail("ANIMATION_HANDOFF_V2_REFERENCE_ROLE_INVALID", String(index));
  }
  if (typeof item.artifactId !== "string" || !ARTIFACT.test(item.artifactId)) {
    fail("ANIMATION_HANDOFF_V2_REFERENCE_ARTIFACT_INVALID", String(index));
  }
  if (typeof item.contentDigest !== "string" || !SHA.test(item.contentDigest)) {
    fail("ANIMATION_HANDOFF_V2_REFERENCE_DIGEST_INVALID", String(index));
  }
  if (item.mediaType !== "image/png") {
    fail("ANIMATION_HANDOFF_V2_REFERENCE_MEDIA_INVALID", String(index));
  }
  for (const key of ["width", "height"]) {
    if (!Number.isSafeInteger(item[key]) || item[key] < 1 || item[key] > 8192) {
      fail("ANIMATION_HANDOFF_V2_REFERENCE_DIMENSIONS_INVALID", `${index}:${key}`);
    }
  }
  return Object.freeze({
    role: item.role,
    artifactId: item.artifactId,
    contentDigest: item.contentDigest,
    mediaType: "image/png",
    width: item.width,
    height: item.height,
    sourceFrameId:
      typeof item.sourceFrameId === "string" ? item.sourceFrameId : null,
    sourceReviewDigest:
      typeof item.sourceReviewDigest === "string" && SHA.test(item.sourceReviewDigest)
        ? item.sourceReviewDigest
        : null,
  });
}

export function compileAnimationCandidateProductionHandoffV2(input) {
  const value = record(input, "ANIMATION_HANDOFF_V2_INPUT_INVALID");
  const base = compileAnimationCandidateProductionHandoff({
    workOrder: value.workOrder,
  });
  const supplements = Array.isArray(value.supplementalReferences)
    ? value.supplementalReferences.map(normalizeReference)
    : [];
  if (supplements.length > 32) fail("ANIMATION_HANDOFF_V2_REFERENCES_EXCESSIVE");
  const seen = new Set(
    base.references.map((entry) => `${entry.role}:${entry.artifactId}`),
  );
  const supplementalReferences = [];
  for (const reference of supplements) {
    const key = `${reference.role}:${reference.artifactId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    supplementalReferences.push(reference);
  }
  const body = {
    schema: ANIMATION_CANDIDATE_PRODUCTION_HANDOFF_V2_VERSION,
    baseHandoffDigest: base.contentDigest,
    workOrderId: base.workOrderId,
    workOrderDigest: base.workOrderDigest,
    ledgerId: base.ledgerId,
    ledgerDigest: base.ledgerDigest,
    profileId: base.profileId,
    profileDigest: base.profileDigest,
    drawingId: base.drawingId,
    attempt: base.attempt,
    mode: base.mode,
    generationClass: base.generationClass,
    drawing: base.drawing,
    immutableLocks: base.immutableLocks,
    promptPackage: base.promptPackage,
    references: Object.freeze([
      ...base.references,
      ...supplementalReferences,
    ]),
    supplementalReferences: Object.freeze(supplementalReferences),
    repair: base.repair,
    expectedOutput: base.expectedOutput,
    reviewRequirements: base.reviewRequirements,
    routePolicy: Object.freeze({
      ...base.routePolicy,
      supplementalReviewedReferencesAllowed: true,
      supplementalReferencesAreGuidanceOnly: true,
      supplementalReferencesCannotSatisfyAcceptedDependencies: true,
    }),
    authority: AUTHORITY,
  };
  return Object.freeze({ ...body, contentDigest: digest(body) });
}
