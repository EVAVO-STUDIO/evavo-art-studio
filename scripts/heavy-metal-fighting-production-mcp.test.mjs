import assert from "node:assert/strict";
import test from "node:test";

import {
  BODY_CHOREOGRAPHY_OVERLAY_TOOL,
  FRAME_ATLAS_V3_TOOL,
  FRAME_MOVE_CHOREOGRAPHY_TOOL,
  PROVIDER_EXECUTION_ENVELOPE_BATCH_TOOL,
  PROVIDER_EXECUTION_ENVELOPE_TOOL,
  PROVIDER_SUBMISSION_MANIFEST_BATCH_TOOL,
  PROVIDER_SUBMISSION_MANIFEST_TOOL,
  REGISTRY_BATCH_TOOL,
  REGISTRY_SUMMARY_TOOL,
  RECEIPT_TEMPLATE_TOOL,
  REPAIR_TEMPLATE_TOOL,
  RESUME_BATCH_TOOL,
  STYLE_PROOF_EXECUTION_TOOL,
  VERIFY_TOOL,
  WORK_ORDER_BATCH_TOOL,
  WORK_ORDER_TOOL,
  callTool,
  handleRequest,
  toolDefinitions,
} from "./heavy-metal-fighting-production-mcp.mjs";

const CANDIDATE = "a".repeat(64);
const EXPECTED_TOOLS = [
  REGISTRY_SUMMARY_TOOL,
  REGISTRY_BATCH_TOOL,
  STYLE_PROOF_EXECUTION_TOOL,
  FRAME_ATLAS_V3_TOOL,
  FRAME_MOVE_CHOREOGRAPHY_TOOL,
  BODY_CHOREOGRAPHY_OVERLAY_TOOL,
  PROVIDER_EXECUTION_ENVELOPE_TOOL,
  PROVIDER_EXECUTION_ENVELOPE_BATCH_TOOL,
  PROVIDER_SUBMISSION_MANIFEST_TOOL,
  PROVIDER_SUBMISSION_MANIFEST_BATCH_TOOL,
  WORK_ORDER_BATCH_TOOL,
  WORK_ORDER_TOOL,
  RECEIPT_TEMPLATE_TOOL,
  REPAIR_TEMPLATE_TOOL,
  RESUME_BATCH_TOOL,
  VERIFY_TOOL,
];

test("production MCP exposes only bounded read-only planning and review tools", () => {
  const tools = toolDefinitions();
  assert.deepEqual(tools.map((tool) => tool.name), EXPECTED_TOOLS);
  const names = tools.map((tool) => tool.name).join(" ");
  for (const prohibited of ["generate", "approve", "promote", "publish", "commit", "push", "write", "deploy"]) {
    assert.equal(names.includes(prohibited), false, `production MCP gained prohibited ${prohibited} tool`);
  }
});

test("registry and work-order tools expose the exact final production queue", async () => {
  const summary = await callTool(REGISTRY_SUMMARY_TOOL);
  assert.equal(summary.totals.batches, 179);
  assert.equal(summary.totals.sourceImages, 1573);
  assert.equal(summary.totals.bodyAnimationImages, 896);

  const registryBatch = await callTool(REGISTRY_BATCH_TOOL, { batch: 1 });
  assert.equal(registryBatch.batch.id, "hmf-b0001");
  assert.ok(registryBatch.batch.requiredImages >= 1 && registryBatch.batch.requiredImages <= 10);

  const workOrderBatch = await callTool(WORK_ORDER_BATCH_TOOL, { batch: "hmf-b0001" });
  assert.equal(workOrderBatch.batchId, "hmf-b0001");
  assert.equal(workOrderBatch.requiredImages, workOrderBatch.workOrders.length);
  assert.ok(workOrderBatch.workOrders.every((order) => order.candidatePolicy.candidateFanout === 1));
  assert.ok(workOrderBatch.workOrders.every((order) => order.authority.providerExecution === false));
});

