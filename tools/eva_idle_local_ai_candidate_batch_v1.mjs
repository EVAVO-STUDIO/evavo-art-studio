import { createHash } from "node:crypto";

import {
  applyAnimationFrameCandidateBatch,
  assertAnimationFrameWorkLedgerIntegrity,
  compileAnimationFrameCandidateReceipt,
  summarizeAnimationFrameWorkLedger,
} from "./animation_frame_work_ledger_v1.mjs";
import {
  assertAnimationProductionProfileIntegrity,
} from "./animation_production_profile_canonical_v1.mjs";

export const EVA_IDLE_LOCAL_AI_CANDIDATE_BATCH_VERSION =
  "evavo.eva-idle-local-ai-candidate-batch.v1";
export const EVA_IDLE_LOCAL_AI_CANDIDATE_APPLICATION_VERSION =
  "evavo.eva-idle-local-ai-candidate-application.v1";

const INTAKE_SCHEMA = "evavo.eva-idle-frame-ledger-intake.v1";
const COMPLETION_SCHEMA = "evavo.eva-idle-local-ai-candidate-completion.v1";
const ADAPTER_SCHEMA = "evavo.animation-ledger-candidate-adapter.v1";
const SHA = /^sha256:[0-9a-f]{64}$/u;
const ARTIFACT = /^artifact_[0-9a-f]{64}$/u;
const JOB_ID = /^[A-Za-z0-9._-]{1,96}$/u;
const AUTHORITY = Object.freeze({
  providerExecution: false,
  localAiExecution: false,
  automaticCreativeApproval: false,
  creativeApproval: false,
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
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonical(child)]),
    );
  }
  return value;
}
function digest(value) {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex")}`;
}
function falseAuthority(value, code) {
  const authority = record(value, code);
  if (
    Object.keys(authority).length === 0 ||
    Object.values(authority).some((entry) => entry !== false)
  ) {
    fail(code);
  }
}
function assertSelfDigest(value, code) {
  if (typeof value.contentDigest !== "string" || !SHA.test(value.contentDigest)) {
    fail(`${code}_DIGEST_INVALID`);
  }
  const { contentDigest: _contentDigest, ...body } = value;
  if (digest(body) !== value.contentDigest) fail(`${code}_DIGEST_MISMATCH`);
}
function iso(value, code) {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.valueOf())) fail(code);
  const text = parsed.toISOString();
  if (typeof value === "string" && text !== value) fail(code);
  return parsed;
}
function sameValue(left, right, code) {
  if (JSON.stringify(canonical(left)) !== JSON.stringify(canonical(right))) {
    fail(code);
  }
}

async function validateIntake(profile, intakeValue) {
  const intake = record(intakeValue, "EVA_IDLE_CANDIDATE_BATCH_INTAKE_INVALID");
  if (
    intake.schema !== INTAKE_SCHEMA ||
    intake.characterId !== "eva-female" ||
    intake.clipId !== "idle-primary" ||
    intake.profileId !== profile.profileId ||
    intake.profileDigest !== profile.contentDigest ||
    !intake.ledger ||
    !intake.nextWorkBatch ||
    !Array.isArray(intake.nextWorkBatch.workOrders)
  ) {
    fail("EVA_IDLE_CANDIDATE_BATCH_INTAKE_INVALID");
  }
  assertSelfDigest(intake, "EVA_IDLE_CANDIDATE_BATCH_INTAKE");
  falseAuthority(intake.authority, "EVA_IDLE_CANDIDATE_BATCH_INTAKE_AUTHORITY_INVALID");
  await assertAnimationFrameWorkLedgerIntegrity(profile, intake.ledger);
  if (
    intake.nextWorkBatch.status !== "work-ready" ||
    intake.nextWorkBatch.ledgerId !== intake.ledger.ledgerId ||
    intake.nextWorkBatch.ledgerDigest !== intake.ledger.contentDigest ||
    intake.nextWorkBatch.profileId !== profile.profileId ||
    intake.nextWorkBatch.profileDigest !== profile.contentDigest ||
    intake.nextWorkBatch.workOrders.length !== 2
  ) {
    fail("EVA_IDLE_CANDIDATE_BATCH_WORK_BATCH_INVALID");
  }
  const poseIds = intake.nextWorkBatch.workOrders
    .map((workOrder) => workOrder?.drawing?.poseId)
    .sort();
  if (JSON.stringify(poseIds) !== JSON.stringify(["inhale", "settle"])) {
    fail("EVA_IDLE_CANDIDATE_BATCH_WORK_SCOPE_INVALID");
  }
  return intake;
}

