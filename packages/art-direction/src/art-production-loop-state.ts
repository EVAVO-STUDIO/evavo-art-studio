import { fail, freeze, sha256 } from "./layered-production-internal.js";
import type {
  CompiledLayeredProductionPlan,
  CompiledLayeredProductionUnit,
} from "./layered-production-types.js";
import {
  ART_PRODUCTION_LOOP_KIND,
  ART_PRODUCTION_ORCHESTRATOR_PROTOCOL_VERSION,
} from "./art-production-orchestrator-types.js";
import type {
  ArtProductionAttemptRecord,
  ArtProductionLoop,
  ArtProductionUnitState,
  CompiledArtProductionProfile,
} from "./art-production-orchestrator-types.js";

function unitDependencies(
  plan: CompiledLayeredProductionPlan,
): ReadonlyMap<string, readonly string[]> {
  const units = plan.layers.flatMap((layer) => layer.units);
  const byLayer = new Map(
    plan.layers.map((layer) => [layer.id, layer.units.map((unit) => unit.id)]),
  );
  const byContinuity = new Map<string, CompiledLayeredProductionUnit[]>();
  for (const unit of units) {
    const group = byContinuity.get(unit.continuityKey) ?? [];
    group.push(unit);
    byContinuity.set(unit.continuityKey, group);
  }
  const output = new Map<string, readonly string[]>();
  for (const layer of plan.layers) {
    for (const unit of layer.units) {
      const dependencies = new Set<string>();
      for (const dependencyLayer of layer.dependsOn) {
        for (const unitId of byLayer.get(dependencyLayer) ?? []) {
          dependencies.add(unitId);
        }
      }
      const continuity = (byContinuity.get(unit.continuityKey) ?? []).sort(
        (left, right) => left.sequence - right.sequence,
      );
      const identityMaster = continuity[0];
      if (
        identityMaster &&
        identityMaster.id !== unit.id &&
        (unit.kind === "sprite" || unit.kind === "animation-frame")
      ) {
        dependencies.add(identityMaster.id);
      }
      if (unit.kind === "animation-frame" && unit.frame) {
        const unitFrame = unit.frame;
        const previous = continuity
          .filter(
            (candidate) =>
              candidate.kind === "animation-frame" &&
              candidate.frame?.clipId === unitFrame.clipId &&
              (candidate.frame?.frameNumber ?? 0) < unitFrame.frameNumber,
          )
          .sort(
            (left, right) =>
              (right.frame?.frameNumber ?? 0) -
              (left.frame?.frameNumber ?? 0),
          )[0];
        if (previous) dependencies.add(previous.id);
      }
      output.set(
        unit.id,
        freeze(
          [...dependencies].sort((left, right) => {
            const a = units.find((candidate) => candidate.id === left)?.sequence ?? 0;
            const b = units.find((candidate) => candidate.id === right)?.sequence ?? 0;
            return a - b || left.localeCompare(right);
          }),
        ),
      );
    }
  }
  return output;
}

export function initialUnitStates(
  plan: CompiledLayeredProductionPlan,
  profile: CompiledArtProductionProfile,
): readonly ArtProductionUnitState[] {
  const dependencies = unitDependencies(plan);
  const proofSet = new Set(plan.styleProof.unitIds);
  const fullProduction = plan.styleProof.status === "approved";
  const states = plan.layers
    .flatMap((layer) => layer.units)
    .map((unit) => {
      const dependencyUnitIds = dependencies.get(unit.id) ?? [];
      const inScope = fullProduction || proofSet.has(unit.id);
      if (
        !fullProduction &&
        inScope &&
        dependencyUnitIds.some((dependency) => !proofSet.has(dependency))
      ) {
        fail(
          "ART_PRODUCTION_STYLE_PROOF_DEADLOCK",
          `Style-proof unit ${unit.id} depends on non-proof source units.`,
        );
      }
      return freeze({
        sequence: unit.sequence,
        unitId: unit.id,
        layerId: unit.layerId,
        continuityKey: unit.continuityKey,
        unitKind: unit.kind,
        alphaPolicy: unit.alpha,
        dimensions: unit.dimensions,
        dependencyUnitIds,
        status:
          inScope && dependencyUnitIds.length === 0
            ? ("queued" as const)
            : ("gated" as const),
        attemptCount: 0,
        maximumAttempts: profile.iteration.maximumAttemptsPerUnit,
      });
    });
  return refreshStatuses(states, fullProduction ? undefined : proofSet);
}

export function refreshStatuses(
  states: readonly ArtProductionUnitState[],
  scope?: ReadonlySet<string>,
): readonly ArtProductionUnitState[] {
  const byId = new Map(states.map((state) => [state.unitId, state]));
  return freeze(
    states.map((state) => {
      if (
        state.status === "review-passed" ||
        state.status === "repair-required" ||
        state.status === "blocked"
      ) {
        return state;
      }
      if (scope && !scope.has(state.unitId)) {
        return state.status === "gated"
          ? state
          : freeze({ ...state, status: "gated" as const });
      }
      const ready = state.dependencyUnitIds.every(
        (dependency) => byId.get(dependency)?.status === "review-passed",
      );
      const nextStatus = ready ? ("queued" as const) : ("gated" as const);
      return state.status === nextStatus
        ? state
        : freeze({ ...state, status: nextStatus });
    }),
  );
}

function totals(
  states: readonly ArtProductionUnitState[],
  attempts: readonly ArtProductionAttemptRecord[],
): ArtProductionLoop["totals"] {
  return freeze({
    units: states.length,
    gated: states.filter((state) => state.status === "gated").length,
    queued: states.filter((state) => state.status === "queued").length,
    repairRequired: states.filter(
      (state) => state.status === "repair-required",
    ).length,
    reviewPassed: states.filter(
      (state) => state.status === "review-passed",
    ).length,
    blocked: states.filter((state) => state.status === "blocked").length,
    attempts: attempts.length,
  });
}

export function loopPayload(
  plan: CompiledLayeredProductionPlan,
  profile: CompiledArtProductionProfile,
  states: readonly ArtProductionUnitState[],
  attempts: readonly ArtProductionAttemptRecord[],
): Omit<ArtProductionLoop, "loopSha256"> {
  return {
    schemaVersion: "1.0",
    kind: ART_PRODUCTION_LOOP_KIND,
    protocolVersion: ART_PRODUCTION_ORCHESTRATOR_PROTOCOL_VERSION,
    planId: plan.planId,
    planSha256: plan.planSha256,
    profile,
    profileSha256: profile.profileSha256,
    scope:
      plan.styleProof.status === "approved" ? "full-production" : "style-proof",
    unitStates: states,
    attempts,
    totals: totals(states, attempts),
    authority: freeze({
      providerExecution: false as const,
      automaticCreativeApproval: false as const,
      imageMutation: false as const,
      packagingExecution: false as const,
      targetRepositoryMutation: false as const,
      gitCommit: false as const,
      gitPush: false as const,
      publication: false as const,
    }),
  };
}

export function withLoopHash(
  payload: Omit<ArtProductionLoop, "loopSha256">,
): ArtProductionLoop {
  return freeze({ ...payload, loopSha256: sha256(payload) });
}