test("style-proof execution tool covers every critical batch in four human-gated phases", async () => {
  const [summary, view] = await Promise.all([
    callTool(REGISTRY_SUMMARY_TOOL),
    callTool(STYLE_PROOF_EXECUTION_TOOL),
  ]);
  assert.equal(view.plan.phases.length, 4);
  assert.equal(view.plan.totals.batches, summary.totals.styleProofBatches);
  assert.equal(new Set(view.plan.phases.flatMap((phase) => phase.batchIds)).size, view.plan.totals.batches);
  assert.equal(view.plan.phases[0].id, "brand-shell");
  assert.equal(view.plan.phases.at(-1).completionApprovalId, "style-proof-approved");
  assert.equal(view.plan.proofSubjects.pilotId, "branka-kovac");
  assert.equal(view.plan.proofSubjects.frameId, "bastion");
  assert.equal(view.plan.proofSubjects.arenaId, "foundry-nine");
  assert.equal(view.plan.runtimePromotion.productionMasterCell.width, 160);
  assert.equal(view.plan.runtimePromotion.productionMasterCell.height, 160);
  assert.deepEqual(view.plan.runtimePromotion.productionMasterPivot, { x: 80, y: 152 });
  assert.equal(view.plan.runtimePromotion.finalFrameBodyPromotionRequiresGameAtlasV3Migration, true);
  assert.equal(view.plan.runtimePromotion.artProductionMayProceedBeforeMigration, true);
  assert.equal(view.status.phaseStatuses[0].status, "blocked-by-approval");
  assert.ok(view.status.phaseStatuses[0].missingApprovalIds.includes("style-north-star-approved"));
  assert.equal(view.status.authority.providerExecution, false);
  assert.equal(view.status.authority.automaticApproval, false);
});

test("style-proof execution accepts only explicit named-human evidence", async () => {
  const approval = {
    id: "style-north-star-approved",
    actorClass: "human",
    actorId: "named-human-reviewer",
    occurredAt: "2026-08-12T08:00:00Z",
    evidenceSha256: "b".repeat(64),
  };
  const view = await callTool(STYLE_PROOF_EXECUTION_TOOL, { approvalRecords: [approval] });
  assert.equal(view.status.status, "ready-to-start");
  assert.equal(view.status.phaseStatuses[0].status, "ready-to-start");
  assert.equal(view.status.phaseStatuses[0].missingApprovalIds.length, 0);
  assert.equal(view.status.phaseStatuses[1].status, "blocked-by-prior-phase");
  await assert.rejects(
    callTool(STYLE_PROOF_EXECUTION_TOOL, { approvalRecords: [{ ...approval, actorClass: "agent" }] }),
    /must be recorded by a human actor/,
  );
});

test("frame atlas-v3 MCP tool exposes deterministic 224-cel semantic handoff without building or promoting it", async () => {
  const layout = await callTool(FRAME_ATLAS_V3_TOOL, { frameId: "bastion" });
  assert.equal(layout.frameId, "bastion");
  assert.equal(layout.slots.length, 224);
  assert.equal(layout.bodyBatchIds.length, 26);
  assert.equal(layout.productionMaster.slotsPerFrame, 256);
  assert.equal(layout.reservedSlots.length, 32);
  assert.equal(layout.reservedSlots[0], 224);
  assert.equal(layout.reservedSlots.at(-1), 255);
  assert.deepEqual(layout.productionMaster.cell, { width: 160, height: 160 });
  assert.deepEqual(layout.productionMaster.pivot, { x: 80, y: 152 });
  assert.match(layout.roleGrammarSha256, /^[0-9a-f]{64}$/);
  assert.match(layout.roleMapSha256, /^[0-9a-f]{64}$/);
  assert.equal(layout.frameMotionRealization.motionIdentity, "hydraulic-weight");
  assert.equal(layout.slots[121].bodyRole.semanticId, "standing-heavy:hero-impact");
  assert.equal(layout.slots[184].bodyRole.semanticId, "overdrive:super-primary-impact");
  assert.equal(layout.gameTargetPath, "res://assets/fighters/final-v3/bastion.png");
  assert.equal(layout.authority.targetRepositoryMutation, false);
  assert.equal(layout.authority.gitMutation, false);
});

