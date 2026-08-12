import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  buildHmfProviderExecutionEnvelopeBatch,
  heavyMetalFightingProviderExecutionEnvelope,
  verifyHmfProviderExecutionEnvelopes,
} from "./frame-body-provider-execution-envelope.mjs";
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
    evidenceSha256: sha256(`evidence:${envelope.unitId}:${requirement.bindingKey}`),
    actorClass: "human",
    actorId: "named-human-reviewer",
    occurredAt: "2026-08-13T01:00:00.000Z",
  }));
}

async function generationAuthorizationReceipts() {
  const referencesLocked = await createHmfProductionReceipt({
    unitId: UNIT_ID,
    state: "references-locked",
    attempt: 1,
    evidenceSha256: sha256("references-locked"),
    actorClass: "agent",
    actorId: "test-agent",
    occurredAt: "2026-08-13T01:01:00.000Z",
  });
  const generationAuthorized = await createHmfProductionReceipt({
    unitId: UNIT_ID,
    state: "generation-authorized",
    attempt: 1,
    evidenceSha256: sha256("generation-authorized"),
    actorClass: "human",
    actorId: "named-human-reviewer",
    occurredAt: "2026-08-13T01:02:00.000Z",
  }, referencesLocked);
  return [referencesLocked, generationAuthorized];
}

test("provider envelope composes immutable base and choreography prompts without self-authorizing", async () => {
  const [order, envelope] = await Promise.all([
    heavyMetalFightingProductionWorkOrder(UNIT_ID),
    heavyMetalFightingProviderExecutionEnvelope(UNIT_ID),
  ]);
  assert.equal(envelope.status, "blocked");
  assert.equal(envelope.submissionReady, false);
  assert.equal(envelope.baseWorkOrderSha256, order.workOrderSha256);
  assert.match(envelope.choreographyOverlaySha256, /^[0-9a-f]{64}$/);
  assert.match(envelope.executionEnvelopeSha256, /^[0-9a-f]{64}$/);
  assert.ok(envelope.composedProviderPrompt.startsWith(order.providerPrompt));
  assert.equal(envelope.composedProviderPrompt, `${order.providerPrompt}\n\n${envelope.composedProviderPrompt.slice(order.providerPrompt.length + 2)}`);
  assert.equal(envelope.promptComposition.baseProviderPromptSha256, sha256(order.providerPrompt));
  assert.equal(envelope.promptComposition.composedProviderPromptSha256, sha256(envelope.composedProviderPrompt));
  assert.equal(envelope.authorization.nextLegalAction, "lock-references");
  assert.equal(envelope.authorization.readyForOneProviderCall, false);
  assert.equal(envelope.providerRequestInput, null);
  assert.equal(envelope.missingReferenceBindingKeys.length, envelope.referenceRequirements.length);
  assert.ok(envelope.referenceRequirements.some((requirement) => requirement.role === "canonical-identity"));
  assert.ok(envelope.referenceRequirements.some((requirement) => requirement.role === "previous-key-pose"));
  assert.ok(envelope.referenceRequirements.some((requirement) => requirement.role === "next-key-pose"));
  assert.equal(envelope.candidatePolicy.candidateFanout, 1);
  assert.equal(envelope.authority.providerExecution, false);
  assert.equal(envelope.authority.referenceArtifactAdmission, false);
  assert.equal(envelope.authority.baseWorkOrderMutation, false);
  assert.equal(envelope.authority.receiptChainMutation, false);
});

test("provider envelope becomes submit-ready only with exact artifact admissions and human generation authorization", async () => {
  const blocked = await heavyMetalFightingProviderExecutionEnvelope(UNIT_ID);
  const receipts = await generationAuthorizationReceipts();
  const ready = await heavyMetalFightingProviderExecutionEnvelope(UNIT_ID, {
    receipts,
    artifactBindings: artifactBindings(blocked),
  });
  assert.equal(ready.status, "ready-for-explicit-provider-submission");
  assert.equal(ready.submissionReady, true);
  assert.equal(ready.blockers.length, 0);
  assert.equal(ready.authorization.currentState, "generation-authorized");
  assert.equal(ready.authorization.nextLegalAction, "run-provider-once");
  assert.equal(ready.authorization.readyForOneProviderCall, true);
  assert.match(ready.authorization.headReceiptSha256, /^[0-9a-f]{64}$/);
  assert.equal(ready.missingReferenceBindingKeys.length, 0);
  assert.equal(ready.referenceAdmissions.length, ready.referenceRequirements.length);
  assert.ok(ready.referenceAdmissions.every((binding) => binding.actorClass === "human"));
  assert.ok(ready.providerRequestInput);
  assert.equal(ready.providerRequestInput.schemaVersion, "1.0");
  assert.equal(ready.providerRequestInput.operation, "generate");
  assert.equal(ready.providerRequestInput.assetKind, "sprite-frame");
  assert.equal(ready.providerRequestInput.continuityPhase, "in-between");
  assert.equal(ready.providerRequestInput.candidateCount, 1);
  assert.deepEqual(ready.providerRequestInput.target, { width: 160, height: 160, transparency: "required", outputFormat: "png" });
  assert.deepEqual(ready.providerRequestInput.sourceCanvas, { width: 640, height: 640 });
  assert.deepEqual(ready.providerRequestInput.background, { strategy: "native-alpha" });
  assert.equal(ready.providerRequestInput.metadata.approvals.generation, false);
  assert.equal(ready.providerRequestInput.metadata.approvals.promotion, false);
  assert.equal(ready.providerRequestInput.references.length, ready.referenceRequirements.length);
  assert.ok(ready.providerRequestInput.references.some((reference) => reference.role === "canonical-identity" && reference.required));
  assert.ok(ready.providerRequestInput.references.some((reference) => reference.role === "previous-key-pose" && reference.required));
  assert.ok(ready.providerRequestInput.references.some((reference) => reference.role === "next-key-pose" && reference.required));
  assert.equal(ready.bodyRoleSemanticId, "standing-heavy:hero-impact");
  assert.match(ready.composedProviderPrompt, /GRAVEBELL/);
  assert.equal(ready.authority.explicitWriteEnabledRuntimeCallRequired, true);
  assert.equal(ready.authority.providerExecution, false);
});

