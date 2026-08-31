import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { compileEvaCanonicalProfileBundle } from "../tools/eva_avatar_canonical_profile_adapter_v1.mjs";
import { compileEvaIdleFrameLedgerIntake } from "../tools/eva_idle_frame_ledger_intake_v1.mjs";
import {
  applyEvaIdleLocalAiCandidateBatch,
  prepareEvaIdleLocalAiCandidateBatch,
} from "../tools/eva_idle_local_ai_candidate_batch_v1.mjs";

const raw = (character) => character.repeat(64);
const prefixed = (character) => `sha256:${raw(character)}`;
const artifact = (character) => `artifact_${raw(character)}`;

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
function seal(body) {
  return { ...body, contentDigest: digest(body) };
}

const completionAuthority = Object.freeze({
  physicalExecution: false,
  ledgerMutation: false,
  candidateAdmission: false,
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

function profile() {
  const bundle = compileEvaCanonicalProfileBundle(
    {
      characterId: "eva-female",
      compiledAt: "2026-08-31T10:00:00.000Z",
      targetCanvas: { width: 1024, height: 1536 },
      animationIdentityMaster: { asset: { sha256: raw("1") } },
      clips: [
        {
          id: "idle-primary",
          kind: "idle",
          loopMode: "loop",
          targetFrames: 36,
          fps: 24,
          performance: "quiet neutral breathing",
        },
      ],
    },
    { generatedAt: "2026-08-31T10:00:00.000Z", state: "approved" },
  );
  return bundle.bodyProfiles[0].plan;
}

function source(id, drawingId, character) {
  return {
    sourceId: id,
    reviewDecisionId: `decision:${id}`,
    reviewDecisionDigest: prefixed(character),
    inspectionEvidenceDigest: prefixed("e"),
    artifactId: artifact(character),
    contentDigest: prefixed(character),
    byteLength: 1000,
    mediaType: "image/png",
    width: 1024,
    height: 1536,
    meaningfulAlpha: true,
    reviewStatus: "sealed",
    decision: "keep",
    identityLockId: "eva-female-identity-lock",
    identityRevision: 1,
    eligibleDrawingIds: [drawingId],
    reusePriority: 1,
  };
}

function bridge(plan) {
  const poses = new Map(plan.drawings.map((drawing) => [drawing.poseId, drawing]));
  const supplementalReferencesByDrawing = {};
  for (const poseId of ["inhale", "settle"]) {
    supplementalReferencesByDrawing[poses.get(poseId).id] = [
      {
        role: "reviewed-silhouette-reference",
        artifactId: artifact("4"),
        contentDigest: prefixed("4"),
        mediaType: "image/png",
        width: 1024,
        height: 1536,
        sourceFrameId: "pose-ref",
        sourceReviewDigest: prefixed("5"),
      },
    ];
  }
  const body = {
    schema: "evavo.eva-idle-source-review-bridge.v1",
    characterId: "eva-female",
    clipId: "idle-primary",
    profileId: plan.profileId,
    profileDigest: plan.contentDigest,
    sourceReviewFinalizationSha256: raw("6"),
    sourceReusePlanSha256: raw("7"),
    reviewedSources: [
      source("reviewed-rest", poses.get("rest").id, "2"),
      source("reviewed-exhale", poses.get("exhale").id, "3"),
    ],
    referenceBindings: [
      {
        artifactId: artifact("1"),
        contentDigest: prefixed("1"),
        mediaType: "image/png",
        width: 1024,
        height: 1536,
      },
    ],
    supplementalReferencesByDrawing,
    routing: {
      restReuseEligible: true,
      exhaleReuseEligible: true,
      inhaleRequiresAuthoredWork: true,
      settleRequiresAuthoredWork: true,
    },
    authority: {
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
    },
  };
  return { ...body, contentDigest: digest(body) };
}

async function fixture() {
  const plan = profile();
  const intake = await compileEvaIdleFrameLedgerIntake(
    {
      profile: plan,
      bridge: bridge(plan),
      sessionId: "eva-idle-candidate-batch-test",
    },
    new Date("2026-08-31T11:00:00.000Z"),
  );
  return { plan, intake };
}

function completionFor(plan, intake, workOrder, character, jobId) {
  const candidate = {
    artifactId: artifact(character),
    contentDigest: prefixed(character),
    byteLength: 4096,
    mediaType: "image/png",
    width: 1024,
    height: 1536,
    meaningfulAlpha: true,
    providerRequestDigest: prefixed("8"),
    providerResponseDigest: prefixed("9"),
    inspectionEvidenceDigest: prefixed("a"),
    adapterId: "cel-local-compute-animation-v2",
    modelId: "eva-image-model",
  };
  const candidateArtifact = {
    artifactId: candidate.artifactId,
    contentDigest: candidate.contentDigest,
    byteLength: candidate.byteLength,
    mediaType: candidate.mediaType,
    width: candidate.width,
    height: candidate.height,
    meaningfulAlpha: true,
    inspectionEvidenceDigest: candidate.inspectionEvidenceDigest,
  };
  const ledgerCandidate = {
    schema: "evavo.animation-ledger-candidate-adapter.v1",
    route: "local-ai",
    ledgerReceiptInput: {
      workOrder,
      ledgerDigest: intake.ledger.contentDigest,
      candidate,
    },
    acceptanceBoundary: {
      candidateOnly: true,
      ledgerAdmissionIsNotCreativeApproval: true,
      independentDrawingReviewRequired: true,
      sequenceReviewRequired: true,
      publicationGranted: false,
    },
  };
  return seal({
    schema: "evavo.eva-idle-local-ai-candidate-completion.v1",
    characterId: "eva-female",
    clipId: "idle-primary",
    drawingId: workOrder.drawingId,
    poseId: workOrder.drawing.poseId,
    attempt: workOrder.attempt,
    dispatchDigest: prefixed("b"),
    workOrderDigest: workOrder.workOrderDigest,
    creativeImagePlanDigest: prefixed("c"),
    submittedAiSpecDigest: prefixed("d"),
    localComputeJobId: jobId,
    localComputeReceiptDigest: prefixed("e"),
    workerReceiptDigest: prefixed("f"),
    manifestFileDigest: prefixed("0"),
    profileId: plan.profileId,
    profileDigest: plan.contentDigest,
    ledgerId: intake.ledger.ledgerId,
    ledgerDigest: intake.ledger.contentDigest,
    candidateArtifact,
    ledgerCandidate,
    acceptanceBoundary: {
      physicalExecutionProved: true,
      candidateBytesInspected: true,
      ledgerCandidatePrepared: true,
      ledgerAdmissionGranted: false,
      independentDrawingReviewRequired: true,
      fullFourDrawingSequenceReviewRequired: true,
      automaticCreativeApprovalGranted: false,
      creativeApprovalGranted: false,
      artifactPromotionGranted: false,
      runtimeActivationGranted: false,
      publicationGranted: false,
    },
    authority: completionAuthority,
  });
}

function completions(plan, intake) {
  const byPose = new Map(
    intake.nextWorkBatch.workOrders.map((workOrder) => [
      workOrder.drawing.poseId,
      workOrder,
    ]),
  );
  return [
    completionFor(plan, intake, byPose.get("inhale"), "b", "eva-inhale-job-1"),
    completionFor(plan, intake, byPose.get("settle"), "c", "eva-settle-job-1"),
  ];
}

const preparedAt = new Date("2026-08-31T12:00:00.000Z");
const appliedAt = new Date("2026-08-31T12:05:00.000Z");

test("prepares two official receipts without changing the source ledger", async () => {
  const { plan, intake } = await fixture();
  const before = structuredClone(intake.ledger);
  const prepared = await prepareEvaIdleLocalAiCandidateBatch(
    { profile: plan, intake, completions: completions(plan, intake) },
    preparedAt,
  );
  assert.equal(prepared.receipts.length, 2);
  assert.deepEqual(prepared.poseIds, ["inhale", "settle"]);
  assert.equal(prepared.applicationInput.ledger.contentDigest, intake.ledger.contentDigest);
  assert.equal(prepared.acceptanceBoundary.atomicLedgerApplicationRequired, true);
  assert.equal(prepared.acceptanceBoundary.creativeApprovalGranted, false);
  assert.deepEqual(intake.ledger, before);
});

test("admits inhale and settle atomically and hands all four drawings to Cel review", async () => {
  const { plan, intake } = await fixture();
  const values = completions(plan, intake);
  const prepared = await prepareEvaIdleLocalAiCandidateBatch(
    { profile: plan, intake, completions: values },
    preparedAt,
  );
  const applied = await applyEvaIdleLocalAiCandidateBatch(
    { profile: plan, intake, completions: values, prepared },
    appliedAt,
  );
  assert.equal(applied.nextLedger.revision, intake.ledger.revision + 1);
  assert.equal(applied.summary.status, "review-required");
  assert.equal(applied.summary.nextOwnerRole, "cel-animation-studio");
  assert.equal(applied.summary.reviewRequiredDrawingIds.length, 4);
  assert.equal(
    applied.nextLedger.drawingStates.every((state) => state.status === "candidate-ready"),
    true,
  );
  assert.equal(applied.nextLedger.events.at(-1).type, "candidate-batch-admitted");
  assert.equal(applied.effects.creativeApprovalGranted, false);
  assert.equal(applied.effects.sequenceAcceptanceGranted, false);
});

test("a partial physical result can never enter the ledger", async () => {
  const { plan, intake } = await fixture();
  await assert.rejects(
    () =>
      prepareEvaIdleLocalAiCandidateBatch(
        { profile: plan, intake, completions: completions(plan, intake).slice(0, 1) },
        preparedAt,
      ),
    /EVA_IDLE_CANDIDATE_BATCH_COMPLETION_COUNT_INVALID/u,
  );
});

test("inhale and settle cannot share the same candidate bytes", async () => {
  const { plan, intake } = await fixture();
  const values = completions(plan, intake);
  const duplicate = structuredClone(values[1]);
  duplicate.candidateArtifact = structuredClone(values[0].candidateArtifact);
  duplicate.ledgerCandidate.ledgerReceiptInput.candidate = structuredClone(
    values[0].ledgerCandidate.ledgerReceiptInput.candidate,
  );
  delete duplicate.contentDigest;
  duplicate.contentDigest = digest(duplicate);
  await assert.rejects(
    () =>
      prepareEvaIdleLocalAiCandidateBatch(
        { profile: plan, intake, completions: [values[0], duplicate] },
        preparedAt,
      ),
    /EVA_IDLE_CANDIDATE_BATCH_COMPLETION_SCOPE_OR_COLLISION_INVALID/u,
  );
});

test("a re-signed completion cannot change the original Art work order", async () => {
  const { plan, intake } = await fixture();
  const values = completions(plan, intake);
  const tampered = structuredClone(values[0]);
  tampered.ledgerCandidate.ledgerReceiptInput.workOrder.promptPackage.positive =
    "tampered prompt";
  delete tampered.contentDigest;
  tampered.contentDigest = digest(tampered);
  await assert.rejects(
    () =>
      prepareEvaIdleLocalAiCandidateBatch(
        { profile: plan, intake, completions: [tampered, values[1]] },
        preparedAt,
      ),
    /EVA_IDLE_CANDIDATE_BATCH_WORK_ORDER_MISMATCH/u,
  );
});

test("a completion cannot smuggle creative approval into atomic admission", async () => {
  const { plan, intake } = await fixture();
  const values = completions(plan, intake);
  const tampered = structuredClone(values[0]);
  tampered.acceptanceBoundary.creativeApprovalGranted = true;
  delete tampered.contentDigest;
  tampered.contentDigest = digest(tampered);
  await assert.rejects(
    () =>
      prepareEvaIdleLocalAiCandidateBatch(
        { profile: plan, intake, completions: [tampered, values[1]] },
        preparedAt,
      ),
    /EVA_IDLE_CANDIDATE_BATCH_COMPLETION_BOUNDARY_INVALID/u,
  );
});