test("frame move choreography MCP tool exposes exact named moves without claiming game timing authority", async () => {
  const frame = await callTool(FRAME_MOVE_CHOREOGRAPHY_TOOL, { frameId: "bastion" });
  assert.equal(frame.frameId, "bastion");
  assert.equal(frame.moves.length, 11);
  assert.equal(frame.byCategory.normals.length, 6);
  assert.equal(frame.byCategory.specials.length, 2);
  assert.equal(frame.namedHighOutput.specialA, "redline-bore");
  assert.equal(frame.namedHighOutput.specialB, "anvil-lock");
  assert.equal(frame.namedHighOutput.reversal, "blow-off");
  assert.equal(frame.namedHighOutput.overdrive, "kiln-verdict");
  const heavy = frame.moves.find((move) => move.moveId === "gravebell");
  assert.equal(heavy.publicName, "GRAVEBELL");
  assert.deepEqual(heavy.productionBodySlotRange, { start: 117, end: 124, count: 8 });
  assert.equal(heavy.heroBodyRole.semanticId, "standing-heavy:hero-impact");
  const overdrive = frame.moves.find((move) => move.moveId === "kiln-verdict");
  assert.deepEqual(overdrive.productionBodySlotRange, { start: 178, end: 191, count: 14 });
  assert.equal(overdrive.heroBodyRole.slot, 184);
  assert.equal(overdrive.authority.simulationTiming, false);
  assert.equal(overdrive.authority.hitboxesDamageAndInputs, false);
  assert.equal(frame.authority.workOrderMutation, false);
  assert.equal(frame.authority.targetRepositoryMutation, false);
});

test("body choreography overlay binds exact pose intent to the immutable work order without mutating its hash", async () => {
  const unitId = "hmf.frame-animation.bastion.slot-121";
  const [order, overlay] = await Promise.all([
    callTool(WORK_ORDER_TOOL, { unitId }),
    callTool(BODY_CHOREOGRAPHY_OVERLAY_TOOL, { unitId }),
  ]);
  assert.equal(overlay.unitId, unitId);
  assert.equal(overlay.baseWorkOrderSha256, order.workOrderSha256);
  assert.match(overlay.overlaySha256, /^[0-9a-f]{64}$/);
  assert.equal(overlay.frameId, "bastion");
  assert.equal(overlay.bodySlot, 121);
  assert.equal(overlay.bodyBankId, "standing-heavy");
  assert.equal(overlay.bodyRole.semanticId, "standing-heavy:hero-impact");
  assert.equal(overlay.bodyRole.hero, true);
  assert.equal(overlay.moveBinding.publicName, "GRAVEBELL");
  assert.equal(overlay.moveBinding.actorRole, "primary-body");
  assert.equal(overlay.frameMotionRealization.motionIdentity, "hydraulic-weight");
  assert.equal(overlay.authority.supplementalPromptUse, true);
  assert.equal(overlay.authority.baseWorkOrderMutation, false);
  assert.equal(overlay.authority.receiptChainMutation, false);
  assert.equal(overlay.authority.simulationTiming, false);
  assert.equal(overlay.authority.targetRepositoryMutation, false);
  assert.match(overlay.supplementalProviderPrompt, /immutable base work order/i);
  assert.match(overlay.supplementalProviderPrompt, /ART SEMANTICS ONLY/);
  assert.match(overlay.supplementalProviderPrompt, /BODY ONLY/);
  assert.match(overlay.supplementalProviderPrompt, /one-image work-unit boundary/);
});

