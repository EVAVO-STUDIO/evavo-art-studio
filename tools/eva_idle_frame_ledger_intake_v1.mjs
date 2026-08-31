import { createHash } from "node:crypto";

import {
  ANIMATION_FRAME_LEDGER_PROTOCOL_VERSION,
  ANIMATION_FRAME_WORK_BATCH_KIND,
  ANIMATION_FRAME_WORK_ORDER_KIND,
  animationFrameLedgerSha256,
  applyAnimationFrameCandidateBatch,
  assertAnimationFrameWorkLedgerIntegrity,
  compileAnimationFrameCandidateReceipt,
  compileNextAnimationFrameWorkBatch,
  createAnimationFrameWorkLedger,
} from "./animation_frame_work_ledger_v1.mjs";
import { compileAnimationCandidateProductionHandoffV2 } from "./animation_candidate_production_handoff_v2.mjs";
import { compileEvaIdleReviewedSourceGenerationState } from "./eva_idle_reviewed_source_generation_adapter_v1.mjs";

export const EVA_IDLE_FRAME_LEDGER_INTAKE_VERSION =
  "evavo.eva-idle-frame-ledger-intake.v1";
export const EVA_IDLE_FRAME_LEDGER_VERIFICATION_VERSION =
  "evavo.eva-idle-frame-ledger-intake-verification.v1";
export const EVA_IDLE_BREAKDOWN_PRODUCTION_HANDOFF_VERSION =
  "evavo.eva-idle-breakdown-production-handoff.v1";

const SHA = /^sha256:[0-9a-f]{64}$/u;
const RAW_SHA = /^[0-9a-f]{64}$/u;
const ARTIFACT = /^artifact_[0-9a-f]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/u;
const LEDGER_AUTHORITY = Object.freeze({
  providerExecution: false,
  automaticCreativeApproval: false,
  artifactPromotion: false,
  targetRepositoryMutation: false,
  gitCommit: false,
  gitPush: false,
  runtimeActivation: false,
  publication: false,
});
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

function prefixedSha(value, code) {
  if (typeof value !== "string") fail(code);
  if (SHA.test(value)) return value;
  if (RAW_SHA.test(value)) return `sha256:${value}`;
  fail(code);
}

function assertFalseAuthority(value, expected, code) {
  const authority = record(value, code);
  if (JSON.stringify(authority) !== JSON.stringify(expected)) fail(code);
}

function assertSafeId(value, code) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) fail(code, String(value));
  return value;
}

function assertArtifact(value, code) {
  if (typeof value !== "string" || !ARTIFACT.test(value)) fail(code, String(value));
  return value;
}

function assertSha(value, code) {
  if (typeof value !== "string" || !SHA.test(value)) fail(code, String(value));
  return value;
}

function assertPositiveInteger(value, code, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    fail(code, String(value));
  }
  return value;
}

function iso(value, code) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) fail(code);
  return date.toISOString();
}

function sourceById(bridge) {
  const result = new Map();
  for (const sourceValue of bridge.reviewedSources ?? []) {
    const source = record(sourceValue, "EVA_IDLE_LEDGER_REVIEWED_SOURCE_INVALID");
    if (result.has(source.sourceId)) {
      fail("EVA_IDLE_LEDGER_REVIEWED_SOURCE_DUPLICATE", source.sourceId);
    }
    result.set(source.sourceId, source);
  }
  return result;
}

function drawingById(profile) {
  return new Map(profile.drawings.map((drawing) => [drawing.id, drawing]));
}

