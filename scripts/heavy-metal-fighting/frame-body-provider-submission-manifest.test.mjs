import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  buildHmfProviderSubmissionManifestBatch,
  createHmfProviderSubmissionAuthorization,
  heavyMetalFightingProviderSubmissionManifest,
  validateHmfProviderSubmissionAuthorization,
  verifyHmfProviderSubmissionManifests,
} from "./frame-body-provider-submission-manifest.mjs";
import { heavyMetalFightingProviderExecutionEnvelope } from "./frame-body-provider-execution-envelope.mjs";
import {
  createHmfProductionReceipt,
  heavyMetalFightingProductionWorkOrder,
} from "./work-orders.mjs";

const UNIT_ID = "hmf.frame-animation.bastion.slot-121";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function artifactBindings(envelope) {
  return envelope.referenceRequirements.map((requirement) => ({
    unitId: envelope.unitId,
    bindingKey: requirement.bindingKey,
    sourcePath: requirement.sourcePath,
    artifactId: `artifact_${sha256(`${envelope.unitId}:${requirement.bindingKey}:${requirement.sourcePath}`)}`,
    evidenceSha256: sha256(`submission-evidence:${envelope.unitId}:${requirement.bindingKey}`),
    actorClass: "human",
    actorId: "named-human-reviewer",
    occurredAt: "2026-08-13T03:00:00.000Z",
  }));
}

async function readyEvidence() {
  const blocked = await heavyMetalFightingProviderExecutionEnvelope(UNIT_ID);
  const referencesLocked = await createHmfProductionReceipt({
    unitId: UNIT_ID,
    state: "references-locked",
    attempt: 1,
    evidenceSha256: sha256("submission-test-references-locked"),
    actorClass: "agent",
    actorId: "submission-test-agent",
    occurredAt: "2026-08-13T03:01:00.000Z",
  });
  const generationAuthorized = await createHmfProductionReceipt({
    unitId: UNIT_ID,
    state: "generation-authorized",
    attempt: 1,
    evidenceSha256: sha256("submission-test-generation-authorized"),
    actorClass: "human",
    actorId: "named-human-reviewer",
    occurredAt: "2026-08-13T03:02:00.000Z",
  }, referencesLocked);
  return {
    receipts: [referencesLocked, generationAuthorized],
    artifactBindings: artifactBindings(blocked),
  };
}

async function readyEnvelopeAndAuthorization() {
  const evidence = await readyEvidence();
  const envelope = await heavyMetalFightingProviderExecutionEnvelope(UNIT_ID, evidence);
  const authorization = createHmfProviderSubmissionAuthorization(envelope, {
    actorClass: "human",
    actorId: "named-human-reviewer",
    occurredAt: "2026-08-13T03:03:00.000Z",
    evidenceSha256: sha256("submission-test-explicit-provider-submit"),
    reason: "Authorize one provider call for one exact GRAVEBELL hero-impact candidate.",
  });
  return { evidence, envelope, authorization };
}

test("provider submission manifest preserves the second explicit human gate after a ready execution envelope", async () => {
  const blocked = await heavyMetalFightingProviderSubmissionManifest(UNIT_ID);
  assert.equal(blocked.status, "blocked-by-provider-execution-envelope");
  assert.equal(blocked.manifestReady, false);
  assert.ok(blocked.blockers.includes("provider-execution-envelope-not-submit-ready"));
  assert.equal(blocked.submissionAuthorizationTemplate, null);
  assert.equal(blocked.runtimeSubmissionInstruction, null);
  assert.equal(blocked.authority.providerExecution, false);
  assert.equal(blocked.authority.runtimeEnqueue, false);

  const evidence = await readyEvidence();
  const awaiting = await heavyMetalFightingProviderSubmissionManifest(UNIT_ID, evidence);
  assert.equal(awaiting.status, "awaiting-human-submission-authorization");
  assert.equal(awaiting.manifestReady, false);
  assert.deepEqual(awaiting.blockers, ["named-human-provider-submission-authorization-required"]);
  assert.equal(awaiting.submissionAuthorizationTemplate.actorClass, "human");
  assert.deepEqual(awaiting.submissionAuthorizationTemplate.requiredHumanFields, ["reason", "actorId", "occurredAt", "evidenceSha256"]);
  assert.equal(awaiting.runtimeSubmissionInstruction, null);
  assert.equal(awaiting.authority.explicitWriteEnabledRuntimeCallRequired, true);
});

