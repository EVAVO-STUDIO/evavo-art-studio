import { createHash } from "node:crypto";

export const ANIMATION_CANDIDATE_PRODUCTION_HANDOFF_VERSION =
  "evavo.animation-candidate-production-handoff.v1";

const SHA = /^sha256:[0-9a-f]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/u;
const ARTIFACT = /^artifact_[0-9a-f]{64}$/u;
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
    return Object.fromEntries(Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}
function digest(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex")}`;
}
function assertId(value, code) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) fail(code);
  return value;
}
function assertSha(value, code) {
  if (typeof value !== "string" || !SHA.test(value)) fail(code);
  return value;
}
function assertArtifact(value, code) {
  if (typeof value !== "string" || !ARTIFACT.test(value)) fail(code);
  return value;
}

export function compileAnimationCandidateProductionHandoff(input) {
  const value = record(input, "ANIMATION_HANDOFF_INPUT_INVALID");
  const workOrder = record(value.workOrder, "ANIMATION_HANDOFF_WORK_ORDER_INVALID");
  assertId(workOrder.workOrderId, "ANIMATION_HANDOFF_WORK_ORDER_ID_INVALID");
  assertId(workOrder.drawingId, "ANIMATION_HANDOFF_DRAWING_ID_INVALID");
  assertSha(workOrder.workOrderDigest, "ANIMATION_HANDOFF_WORK_ORDER_DIGEST_INVALID");
  assertSha(workOrder.ledgerDigest, "ANIMATION_HANDOFF_LEDGER_DIGEST_INVALID");
  assertSha(workOrder.profileDigest, "ANIMATION_HANDOFF_PROFILE_DIGEST_INVALID");
  if (!workOrder.drawing || !["key-pose", "breakdown", "inbetween"].includes(workOrder.drawing.generationClass)) {
    fail("ANIMATION_HANDOFF_GENERATION_CLASS_INVALID");
  }
  if (!Array.isArray(workOrder.references)) fail("ANIMATION_HANDOFF_REFERENCES_INVALID");
  const references = workOrder.references.map((reference, index) => {
    const item = record(reference, `ANIMATION_HANDOFF_REFERENCE_INVALID:${index}`);
    assertArtifact(item.artifactId, `ANIMATION_HANDOFF_REFERENCE_ARTIFACT_INVALID:${index}`);
    assertSha(item.contentDigest, `ANIMATION_HANDOFF_REFERENCE_DIGEST_INVALID:${index}`);
    return Object.freeze({
      role: String(item.role),
      artifactId: item.artifactId,
      contentDigest: item.contentDigest,
      mediaType: item.mediaType,
      width: item.width,
      height: item.height,
      ...(item.sourceDrawingId ? { sourceDrawingId: item.sourceDrawingId } : {}),
    });
  });
  const expectedOutput = record(workOrder.expectedOutput, "ANIMATION_HANDOFF_EXPECTED_OUTPUT_INVALID");
  const body = {
    schema: ANIMATION_CANDIDATE_PRODUCTION_HANDOFF_VERSION,
    workOrderId: workOrder.workOrderId,
    workOrderDigest: workOrder.workOrderDigest,
    ledgerId: workOrder.ledgerId,
    ledgerDigest: workOrder.ledgerDigest,
    profileId: workOrder.profileId,
    profileDigest: workOrder.profileDigest,
    drawingId: workOrder.drawingId,
    attempt: workOrder.attempt,
    mode: workOrder.mode,
    generationClass: workOrder.mode === "repair" ? "repair" : workOrder.drawing.generationClass,
    drawing: structuredClone(workOrder.drawing),
    immutableLocks: structuredClone(workOrder.immutableLocks),
    promptPackage: structuredClone(workOrder.promptPackage),
    references,
    repair: workOrder.repair ? structuredClone(workOrder.repair) : null,
    expectedOutput: structuredClone(expectedOutput),
    reviewRequirements: structuredClone(workOrder.reviewRequirements),
    routePolicy: Object.freeze({
      order: Object.freeze([
        "reuse-existing",
        "deterministic-repair",
        "local-ai",
        "provider",
        "blocked",
      ]),
      acceptedDependenciesRequiredBeforeExecution: true,
      candidateOnly: true,
    }),
    authority: AUTHORITY,
  };
  return Object.freeze({ ...body, contentDigest: digest(body) });
}