function sourceCandidate(source, bridge) {
  assertArtifact(source.artifactId, "EVA_IDLE_LEDGER_SOURCE_ARTIFACT_INVALID");
  assertSha(source.contentDigest, "EVA_IDLE_LEDGER_SOURCE_DIGEST_INVALID");
  assertSha(
    source.inspectionEvidenceDigest,
    "EVA_IDLE_LEDGER_SOURCE_INSPECTION_DIGEST_INVALID",
  );
  assertSha(
    source.reviewDecisionDigest,
    "EVA_IDLE_LEDGER_SOURCE_REVIEW_DIGEST_INVALID",
  );
  assertPositiveInteger(
    source.byteLength,
    "EVA_IDLE_LEDGER_SOURCE_BYTE_LENGTH_INVALID",
  );
  assertPositiveInteger(source.width, "EVA_IDLE_LEDGER_SOURCE_WIDTH_INVALID", 8192);
  assertPositiveInteger(source.height, "EVA_IDLE_LEDGER_SOURCE_HEIGHT_INVALID", 8192);
  if (
    source.mediaType !== "image/png" ||
    source.meaningfulAlpha !== true ||
    source.reviewStatus !== "sealed" ||
    source.decision !== "keep"
  ) {
    fail("EVA_IDLE_LEDGER_SOURCE_NOT_REUSABLE", source.sourceId);
  }
  return Object.freeze({
    artifactId: source.artifactId,
    contentDigest: source.contentDigest,
    byteLength: source.byteLength,
    mediaType: "image/png",
    width: source.width,
    height: source.height,
    meaningfulAlpha: true,
    providerRequestDigest: prefixedSha(
      bridge.sourceReusePlanSha256,
      "EVA_IDLE_LEDGER_SOURCE_REUSE_PLAN_DIGEST_INVALID",
    ),
    providerResponseDigest: prefixedSha(
      bridge.sourceReviewFinalizationSha256,
      "EVA_IDLE_LEDGER_SOURCE_FINALIZATION_DIGEST_INVALID",
    ),
    inspectionEvidenceDigest: source.inspectionEvidenceDigest,
    adapterId: "eva-reviewed-source-reuse-v1",
    origin: "reviewed-source-reuse",
    sourceId: source.sourceId,
    reviewDecisionId: source.reviewDecisionId,
    reviewDecisionDigest: source.reviewDecisionDigest,
    sourceReviewFinalizationDigest: prefixedSha(
      bridge.sourceReviewFinalizationSha256,
      "EVA_IDLE_LEDGER_SOURCE_FINALIZATION_DIGEST_INVALID",
    ),
    sourceReusePlanDigest: prefixedSha(
      bridge.sourceReusePlanSha256,
      "EVA_IDLE_LEDGER_SOURCE_REUSE_PLAN_DIGEST_INVALID",
    ),
    generationAttemptConsumed: false,
    immutableSource: true,
    reviewStillRequired: true,
  });
}

function drawingContract(drawing) {
  return {
    generationClass: drawing.generationClass,
    role: drawing.role,
    poseId: drawing.poseId,
    poseIntent: drawing.poseIntent,
    phase: drawing.phase,
    contactAnchor: drawing.contactAnchor,
    groundContactRequired: drawing.groundContactRequired,
    expectedRootOffset: structuredClone(drawing.expectedRootOffset),
    exposureStartFrame: drawing.exposureStartFrame,
    exposureEndFrame: drawing.exposureEndFrame,
    exposureFrames: drawing.exposureFrames,
    durationMs: drawing.durationMs,
    dependencyDrawingIds: [...drawing.dependencyDrawingIds],
    eventIds: [...drawing.eventIds],
  };
}

function outputContract(profile) {
  return {
    images: 1,
    mediaType: "image/png",
    width: profile.request.delivery.canvas.width,
    height: profile.request.delivery.canvas.height,
    meaningfulAlphaRequired: profile.request.delivery.alphaRequired,
    trim: false,
    pivot: structuredClone(profile.request.delivery.pivot),
    candidateOnly: true,
  };
}

