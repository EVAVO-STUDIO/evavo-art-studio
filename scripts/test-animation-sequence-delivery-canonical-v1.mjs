import assert from "node:assert/strict";
import test from "node:test";

import {
  CREATIVE_APPROVAL_KIND,
  DELIVERY_PROTOCOL_VERSION,
  PROFILE_PLAN_KIND,
  PROFILE_PROTOCOL_VERSION,
  PROFILE_REVIEW_KIND,
  animationSequenceSha256,
  assertAnimationSequenceDeliveryIntegrity,
  assertPathFreeAnimationValue,
  assertVideoStudioAnimationIntakeIntegrity,
  compileAnimationSequenceDelivery,
  compileVideoStudioAnimationIntake,
} from "../tools/animation_sequence_delivery_canonical_v1.mjs";

function profile(exposures = [2, 2, 2]) {
  let frame = 1;
  const drawings = exposures.map((exposureFrames, index) => {
    const ordinal = index + 1;
    const start = frame;
    const end = start + exposureFrames - 1;
    frame = end + 1;
    return {
      id: `hero:walk:right:drawing-${String(ordinal).padStart(4, "0")}`,
      ordinal,
      phase: index / exposures.length,
      generationClass: index === 1 ? "breakdown" : "key-pose",
      role: index === 1 ? "passing" : "contact",
      poseId: index === 0 ? "left-contact" : index === 1 ? "passing" : "right-contact",
      poseIntent: "Author one controlled locomotion pose.",
      contactAnchor: index === 0 ? "left-foot" : index === 2 ? "right-foot" : "none",
      groundContactRequired: index !== 1,
      expectedRootOffset: { x: index * 0.04, y: index === 1 ? -0.02 : 0 },
      exposureStartFrame: start,
      exposureEndFrame: end,
      exposureFrames,
      durationMs: (exposureFrames / 24) * 1000,
      godotRelativeDuration: exposureFrames / 2,
      previousDrawingId: `hero:walk:right:drawing-${String(index === 0 ? exposures.length : index).padStart(4, "0")}`,
      nextDrawingId: `hero:walk:right:drawing-${String(index === exposures.length - 1 ? 1 : ordinal + 1).padStart(4, "0")}`,
      dependencyDrawingIds: index === 1
        ? ["hero:walk:right:drawing-0001", `hero:walk:right:drawing-${String(exposures.length).padStart(4, "0")}`]
        : [],
    };
  });
  const body = {
    protocolVersion: PROFILE_PROTOCOL_VERSION,
    kind: PROFILE_PLAN_KIND,
    profileId: "hero:walk:right:r1",
    request: {
      id: "hero:walk:right",
      revision: 1,
      state: "approved",
      action: "walk",
      direction: "right",
      loop: true,
      sourceFramesPerSecond: 24,
      targets: ["godot-sprite", "cel-sequence", "video-sequence"],
      subject: {
        subjectId: "hero",
        asymmetricVisualAnchors: ["satchel-right-hip"],
      },
      camera: {
        profileId: "side-stage-90s",
        groundLineNormalized: 0.875,
      },
      delivery: {
        animationName: "walk.right",
        canvas: { width: 256, height: 256 },
        alphaRequired: true,
        pivot: { x: 0.5, y: 0.875 },
        textureFiltering: "nearest",
      },
      mirrorPolicy: "forbidden",
    },
    totalTimelineFrames: exposures.reduce((sum, value) => sum + value, 0),
    playbackFramesPerSecond: 12,
    perspectiveGuidance: { perspective: "side-stage" },
    drawings,
    events: [
      {
        id: "left.contact",
        phase: 0,
        drawingId: drawings[0].id,
        drawingOrdinal: 1,
        timelineFrame: 1,
        kind: "left-contact",
      },
      {
        id: "right.contact",
        phase: drawings.at(-1).phase,
        drawingId: drawings.at(-1).id,
        drawingOrdinal: drawings.length,
        timelineFrame: drawings.at(-1).exposureStartFrame,
        kind: "right-contact",
      },
    ],
    generationBatches: [],
    targetPlans: [],
    qualityGates: {
      drawing: { identity: 0.9 },
      sequence: { timingReadability: 0.88 },
    },
    iterationPolicy: {
      maximumAttemptsPerDrawing: 3,
      maximumReviewCycles: 3,
      maximumNoProgressCycles: 2,
    },
    quality: {
      blockerCount: 0,
      warningCount: 0,
      findings: [],
      planningValid: true,
      promotable: true,
    },
    authority: {
      providerExecution: false,
      automaticCreativeApproval: false,
      artifactPromotion: false,
      targetRepositoryMutation: false,
      gitCommit: false,
      gitPush: false,
      publication: false,
    },
  };
  return {
    ...body,
    contentDigest: animationSequenceSha256(body),
    generatedAt: "2026-08-30T00:00:00.000Z",
  };
}

