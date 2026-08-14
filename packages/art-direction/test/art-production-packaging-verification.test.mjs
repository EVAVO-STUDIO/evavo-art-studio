import assert from "node:assert/strict";
import test from "node:test";

import {
  ArtDirectionError,
  compileArtProductionLoop,
  compileArtProductionPackagingPlan,
  compileNextArtProductionBatch,
  evaluateArtProductionAttempt,
  verifyArtProductionPackagingPlan,
} from "../dist/index.js";
import {
  attempt,
  approvedPlan,
  canonicalSha256,
  humanApprovals,
  productionRequest,
  profile,
} from "./art-production-fixtures.mjs";

function compileFixture() {
  const complete = productionRequest();
  for (const source of complete.layers.flatMap((layer) => layer.units)) {
    if (source.frame) source.frame.frameCount = 1;
  }
  const plan = approvedPlan(complete);
  let loop = compileArtProductionLoop(plan, profile());
  while (loop.totals.reviewPassed < loop.totals.units) {
    const batch = compileNextArtProductionBatch(plan, loop);
    assert.equal(batch.status, "jobs-ready");
    assert.ok(batch.jobs.length > 0);
    for (const job of batch.jobs) {
      loop = evaluateArtProductionAttempt(
        plan,
        loop,
        attempt(loop, plan, job.unitId),
      );
    }
  }
  const approvals = humanApprovals(plan, loop);
  return {
    plan,
    loop,
    approvals,
    packaging: compileArtProductionPackagingPlan(plan, loop, approvals),
  };
}

function rehashPackagingPlan(packagingPlan) {
  const { packagingSha256: _discarded, ...payload } = packagingPlan;
  packagingPlan.packagingSha256 = canonicalSha256(payload);
  return packagingPlan;
}

function isSubmittedPayloadMismatch(error) {
  return (
    error instanceof ArtDirectionError &&
    error.code === "ART_PRODUCTION_PACKAGING_INVALID" &&
    /submitted payload/u.test(error.message)
  );
}

function isDeterministicCompilationMismatch(error) {
  return (
    error instanceof ArtDirectionError &&
    error.code === "ART_PRODUCTION_PACKAGING_INVALID" &&
    /deterministic compilation/u.test(error.message)
  );
}

const canonical = compileFixture();

test("accepts the exact deterministic packaging payload", () => {
  assert.equal(
    verifyArtProductionPackagingPlan(
      canonical.plan,
      canonical.loop,
      canonical.approvals,
      canonical.packaging,
    ),
    true,
  );
});

test("rejects a packaging layout mutation that retains the canonical hash string", () => {
  const forged = structuredClone(canonical.packaging);
  assert.ok(forged.atlasPages.length > 0);
  assert.ok(forged.atlasPages[0].placements.length > 0);
  forged.atlasPages[0].placements[0].x += 1;

  assert.equal(forged.packagingSha256, canonical.packaging.packagingSha256);
  assert.throws(
    () =>
      verifyArtProductionPackagingPlan(
        canonical.plan,
        canonical.loop,
        canonical.approvals,
        forged,
      ),
    isSubmittedPayloadMismatch,
  );
});

test("rejects rehashed packaging-execution authority escalation", () => {
  const forged = structuredClone(canonical.packaging);
  forged.authority.packagingExecution = true;
  rehashPackagingPlan(forged);

  assert.notEqual(forged.packagingSha256, canonical.packaging.packagingSha256);
  assert.throws(
    () =>
      verifyArtProductionPackagingPlan(
        canonical.plan,
        canonical.loop,
        canonical.approvals,
        forged,
      ),
    isDeterministicCompilationMismatch,
  );
});
