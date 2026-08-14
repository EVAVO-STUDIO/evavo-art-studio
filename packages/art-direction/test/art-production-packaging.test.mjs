import { createHash } from "node:crypto";
import test from "node:test";

import {
  compileArtProductionLoop,
  compileArtProductionPackagingPlan,
  compileNextArtProductionBatch,
  evaluateArtProductionAttempt,
  verifyArtProductionPackagingPlan,
} from "../dist/index.js";
import {
  assert,
  attempt,
  approvedPlan,
  productionRequest,
  profile,
} from "./art-production-fixtures.mjs";

const digest = (value) =>
  createHash("sha256").update(value).digest("hex");

test("retains approved individual PNGs and deterministically plans strips, grids and non-rotating atlases", () => {
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
  const approvals = loop.unitStates.map((state) => {
    assert.ok(state.acceptedCandidate);
    return {
      unitId: state.unitId,
      sourceArtifactId: state.acceptedCandidate.artifactId,
      sourceSha256: state.acceptedCandidate.sha256,
      sourceBytes: state.acceptedCandidate.bytes,
      reviewer: "Greg Parker",
      reviewedAt: "2026-08-14T02:00:00.000Z",
      approvalReceiptSha256: digest(`approval:${state.unitId}`),
    };
  });
  const packaging = compileArtProductionPackagingPlan(plan, loop, approvals);
  assert.equal(packaging.individualSources.length, plan.totals.units);
  assert.equal(packaging.animationSheets.length, 6);
  assert.ok(packaging.atlasPages.length >= 1);
  assert.ok(packaging.atlasPages.every((page) => page.rotation === false));
  assert.ok(packaging.atlasPages.every((page) => page.trim === false));
  assert.equal(
    verifyArtProductionPackagingPlan(plan, loop, approvals, packaging),
    true,
  );
});