function acceptedDecision(plan) {
  const body = {
    protocolVersion: PROFILE_PROTOCOL_VERSION,
    kind: PROFILE_REVIEW_KIND,
    profileDigest: plan.contentDigest,
    cycle: 2,
    status: "accepted",
    acceptedDrawingIds: plan.drawings.map((drawing) => drawing.id),
    reviewRequiredDrawingIds: [],
    rejectedDrawingIds: [],
    retryQueue: [],
    sequenceReviewRequired: false,
    sequenceFailureCodes: [],
    noProgressCycles: 0,
    blockers: [],
    authority: {
      providerExecution: false,
      automaticCreativeApproval: false,
      artifactPromotion: false,
      runtimeActivation: false,
      publication: false,
    },
  };
  return {
    ...body,
    decisionDigest: animationSequenceSha256(body),
    decidedAt: "2026-08-30T00:10:00.000Z",
  };
}

function artifactBindings(plan) {
  return plan.drawings.map((drawing) => ({
    drawingId: drawing.id,
    artifactId: `artifact_${drawing.ordinal.toString(16).padStart(64, "0")}`,
    contentDigest: `sha256:${drawing.ordinal.toString(16).padStart(64, "a")}`,
    mediaType: "image/png",
    byteLength: 1024 + drawing.ordinal,
    width: 256,
    height: 256,
    meaningfulAlpha: true,
  }));
}

function creativeApproval(plan, decision, artifacts) {
  const body = {
    protocolVersion: DELIVERY_PROTOCOL_VERSION,
    kind: CREATIVE_APPROVAL_KIND,
    id: "hero:walk:right:creative-approval:r1",
    profileDigest: plan.contentDigest,
    reviewDecisionDigest: decision.decisionDigest,
    scope: "animation-sequence-delivery",
    approverId: "animation-director:fixture",
    approverRole: "animation-director",
    approvedAt: "2026-08-30T00:20:00.000Z",
    rationale: "The exact approved drawings preserve identity, camera, contacts and authored motion timing.",
    artifacts: artifacts.map(({ drawingId, artifactId, contentDigest }) => ({ drawingId, artifactId, contentDigest })),
    authority: {
      providerExecution: false,
      artifactPromotion: false,
      runtimeActivation: false,
      repositoryMutation: false,
      publication: false,
    },
  };
  return { ...body, approvalDigest: animationSequenceSha256(body) };
}

function deliveryInput(exposures = [2, 2, 2]) {
  const plan = profile(exposures);
  const decision = acceptedDecision(plan);
  const artifacts = artifactBindings(plan);
  return {
    profile: plan,
    decision,
    artifacts,
    creativeApproval: creativeApproval(plan, decision, artifacts),
  };
}

test("preserves exact source exposure duration in the runtime clip", () => {
  const delivery = compileAnimationSequenceDelivery(
    deliveryInput([2, 2, 2]),
    new Date("2026-08-30T00:30:00.000Z"),
  );
  assert.equal(delivery.timing.durationUnitDivisor, 2);
  assert.equal(delivery.runtimeClip.framesPerSecond, 12);
  assert.deepEqual(delivery.runtimeClip.frameDurations, [1, 1, 1]);
  assert.equal(delivery.timing.totalDurationSeconds, 0.25);
  assert.equal(
    delivery.runtimeClip.frameDurations.reduce((sum, value) => sum + value, 0) /
      delivery.runtimeClip.framesPerSecond,
    0.25,
  );
  assert.doesNotThrow(() => assertAnimationSequenceDeliveryIntegrity(delivery));
});

