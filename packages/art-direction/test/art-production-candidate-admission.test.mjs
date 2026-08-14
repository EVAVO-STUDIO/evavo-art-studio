import test from "node:test";

import {
  ArtDirectionError,
  compileArtProductionCandidateAdmissionReceipt,
  compileArtProductionLoop,
  compileLayeredProductionPlan,
  compileNextArtProductionBatch,
  evaluateArtProductionAttempt,
  verifyArtProductionCandidateAdmissionReceipt,
  verifyArtProductionCandidateAdmissionReceiptAgainstRequest,
} from "../dist/index.js";
import {
  approvedPlan,
  assert,
  attempt,
  candidateAdmissionRequest,
  canonicalSha256,
  digest,
  productionRequest,
  profile,
} from "./art-production-fixtures.mjs";
import {
  addCompleteRuntimeAnimations,
  productionRequest as runtimeProductionRequest,
} from "./layered-assembly-fixtures.mjs";

function requestFromReceipt(receipt) {
  return {
    schemaVersion: "1.0",
    kind: "evavo.art-production.candidate-admission.request",
    planId: receipt.planId,
    planSha256: receipt.planSha256,
    loopSha256: receipt.loopSha256,
    profileSha256: receipt.profileSha256,
    batchSha256: receipt.scheduledJob.batchSha256,
    jobSha256: receipt.scheduledJob.jobSha256,
    unitId: receipt.unitId,
    attemptNumber: receipt.scheduledJob.attemptNumber,
    providerEvidence: receipt.providerEvidence,
    candidate: receipt.candidate,
    inspectionEvidenceArtifactId: receipt.inspectionEvidenceArtifactId,
    inspectionEvidenceSha256: receipt.inspectionEvidenceSha256,
    admittedBy: receipt.admittedBy,
    admittedAt: receipt.admittedAt,
  };
}

function admissionBasis(receipt) {
  return {
    planId: receipt.planId,
    planSha256: receipt.planSha256,
    loopSha256: receipt.loopSha256,
    profileSha256: receipt.profileSha256,
    unitId: receipt.unitId,
    scheduledJob: receipt.scheduledJob,
    providerEvidence: receipt.providerEvidence,
    candidate: receipt.candidate,
    inspectionEvidenceArtifactId: receipt.inspectionEvidenceArtifactId,
    inspectionEvidenceSha256: receipt.inspectionEvidenceSha256,
    admittedBy: receipt.admittedBy,
    admittedAt: receipt.admittedAt,
  };
}

function rehashReceipt(receipt) {
  receipt.requestSha256 = canonicalSha256(requestFromReceipt(receipt));
  receipt.admissionBasisSha256 = canonicalSha256(admissionBasis(receipt));
  const { admissionReceiptSha256: _discarded, ...payload } = receipt;
  receipt.admissionReceiptSha256 = canonicalSha256(payload);
  return receipt;
}

function fixture() {
  const plan = compileLayeredProductionPlan(productionRequest());
  const loop = compileArtProductionLoop(plan, profile());
  const request = candidateAdmissionRequest(plan, loop, "ground-base");
  const receipt = compileArtProductionCandidateAdmissionReceipt(
    plan,
    loop,
    request,
  );
  return { plan, loop, request, receipt };
}

test("compiles and verifies an exact scheduled-job candidate admission receipt", () => {
  const { plan, loop, request, receipt } = fixture();
  assert.equal(receipt.unitId, "ground-base");
  assert.equal(receipt.scheduledJob.batchSha256, request.batchSha256);
  assert.equal(receipt.scheduledJob.jobSha256, request.jobSha256);
  assert.equal(receipt.scheduledJob.attemptNumber, 1);
  assert.equal(receipt.scheduledJob.mode, "generate");
  assert.equal(receipt.candidate.artifactId, request.candidate.artifactId);
  assert.equal(receipt.authority.providerExecution, false);
  assert.equal(receipt.authority.imageInspection, false);
  assert.equal(receipt.authority.automaticCandidateAdmission, false);
  assert.equal(
    verifyArtProductionCandidateAdmissionReceipt(plan, loop, receipt),
    true,
  );
  assert.equal(
    verifyArtProductionCandidateAdmissionReceiptAgainstRequest(
      plan,
      loop,
      request,
      receipt,
    ),
    true,
  );
});

