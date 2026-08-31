import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { compileEvaCanonicalProfileBundle } from "../tools/eva_avatar_canonical_profile_adapter_v1.mjs";
import {
  animationFrameLedgerSha256,
} from "../tools/animation_frame_work_ledger_v1.mjs";
import {
  compileEvaIdleFrameLedgerIntake,
  verifyEvaIdleFrameLedgerIntake,
} from "../tools/eva_idle_frame_ledger_intake_v1.mjs";

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

function resignIntake(value) {
  const clone = structuredClone(value);
  delete clone.contentDigest;
  return { ...clone, contentDigest: digest(clone) };
}

function resignWorkOrder(workOrder) {
  const clone = structuredClone(workOrder);
  const issuedAt = clone.issuedAt;
  delete clone.workOrderDigest;
  delete clone.issuedAt;
  return {
    ...clone,
    workOrderDigest: animationFrameLedgerSha256(clone),
    issuedAt,
  };
}

function resignBatch(batch) {
  const clone = structuredClone(batch);
  const issuedAt = clone.issuedAt;
  delete clone.batchDigest;
  delete clone.issuedAt;
  return {
    ...clone,
    batchDigest: animationFrameLedgerSha256(clone),
    issuedAt,
  };
}

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

function bridge(plan, { rest = true, exhale = true } = {}) {
  const poses = new Map(plan.drawings.map((drawing) => [drawing.poseId, drawing]));
  const reviewedSources = [];
  if (rest) {
    reviewedSources.push(
      source("reviewed-rest", poses.get("rest").id, "2"),
    );
  }
  if (exhale) {
    reviewedSources.push(
      source("reviewed-exhale", poses.get("exhale").id, "3"),
    );
  }
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
    reviewedSources,
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
      restReuseEligible: rest,
      exhaleReuseEligible: exhale,
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

const fixedNow = new Date("2026-08-31T11:00:00.000Z");

async function fixture() {
  const plan = profile();
  const sourceBridge = bridge(plan);
  const intake = await compileEvaIdleFrameLedgerIntake(
    {
      profile: plan,
      bridge: sourceBridge,
      sessionId: "eva-idle-first-production-slice",
    },
    fixedNow,
  );
  return { plan, sourceBridge, intake };
}

test("reviewed rest and exhale enter the immutable ledger while only inhale and settle are queued", async () => {
  const { plan, sourceBridge, intake } = await fixture();
  const poses = new Map(plan.drawings.map((drawing) => [drawing.poseId, drawing]));
  const stateByDrawing = new Map(
    intake.ledger.drawingStates.map((state) => [state.drawingId, state]),
  );

  for (const poseId of ["rest", "exhale"]) {
    const state = stateByDrawing.get(poses.get(poseId).id);
    assert.equal(state.status, "candidate-ready");
    assert.equal(state.attemptCount, 1);
    assert.equal(state.candidates.length, 1);
    assert.equal(
      state.candidates[0].candidate.origin,
      "reviewed-source-reuse",
    );
    assert.equal(
      state.candidates[0].candidate.generationAttemptConsumed,
      false,
    );
    assert.equal(state.candidates[0].candidate.immutableSource, true);
    assert.equal(state.candidates[0].candidate.reviewStillRequired, true);
  }

  for (const poseId of ["inhale", "settle"]) {
    const state = stateByDrawing.get(poses.get(poseId).id);
    assert.equal(state.status, "pending");
    assert.equal(state.attemptCount, 0);
    assert.deepEqual(state.candidates, []);
  }

  assert.equal(intake.ledger.revision, 1);
  assert.equal(intake.ledger.events.length, 1);
  assert.equal(intake.ledger.events[0].type, "candidate-batch-admitted");
  assert.equal(intake.sourceReuseBatch.mode, "reviewed-source-reuse");
  assert.equal(intake.sourceReuseReceipts.length, 2);
  assert.equal(intake.nextWorkBatch.status, "work-ready");
  assert.deepEqual(
    intake.nextWorkBatch.workOrders.map((order) => order.drawing.poseId).sort(),
    ["inhale", "settle"],
  );
  assert.equal(
    intake.nextWorkBatch.workOrders.some((order) =>
      ["rest", "exhale"].includes(order.drawing.poseId),
    ),
    false,
  );

  for (const order of intake.nextWorkBatch.workOrders) {
    assert.equal(order.sourceBracket.length, 2);
    assert.equal(
      order.sourceBracket.every(
        (entry) =>
          entry.artifact.contentDigest.startsWith("sha256:") &&
          entry.inspectionEvidenceDigest.startsWith("sha256:"),
      ),
      true,
    );
    assert.equal(
      order.sourceReusePolicy.preserveReviewedSourceReferencesExactly,
      true,
    );
    assert.equal(order.sourceReusePolicy.noEndpointRegeneration, true);
    assert.equal(order.sourceReusePolicy.noCanonicalPixelInterpolation, true);
    assert.equal(
      intake.reusedDrawingIds.every((id) =>
        order.preserveDrawingIds.includes(id),
      ),
      true,
    );
  }

  assert.equal(intake.productionHandoffs.length, 2);
  assert.equal(
    intake.productionHandoffs.every(
      (handoff) =>
        handoff.sourceBracket.length === 2 &&
        handoff.sourceReusePolicy.onlyThisMissingDrawingMayBeGenerated ===
          true &&
        Object.values(handoff.authority).every((value) => value === false),
    ),
    true,
  );

  const verification = await verifyEvaIdleFrameLedgerIntake(
    plan,
    sourceBridge,
    intake,
  );
  assert.equal(verification.status, "verified");
  assert.equal(verification.creativeApprovalGranted, false);
  assert.equal(verification.promotionGranted, false);
});

test("tampering with a reused source candidate breaks ledger replay integrity", async () => {
  const { plan, sourceBridge, intake } = await fixture();
  const tampered = structuredClone(intake);
  tampered.ledger.drawingStates[0].candidates[0].candidate.contentDigest =
    prefixed("9");
  const resigned = resignIntake(tampered);
  await assert.rejects(
    () => verifyEvaIdleFrameLedgerIntake(plan, sourceBridge, resigned),
    /ANIMATION_FRAME_LEDGER_DIGEST_MISMATCH|ANIMATION_FRAME_LEDGER_REPLAY_MISMATCH/u,
  );
});

test("a reused endpoint cannot be smuggled back into the breakdown batch", async () => {
  const { plan, sourceBridge, intake } = await fixture();
  const poses = new Map(plan.drawings.map((drawing) => [drawing.poseId, drawing]));
  const tampered = structuredClone(intake);
  tampered.nextWorkBatch.workOrders[0] = resignWorkOrder({
    ...tampered.nextWorkBatch.workOrders[0],
    drawingId: poses.get("rest").id,
  });
  tampered.nextWorkBatch = resignBatch(tampered.nextWorkBatch);
  const resigned = resignIntake(tampered);
  await assert.rejects(
    () => verifyEvaIdleFrameLedgerIntake(plan, sourceBridge, resigned),
    /EVA_IDLE_LEDGER_NEXT_BATCH_MISMATCH|EVA_IDLE_LEDGER_REUSED_DRAWING_REQUEUED/u,
  );
});

test("the intake cannot acquire provider or approval authority", async () => {
  const { plan, sourceBridge, intake } = await fixture();
  const tampered = structuredClone(intake);
  tampered.authority.providerExecution = true;
  const resigned = resignIntake(tampered);
  await assert.rejects(
    () => verifyEvaIdleFrameLedgerIntake(plan, sourceBridge, resigned),
    /EVA_IDLE_LEDGER_AUTHORITY_INVALID/u,
  );
});

test("both sealed reviewed endpoints are mandatory before the ledger can unlock breakdown work", async () => {
  const plan = profile();
  await assert.rejects(
    () =>
      compileEvaIdleFrameLedgerIntake(
        {
          profile: plan,
          bridge: bridge(plan, { exhale: false }),
          sessionId: "eva-idle-missing-exhale",
        },
        fixedNow,
      ),
    /EVA_IDLE_GENERATION_REQUIRED_REUSE_MISSING:exhale/u,
  );
});
