import assert from "node:assert/strict";
import test from "node:test";

import {
  ArtDirectionError,
  compileArtProductionLoop,
  compileArtProductionPackagingPlan,
  compileArtProductionRuntimeAssemblyHandoff,
  compileNextArtProductionBatch,
  evaluateArtProductionAttempt,
  verifyArtProductionRuntimeAssemblyHandoff,
} from "../dist/index.js";
import {
  approvedPlan,
  attempt,
  canonicalSha256,
  digest,
  humanApprovals,
  profile,
} from "./art-production-fixtures.mjs";
import {
  addCompleteRuntimeAnimations,
  productionRequest,
  runtimeAssemblyRequest,
} from "./layered-assembly-fixtures.mjs";

function compileFixture() {
  const plan = approvedPlan(
    addCompleteRuntimeAnimations(productionRequest()),
  );
  let loop = compileArtProductionLoop(plan, profile());
  while (loop.totals.reviewPassed < loop.totals.units) {
    const batch = compileNextArtProductionBatch(plan, loop);
    assert.equal(batch.status, "jobs-ready");
    assert.ok(batch.jobs.length > 0);
    const scheduledAttempts = batch.jobs.map((job) =>
      attempt(loop, plan, job.unitId),
    );
    for (const scheduledAttempt of scheduledAttempts) {
      loop = evaluateArtProductionAttempt(plan, loop, {
        ...scheduledAttempt,
        loopSha256: loop.loopSha256,
      });
    }
  }

  const approvals = humanApprovals(plan, loop);
  const packagingPlan = compileArtProductionPackagingPlan(
    plan,
    loop,
    approvals,
  );
  const assemblyRequest = runtimeAssemblyRequest(plan);
  const approvalByUnit = new Map(
    approvals.map((approval) => [approval.unitId, approval]),
  );
  const packagedByUnit = new Map(
    packagingPlan.individualSources.map((source) => [source.unitId, source]),
  );
  for (const source of assemblyRequest.sources) {
    const approval = approvalByUnit.get(source.unitId);
    const packaged = packagedByUnit.get(source.unitId);
    assert.ok(approval, `missing approval ${source.unitId}`);
    assert.ok(packaged, `missing package source ${source.unitId}`);
    source.artifactId = packaged.artifactId;
    source.sha256 = packaged.sha256;
    source.bytes = packaged.bytes;
    source.width = packaged.width;
    source.height = packaged.height;
    source.approvalReceiptSha256 = approval.approvalReceiptSha256;
    source.approvalReceiptArtifactId =
      `artifact_${approval.approvalReceiptSha256}`;
  }

  const handoff = compileArtProductionRuntimeAssemblyHandoff(
    plan,
    loop,
    approvals,
    packagingPlan,
    assemblyRequest,
  );
  return {
    plan,
    loop,
    approvals,
    packagingPlan,
    assemblyRequest,
    handoff,
  };
}

function rehashHandoff(handoff) {
  const { handoffSha256: _discarded, ...payload } = handoff;
  handoff.handoffSha256 = canonicalSha256(payload);
  return handoff;
}

function isRuntimeAssemblyInvalid(error) {
  return (
    error instanceof ArtDirectionError &&
    error.code === "ART_PRODUCTION_RUNTIME_ASSEMBLY_INVALID"
  );
}

const canonical = compileFixture();