test("retains uneven authored exposures without fractional duration weights", () => {
  const delivery = compileAnimationSequenceDelivery(deliveryInput([2, 1, 3]));
  assert.equal(delivery.timing.durationUnitDivisor, 1);
  assert.equal(delivery.runtimeClip.framesPerSecond, 24);
  assert.deepEqual(delivery.runtimeClip.frameDurations, [2, 1, 3]);
  assert.equal(delivery.timing.totalDurationSeconds, 0.25);
});

test("allows EVAVO colon IDs but rejects path, URL and location leakage", () => {
  assert.doesNotThrow(() => assertPathFreeAnimationValue({ id: "hero:walk:right" }));
  assert.throws(() => assertPathFreeAnimationValue({ sourcePath: "frames/hero.png" }), /LOCATION_KEY_FORBIDDEN/);
  assert.throws(() => assertPathFreeAnimationValue({ sourceUrl: "https://example.invalid/hero.png" }), /LOCATION_KEY_FORBIDDEN/);
  assert.throws(() => assertPathFreeAnimationValue({ mediaLocation: "artifact-store" }), /LOCATION_KEY_FORBIDDEN/);
  assert.throws(() => assertPathFreeAnimationValue({ source: "C:\\frames\\hero.png" }), /LOCATION_VALUE_FORBIDDEN/);
  assert.throws(() => assertPathFreeAnimationValue({ source: "s3://bucket/frame.png" }), /LOCATION_VALUE_FORBIDDEN/);
});

test("requires creative approval to bind the exact accepted artifact hashes", () => {
  const input = deliveryInput();
  input.artifacts[1] = {
    ...input.artifacts[1],
    contentDigest: `sha256:${"f".repeat(64)}`,
  };
  assert.throws(() => compileAnimationSequenceDelivery(input), /CREATIVE_APPROVAL_ARTIFACT_MISMATCH/);
});

test("rejects incomplete review state and tampered delivery content", () => {
  const input = deliveryInput();
  const unresolvedBody = {
    ...input.decision,
    decisionDigest: undefined,
    decidedAt: undefined,
    status: "review-required",
    acceptedDrawingIds: [],
    reviewRequiredDrawingIds: input.profile.drawings.map((drawing) => drawing.id),
  };
  input.decision = {
    ...unresolvedBody,
    decisionDigest: animationSequenceSha256(unresolvedBody),
    decidedAt: "2026-08-30T00:10:00.000Z",
  };
  assert.throws(() => compileAnimationSequenceDelivery(input), /REVIEW_NOT_ACCEPTED/);

  const valid = compileAnimationSequenceDelivery(deliveryInput());
  assert.throws(
    () => assertAnimationSequenceDeliveryIntegrity({
      ...valid,
      timing: { ...valid.timing, totalDurationSeconds: 99 },
    }),
    /DIGEST_MISMATCH|TOTAL_DURATION_INVALID/,
  );
});

test("creates a path-free Video Studio intake and retains terminal duration", () => {
  const delivery = compileAnimationSequenceDelivery(deliveryInput());
  const intake = compileVideoStudioAnimationIntake(
    delivery,
    new Date("2026-08-30T00:40:00.000Z"),
  );
  assert.equal(intake.entries.length, 3);
  assert.equal(intake.totalDurationSeconds, 0.25);
  assert.equal(
    intake.concatPlan.terminalRepeatArtifactId,
    intake.entries.at(-1).sourceArtifactId,
  );
  assert.equal(intake.interpolationPolicy.default, "disabled");
  assert.equal(intake.artifactResolution.verifyContentDigestBeforeDecode, true);
  assert.doesNotThrow(() => assertVideoStudioAnimationIntakeIntegrity(intake));
});