function reuseWorkOrder(profile, ledger, drawing, reused, source, bridge, now) {
  const issuedAt = iso(now, "EVA_IDLE_LEDGER_TIME_INVALID");
  const candidate = sourceCandidate(source, bridge);
  const body = {
    protocolVersion: ANIMATION_FRAME_LEDGER_PROTOCOL_VERSION,
    kind: ANIMATION_FRAME_WORK_ORDER_KIND,
    workOrderId: `${ledger.sessionId}:${drawing.id}:reuse-candidate-1`,
    ledgerId: ledger.ledgerId,
    ledgerDigest: ledger.contentDigest,
    profileId: profile.profileId,
    profileDigest: profile.contentDigest,
    drawingId: drawing.id,
    drawingOrdinal: drawing.ordinal,
    mode: "reviewed-source-reuse",
    attempt: 1,
    idempotencyKey: animationFrameLedgerSha256({
      profileDigest: profile.contentDigest,
      drawingId: drawing.id,
      sourceArtifactId: candidate.artifactId,
      sourceContentDigest: candidate.contentDigest,
      sourceReviewDecisionDigest: candidate.reviewDecisionDigest,
    }),
    drawing: drawingContract(drawing),
    immutableLocks: {
      subject: structuredClone(profile.request.subject),
      camera: structuredClone(profile.request.camera),
      performance: structuredClone(profile.request.performance),
      style: structuredClone(profile.request.style),
      delivery: structuredClone(profile.request.delivery),
    },
    promptPackage: {
      positive: [
        `Admit the exact sealed reviewed source for ${drawing.poseId} as an existing candidate.`,
        "Do not render, redraw, transform, resample, repair, interpolate, replace or regenerate the source artifact.",
        "Generation is complete for this drawing, but independent technical and sequence review remains required.",
      ].join("\n"),
      negative: [
        "provider execution",
        "local AI execution",
        "creative approval",
        "source mutation",
        "source replacement",
        "pixel interpolation",
      ].join("; "),
      antiGenericTraits: [...profile.request.style.antiGenericTraits],
    },
    references: [
      {
        role: "reviewed-source-candidate",
        artifactId: candidate.artifactId,
        contentDigest: candidate.contentDigest,
        mediaType: candidate.mediaType,
        width: candidate.width,
        height: candidate.height,
        sourceDrawingId: drawing.id,
      },
    ],
    repair: null,
    preserveDrawingIds: [],
    expectedOutput: outputContract(profile),
    reviewRequirements: {
      drawingGates: structuredClone(profile.qualityGates.drawing),
      compareAgainstDrawingIds: [
        ...new Set(
          [
            ...drawing.dependencyDrawingIds,
            drawing.previousDrawingId,
            drawing.nextDrawingId,
          ].filter((id) => id && id !== drawing.id),
        ),
      ],
      normalSpeedSequenceReviewRequired: true,
      frameByFrameSequenceReviewRequired: true,
    },
    reuseAdmission: {
      sourceId: reused.sourceId,
      reviewDecisionId: reused.reviewDecisionId,
      reviewDecisionDigest: reused.reviewDecisionDigest,
      inspectionEvidenceDigest: reused.inspectionEvidenceDigest,
      sourceReviewFinalizationDigest: candidate.sourceReviewFinalizationDigest,
      sourceReusePlanDigest: candidate.sourceReusePlanDigest,
      generationRequired: false,
      generationAttemptConsumed: false,
      creativeApprovalGranted: false,
      independentReviewStillRequired: true,
      immutableSource: true,
    },
    authority: LEDGER_AUTHORITY,
  };
  return Object.freeze({
    ...body,
    workOrderDigest: animationFrameLedgerSha256(body),
    issuedAt,
  });
}

function reuseBatch(profile, ledger, generationState, bridge, now) {
  const drawings = drawingById(profile);
  const sources = sourceById(bridge);
  const workOrders = generationState.reusedDrawings.map((reused) => {
    const drawing = drawings.get(reused.drawingId);
    const source = sources.get(reused.sourceId);
    if (!drawing || !source) {
      fail("EVA_IDLE_LEDGER_SOURCE_BINDING_MISSING", reused.drawingId);
    }
    return reuseWorkOrder(profile, ledger, drawing, reused, source, bridge, now);
  });
  const body = {
    status: "work-ready",
    protocolVersion: ANIMATION_FRAME_LEDGER_PROTOCOL_VERSION,
    kind: ANIMATION_FRAME_WORK_BATCH_KIND,
    batchId: `${ledger.sessionId}:reviewed-source-reuse:r${ledger.revision}`,
    ledgerId: ledger.ledgerId,
    ledgerDigest: ledger.contentDigest,
    profileId: profile.profileId,
    profileDigest: profile.contentDigest,
    generationBatchId: "reviewed-source-reuse",
    mode: "reviewed-source-reuse",
    workOrders,
    authority: LEDGER_AUTHORITY,
  };
  return Object.freeze({
    ...body,
    batchDigest: animationFrameLedgerSha256(body),
    issuedAt: iso(now, "EVA_IDLE_LEDGER_TIME_INVALID"),
  });
}