function parseCompletion(completionValue, profile, intake, workOrders) {
  const completion = record(
    completionValue,
    "EVA_IDLE_CANDIDATE_BATCH_COMPLETION_INVALID",
  );
  if (
    completion.schema !== COMPLETION_SCHEMA ||
    completion.characterId !== "eva-female" ||
    completion.clipId !== "idle-primary" ||
    !["inhale", "settle"].includes(completion.poseId) ||
    completion.profileId !== profile.profileId ||
    completion.profileDigest !== profile.contentDigest ||
    completion.ledgerId !== intake.ledger.ledgerId ||
    completion.ledgerDigest !== intake.ledger.contentDigest ||
    typeof completion.localComputeJobId !== "string" ||
    !JOB_ID.test(completion.localComputeJobId) ||
    !completion.ledgerCandidate ||
    !completion.candidateArtifact ||
    !completion.acceptanceBoundary
  ) {
    fail("EVA_IDLE_CANDIDATE_BATCH_COMPLETION_INVALID");
  }
  for (const field of [
    "dispatchDigest",
    "workOrderDigest",
    "creativeImagePlanDigest",
    "submittedAiSpecDigest",
    "localComputeReceiptDigest",
    "workerReceiptDigest",
    "manifestFileDigest",
  ]) {
    if (typeof completion[field] !== "string" || !SHA.test(completion[field])) {
      fail("EVA_IDLE_CANDIDATE_BATCH_COMPLETION_PROVENANCE_INVALID", field);
    }
  }
  assertSelfDigest(completion, "EVA_IDLE_CANDIDATE_BATCH_COMPLETION");
  falseAuthority(
    completion.authority,
    "EVA_IDLE_CANDIDATE_BATCH_COMPLETION_AUTHORITY_INVALID",
  );
  if (
    completion.acceptanceBoundary.physicalExecutionProved !== true ||
    completion.acceptanceBoundary.candidateBytesInspected !== true ||
    completion.acceptanceBoundary.ledgerCandidatePrepared !== true ||
    completion.acceptanceBoundary.ledgerAdmissionGranted !== false ||
    completion.acceptanceBoundary.independentDrawingReviewRequired !== true ||
    completion.acceptanceBoundary.fullFourDrawingSequenceReviewRequired !== true ||
    completion.acceptanceBoundary.automaticCreativeApprovalGranted !== false ||
    completion.acceptanceBoundary.creativeApprovalGranted !== false ||
    completion.acceptanceBoundary.artifactPromotionGranted !== false ||
    completion.acceptanceBoundary.runtimeActivationGranted !== false ||
    completion.acceptanceBoundary.publicationGranted !== false
  ) {
    fail("EVA_IDLE_CANDIDATE_BATCH_COMPLETION_BOUNDARY_INVALID");
  }
  const adapter = record(
    completion.ledgerCandidate,
    "EVA_IDLE_CANDIDATE_BATCH_ADAPTER_INVALID",
  );
  if (
    adapter.schema !== ADAPTER_SCHEMA ||
    adapter.route !== "local-ai" ||
    !adapter.ledgerReceiptInput ||
    !adapter.acceptanceBoundary ||
    adapter.acceptanceBoundary.candidateOnly !== true ||
    adapter.acceptanceBoundary.ledgerAdmissionIsNotCreativeApproval !== true ||
    adapter.acceptanceBoundary.independentDrawingReviewRequired !== true ||
    adapter.acceptanceBoundary.sequenceReviewRequired !== true ||
    adapter.acceptanceBoundary.publicationGranted !== false
  ) {
    fail("EVA_IDLE_CANDIDATE_BATCH_ADAPTER_INVALID");
  }
  const receiptInput = record(
    adapter.ledgerReceiptInput,
    "EVA_IDLE_CANDIDATE_BATCH_RECEIPT_INPUT_INVALID",
  );
  const workOrder = workOrders.get(completion.drawingId);
  if (
    !workOrder ||
    receiptInput.ledgerDigest !== intake.ledger.contentDigest ||
    completion.workOrderDigest !== workOrder.workOrderDigest ||
    completion.attempt !== workOrder.attempt ||
    completion.poseId !== workOrder.drawing.poseId
  ) {
    fail("EVA_IDLE_CANDIDATE_BATCH_WORK_ORDER_BINDING_INVALID");
  }
  sameValue(
    receiptInput.workOrder,
    workOrder,
    "EVA_IDLE_CANDIDATE_BATCH_WORK_ORDER_MISMATCH",
  );
  const candidate = record(
    receiptInput.candidate,
    "EVA_IDLE_CANDIDATE_BATCH_CANDIDATE_INVALID",
  );
  const artifact = record(
    completion.candidateArtifact,
    "EVA_IDLE_CANDIDATE_BATCH_ARTIFACT_INVALID",
  );
  if (
    typeof candidate.artifactId !== "string" ||
    !ARTIFACT.test(candidate.artifactId) ||
    typeof candidate.contentDigest !== "string" ||
    !SHA.test(candidate.contentDigest) ||
    candidate.artifactId !== `artifact_${candidate.contentDigest.slice("sha256:".length)}` ||
    candidate.artifactId !== artifact.artifactId ||
    candidate.contentDigest !== artifact.contentDigest ||
    candidate.byteLength !== artifact.byteLength ||
    candidate.mediaType !== artifact.mediaType ||
    candidate.width !== artifact.width ||
    candidate.height !== artifact.height ||
    candidate.meaningfulAlpha !== artifact.meaningfulAlpha ||
    candidate.inspectionEvidenceDigest !== artifact.inspectionEvidenceDigest
  ) {
    fail("EVA_IDLE_CANDIDATE_BATCH_ARTIFACT_BINDING_INVALID");
  }
  return Object.freeze({ completion, workOrder, candidate });
}