test("one human authorization produces one hash-bound runtime submission instruction without executing it", async () => {
  const { evidence, envelope, authorization } = await readyEnvelopeAndAuthorization();
  assert.equal(authorization.unitId, UNIT_ID);
  assert.equal(authorization.executionEnvelopeSha256, envelope.executionEnvelopeSha256);
  assert.equal(authorization.providerRequestInputSha256, envelope.providerRequestInputSha256);
  assert.equal(authorization.generationAuthorizationReceiptSha256, envelope.authorization.headReceiptSha256);
  assert.equal(authorization.scope.providerCalls, 1);
  assert.equal(authorization.scope.candidates, 1);
  assert.equal(authorization.actorClass, "human");
  assert.match(authorization.authorizationSha256, /^[0-9a-f]{64}$/);
  assert.equal(validateHmfProviderSubmissionAuthorization(envelope, authorization), authorization);

  const manifest = await heavyMetalFightingProviderSubmissionManifest(UNIT_ID, {
    ...evidence,
    submissionAuthorization: authorization,
  });
  assert.equal(manifest.status, "authorized-for-explicit-runtime-submission");
  assert.equal(manifest.manifestReady, true);
  assert.equal(manifest.blockers.length, 0);
  assert.equal(manifest.submissionAuthorization.authorizationSha256, authorization.authorizationSha256);
  assert.match(manifest.submissionManifestSha256, /^[0-9a-f]{64}$/);
  const instruction = manifest.runtimeSubmissionInstruction;
  assert.ok(instruction);
  assert.equal(instruction.providerCompiler.package, "@evavo/art-providers");
  assert.equal(instruction.providerCompiler.export, "compileProviderCandidateRuntimeContract");
  assert.equal(instruction.providerCompiler.validationRequiredAtSubmission, true);
  assert.equal(instruction.providerRequestInputSha256, envelope.providerRequestInputSha256);
  assert.deepEqual(instruction.providerRequestInput, envelope.providerRequestInput);
  assert.equal(instruction.providerRequestInput.candidateCount, 1);
  assert.equal(instruction.maximumProviderCalls, 1);
  assert.equal(instruction.maximumCandidates, 1);
  assert.equal(instruction.candidateOutputPath, envelope.candidateOutputPath);
  assert.equal(instruction.expectedNextReceiptState, "candidates-admitted");
  assert.match(instruction.submissionIdempotencyKey, /^hmf-provider-submit:[0-9a-f]{40}$/);
  assert.match(instruction.runtimeSubmissionInstructionSha256, /^[0-9a-f]{64}$/);
  assert.equal(instruction.authority.providerExecution, false);
  assert.equal(instruction.authority.runtimeEnqueue, false);
  assert.equal(manifest.authority.providerExecution, false);
  assert.equal(manifest.authority.candidateApproval, false);
  assert.equal(manifest.authority.candidatePromotion, false);
});

test("submission authorization rejects non-human actors, unsupported fields and stale or tampered bindings", async () => {
  const { evidence, envelope, authorization } = await readyEnvelopeAndAuthorization();
  assert.throws(
    () => createHmfProviderSubmissionAuthorization(envelope, {
      actorClass: "agent",
      actorId: "automation-agent",
      occurredAt: "2026-08-13T03:04:00.000Z",
      evidenceSha256: sha256("non-human-submit"),
      reason: "Automation may not authorize provider execution.",
    }),
    /requires actorClass human/,
  );
  assert.throws(
    () => createHmfProviderSubmissionAuthorization(envelope, {
      actorClass: "human",
      actorId: "named-human-reviewer",
      occurredAt: "2026-08-13T03:04:00.000Z",
      evidenceSha256: sha256("extra-field-submit"),
      reason: "Exact fields only.",
      providerExecution: true,
    }),
    /fields must be exactly/,
  );
  await assert.rejects(
    heavyMetalFightingProviderSubmissionManifest(UNIT_ID, {
      ...evidence,
      submissionAuthorization: { ...authorization, executionEnvelopeSha256: "f".repeat(64) },
    }),
    /authorizationSha256 does not match|bound to another execution envelope/,
  );
  await assert.rejects(
    heavyMetalFightingProviderSubmissionManifest(UNIT_ID, {
      ...evidence,
      submissionAuthorization: { ...authorization, actorClass: "agent" },
    }),
    /authorizationSha256 does not match|requires actorClass human/,
  );
});

test("submission manifest batches reuse the exact 1-10 Frame body batch without padding or runtime authority", async () => {
  const order = await heavyMetalFightingProductionWorkOrder(UNIT_ID);
  const batch = await buildHmfProviderSubmissionManifestBatch(order.batchId);
  assert.equal(batch.batchId, order.batchId);
  assert.equal(batch.frameId, "bastion");
  assert.ok(batch.manifestCount >= 1 && batch.manifestCount <= 10);
  assert.equal(batch.manifestCount, batch.manifests.length);
  assert.equal(batch.authorizedManifestCount, 0);
  assert.equal(batch.awaitingAuthorizationCount, 0);
  assert.equal(batch.blockedManifestCount, batch.manifestCount);
  assert.equal(batch.status, "blocked");
  assert.equal(new Set(batch.manifests.map((manifest) => manifest.unitId)).size, batch.manifestCount);
  assert.ok(batch.manifests.every((manifest) => manifest.batchId === batch.batchId));
  assert.ok(batch.manifests.every((manifest) => manifest.authority.providerExecution === false));
  assert.equal(batch.authority.providerExecution, false);
  assert.equal(batch.authority.runtimeEnqueue, false);
  assert.equal(batch.authority.explicitWriteEnabledRuntimeCallRequired, true);
});

test("supporting-art batches cannot acquire Frame body provider submission manifests", async () => {
  await assert.rejects(
    buildHmfProviderSubmissionManifestBatch("hmf-b0001"),
    /body choreography overlays apply only to frame-animation batches|provider execution envelopes currently apply only to Frame body-animation batches/,
  );
});

test("provider submission manifest verification covers blocked, awaiting and authorized states without provider execution", async () => {
  const verification = await verifyHmfProviderSubmissionManifests();
  assert.equal(verification.status, "passed");
  assert.ok(verification.checks.every((check) => check.passed));
  assert.equal(verification.failed.length, 0);
  assert.match(verification.blockedManifestSha256, /^[0-9a-f]{64}$/);
  assert.match(verification.awaitingManifestSha256, /^[0-9a-f]{64}$/);
  assert.match(verification.authorizedManifestSha256, /^[0-9a-f]{64}$/);
  assert.match(verification.authorizationSha256, /^[0-9a-f]{64}$/);
});