function appendUniqueReference(references, reference) {
  const key = `${reference.role}:${reference.artifactId}`;
  if (references.some((entry) => `${entry.role}:${entry.artifactId}` === key)) {
    return references;
  }
  return [...references, structuredClone(reference)];
}

function withWorkOrderDigest(workOrder) {
  const { workOrderDigest: _digest, issuedAt, ...body } = workOrder;
  return Object.freeze({
    ...body,
    workOrderDigest: animationFrameLedgerSha256(body),
    issuedAt,
  });
}

function enrichBreakdownWorkOrder(coreOrder, specializedOrder, generationState) {
  if (
    coreOrder.drawingId !== specializedOrder.drawingId ||
    coreOrder.drawing.poseId !== specializedOrder.poseId ||
    coreOrder.drawing.generationClass !== "breakdown"
  ) {
    fail("EVA_IDLE_LEDGER_BREAKDOWN_WORK_ORDER_MISMATCH", coreOrder.drawingId);
  }
  const reusedByDrawing = new Map(
    generationState.reusedDrawings.map((entry) => [entry.drawingId, entry]),
  );
  let references = coreOrder.references.map((reference) => {
    const reused = reusedByDrawing.get(reference.sourceDrawingId);
    if (!reused) return structuredClone(reference);
    return {
      ...structuredClone(reference),
      origin: "reviewed-source-reuse",
      immutableSource: true,
      generationAttemptConsumed: false,
      reviewDecisionDigest: reused.reviewDecisionDigest,
      inspectionEvidenceDigest: reused.inspectionEvidenceDigest,
    };
  });
  for (const supplemental of specializedOrder.supplementalReferences) {
    references = appendUniqueReference(references, supplemental);
  }
  const reusedDrawingIds = generationState.completedDrawingIds;
  const positive = [
    coreOrder.promptPackage.positive,
    `Author only the missing ${specializedOrder.poseId} breakdown drawing between the exact sealed reviewed endpoints.`,
    "Treat both reviewed source endpoints as immutable bracketing evidence. Do not regenerate, redraw, transform, resample or replace them.",
    "Do not use pixel interpolation as the canonical authored drawing.",
  ].join("\n");
  const negative = [
    coreOrder.promptPackage.negative,
    "regeneration of reviewed source endpoints",
    "mutation or replacement of reviewed source endpoints",
    "pixel interpolation presented as authored canonical art",
  ].join("; ");
  return withWorkOrderDigest({
    ...structuredClone(coreOrder),
    promptPackage: {
      ...structuredClone(coreOrder.promptPackage),
      positive,
      negative,
    },
    references,
    preserveDrawingIds: [
      ...new Set([...(coreOrder.preserveDrawingIds ?? []), ...reusedDrawingIds]),
    ].sort(),
    sourceBracket: structuredClone(specializedOrder.authoritativeNeighbours),
    supplementalReferences: structuredClone(
      specializedOrder.supplementalReferences,
    ),
    sourceReusePolicy: {
      preserveReviewedSourceReferencesExactly: true,
      reviewedSourcesAreReferenceNotGenerationTargets: true,
      noEndpointRegeneration: true,
      noCanonicalPixelInterpolation: true,
      onlyThisMissingDrawingMayBeGenerated: true,
      reusedDrawingsRemainInFinalReview: true,
    },
    reviewRequirements: {
      ...structuredClone(coreOrder.reviewRequirements),
      reusedDrawingIds: [...reusedDrawingIds],
      fullFourDrawingSequenceReviewRequired: true,
    },
  });
}