test("reference artifact admissions fail closed on path drift, non-human admission, duplicates and unknown keys", async () => {
  const blocked = await heavyMetalFightingProviderExecutionEnvelope(UNIT_ID);
  const receipts = await generationAuthorizationReceipts();
  const bindings = artifactBindings(blocked);
  await assert.rejects(
    heavyMetalFightingProviderExecutionEnvelope(UNIT_ID, {
      receipts,
      artifactBindings: [{ ...bindings[0], sourcePath: `${bindings[0].sourcePath}/drift` }, ...bindings.slice(1)],
    }),
    /sourcePath does not match/,
  );
  await assert.rejects(
    heavyMetalFightingProviderExecutionEnvelope(UNIT_ID, {
      receipts,
      artifactBindings: [{ ...bindings[0], actorClass: "agent" }, ...bindings.slice(1)],
    }),
    /requires actorClass human/,
  );
  await assert.rejects(
    heavyMetalFightingProviderExecutionEnvelope(UNIT_ID, {
      receipts,
      artifactBindings: [...bindings, bindings[0]],
    }),
    /is duplicated/,
  );
  await assert.rejects(
    heavyMetalFightingProviderExecutionEnvelope(UNIT_ID, {
      receipts,
      artifactBindings: [{ ...bindings[0], bindingKey: "invented-reference" }, ...bindings.slice(1)],
    }),
    /is not required/,
  );
});

test("provider envelope batches preserve the existing 1-10 Frame-body queue and never pad or execute it", async () => {
  const order = await heavyMetalFightingProductionWorkOrder(UNIT_ID);
  const batch = await buildHmfProviderExecutionEnvelopeBatch(order.batchId);
  assert.equal(batch.batchId, order.batchId);
  assert.equal(batch.frameId, "bastion");
  assert.ok(batch.envelopeCount >= 1 && batch.envelopeCount <= 10);
  assert.equal(batch.envelopeCount, batch.envelopes.length);
  assert.equal(batch.readyEnvelopeCount, 0);
  assert.equal(batch.blockedEnvelopeCount, batch.envelopeCount);
  assert.equal(batch.status, "blocked");
  assert.equal(new Set(batch.envelopes.map((envelope) => envelope.unitId)).size, batch.envelopeCount);
  assert.ok(batch.envelopes.every((envelope) => envelope.batchId === batch.batchId));
  assert.ok(batch.envelopes.every((envelope) => envelope.authority.providerExecution === false));
  assert.equal(batch.authority.providerExecution, false);
  assert.equal(batch.authority.referenceArtifactAdmission, false);
  assert.equal(batch.authority.explicitWriteEnabledRuntimeCallRequired, true);
});

test("supporting-art batches cannot be misrepresented as Frame body provider envelopes", async () => {
  await assert.rejects(
    buildHmfProviderExecutionEnvelopeBatch("hmf-b0001"),
    /body choreography overlays apply only to frame-animation batches|provider execution envelopes currently apply only to Frame body-animation batches/,
  );
});

test("provider execution envelope verification covers blocked and submit-ready states without executing anything", async () => {
  const verification = await verifyHmfProviderExecutionEnvelopes();
  assert.equal(verification.status, "passed");
  assert.ok(verification.checks.every((check) => check.passed));
  assert.equal(verification.failed.length, 0);
  assert.match(verification.blockedEnvelopeSha256, /^[0-9a-f]{64}$/);
  assert.match(verification.readyEnvelopeSha256, /^[0-9a-f]{64}$/);
});