test("provider execution envelope MCP tools report blockers and exact batch cardinality without executing providers", async () => {
  const unitId = "hmf.frame-animation.bastion.slot-121";
  const [order, envelope] = await Promise.all([
    callTool(WORK_ORDER_TOOL, { unitId }),
    callTool(PROVIDER_EXECUTION_ENVELOPE_TOOL, { unitId }),
  ]);
  assert.equal(envelope.unitId, unitId);
  assert.equal(envelope.baseWorkOrderSha256, order.workOrderSha256);
  assert.equal(envelope.status, "blocked");
  assert.equal(envelope.submissionReady, false);
  assert.equal(envelope.authorization.nextLegalAction, "lock-references");
  assert.ok(envelope.missingReferenceBindingKeys.length > 0);
  assert.equal(envelope.providerRequestInput, null);
  assert.match(envelope.executionEnvelopeSha256, /^[0-9a-f]{64}$/);
  assert.equal(envelope.authority.providerExecution, false);
  assert.equal(envelope.authority.referenceArtifactAdmission, false);
  assert.equal(envelope.authority.explicitWriteEnabledRuntimeCallRequired, true);

  const batch = await callTool(PROVIDER_EXECUTION_ENVELOPE_BATCH_TOOL, { batch: order.batchId });
  assert.equal(batch.batchId, order.batchId);
  assert.equal(batch.frameId, "bastion");
  assert.ok(batch.envelopeCount >= 1 && batch.envelopeCount <= 10);
  assert.equal(batch.envelopeCount, batch.envelopes.length);
  assert.equal(batch.readyEnvelopeCount, 0);
  assert.equal(batch.blockedEnvelopeCount, batch.envelopeCount);
  assert.equal(batch.authority.providerExecution, false);
});

test("provider submission manifest MCP tools preserve the second human gate and never enqueue runtime jobs", async () => {
  const unitId = "hmf.frame-animation.bastion.slot-121";
  const order = await callTool(WORK_ORDER_TOOL, { unitId });
  const manifest = await callTool(PROVIDER_SUBMISSION_MANIFEST_TOOL, { unitId });
  assert.equal(manifest.unitId, unitId);
  assert.equal(manifest.status, "blocked-by-provider-execution-envelope");
  assert.equal(manifest.manifestReady, false);
  assert.ok(manifest.blockers.includes("provider-execution-envelope-not-submit-ready"));
  assert.equal(manifest.runtimeSubmissionInstruction, null);
  assert.match(manifest.submissionManifestSha256, /^[0-9a-f]{64}$/);
  assert.equal(manifest.authority.providerExecution, false);
  assert.equal(manifest.authority.runtimeEnqueue, false);
  assert.equal(manifest.authority.explicitWriteEnabledRuntimeCallRequired, true);

  const batch = await callTool(PROVIDER_SUBMISSION_MANIFEST_BATCH_TOOL, { batch: order.batchId });
  assert.equal(batch.batchId, order.batchId);
  assert.ok(batch.manifestCount >= 1 && batch.manifestCount <= 10);
  assert.equal(batch.manifestCount, batch.manifests.length);
  assert.equal(batch.authorizedManifestCount, 0);
  assert.equal(batch.blockedManifestCount, batch.manifestCount);
  assert.equal(batch.authority.providerExecution, false);
  assert.equal(batch.authority.runtimeEnqueue, false);
});

test("one final Frame body work order remains native, identity-bound and one-image-only", async () => {
  const order = await callTool(WORK_ORDER_TOOL, { unitId: "hmf.frame-animation.bastion.slot-002" });
  assert.equal(order.assetContract.nativeDimensions.width, 160);
  assert.equal(order.assetContract.nativeDimensions.height, 160);
  assert.deepEqual(order.assetContract.pivot, { x: 80, y: 152 });
  assert.equal(order.subjectContract.type, "frame");
  assert.equal(order.subjectContract.id, "bastion");
  assert.equal(order.subjectContract.motionIdentity, "hydraulic-weight");
  assert.ok(order.referenceBindings.previousCel.startsWith("working/frames/bastion/sprites/"));
  assert.ok(order.referenceBindings.nextCel.startsWith("working/frames/bastion/sprites/"));
  assert.ok(order.providerPrompt.includes("OUTPUT EXACTLY ONE SEPARATE IMAGE"));
  assert.equal(order.authority.automaticApproval, false);
  assert.equal(order.authority.targetRepositoryMutation, false);
});