export async function prepareEvaIdleLocalAiCandidateBatch(
  input,
  now = new Date(),
) {
  const value = record(input, "EVA_IDLE_CANDIDATE_BATCH_INPUT_INVALID");
  const profile = record(value.profile, "EVA_IDLE_CANDIDATE_BATCH_PROFILE_INVALID");
  assertAnimationProductionProfileIntegrity(profile);
  if (
    profile.request?.subject?.subjectId !== "eva-female" ||
    profile.request?.delivery?.animationName !== "eva-idle-primary"
  ) {
    fail("EVA_IDLE_CANDIDATE_BATCH_PROFILE_TARGET_INVALID");
  }
  const intake = await validateIntake(profile, value.intake);
  if (!Array.isArray(value.completions) || value.completions.length !== 2) {
    fail("EVA_IDLE_CANDIDATE_BATCH_COMPLETION_COUNT_INVALID");
  }
  const workOrders = new Map(
    intake.nextWorkBatch.workOrders.map((workOrder) => [workOrder.drawingId, workOrder]),
  );
  const parsed = value.completions.map((completion) =>
    parseCompletion(completion, profile, intake, workOrders),
  );
  const poseIds = parsed.map((entry) => entry.completion.poseId).sort();
  const drawingIds = parsed.map((entry) => entry.completion.drawingId);
  const artifactIds = parsed.map((entry) => entry.candidate.artifactId);
  const contentDigests = parsed.map((entry) => entry.candidate.contentDigest);
  const jobIds = parsed.map((entry) => entry.completion.localComputeJobId);
  if (
    JSON.stringify(poseIds) !== JSON.stringify(["inhale", "settle"]) ||
    new Set(drawingIds).size !== 2 ||
    new Set(artifactIds).size !== 2 ||
    new Set(contentDigests).size !== 2 ||
    new Set(jobIds).size !== 2
  ) {
    fail("EVA_IDLE_CANDIDATE_BATCH_COMPLETION_SCOPE_OR_COLLISION_INVALID");
  }
  const preparedAt = iso(now, "EVA_IDLE_CANDIDATE_BATCH_TIME_INVALID").toISOString();
  const receipts = parsed.map((entry) =>
    compileAnimationFrameCandidateReceipt(
      {
        workOrder: entry.workOrder,
        ledgerDigest: intake.ledger.contentDigest,
        candidate: entry.candidate,
      },
      new Date(preparedAt),
    ),
  );
  const applicationInput = Object.freeze({
    profile,
    ledger: intake.ledger,
    batch: intake.nextWorkBatch,
    receipts: Object.freeze(receipts),
  });
  const body = {
    schema: EVA_IDLE_LOCAL_AI_CANDIDATE_BATCH_VERSION,
    characterId: "eva-female",
    clipId: "idle-primary",
    profileId: profile.profileId,
    profileDigest: profile.contentDigest,
    intakeDigest: intake.contentDigest,
    ledgerId: intake.ledger.ledgerId,
    ledgerDigest: intake.ledger.contentDigest,
    batchId: intake.nextWorkBatch.batchId,
    batchDigest: intake.nextWorkBatch.batchDigest,
    completionDigests: Object.freeze(
      parsed.map((entry) => entry.completion.contentDigest).sort(),
    ),
    drawingIds: Object.freeze([...drawingIds].sort()),
    poseIds: Object.freeze([...poseIds]),
    candidateArtifactIds: Object.freeze([...artifactIds].sort()),
    receipts: Object.freeze(receipts),
    applicationInput,
    preparedAt,
    acceptanceBoundary: Object.freeze({
      bothBreakdownsPresent: true,
      distinctPhysicalJobsRequired: true,
      distinctCandidateBytesRequired: true,
      atomicLedgerApplicationRequired: true,
      candidateOnly: true,
      creativeApprovalGranted: false,
      sequenceAcceptanceGranted: false,
      artifactPromotionGranted: false,
      runtimeActivationGranted: false,
      publicationGranted: false,
    }),
    authority: AUTHORITY,
  };
  return Object.freeze({ ...body, contentDigest: digest(body) });
}