test("applies untouched sibling receipts from one scheduled batch as the loop advances", () => {
  const plan = approvedPlan(
    addCompleteRuntimeAnimations(runtimeProductionRequest()),
  );
  let loop = compileArtProductionLoop(plan, profile());
  let batch = compileNextArtProductionBatch(plan, loop);

  for (let guard = 0; batch.jobs.length < 2 && guard < 100; guard += 1) {
    assert.equal(batch.status, "jobs-ready");
    assert.ok(batch.jobs.length > 0);
    loop = evaluateArtProductionAttempt(
      plan,
      loop,
      attempt(loop, plan, batch.jobs[0].unitId),
    );
    batch = compileNextArtProductionBatch(plan, loop);
  }

  assert.equal(batch.status, "jobs-ready");
  assert.ok(batch.jobs.length >= 2);
  const scheduledLoopSha256 = loop.loopSha256;
  const scheduledBatchSha256 = batch.batchSha256;
  const scheduledAttempts = batch.jobs
    .slice(0, 2)
    .map((job) => attempt(loop, plan, job.unitId));

  assert.ok(
    scheduledAttempts.every(
      (entry) =>
        entry.candidateAdmissionReceipt.loopSha256 ===
          scheduledLoopSha256 &&
        entry.candidateAdmissionReceipt.scheduledJob.batchSha256 ===
          scheduledBatchSha256,
    ),
  );

  loop = evaluateArtProductionAttempt(plan, loop, scheduledAttempts[0]);
  loop = evaluateArtProductionAttempt(plan, loop, {
    ...scheduledAttempts[1],
    loopSha256: loop.loopSha256,
  });

  const secondUnitId = scheduledAttempts[1].unitId;
  const secondState = loop.unitStates.find(
    (entry) => entry.unitId === secondUnitId,
  );
  const retainedSecondAttempt = loop.attempts.at(-1);
  assert.equal(secondState?.status, "review-passed");
  assert.equal(
    retainedSecondAttempt?.candidateAdmissionReceipt.loopSha256,
    scheduledLoopSha256,
  );
  assert.notEqual(retainedSecondAttempt?.priorLoopSha256, scheduledLoopSha256);
});

test("technical review rejects the former loose candidate object", () => {
  const { plan, loop } = fixture();
  const governed = attempt(loop, plan, "ground-base");
  const loose = structuredClone(governed);
  loose.candidate = loose.candidateAdmissionReceipt.candidate;
  delete loose.candidateAdmissionReceipt;

  assert.throws(
    () => evaluateArtProductionAttempt(plan, loop, loose),
    (error) =>
      error instanceof ArtDirectionError &&
      /unsupported fields: candidate/u.test(error.message),
  );
});

test("rejects retained-hash candidate mutation", () => {
  const { plan, loop, receipt } = fixture();
  const forged = structuredClone(receipt);
  forged.candidate.bytes += 1;

  assert.throws(
    () =>
      verifyArtProductionCandidateAdmissionReceipt(
        plan,
        loop,
        forged,
      ),
    (error) =>
      error instanceof ArtDirectionError &&
      error.code ===
        "ART_PRODUCTION_CANDIDATE_ADMISSION_RECEIPT_INVALID" &&
      /requestSha256 does not match|submitted payload/u.test(
        error.message,
      ),
  );
});

