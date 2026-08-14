import { fail, freeze, sha256 } from "./layered-production-internal.js";
import type {
  CompiledLayeredProductionPlan,
  CompiledLayeredProductionUnit,
} from "./layered-production-types.js";
import {
  ART_PRODUCTION_BATCH_KIND,
  ART_PRODUCTION_ORCHESTRATOR_PROTOCOL_VERSION,
} from "./art-production-orchestrator-types.js";
import type {
  ArtProductionBatch,
  ArtProductionBatchJob,
  ArtProductionLoop,
  ArtProductionUnitState,
} from "./art-production-orchestrator-types.js";
import { verifyArtProductionLoop } from "./art-production-loop.js";

function latestRetryPrompt(
  loop: ArtProductionLoop,
  state: ArtProductionUnitState,
): string | undefined {
  if (!state.latestAttemptSha256) return undefined;
  return loop.attempts.find(
    (attempt) => attempt.attemptSha256 === state.latestAttemptSha256,
  )?.retryPrompt;
}

function referenceRole(
  unit: CompiledLayeredProductionUnit,
  dependency: CompiledLayeredProductionUnit,
): "dependency" | "identity-master" | "previous-frame" {
  if (
    unit.kind === "animation-frame" &&
    dependency.kind === "animation-frame" &&
    unit.frame?.clipId === dependency.frame?.clipId &&
    (dependency.frame?.frameNumber ?? 0) < (unit.frame?.frameNumber ?? 0)
  ) {
    return "previous-frame";
  }
  if (
    (unit.kind === "sprite" || unit.kind === "animation-frame") &&
    dependency.continuityKey === unit.continuityKey
  ) {
    return "identity-master";
  }
  return "dependency";
}

function compileJob(
  plan: CompiledLayeredProductionPlan,
  loop: ArtProductionLoop,
  state: ArtProductionUnitState,
): ArtProductionBatchJob {
  const units = plan.layers.flatMap((layer) => layer.units);
  const unit = units.find((entry) => entry.id === state.unitId);
  if (!unit) {
    fail(
      "ART_PRODUCTION_UNIT_NOT_FOUND",
      `Layered-production unit ${state.unitId} no longer exists.`,
    );
  }
  const references = state.dependencyUnitIds.map((dependencyUnitId) => {
    const dependencyState = loop.unitStates.find(
      (entry) => entry.unitId === dependencyUnitId,
    );
    const dependencyUnit = units.find(
      (entry) => entry.id === dependencyUnitId,
    );
    if (!dependencyState?.acceptedCandidate || !dependencyUnit) {
      fail(
        "ART_PRODUCTION_DEPENDENCY_NOT_READY",
        `Required production dependency ${dependencyUnitId} is not review-passed.`,
      );
    }
    return freeze({
      unitId: dependencyUnitId,
      artifactId: dependencyState.acceptedCandidate.artifactId,
      sha256: dependencyState.acceptedCandidate.sha256,
      role: referenceRole(unit, dependencyUnit),
    });
  });
  const mode =
    state.status === "repair-required"
      ? ("repair" as const)
      : ("generate" as const);
  const prompt =
    mode === "repair"
      ? latestRetryPrompt(loop, state)
      : unit.providerJob.prompt;
  if (!prompt) {
    fail(
      "ART_PRODUCTION_LOOP_INVALID",
      `Repair-required unit ${state.unitId} is missing a deterministic retry prompt.`,
    );
  }
  const partial = {
    sequence: state.sequence,
    unitId: state.unitId,
    attemptNumber: state.attemptCount + 1,
    mode,
    prompt,
    negativePrompt: unit.providerJob.negativePrompt,
    expectedOutput: freeze({
      images: 1 as const,
      width: unit.dimensions.width,
      height: unit.dimensions.height,
      alphaPolicy: unit.alpha,
      outputFormat: "png" as const,
    }),
    referenceArtifacts: freeze(references),
  };
  return freeze({ ...partial, jobSha256: sha256(partial) });
}

export function compileNextArtProductionBatchFromVerifiedLoop(
  plan: CompiledLayeredProductionPlan,
  loop: ArtProductionLoop,
): ArtProductionBatch {
  const eligible = loop.unitStates
    .filter(
      (state) =>
        state.status === "repair-required" || state.status === "queued",
    )
    .sort((left, right) => {
      const leftPriority = left.status === "repair-required" ? 0 : 1;
      const rightPriority = right.status === "repair-required" ? 0 : 1;
      return (
        leftPriority - rightPriority ||
        left.sequence - right.sequence ||
        left.unitId.localeCompare(right.unitId)
      );
    })
    .slice(0, loop.profile.iteration.maximumBatchSize);
  const jobs = freeze(eligible.map((state) => compileJob(plan, loop, state)));
  const status: ArtProductionBatch["status"] =
    jobs.length > 0
      ? "jobs-ready"
      : loop.totals.blocked > 0
        ? "blocked"
        : loop.scope === "style-proof" &&
            loop.totals.reviewPassed === plan.styleProof.unitIds.length
          ? "awaiting-style-proof-approval"
          : "awaiting-human-approval";
  const partial = {
    schemaVersion: "1.0" as const,
    kind: ART_PRODUCTION_BATCH_KIND,
    protocolVersion: ART_PRODUCTION_ORCHESTRATOR_PROTOCOL_VERSION,
    loopSha256: loop.loopSha256,
    status,
    jobs,
    authority: freeze({
      providerExecution: false as const,
      creativeApproval: false as const,
      imageMutation: false as const,
      packagingExecution: false as const,
      targetRepositoryMutation: false as const,
    }),
  };
  return freeze({ ...partial, batchSha256: sha256(partial) });
}

export function compileNextArtProductionBatch(
  plan: CompiledLayeredProductionPlan,
  loop: ArtProductionLoop,
): ArtProductionBatch {
  verifyArtProductionLoop(plan, loop);
  return compileNextArtProductionBatchFromVerifiedLoop(plan, loop);
}
