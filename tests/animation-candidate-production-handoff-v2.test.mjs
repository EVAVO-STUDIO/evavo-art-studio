import assert from "node:assert/strict";
import test from "node:test";

import {
  ANIMATION_CANDIDATE_PRODUCTION_HANDOFF_V2_VERSION,
  compileAnimationCandidateProductionHandoffV2,
} from "../tools/animation_candidate_production_handoff_v2.mjs";

const hex = (char) => char.repeat(64);
const sha = (char) => `sha256:${hex(char)}`;
const artifact = (char) => `artifact_${hex(char)}`;

function workOrder() {
  return {
    schema: "evavo.animation-frame-work-order.v1",
    workOrderId: "work_idle_inhale_attempt_1",
    workOrderDigest: sha("c"),
    ledgerId: "ledger_idle_v1",
    ledgerRevision: 1,
    ledgerDigest: sha("a"),
    profileId: "eva-female:idle-primary:r1",
    profileDigest: sha("b"),
    drawingId: "eva-idle-primary-inhale",
    attempt: 1,
    attemptId: "eva-idle-primary-inhale-attempt-1",
    idempotencyKey: "eva-idle-primary-inhale-attempt-1",
    mode: "generate",
    drawing: {
      ordinal: 2,
      poseId: "inhale",
      role: "breakdown",
      generationClass: "breakdown",
      phase: "inhale",
      intent: "subtle inhale",
      contactAnchor: "feet",
      groundContactRequired: true,
      rootOffset: { x: 0, y: 0 },
      exposureFrames: 10,
      durationMs: 417,
      dependencyDrawingIds: ["eva-idle-primary-rest"],
    },
    immutableLocks: {
      camera: {},
      identity: {},
      performance: {},
      style: {},
      delivery: { canvas: { width: 1024, height: 1536 } },
    },
    promptPackage: {
      positive: "subtle inhale",
      negative: "identity drift",
    },
    references: [
      {
        role: "identity",
        artifactId: artifact("1"),
        contentDigest: sha("1"),
        mediaType: "image/png",
        width: 1024,
        height: 1536,
      },
    ],
    repair: null,
    expectedOutput: {
      mediaType: "image/png",
      width: 1024,
      height: 1536,
      alphaRequired: true,
      trim: false,
    },
    reviewRequirements: {},
    routePolicy: {
      candidateOnly: true,
      creativeApprovalRequired: true,
      artifactPromotionAllowed: false,
      repositoryMutationAllowed: false,
    },
    authority: {
      providerExecution: false,
      localExecution: false,
      automaticCreativeApproval: false,
      artifactPromotion: false,
      targetRepositoryMutation: false,
      gitCommit: false,
      gitPush: false,
      runtimeActivation: false,
      publication: false,
    },
  };
}

test("adds reviewed supplemental guidance without changing accepted dependency semantics", () => {
  const handoff = compileAnimationCandidateProductionHandoffV2({
    workOrder: workOrder(),
    supplementalReferences: [
      {
        role: "reviewed-pose-reference",
        artifactId: artifact("2"),
        contentDigest: sha("2"),
        mediaType: "image/png",
        width: 1024,
        height: 1536,
        sourceFrameId: "eva-raw-frame-42",
        sourceReviewDigest: sha("3"),
      },
    ],
  });
  assert.equal(handoff.schema, ANIMATION_CANDIDATE_PRODUCTION_HANDOFF_V2_VERSION);
  assert.equal(handoff.supplementalReferences.length, 1);
  assert.equal(handoff.references.length, 2);
  assert.equal(handoff.routePolicy.supplementalReviewedReferencesAllowed, true);
  assert.equal(handoff.routePolicy.supplementalReferencesAreGuidanceOnly, true);
  assert.equal(handoff.routePolicy.supplementalReferencesCannotSatisfyAcceptedDependencies, true);
  assert.equal(handoff.authority.providerExecution, false);
  assert.equal(handoff.authority.candidateApproval, false);
  assert.match(handoff.contentDigest, /^sha256:[0-9a-f]{64}$/u);
});

test("deduplicates a supplemental reference already present on the base work order", () => {
  const order = workOrder();
  const handoff = compileAnimationCandidateProductionHandoffV2({
    workOrder: order,
    supplementalReferences: [
      {
        role: "identity",
        artifactId: artifact("1"),
        contentDigest: sha("1"),
        mediaType: "image/png",
        width: 1024,
        height: 1536,
        sourceFrameId: "eva-raw-frame-1",
        sourceReviewDigest: sha("4"),
      },
    ],
  });
  assert.equal(handoff.references.length, 1);
  assert.equal(handoff.supplementalReferences.length, 0);
});

test("rejects malformed or non-image supplemental references", () => {
  assert.throws(
    () => compileAnimationCandidateProductionHandoffV2({
      workOrder: workOrder(),
      supplementalReferences: [{
        role: "reviewed-pose-reference",
        artifactId: artifact("2"),
        contentDigest: sha("2"),
        mediaType: "image/webp",
        width: 1024,
        height: 1536,
      }],
    }),
    /ANIMATION_HANDOFF_V2_REFERENCE_MEDIA_INVALID/u,
  );
});
