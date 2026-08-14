import test from "node:test";

import {
  ArtDirectionError,
  compileArtProductionLoop,
  compileLayeredProductionPlan,
  compileNextArtProductionBatch,
  evaluateArtProductionAttempt,
  verifyArtProductionLoop,
} from "../dist/index.js";
import {
  assert,
  attempt,
  canonicalSha256,
  productionRequest,
  profile,
} from "./art-production-fixtures.mjs";

test("compiles a profile-bound proof loop and schedules dependency-safe one-image work", () => {
  const plan = compileLayeredProductionPlan(productionRequest());
  const loop = compileArtProductionLoop(plan, profile());
  assert.equal(loop.scope, "style-proof");
  assert.equal(loop.authority.providerExecution, false);
  const batch = compileNextArtProductionBatch(plan, loop);
  assert.equal(batch.status, "jobs-ready");
  assert.deepEqual(batch.jobs.map((job) => job.unitId), ["ground-base"]);
  assert.equal(batch.jobs[0].expectedOutput.images, 1);
  assert.equal(batch.jobs[0].expectedOutput.outputFormat, "png");
});

test("reviews, repairs and re-evaluates a generic animation candidate without weakening locks", () => {
  const plan = compileLayeredProductionPlan(productionRequest());
  let loop = compileArtProductionLoop(plan, profile());
  loop = evaluateArtProductionAttempt(
    plan,
    loop,
    attempt(loop, plan, "ground-base"),
  );
  const afterGround = compileNextArtProductionBatch(plan, loop);
  assert.ok(afterGround.jobs.some((job) => job.unitId === "fountain-f001"));

  loop = evaluateArtProductionAttempt(
    plan,
    loop,
    attempt(loop, plan, "fountain-f001", {
      score: 70,
      detections: ["generic-ai-styling", "vector-like-rendering"],
    }),
  );
  const state = loop.unitStates.find(
    (entry) => entry.unitId === "fountain-f001",
  );
  assert.equal(state.status, "repair-required");
  const repairBatch = compileNextArtProductionBatch(plan, loop);
  assert.equal(repairBatch.jobs[0].unitId, "fountain-f001");
  assert.equal(repairBatch.jobs[0].mode, "repair");
  assert.match(repairBatch.jobs[0].prompt, /ITERATIVE REPAIR PASS/);
  assert.match(repairBatch.jobs[0].prompt, /SVG-like curves/);
  assert.match(repairBatch.jobs[0].prompt, /exactly one corrected 32x32 native PNG/);

  loop = evaluateArtProductionAttempt(
    plan,
    loop,
    attempt(loop, plan, "fountain-f001"),
  );
  assert.equal(
    loop.unitStates.find((entry) => entry.unitId === "fountain-f001")
      .status,
    "review-passed",
  );
  assert.equal(verifyArtProductionLoop(plan, loop), true);
});

test("rejects camera-family drift before any candidate can be scheduled", () => {
  const plan = compileLayeredProductionPlan(productionRequest());
  const mismatched = profile();
  mismatched.camera.pitchDegrees = 24;
  assert.throws(
    () => compileArtProductionLoop(plan, mismatched),
    (error) =>
      error instanceof ArtDirectionError &&
      error.code === "ART_PRODUCTION_CAMERA_MISMATCH",
  );
});

test("semantic replay rejects a rehashed loop authority escalation", () => {
  const plan = compileLayeredProductionPlan(productionRequest());
  const original = compileArtProductionLoop(plan, profile());
  const forged = structuredClone(original);
  forged.authority.providerExecution = true;
  const { loopSha256: _discarded, ...payload } = forged;
  forged.loopSha256 = canonicalSha256(payload);
  assert.throws(
    () => verifyArtProductionLoop(plan, forged),
    (error) =>
      error instanceof ArtDirectionError &&
      error.code === "ART_PRODUCTION_LOOP_INVALID",
  );
});
