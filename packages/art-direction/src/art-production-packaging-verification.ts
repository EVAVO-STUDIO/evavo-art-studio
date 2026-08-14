import { fail, sha256 } from "./layered-production-internal.js";
import type { CompiledLayeredProductionPlan } from "./layered-production-types.js";
import type {
  ArtProductionHumanApprovalReceipt,
  ArtProductionLoop,
  ArtProductionPackagingPlan,
} from "./art-production-orchestrator-types.js";
import {
  verifyArtProductionPackagingPlan as verifyDeterministicPackagingPlan,
} from "./art-production-packaging.js";

function packagingPayload(
  packagingPlan: ArtProductionPackagingPlan,
): Omit<ArtProductionPackagingPlan, "packagingSha256"> {
  const { packagingSha256: _packagingSha256, ...payload } = packagingPlan;
  return payload;
}

export function verifyArtProductionPackagingPlan(
  plan: CompiledLayeredProductionPlan,
  loop: ArtProductionLoop,
  approvals: readonly ArtProductionHumanApprovalReceipt[] | unknown,
  packagingPlan: ArtProductionPackagingPlan,
): true {
  if (
    !packagingPlan ||
    typeof packagingPlan !== "object" ||
    Array.isArray(packagingPlan)
  ) {
    fail(
      "ART_PRODUCTION_PACKAGING_INVALID",
      "Packaging plan must be an object.",
    );
  }

  const submittedPackagingSha256 = sha256(packagingPayload(packagingPlan));
  if (submittedPackagingSha256 !== packagingPlan.packagingSha256) {
    fail(
      "ART_PRODUCTION_PACKAGING_INVALID",
      "Packaging plan SHA-256 does not match its submitted payload.",
      {
        expectedPackagingSha256: submittedPackagingSha256,
        submittedPackagingSha256: packagingPlan.packagingSha256,
      },
    );
  }

  return verifyDeterministicPackagingPlan(
    plan,
    loop,
    approvals,
    packagingPlan,
  );
}
