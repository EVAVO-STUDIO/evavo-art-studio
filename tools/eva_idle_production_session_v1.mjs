import {
  createAnimationFrameWorkLedger,
  compileNextAnimationFrameWorkBatch,
  compileAnimationFrameCandidateReceipt,
  applyAnimationFrameCandidateBatch,
} from "./animation_frame_work_ledger_v1.mjs";
import { compileEvaIdleSourceReconciliation } from "./eva_idle_source_reconciliation_v1.mjs";
import { compileAnimationCandidateProductionHandoffV2 } from "./animation_candidate_production_handoff_v2.mjs";

export const EVA_IDLE_PRODUCTION_SESSION_VERSION =
  "evavo.eva-idle-production-session.v1";

const AUTHORITY = Object.freeze({
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

function profileEntry(input) {
  const entry = record(input, "EVA_IDLE_SESSION_PROFILE_ENTRY_INVALID");
  if (entry.clipId !== "idle-primary") fail("EVA_IDLE_SESSION_PROFILE_REQUIRED");
  const profile = record(entry.plan, "EVA_IDLE_SESSION_PROFILE_INVALID");
  if (profile.request?.state !== "approved" || profile.quality?.promotable !== true) {
    fail("EVA_IDLE_SESSION_PROFILE_NOT_APPROVED");
  }
  return { entry, profile };
}

function reuseMap(reconciliation) {
  return new Map(
    reconciliation.selections.map((selection) => [selection.drawingId, selection]),
  );
}

function supplementalReferences(value, drawingId) {
  if (value === undefined) return [];
  const input = record(value, "EVA_IDLE_SESSION_SUPPLEMENTAL_REFERENCES_INVALID");
  const references = input[drawingId] ?? [];
  if (!Array.isArray(references) || references.length > 32) {
    fail("EVA_IDLE_SESSION_SUPPLEMENTAL_REFERENCES_INVALID", drawingId);
  }
  return references;
}

function batchRouting(batch, reconciliation, supplementalReferencesByDrawing) {
  if (batch.status !== "work-ready") {
    return Object.freeze({
      status: batch.status,
      batch,
      workOrders: Object.freeze([]),
      reusedWorkOrderCount: 0,
      unresolvedWorkOrderCount: 0,
      allCandidatesReady: false,
    });
  }
  const reused = reuseMap(reconciliation);
  const workOrders = batch.workOrders.map((workOrder) => {
    const selection = reused.get(workOrder.drawingId);
    if (!selection) {
      const supplemental = supplementalReferences(
        supplementalReferencesByDrawing,
        workOrder.drawingId,
      );
      return Object.freeze({
        drawingId: workOrder.drawingId,
        workOrder,
        route: "unresolved",
        sourceSelection: null,
        candidate: null,
        supplementalReferenceCount: supplemental.length,
        productionHandoff: compileAnimationCandidateProductionHandoffV2({
          workOrder,
          supplementalReferences: supplemental,
        }),
      });
    }
    return Object.freeze({
      drawingId: workOrder.drawingId,
      workOrder,
      route: "reviewed-source-reuse",
      sourceSelection: selection,
      candidate: selection.candidate,
      supplementalReferenceCount: 0,
      productionHandoff: null,
    });
  });
  const reusedWorkOrderCount = workOrders.filter(
    (entry) => entry.route === "reviewed-source-reuse",
  ).length;
  return Object.freeze({
    status: "batch-routing-ready",
    batch,
    workOrders: Object.freeze(workOrders),
    reusedWorkOrderCount,
    unresolvedWorkOrderCount: workOrders.length - reusedWorkOrderCount,
    supplementalReferenceCount: workOrders.reduce(
      (total, entry) => total + entry.supplementalReferenceCount,
      0,
    ),
    allCandidatesReady: reusedWorkOrderCount === workOrders.length,
  });
}

export async function compileEvaIdleProductionSession(input, now = new Date()) {
  const value = record(input, "EVA_IDLE_SESSION_INPUT_INVALID");
  const { entry, profile } = profileEntry(value.profileEntry);
  const sessionId = value.sessionId ?? "eva-idle-primary-proof-v1";
  const ledger = await createAnimationFrameWorkLedger(
    { profile, sessionId },
    now,
  );
  const reconciliation = compileEvaIdleSourceReconciliation({
    profileEntry: entry,
    reviewedSources: value.reviewedSources ?? [],
    reservedArtifactIds: value.reservedArtifactIds ?? [],
  });
  const batch = await compileNextAnimationFrameWorkBatch(
    {
      profile,
      ledger,
      referenceBindings: value.referenceBindings ?? [],
    },
    now,
  );
  const routing = batchRouting(
    batch,
    reconciliation,
    value.supplementalReferencesByDrawing,
  );
  return Object.freeze({
    schema: EVA_IDLE_PRODUCTION_SESSION_VERSION,
    characterId: "eva-female",
    clipId: "idle-primary",
    profileId: profile.profileId,
    profileDigest: profile.contentDigest,
    sessionId: ledger.sessionId,
    ledger,
    reconciliation,
    firstBatch: routing,
    nextAction:
      routing.status !== "batch-routing-ready"
        ? routing.status
        : routing.allCandidatesReady
          ? "apply-reused-candidate-batch"
          : "route-unresolved-work-orders",
    authority: AUTHORITY,
  });
}

export async function applyEvaIdleReadyBatch(input, now = new Date()) {
  const value = record(input, "EVA_IDLE_READY_BATCH_INPUT_INVALID");
  const profile = record(value.profile, "EVA_IDLE_READY_BATCH_PROFILE_INVALID");
  const ledger = record(value.ledger, "EVA_IDLE_READY_BATCH_LEDGER_INVALID");
  const batch = record(value.batch, "EVA_IDLE_READY_BATCH_BATCH_INVALID");
  if (batch.status !== "work-ready" || !Array.isArray(batch.workOrders)) {
    fail("EVA_IDLE_READY_BATCH_NOT_WORK_READY");
  }
  if (!Array.isArray(value.candidates) || value.candidates.length !== batch.workOrders.length) {
    fail("EVA_IDLE_READY_BATCH_CANDIDATE_COUNT_INVALID");
  }
  const candidates = new Map(
    value.candidates.map((entry) => {
      const item = record(entry, "EVA_IDLE_READY_BATCH_CANDIDATE_INVALID");
      return [item.drawingId, item.candidate];
    }),
  );
  const receipts = batch.workOrders.map((workOrder) => {
    const candidate = candidates.get(workOrder.drawingId);
    if (!candidate) fail("EVA_IDLE_READY_BATCH_CANDIDATE_MISSING", workOrder.drawingId);
    return compileAnimationFrameCandidateReceipt(
      {
        workOrder,
        ledgerDigest: ledger.contentDigest,
        candidate,
      },
      now,
    );
  });
  const nextLedger = await applyAnimationFrameCandidateBatch(
    { profile, ledger, batch, receipts },
    now,
  );
  const nextBatch = await compileNextAnimationFrameWorkBatch(
    {
      profile,
      ledger: nextLedger,
      referenceBindings: value.referenceBindings ?? [],
    },
    now,
  );
  return Object.freeze({
    schema: EVA_IDLE_PRODUCTION_SESSION_VERSION,
    operation: "apply-ready-batch",
    receipts: Object.freeze(receipts),
    ledger: nextLedger,
    nextBatch,
    authority: AUTHORITY,
  });
}