test("receipt, repair and resume tools stay human-gated and non-executing", async () => {
  const unitId = "hmf.frame-animation.bastion.slot-002";
  const receipt = await callTool(RECEIPT_TEMPLATE_TOOL, { unitId });
  assert.equal(receipt.states.find((state) => state.id === "generation-authorized")?.requiresHuman, true);
  assert.equal(receipt.states.find((state) => state.id === "named-human-approved")?.requiresHuman, true);

  const repair = await callTool(REPAIR_TEMPLATE_TOOL, {
    unitId,
    candidateSha256: CANDIDATE,
    failureCodes: ["random-greebles", "pivot-drift"],
    attempt: 1,
  });
  assert.equal(repair.preservePassingSiblings, true);
  assert.equal(repair.authority.providerExecution, false);
  assert.equal(repair.authority.siblingRegeneration, false);
  assert.ok(repair.siblingUnitIdsForbiddenFromRegeneration.length > 0);

  const resume = await callTool(RESUME_BATCH_TOOL, { batch: "hmf-b0001", receipts: [] });
  assert.equal(resume.status, "not-started");
  assert.equal(resume.authority.providerExecution, false);
  assert.ok(resume.unitStates.every((state) => state.nextAction === "lock-references"));
});

test("production MCP verification composes registry, style-proof, atlas-v3, choreography, envelopes, submission manifests and work-order evidence", async () => {
  const verification = await callTool(VERIFY_TOOL);
  assert.equal(verification.status, "passed");
  assert.equal(verification.registry.status, "passed");
  assert.equal(verification.styleProofExecution.status, "passed");
  assert.equal(verification.frameAtlasV3.status, "passed");
  assert.equal(verification.frameMoveChoreography.status, "passed");
  assert.equal(verification.frameMoveChoreography.moveCount, 44);
  assert.equal(verification.bodyChoreographyOverlays.status, "passed");
  assert.equal(verification.providerExecutionEnvelopes.status, "passed");
  assert.equal(verification.providerSubmissionManifests.status, "passed");
  assert.equal(verification.workOrders.status, "passed");
  assert.equal(verification.authority.providerExecution, false);
  assert.equal(verification.authority.runtimeEnqueue, false);
  assert.equal(verification.authority.referenceArtifactAdmission, false);
  assert.equal(verification.authority.receiptPersistence, false);
  assert.equal(verification.authority.gitMutation, false);
});

test("JSON-RPC surface rejects undeclared production mutation tools", async () => {
  await assert.rejects(callTool("evavo_hmf_production_generate", {}), /Unknown or prohibited/);
  const listed = await handleRequest({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  assert.deepEqual(listed.result.tools.map((tool) => tool.name), EXPECTED_TOOLS);
  const initialized = await handleRequest({ jsonrpc: "2.0", id: 2, method: "initialize", params: {} });
  assert.equal(initialized.result.serverInfo.name, "evavo-heavy-metal-fighting-production");
  assert.equal(initialized.result.serverInfo.version, "1.6.0");
  assert.match(initialized.result.instructions, /does not generate images/i);
  assert.match(initialized.result.instructions, /style-proof controller/i);
  assert.match(initialized.result.instructions, /atlas-v3 layout/i);
  assert.match(initialized.result.instructions, /44-move body choreography/i);
  assert.match(initialized.result.instructions, /provider execution envelopes/i);
  assert.match(initialized.result.instructions, /provider submission manifests/i);
  assert.match(initialized.result.instructions, /separate explicit write-enabled runtime call/i);
  assert.match(initialized.result.instructions, /does not.*enqueue runtime jobs/i);
  assert.match(initialized.result.instructions, /does not.*execute providers/i);
});