test("rejects attacker-rehashed scheduled-job substitution", () => {
  const { plan, loop, receipt } = fixture();
  const forged = structuredClone(receipt);
  forged.scheduledJob.jobSha256 = digest("forged-scheduled-job");
  rehashReceipt(forged);

  assert.throws(
    () =>
      verifyArtProductionCandidateAdmissionReceipt(
        plan,
        loop,
        forged,
      ),
    (error) =>
      error instanceof ArtDirectionError &&
      (error.code === "ART_PRODUCTION_CANDIDATE_ADMISSION_INVALID" ||
        error.code ===
          "ART_PRODUCTION_CANDIDATE_ADMISSION_RECEIPT_INVALID"),
  );
});

test("rejects rehashed provider-execution authority escalation", () => {
  const { plan, loop, receipt } = fixture();
  const forged = structuredClone(receipt);
  forged.authority.providerExecution = true;
  const { admissionReceiptSha256: _discarded, ...payload } = forged;
  forged.admissionReceiptSha256 = canonicalSha256(payload);

  assert.throws(
    () =>
      verifyArtProductionCandidateAdmissionReceipt(
        plan,
        loop,
        forged,
      ),
    (error) =>
      error instanceof ArtDirectionError &&
      error.code ===
        "ART_PRODUCTION_CANDIDATE_ADMISSION_RECEIPT_INVALID" &&
      /authority/u.test(error.message),
  );
});

test("request-bound verification distinguishes separate external provider evidence", () => {
  const { plan, loop, request, receipt } = fixture();
  const alternateRequest = candidateAdmissionRequest(
    plan,
    loop,
    "ground-base",
    {
      providerJobId: "fixture-provider-job-alternate",
      providerRequestSha256: digest("alternate-provider-request"),
      providerResponseSha256: digest("alternate-provider-response"),
      inspectionEvidenceSha256: digest("alternate-inspection"),
      candidateSalt: "alternate-candidate",
    },
  );
  const alternateReceipt =
    compileArtProductionCandidateAdmissionReceipt(
      plan,
      loop,
      alternateRequest,
    );

  assert.equal(
    verifyArtProductionCandidateAdmissionReceipt(
      plan,
      loop,
      alternateReceipt,
    ),
    true,
  );
  assert.notEqual(
    alternateReceipt.admissionReceiptSha256,
    receipt.admissionReceiptSha256,
  );
  assert.throws(
    () =>
      verifyArtProductionCandidateAdmissionReceiptAgainstRequest(
        plan,
        loop,
        request,
        alternateReceipt,
      ),
    (error) =>
      error instanceof ArtDirectionError &&
      error.code ===
        "ART_PRODUCTION_CANDIDATE_ADMISSION_RECEIPT_INVALID",
  );
});

test("rejects a valid admission receipt replayed against a later loop", () => {
  const { plan, loop, receipt } = fixture();
  const next = evaluateArtProductionAttempt(
    plan,
    loop,
    attempt(loop, plan, "ground-base"),
  );

  assert.throws(
    () =>
      verifyArtProductionCandidateAdmissionReceipt(
        plan,
        next,
        receipt,
      ),
    (error) =>
      error instanceof ArtDirectionError &&
      (error.code === "ART_PRODUCTION_CANDIDATE_ADMISSION_INVALID" ||
        error.code ===
          "ART_PRODUCTION_CANDIDATE_ADMISSION_RECEIPT_INVALID"),
  );
});

test("requires inspection evidence distinct from the retained candidate PNG", () => {
  const plan = compileLayeredProductionPlan(productionRequest());
  const loop = compileArtProductionLoop(plan, profile());
  const request = candidateAdmissionRequest(plan, loop, "ground-base");
  request.inspectionEvidenceSha256 = request.candidate.sha256;
  request.inspectionEvidenceArtifactId = request.candidate.artifactId;

  assert.throws(
    () =>
      compileArtProductionCandidateAdmissionReceipt(
        plan,
        loop,
        request,
      ),
    (error) =>
      error instanceof ArtDirectionError &&
      error.code === "ART_PRODUCTION_CANDIDATE_ADMISSION_INVALID" &&
      /distinct artifacts/u.test(error.message),
  );
});
