import {
  exactKeys,
  fail,
  freeze,
  idValue,
  record,
  sha256,
  stringValue,
} from "./layered-production-internal.js";
import type {
  CompiledLayeredProductionPlan,
  CompiledLayeredProductionUnit,
} from "./layered-production-types.js";
import {
  ART_PRODUCTION_ATTEMPT_KIND,
  ART_PRODUCTION_ORCHESTRATOR_PROTOCOL_VERSION,
} from "./art-production-orchestrator-types.js";
import type {
  ArtProductionAttemptDecision,
  ArtProductionAttemptInput,
  ArtProductionAttemptRecord,
  ArtProductionLoop,
  ArtProductionUnitState,
} from "./art-production-orchestrator-types.js";
import {
  verifyArtProductionCandidateAdmissionReceiptForVerifiedLoop,
} from "./art-production-candidate-admission.js";
import {
  resolveArtProductionLoopRevisionFromVerifiedLoop,
} from "./art-production-loop.js";
import {
  compileArtProductionJobForVerifiedLoop,
} from "./art-production-scheduler.js";
import {
  REPAIR_BY_DETECTION,
  REPAIR_BY_METRIC,
} from "./art-production-repair-rules.js";
import {
  normalizeDetections,
  normalizeMetrics,
  requiredMetrics,
  strictUtc,
} from "./art-production-review-normalization.js";
import {
  metricMinimum,
  retryPrompt,
  weightedScore,
} from "./art-production-review-scoring.js";

