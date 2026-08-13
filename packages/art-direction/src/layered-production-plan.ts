import type {
  CompiledLayeredProductionPlan,
  CompiledLayeredProductionUnit,
  LayeredProductionRequestInput,
} from "./layered-production-types.js";
import { LAYERED_PRODUCTION_REQUEST_KIND } from "./layered-production-types.js";
import { fail, sha256 } from "./layered-production-internal.js";
import {
  compileLayeredProductionPlan as compileLayeredProductionPlanCore,
  getLayeredProductionUnit as getLayeredProductionUnitCore,
  verifyLayeredProductionPlan as verifyLayeredProductionPlanEnvelope,
} from "./layered-production-plan-core.js";

export const compileLayeredProductionPlan = compileLayeredProductionPlanCore;

function sourceRequestFromPlan(
  plan: CompiledLayeredProductionPlan,
): LayeredProductionRequestInput {
  return {
    schemaVersion: "1.0",
    kind: LAYERED_PRODUCTION_REQUEST_KIND,
    planId: plan.planId,
    revision: plan.revision,
    intent: plan.intent,
    project: plan.project,
    canvas: plan.canvas,
    style: plan.style,
    sourcePolicy: plan.sourcePolicy,
    styleProof: {
      required: true,
      approvalBeforeExpansion: true,
      maximumUnitsBeforeApproval: plan.styleProof.maximumUnitsBeforeApproval,
      unitIds: plan.styleProof.unitIds,
    },
    layers: plan.layers.map((layer) => ({
      id: layer.id,
      role: layer.role,
      zOrder: layer.zOrder,
      alpha: layer.alpha,
      assemblyMode: layer.assemblyMode,
      ySortMode: layer.ySortMode,
      dependsOn: layer.dependsOn,
      include: layer.include,
      exclude: layer.exclude,
      units: layer.units.map((unit) => ({
        id: unit.id,
        kind: unit.kind,
        purpose: unit.purpose,
        dimensions: unit.dimensions,
        ...(unit.position ? { position: unit.position } : {}),
        ...(unit.pivot ? { pivot: unit.pivot } : {}),
        ...(unit.ySortOrigin ? { ySortOrigin: unit.ySortOrigin } : {}),
        continuityKey: unit.continuityKey,
        include: unit.include,
        exclude: unit.exclude,
        fileName: unit.fileName,
        targetPath: unit.targetPath,
        ...(unit.frame ? { frame: unit.frame } : {}),
      })),
    })),
    ...(plan.metadata === undefined ? {} : { metadata: plan.metadata }),
  };
}

function compileDeclaredPendingPlan(
  plan: CompiledLayeredProductionPlan,
): CompiledLayeredProductionPlan {
  try {
    return compileLayeredProductionPlanCore(sourceRequestFromPlan(plan));
  } catch (error) {
    fail(
      "LAYERED_PRODUCTION_PLAN_INVALID",
      "Plan source declarations cannot be recompiled into a valid normalized layered-production request.",
      {
        cause:
          error instanceof Error
            ? error.message
            : "Unknown deterministic recompilation failure.",
      },
    );
  }
}

function expectedPlanSha256(
  pending: CompiledLayeredProductionPlan,
  actual: CompiledLayeredProductionPlan,
): string {
  if (actual.styleProof.status === "approval-required") {
    return pending.planSha256;
  }
  const { planSha256: _pendingPlanSha256, ...pendingWithoutHash } = pending;
  return sha256({
    ...pendingWithoutHash,
    styleProof: {
      ...pending.styleProof,
      status: "approved" as const,
      approval: actual.styleProof.approval,
    },
  });
}

function assertDeterministicCompilation(
  plan: CompiledLayeredProductionPlan,
  expectedPending: CompiledLayeredProductionPlan,
  code: string,
  message: string,
): void {
  const expectedSha256 = expectedPlanSha256(expectedPending, plan);
  if (
    plan.requestSha256 !== expectedPending.requestSha256 ||
    plan.planSha256 !== expectedSha256
  ) {
    fail(code, message, {
      expectedRequestSha256: expectedPending.requestSha256,
      actualRequestSha256: plan.requestSha256,
      expectedPlanSha256: expectedSha256,
      actualPlanSha256: plan.planSha256,
    });
  }
}

export function verifyLayeredProductionPlan(
  plan: CompiledLayeredProductionPlan,
): true {
  verifyLayeredProductionPlanEnvelope(plan);
  const expectedPending = compileDeclaredPendingPlan(plan);
  assertDeterministicCompilation(
    plan,
    expectedPending,
    "LAYERED_PRODUCTION_PLAN_INVALID",
    "Plan payload is not the deterministic compilation of its declared normalized source fields.",
  );
  return true;
}

export function verifyLayeredProductionPlanAgainstRequest(
  input: unknown,
  plan: CompiledLayeredProductionPlan,
): true {
  verifyLayeredProductionPlan(plan);
  const expectedPending = compileLayeredProductionPlanCore(input);
  assertDeterministicCompilation(
    plan,
    expectedPending,
    "LAYERED_PRODUCTION_PLAN_REQUEST_MISMATCH",
    "Layered-production plan is not bound to the exact normalized source request.",
  );
  return true;
}

export function getLayeredProductionUnit(
  plan: CompiledLayeredProductionPlan,
  unitId: string,
): CompiledLayeredProductionUnit {
  verifyLayeredProductionPlan(plan);
  return getLayeredProductionUnitCore(plan, unitId);
}