function enrichBreakdownBatch(coreBatch, generationState) {
  if (coreBatch.status !== "work-ready" || coreBatch.mode !== "generate") {
    fail("EVA_IDLE_LEDGER_BREAKDOWN_BATCH_NOT_READY", coreBatch.status);
  }
  const specialized = new Map(
    generationState.workOrders.map((entry) => [entry.drawingId, entry]),
  );
  const expected = [...generationState.pendingDrawingIds].sort();
  const actual = coreBatch.workOrders.map((entry) => entry.drawingId).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail("EVA_IDLE_LEDGER_BREAKDOWN_SCOPE_INVALID");
  }
  const workOrders = coreBatch.workOrders.map((order) => {
    const specializedOrder = specialized.get(order.drawingId);
    if (!specializedOrder) {
      fail("EVA_IDLE_LEDGER_SPECIALIZED_WORK_ORDER_MISSING", order.drawingId);
    }
    return enrichBreakdownWorkOrder(order, specializedOrder, generationState);
  });
  const { batchDigest: _digest, issuedAt, ...body } = coreBatch;
  const nextBody = { ...body, workOrders };
  return Object.freeze({
    ...nextBody,
    batchDigest: animationFrameLedgerSha256(nextBody),
    issuedAt,
  });
}

function compileProductionHandoffs(batch) {
  return Object.freeze(
    batch.workOrders.map((workOrder) => {
      const baseHandoff = compileAnimationCandidateProductionHandoffV2({
        workOrder,
        supplementalReferences: workOrder.supplementalReferences ?? [],
      });
      const body = {
        schema: EVA_IDLE_BREAKDOWN_PRODUCTION_HANDOFF_VERSION,
        baseHandoffDigest: baseHandoff.contentDigest,
        workOrderId: workOrder.workOrderId,
        workOrderDigest: workOrder.workOrderDigest,
        ledgerId: workOrder.ledgerId,
        ledgerDigest: workOrder.ledgerDigest,
        profileId: workOrder.profileId,
        profileDigest: workOrder.profileDigest,
        drawingId: workOrder.drawingId,
        poseId: workOrder.drawing.poseId,
        attempt: workOrder.attempt,
        baseHandoff,
        sourceBracket: structuredClone(workOrder.sourceBracket),
        preserveDrawingIds: [...workOrder.preserveDrawingIds],
        sourceReusePolicy: structuredClone(workOrder.sourceReusePolicy),
        reviewRequirements: structuredClone(workOrder.reviewRequirements),
        routePolicy: {
          order: [...baseHandoff.routePolicy.order],
          reviewedSourceCandidateDependencyOverride: true,
          sealedKeepEvidenceRequired: true,
          reviewedSourceDependenciesGrantCreativeApproval: false,
          generatedDrawingCandidateOnly: true,
          artifactPromotionForbidden: true,
        },
        authority: AUTHORITY,
      };
      return Object.freeze({ ...body, contentDigest: digest(body) });
    }),
  );
}

function intakeBody(value) {
  const { contentDigest: _contentDigest, ...body } = value;
  return body;
}