test("compiles and verifies an exact approval-bound runtime assembly handoff", () => {
  assert.equal(canonical.handoff.protocolVersion, "2026-08-15.1");
  assert.equal(
    canonical.handoff.kind,
    "evavo.art-production.runtime-assembly-handoff",
  );
  assert.equal(
    canonical.handoff.assembly.manifest.readiness.runtimeReady,
    true,
  );
  assert.equal(
    canonical.handoff.sourceBindings.length,
    canonical.assemblyRequest.sources.length,
  );
  assert.ok(
    canonical.handoff.sourceBindings.every(
      (binding) =>
        binding.approvalReceiptArtifactId ===
        `artifact_${binding.approvalReceiptSha256}`,
    ),
  );
  assert.equal(canonical.handoff.authority.automaticAssembly, false);
  assert.equal(canonical.handoff.authority.runtimeActivation, false);
  assert.equal(
    verifyArtProductionRuntimeAssemblyHandoff(
      canonical.plan,
      canonical.loop,
      canonical.approvals,
      canonical.packagingPlan,
      canonical.assemblyRequest,
      canonical.handoff,
    ),
    true,
  );
});

test("rejects the generic hash-only runtime assembly source shape", () => {
  const legacy = runtimeAssemblyRequest(canonical.plan);
  assert.throws(
    () =>
      compileArtProductionRuntimeAssemblyHandoff(
        canonical.plan,
        canonical.loop,
        canonical.approvals,
        canonical.packagingPlan,
        legacy,
      ),
    (error) =>
      isRuntimeAssemblyInvalid(error) &&
      /exact packaged and named-human-approved source candidate/u.test(
        error.message,
      ),
  );
});

test("rejects a self-consistent but unrelated approval receipt identity", () => {
  const forged = structuredClone(canonical.assemblyRequest);
  const unrelatedReceiptSha256 = digest("unrelated-approval-receipt");
  forged.sources[0].approvalReceiptSha256 = unrelatedReceiptSha256;
  forged.sources[0].approvalReceiptArtifactId =
    `artifact_${unrelatedReceiptSha256}`;
  assert.throws(
    () =>
      compileArtProductionRuntimeAssemblyHandoff(
        canonical.plan,
        canonical.loop,
        canonical.approvals,
        canonical.packagingPlan,
        forged,
      ),
    (error) =>
      isRuntimeAssemblyInvalid(error) &&
      /exact candidate-bound human-approval receipt/u.test(error.message),
  );
});

test("rejects retained-hash handoff payload mutation", () => {
  const forged = structuredClone(canonical.handoff);
  forged.sourceBindings[0].sourceBytes += 1;
  assert.equal(forged.handoffSha256, canonical.handoff.handoffSha256);
  assert.throws(
    () =>
      verifyArtProductionRuntimeAssemblyHandoff(
        canonical.plan,
        canonical.loop,
        canonical.approvals,
        canonical.packagingPlan,
        canonical.assemblyRequest,
        forged,
      ),
    (error) =>
      isRuntimeAssemblyInvalid(error) && /submitted payload/u.test(error.message),
  );
});

test("rejects attacker-rehashed automatic assembly authority escalation", () => {
  const forged = structuredClone(canonical.handoff);
  forged.authority.automaticAssembly = true;
  rehashHandoff(forged);
  assert.notEqual(forged.handoffSha256, canonical.handoff.handoffSha256);
  assert.throws(
    () =>
      verifyArtProductionRuntimeAssemblyHandoff(
        canonical.plan,
        canonical.loop,
        canonical.approvals,
        canonical.packagingPlan,
        canonical.assemblyRequest,
        forged,
      ),
    (error) =>
      isRuntimeAssemblyInvalid(error) && /authority must remain/u.test(error.message),
  );
});

test("binds a valid handoff to the exact assembly request", () => {
  const changedRequest = structuredClone(canonical.assemblyRequest);
  const playerPlacement = changedRequest.placements.find(
    (placement) => placement.id === "player-placement",
  );
  assert.ok(playerPlacement);
  playerPlacement.position.x += 1;
  assert.throws(
    () =>
      verifyArtProductionRuntimeAssemblyHandoff(
        canonical.plan,
        canonical.loop,
        canonical.approvals,
        canonical.packagingPlan,
        changedRequest,
        canonical.handoff,
      ),
    (error) =>
      isRuntimeAssemblyInvalid(error) &&
      /deterministic compilation/u.test(error.message),
  );
});