export function buildAttemptRecord(
  plan: CompiledLayeredProductionPlan,
  loop: ArtProductionLoop,
  state: ArtProductionUnitState,
  unit: CompiledLayeredProductionUnit,
  inputValue: unknown,
): ArtProductionAttemptRecord {
  const input = record(inputValue, "attempt");
  exactKeys(input, "attempt", [
    "schemaVersion",
    "kind",
    "loopSha256",
    "unitId",
    "evaluator",
    "evaluatedAt",
    "candidateAdmissionReceipt",
    "metrics",
    "detections",
  ]);
  if (
    input.schemaVersion !== "1.0" ||
    input.kind !== ART_PRODUCTION_ATTEMPT_KIND
  ) {
    fail(
      "ART_PRODUCTION_ATTEMPT_INVALID",
      "Attempt schema or kind is invalid.",
    );
  }
  if (input.loopSha256 !== loop.loopSha256) {
    fail(
      "ART_PRODUCTION_LOOP_DRIFT",
      "Attempt is not bound to the current production loop.",
    );
  }
  const unitId = idValue(input.unitId, "attempt.unitId");
  if (unitId !== state.unitId) {
    fail(
      "ART_PRODUCTION_ATTEMPT_INVALID",
      "Attempt unit does not match the selected unit state.",
    );
  }

  const admissionEnvelope = record(
    input.candidateAdmissionReceipt,
    "attempt.candidateAdmissionReceipt",
  );
  const scheduledLoopSha256 = stringValue(
    admissionEnvelope.loopSha256,
    "attempt.candidateAdmissionReceipt.loopSha256",
    64,
  );
  const scheduledLoop =
    scheduledLoopSha256 === loop.loopSha256
      ? loop
      : resolveArtProductionLoopRevisionFromVerifiedLoop(
          plan,
          loop,
          scheduledLoopSha256,
        );
  const candidateAdmissionReceipt =
    verifyArtProductionCandidateAdmissionReceiptForVerifiedLoop(
      plan,
      scheduledLoop,
      input.candidateAdmissionReceipt,
    );
  if (
    candidateAdmissionReceipt.unitId !== unitId ||
    candidateAdmissionReceipt.scheduledJob.attemptNumber !==
      state.attemptCount + 1
  ) {
    fail(
      "ART_PRODUCTION_ATTEMPT_INVALID",
      "Attempt candidate admission does not match the selected unit and attempt number.",
    );
  }

  const currentJob = compileArtProductionJobForVerifiedLoop(
    plan,
    loop,
    unitId,
  );
  if (
    currentJob.jobSha256 !==
      candidateAdmissionReceipt.scheduledJob.jobSha256 ||
    currentJob.attemptNumber !==
      candidateAdmissionReceipt.scheduledJob.attemptNumber ||
    currentJob.mode !== candidateAdmissionReceipt.scheduledJob.mode
  ) {
    fail(
      "ART_PRODUCTION_ATTEMPT_INVALID",
      "Attempt candidate admission no longer matches the untouched scheduled job in the current production loop.",
      {
        scheduledLoopSha256,
        currentLoopSha256: loop.loopSha256,
        scheduledJobSha256:
          candidateAdmissionReceipt.scheduledJob.jobSha256,
        currentJobSha256: currentJob.jobSha256,
      },
    );
  }

  const requiredMetricIds = requiredMetrics(unit);
  const candidate = candidateAdmissionReceipt.candidate;
  const metrics = normalizeMetrics(input.metrics, requiredMetricIds);
  const detections = normalizeDetections(input.detections, loop.profile);
  const score = weightedScore(metrics, loop.profile);
  const failedMetricIds = freeze(
    metrics
      .filter(
        (metric) =>
          metric.score < metricMinimum(metric.metricId, loop.profile),
      )
      .map((metric) => metric.metricId),
  );
  const passed =
    detections.length === 0 &&
    failedMetricIds.length === 0 &&
    score >= loop.profile.iteration.technicalPassScore;
  const attemptNumber = state.attemptCount + 1;
  const decision: ArtProductionAttemptDecision = passed
    ? "review-passed"
    : attemptNumber >= state.maximumAttempts
      ? "blocked"
      : "repair-required";
  const repairDirectives = freeze(
    passed
      ? []
      : [
          ...failedMetricIds.map((metricId) => REPAIR_BY_METRIC[metricId]),
          ...detections.map(
            (detection) => REPAIR_BY_DETECTION[detection.detection],
          ),
          ...(score < loop.profile.iteration.technicalPassScore &&
          failedMetricIds.length === 0
            ? [
                "Increase the weakest measured review areas until the weighted technical score reaches the configured pass threshold without weakening any style, camera or continuity lock.",
              ]
            : []),
        ].filter(
          (entry, index, values) => values.indexOf(entry) === index,
        ),
  );
  const partial = {
    schemaVersion: "1.0" as const,
    kind: ART_PRODUCTION_ATTEMPT_KIND,
    protocolVersion: ART_PRODUCTION_ORCHESTRATOR_PROTOCOL_VERSION,
    priorLoopSha256: loop.loopSha256,
    attemptNumber,
    unitId,
    evaluator: stringValue(input.evaluator, "attempt.evaluator", 300),
    evaluatedAt: strictUtc(input.evaluatedAt, "attempt.evaluatedAt"),
    candidateAdmissionReceipt,
    candidate,
    metrics,
    requiredMetricIds,
    detections,
    weightedScore: score,
    failedMetricIds,
    decision,
    repairDirectives,
    ...(decision === "repair-required"
      ? { retryPrompt: retryPrompt(unit, attemptNumber, repairDirectives) }
      : {}),
    authority: freeze({
      providerExecution: false as const,
      candidateAdmission: false as const,
      creativeApproval: false as const,
      imageMutation: false as const,
      targetRepositoryMutation: false as const,
      gitCommit: false as const,
      gitPush: false as const,
      publication: false as const,
    }),
  };
  return freeze({ ...partial, attemptSha256: sha256(partial) });
}

export function replayAttemptInput(
  attempt: ArtProductionAttemptRecord,
): ArtProductionAttemptInput {
  return {
    schemaVersion: "1.0",
    kind: ART_PRODUCTION_ATTEMPT_KIND,
    loopSha256: attempt.priorLoopSha256,
    unitId: attempt.unitId,
    evaluator: attempt.evaluator,
    evaluatedAt: attempt.evaluatedAt,
    candidateAdmissionReceipt: attempt.candidateAdmissionReceipt,
    metrics: attempt.metrics,
    detections: attempt.detections,
  };
}