export async function compileEvaIdleFrameLedgerIntake(input, now = new Date()) {
  const value = record(input, "EVA_IDLE_LEDGER_INPUT_INVALID");
  assertSafeId(value.sessionId, "EVA_IDLE_LEDGER_SESSION_ID_INVALID");
  const profile = record(value.profile, "EVA_IDLE_LEDGER_PROFILE_INVALID");
  const bridge = record(value.bridge, "EVA_IDLE_LEDGER_BRIDGE_INVALID");
  const generationState = compileEvaIdleReviewedSourceGenerationState(
    profile,
    bridge,
  );
  const baseLedger = await createAnimationFrameWorkLedger(
    { profile, sessionId: value.sessionId },
    now,
  );
  const sourceReuseBatch = reuseBatch(
    profile,
    baseLedger,
    generationState,
    bridge,
    now,
  );
  const sources = sourceById(bridge);
  const sourceReuseReceipts = sourceReuseBatch.workOrders.map((workOrder) => {
    const sourceId = workOrder.reuseAdmission.sourceId;
    const source = sources.get(sourceId);
    if (!source) fail("EVA_IDLE_LEDGER_REVIEWED_SOURCE_MISSING", sourceId);
    return compileAnimationFrameCandidateReceipt(
      {
        workOrder,
        ledgerDigest: baseLedger.contentDigest,
        candidate: sourceCandidate(source, bridge),
      },
      now,
    );
  });
  const ledger = await applyAnimationFrameCandidateBatch(
    {
      profile,
      ledger: baseLedger,
      batch: sourceReuseBatch,
      receipts: sourceReuseReceipts,
    },
    now,
  );
  await assertAnimationFrameWorkLedgerIntegrity(profile, ledger);
  const coreBatch = await compileNextAnimationFrameWorkBatch(
    {
      profile,
      ledger,
      referenceBindings: bridge.referenceBindings,
    },
    now,
  );
  const nextWorkBatch = enrichBreakdownBatch(coreBatch, generationState);
  const productionHandoffs = compileProductionHandoffs(nextWorkBatch);
  const body = {
    schema: EVA_IDLE_FRAME_LEDGER_INTAKE_VERSION,
    characterId: "eva-female",
    clipId: "idle-primary",
    sessionId: value.sessionId,
    profileId: profile.profileId,
    profileDigest: profile.contentDigest,
    generationStateDigest: generationState.contentDigest,
    sourceReviewFinalizationDigest: prefixedSha(
      bridge.sourceReviewFinalizationSha256,
      "EVA_IDLE_LEDGER_SOURCE_FINALIZATION_DIGEST_INVALID",
    ),
    sourceReusePlanDigest: prefixedSha(
      bridge.sourceReusePlanSha256,
      "EVA_IDLE_LEDGER_SOURCE_REUSE_PLAN_DIGEST_INVALID",
    ),
    referenceBindings: structuredClone(bridge.referenceBindings),
    reusedDrawingIds: [...generationState.completedDrawingIds],
    pendingDrawingIds: [...generationState.pendingDrawingIds],
    sourceReuseBatch,
    sourceReuseReceipts: Object.freeze(sourceReuseReceipts),
    ledger,
    nextWorkBatch,
    productionHandoffs,
    rules: Object.freeze({
      reviewedReuseIsCandidateAdmissionNotCreativeApproval: true,
      reusedSourcesAreByteIdentityLocked: true,
      reusedSourcesNeverEnterGenerationBatch: true,
      onlyInhaleAndSettleMayBeGenerated: true,
      rejectedReusedSourcesMayEnterNormalRepairCycle: true,
      allFourDrawingsRemainInIndependentFinalReview: true,
      noCanonicalPixelInterpolation: true,
    }),
    authority: AUTHORITY,
  };
  return Object.freeze({ ...body, contentDigest: digest(body) });
}

function latestCandidate(state) {
  return state.candidates?.at(-1)?.candidate;
}