function validatePrepared(value) {
  const prepared = record(
    value,
    "EVA_IDLE_CANDIDATE_APPLICATION_PREPARED_INVALID",
  );
  if (
    prepared.schema !== EVA_IDLE_LOCAL_AI_CANDIDATE_BATCH_VERSION ||
    prepared.characterId !== "eva-female" ||
    prepared.clipId !== "idle-primary" ||
    !prepared.applicationInput ||
    !Array.isArray(prepared.receipts) ||
    prepared.receipts.length !== 2
  ) {
    fail("EVA_IDLE_CANDIDATE_APPLICATION_PREPARED_INVALID");
  }
  assertSelfDigest(prepared, "EVA_IDLE_CANDIDATE_APPLICATION_PREPARED");
  falseAuthority(
    prepared.authority,
    "EVA_IDLE_CANDIDATE_APPLICATION_PREPARED_AUTHORITY_INVALID",
  );
  if (
    prepared.acceptanceBoundary?.bothBreakdownsPresent !== true ||
    prepared.acceptanceBoundary?.atomicLedgerApplicationRequired !== true ||
    prepared.acceptanceBoundary?.candidateOnly !== true ||
    prepared.acceptanceBoundary?.creativeApprovalGranted !== false ||
    prepared.acceptanceBoundary?.sequenceAcceptanceGranted !== false ||
    prepared.acceptanceBoundary?.artifactPromotionGranted !== false ||
    prepared.acceptanceBoundary?.runtimeActivationGranted !== false ||
    prepared.acceptanceBoundary?.publicationGranted !== false
  ) {
    fail("EVA_IDLE_CANDIDATE_APPLICATION_PREPARED_BOUNDARY_INVALID");
  }
  return prepared;
}

export async function applyEvaIdleLocalAiCandidateBatch(
  input,
  now = new Date(),
) {
  const value = record(input, "EVA_IDLE_CANDIDATE_APPLICATION_INPUT_INVALID");
  const expected = await prepareEvaIdleLocalAiCandidateBatch(
    {
      profile: value.profile,
      intake: value.intake,
      completions: value.completions,
    },
    iso(
      value.prepared?.preparedAt,
      "EVA_IDLE_CANDIDATE_APPLICATION_PREPARED_TIME_INVALID",
    ),
  );
  const prepared = validatePrepared(value.prepared);
  sameValue(
    prepared,
    expected,
    "EVA_IDLE_CANDIDATE_APPLICATION_PREPARED_REPRODUCTION_MISMATCH",
  );
  const appliedAt = iso(now, "EVA_IDLE_CANDIDATE_APPLICATION_TIME_INVALID");
  const nextLedger = await applyAnimationFrameCandidateBatch(
    prepared.applicationInput,
    appliedAt,
  );
  await assertAnimationFrameWorkLedgerIntegrity(value.profile, nextLedger);
  const summary = summarizeAnimationFrameWorkLedger(nextLedger);
  if (
    summary.status !== "review-required" ||
    summary.nextOwnerRole !== "cel-animation-studio" ||
    summary.reviewRequiredDrawingIds.length !== 4 ||
    summary.pendingDrawingIds.length !== 0 ||
    summary.repairDrawingIds.length !== 0 ||
    nextLedger.revision !== value.intake.ledger.revision + 1
  ) {
    fail("EVA_IDLE_CANDIDATE_APPLICATION_RESULT_INVALID");
  }
  const body = {
    schema: EVA_IDLE_LOCAL_AI_CANDIDATE_APPLICATION_VERSION,
    characterId: "eva-female",
    clipId: "idle-primary",
    preparedDigest: prepared.contentDigest,
    priorLedgerDigest: value.intake.ledger.contentDigest,
    nextLedger,
    summary,
    appliedAt: appliedAt.toISOString(),
    effects: Object.freeze({
      candidateBatchAdmitted: true,
      bothBreakdownsCandidateReady: true,
      reusedEndpointsStillReviewRequired: true,
      nextOwnerRole: "cel-animation-studio",
      creativeApprovalGranted: false,
      sequenceAcceptanceGranted: false,
      artifactPromotionGranted: false,
      runtimeActivationGranted: false,
      publicationGranted: false,
    }),
    authority: AUTHORITY,
  };
  return Object.freeze({ ...body, contentDigest: digest(body) });
}