function assertBatchSelfIntegrity(batch) {
  const value = record(batch, "EVA_IDLE_LEDGER_BATCH_INVALID");
  const { batchDigest, issuedAt, ...body } = value;
  assertSha(batchDigest, "EVA_IDLE_LEDGER_BATCH_DIGEST_INVALID");
  iso(issuedAt, "EVA_IDLE_LEDGER_BATCH_TIME_INVALID");
  if (animationFrameLedgerSha256(body) !== batchDigest) {
    fail("EVA_IDLE_LEDGER_BATCH_DIGEST_MISMATCH");
  }
  assertFalseAuthority(
    value.authority,
    LEDGER_AUTHORITY,
    "EVA_IDLE_LEDGER_BATCH_AUTHORITY_INVALID",
  );
  for (const workOrderValue of value.workOrders ?? []) {
    const workOrder = record(
      workOrderValue,
      "EVA_IDLE_LEDGER_WORK_ORDER_INVALID",
    );
    const {
      workOrderDigest,
      issuedAt: workOrderIssuedAt,
      ...workOrderBody
    } = workOrder;
    assertSha(
      workOrderDigest,
      "EVA_IDLE_LEDGER_WORK_ORDER_DIGEST_INVALID",
    );
    iso(workOrderIssuedAt, "EVA_IDLE_LEDGER_WORK_ORDER_TIME_INVALID");
    if (animationFrameLedgerSha256(workOrderBody) !== workOrderDigest) {
      fail("EVA_IDLE_LEDGER_WORK_ORDER_DIGEST_MISMATCH", workOrder.drawingId);
    }
    assertFalseAuthority(
      workOrder.authority,
      LEDGER_AUTHORITY,
      "EVA_IDLE_LEDGER_WORK_ORDER_AUTHORITY_INVALID",
    );
  }
}

export async function verifyEvaIdleFrameLedgerIntake(
  profileValue,
  bridgeValue,
  intakeValue,
) {
  const profile = record(profileValue, "EVA_IDLE_LEDGER_VERIFY_PROFILE_INVALID");
  const bridge = record(bridgeValue, "EVA_IDLE_LEDGER_VERIFY_BRIDGE_INVALID");
  const intake = record(intakeValue, "EVA_IDLE_LEDGER_VERIFY_INPUT_INVALID");
  if (intake.schema !== EVA_IDLE_FRAME_LEDGER_INTAKE_VERSION) {
    fail("EVA_IDLE_LEDGER_SCHEMA_INVALID");
  }
  assertFalseAuthority(
    intake.authority,
    AUTHORITY,
    "EVA_IDLE_LEDGER_AUTHORITY_INVALID",
  );
  if (digest(intakeBody(intake)) !== intake.contentDigest) {
    fail("EVA_IDLE_LEDGER_CONTENT_DIGEST_MISMATCH");
  }
  const generationState = compileEvaIdleReviewedSourceGenerationState(
    profile,
    bridge,
  );
  if (
    intake.profileId !== profile.profileId ||
    intake.profileDigest !== profile.contentDigest ||
    intake.generationStateDigest !== generationState.contentDigest
  ) {
    fail("EVA_IDLE_LEDGER_PROFILE_BINDING_MISMATCH");
  }
  await assertAnimationFrameWorkLedgerIntegrity(profile, intake.ledger);
  if (
    intake.ledger.revision !== 1 ||
    intake.ledger.events.length !== 1 ||
    intake.ledger.events[0].type !== "candidate-batch-admitted" ||
    intake.ledger.events[0].ownerRole !== "art-studio"
  ) {
    fail("EVA_IDLE_LEDGER_SOURCE_ADMISSION_EVENT_INVALID");
  }
  if (
    JSON.stringify(intake.ledger.events[0].payload.batch) !==
      JSON.stringify(intake.sourceReuseBatch) ||
    JSON.stringify(intake.ledger.events[0].payload.receipts) !==
      JSON.stringify(intake.sourceReuseReceipts)
  ) {
    fail("EVA_IDLE_LEDGER_SOURCE_ADMISSION_EVENT_MISMATCH");
  }
  assertBatchSelfIntegrity(intake.sourceReuseBatch);
  assertBatchSelfIntegrity(intake.nextWorkBatch);

  const reused = new Set(generationState.completedDrawingIds);
  const pending = new Set(generationState.pendingDrawingIds);
  for (const state of intake.ledger.drawingStates) {
    if (reused.has(state.drawingId)) {
      const candidate = latestCandidate(state);
      if (
        state.status !== "candidate-ready" ||
        state.attemptCount !== 1 ||
        candidate?.origin !== "reviewed-source-reuse" ||
        candidate?.generationAttemptConsumed !== false ||
        candidate?.immutableSource !== true ||
        candidate?.reviewStillRequired !== true
      ) {
        fail("EVA_IDLE_LEDGER_REUSED_STATE_INVALID", state.drawingId);
      }
    } else if (pending.has(state.drawingId)) {
      if (
        state.status !== "pending" ||
        state.attemptCount !== 0 ||
        state.candidates.length !== 0
      ) {
        fail("EVA_IDLE_LEDGER_PENDING_STATE_INVALID", state.drawingId);
      }
    } else {
      fail("EVA_IDLE_LEDGER_UNEXPECTED_DRAWING_STATE", state.drawingId);
    }
    if (state.status === "accepted") {
      fail("EVA_IDLE_LEDGER_PREMATURE_CREATIVE_APPROVAL", state.drawingId);
    }
  }

  const coreBatch = await compileNextAnimationFrameWorkBatch(
    {
      profile,
      ledger: intake.ledger,
      referenceBindings: bridge.referenceBindings,
    },
    new Date(intake.nextWorkBatch.issuedAt),
  );
  const expectedBatch = enrichBreakdownBatch(coreBatch, generationState);
  if (JSON.stringify(expectedBatch) !== JSON.stringify(intake.nextWorkBatch)) {
    fail("EVA_IDLE_LEDGER_NEXT_BATCH_MISMATCH");
  }
  const expectedHandoffs = compileProductionHandoffs(expectedBatch);
  if (
    JSON.stringify(expectedHandoffs) !==
    JSON.stringify(intake.productionHandoffs)
  ) {
    fail("EVA_IDLE_LEDGER_HANDOFF_MISMATCH");
  }
  for (const handoff of intake.productionHandoffs) {
    if (
      handoff.routePolicy?.reviewedSourceCandidateDependencyOverride !== true ||
      handoff.routePolicy?.sealedKeepEvidenceRequired !== true ||
      handoff.routePolicy?.reviewedSourceDependenciesGrantCreativeApproval !== false ||
      handoff.routePolicy?.generatedDrawingCandidateOnly !== true ||
      handoff.routePolicy?.artifactPromotionForbidden !== true
    ) {
      fail("EVA_IDLE_LEDGER_HANDOFF_ROUTE_POLICY_INVALID", handoff.drawingId);
    }
  }
  for (const workOrder of intake.nextWorkBatch.workOrders) {
    if (reused.has(workOrder.drawingId)) {
      fail("EVA_IDLE_LEDGER_REUSED_DRAWING_REQUEUED", workOrder.drawingId);
    }
    if (!pending.has(workOrder.drawingId)) {
      fail("EVA_IDLE_LEDGER_UNEXPECTED_WORK_ORDER", workOrder.drawingId);
    }
    if (
      workOrder.sourceBracket?.length !== 2 ||
      workOrder.sourceReusePolicy?.preserveReviewedSourceReferencesExactly !==
        true ||
      workOrder.sourceReusePolicy?.noEndpointRegeneration !== true ||
      workOrder.sourceReusePolicy?.noCanonicalPixelInterpolation !== true ||
      workOrder.sourceReusePolicy?.onlyThisMissingDrawingMayBeGenerated !== true ||
      !generationState.completedDrawingIds.every((id) =>
        workOrder.preserveDrawingIds.includes(id),
      )
    ) {
      fail("EVA_IDLE_LEDGER_SOURCE_LOCK_POLICY_INVALID", workOrder.drawingId);
    }
  }

  const body = {
    schema: EVA_IDLE_FRAME_LEDGER_VERIFICATION_VERSION,
    status: "verified",
    intakeDigest: intake.contentDigest,
    ledgerId: intake.ledger.ledgerId,
    ledgerDigest: intake.ledger.contentDigest,
    sourceAdmissionBatchDigest: intake.sourceReuseBatch.batchDigest,
    nextWorkBatchDigest: intake.nextWorkBatch.batchDigest,
    reusedDrawingIds: [...generationState.completedDrawingIds],
    pendingDrawingIds: [...generationState.pendingDrawingIds],
    creativeApprovalGranted: false,
    promotionGranted: false,
    authority: AUTHORITY,
  };
  return Object.freeze({ ...body, contentDigest: digest(body) });
}
