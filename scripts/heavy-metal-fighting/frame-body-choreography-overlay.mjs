import { createHash } from "node:crypto";

import { buildHmfFrameAtlasV3Layout } from "./frame-atlas-v3-delivery.mjs";
import { buildHmfFrameMoveBodyChoreography } from "./frame-move-body-choreography.mjs";
import {
  buildHmfProductionWorkOrderBatch,
  heavyMetalFightingProductionWorkOrder,
} from "./work-orders.mjs";

export const HMF_BODY_CHOREOGRAPHY_OVERLAY_SCHEMA = "evavo.heavy-metal-fighting-body-choreography-overlay.v1";
export const HMF_BODY_CHOREOGRAPHY_OVERLAY_BATCH_SCHEMA = "evavo.heavy-metal-fighting-body-choreography-overlay-batch.v1";
export const HMF_BODY_CHOREOGRAPHY_OVERLAY_PROTOCOL_VERSION = "2026-08-12.1";

function fail(message) {
  throw new Error(`HEAVY_METAL_FIGHTING_BODY_CHOREOGRAPHY_OVERLAY_INVALID: ${message}`);
}
function assert(condition, message) {
  if (!condition) fail(message);
}
function freeze(value) {
  if (Array.isArray(value)) value.forEach(freeze);
  else if (value && typeof value === "object") Object.values(value).forEach(freeze);
  return Object.freeze(value);
}
function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortObject(value[key])]));
  return value;
}
function sha256(value) {
  return createHash("sha256").update(`${JSON.stringify(sortObject(value), null, 2)}\n`).digest("hex");
}
function moveBindingForBank(moveView, bankId) {
  let actorRole = "primary-body";
  let move = moveView.moves.find((candidate) => candidate.productionBodyBank === bankId) ?? null;
  if (!move && bankId === "throw-receiver") {
    move = moveView.moves.find((candidate) => candidate.category === "throw") ?? null;
    actorRole = "receiver-body";
  } else if (!move && bankId === "throw-break") {
    move = moveView.moves.find((candidate) => candidate.category === "throw") ?? null;
    actorRole = "break-body";
  } else if (!move && bankId === "grab-whiff") {
    move = moveView.moves.find((candidate) => candidate.category === "throw") ?? null;
    actorRole = "grab-whiff-body";
  } else if (move?.category === "throw") {
    actorRole = "attacker-body";
  }
  if (!move) return null;
  return freeze({
    moveId: move.moveId,
    publicName: move.publicName,
    category: move.category,
    actorRole,
    inputNotation: move.inputNotation,
    implementationStatus: move.implementationStatus,
    runtimeImplemented: move.runtimeImplemented,
    compatibilityPlannedProductionBank: move.compatibilityPlannedProductionBank,
    productionBodyBank: bankId,
    gameplayTimingReference: move.gameTimingReference,
    choreography: move.choreography,
    bodyNotes: move.bodyNotes,
    separateEffects: move.separateEffects,
    productionGates: move.productionGates,
  });
}
function promptAppendix(order, slot, layout, moveBinding) {
  const role = slot.bodyRole;
  const motion = layout.frameMotionRealization;
  const parts = [
    `SUPPLEMENTAL BODY CHOREOGRAPHY OVERLAY. This overlay is bound to immutable base work order ${order.workOrderSha256}; it does not replace or mutate that work order.`,
    `EXACT BODY ROLE: production slot ${slot.slot}; bank ${slot.bankId}; semantic role ${role.semanticId}; phase ${role.phase}; hero=${role.hero}; contact-role=${role.contactRole}; hold-priority=${role.holdPriority}. Interpret contact-role as visual choreography only, never as gameplay hit timing.`,
    `FRAME PHYSICAL REALIZATION: motion identity ${motion.motionIdentity}; cadence ${motion.motionCadence}. ${motion.bodyRules.join(" ")} Recovery rule: ${motion.recoveryRule}.`,
  ];
  if (moveBinding) {
    parts.push(`NAMED MOVE CONTEXT: ${moveBinding.publicName} (${moveBinding.moveId}); role ${moveBinding.actorRole}; implementation status ${moveBinding.implementationStatus}. ${moveBinding.choreography.startupIntent ?? ""} ${moveBinding.choreography.heroContact ?? ""} ${moveBinding.choreography.activeOvershoot ?? ""} ${moveBinding.choreography.recoveryIntent ?? ""}`.trim());
    if (moveBinding.bodyNotes.length) parts.push(`MOVE BODY NOTES: ${moveBinding.bodyNotes.join(" ")}`);
    if (moveBinding.productionGates.length) parts.push(`PRODUCTION GATES: ${moveBinding.productionGates.join("; ")}. These gates are planning facts, not permission to implement or promote the move.`);
  }
  parts.push(`FX SEPARATION: ${motion.fxSeparation}${moveBinding?.separateEffects?.length ? ` Named-move effects remain separate: ${moveBinding.separateEffects.join("; ")}.` : ""}`);
  parts.push("ART SEMANTICS ONLY. Do not alter gameplay startup/active/recovery timing, hitboxes, hurtboxes, damage, inputs, CORE cost, cancel rules, runtime implementation state, or any other game authority from this overlay.");
  parts.push("BODY ONLY. Preserve the approved mechanical identity and exact one-image work-unit boundary. Do not merge FX, labels, contact sheets, extra variants or additional frames into this output.");
  return parts.join("\n\n");
}
function compileOverlay(order, layout, moveView) {
  assert(order.assetContract?.kind === "frame-body-cel", `${order.unitId} is not a Frame body-cel work order.`);
  const frameId = String(order.subjectContract?.id ?? "");
  assert(frameId === layout.frameId && frameId === moveView.frameId, `${order.unitId} Frame identity disagrees across production authorities.`);
  const slot = layout.slots.find((candidate) => candidate.unitId === order.unitId);
  assert(slot, `${order.unitId} has no deterministic atlas-v3 slot binding.`);
  assert(slot.bodyRole && typeof slot.bodyRole.semanticId === "string", `${order.unitId} has no body-role semantic binding.`);
  const moveBinding = moveBindingForBank(moveView, slot.bankId);
  const body = {
    schema: HMF_BODY_CHOREOGRAPHY_OVERLAY_SCHEMA,
    protocolVersion: HMF_BODY_CHOREOGRAPHY_OVERLAY_PROTOCOL_VERSION,
    projectId: order.projectId,
    publicTitle: order.publicTitle,
    unitId: order.unitId,
    batchId: order.batchId,
    baseWorkOrderSha256: order.workOrderSha256,
    registrySha256: order.registrySha256,
    frameId,
    bodySlot: slot.slot,
    productionGroup: slot.productionGroup,
    bodyBankId: slot.bankId,
    bodyRole: slot.bodyRole,
    roleGrammarSha256: layout.roleGrammarSha256,
    roleMapSha256: layout.roleMapSha256,
    combatPresentationContractSha256: moveView.combatPresentationContractSha256,
    frameMotionRealization: layout.frameMotionRealization,
    moveBinding,
    continuityReferences: freeze({
      previousCel: order.referenceBindings?.previousCel ?? null,
      nextCel: order.referenceBindings?.nextCel ?? null,
    }),
    supplementalProviderPrompt: promptAppendix(order, slot, layout, moveBinding),
    authority: freeze({
      supplementalPromptUse: true,
      baseWorkOrderMutation: false,
      receiptChainMutation: false,
      simulationTiming: false,
      hitboxesDamageAndInputs: false,
      runtimeImplementationStatus: false,
      providerExecution: false,
      automaticApproval: false,
      automaticPromotion: false,
      targetRepositoryMutation: false,
      gitMutation: false,
      publication: false,
    }),
  };
  return freeze({ ...body, overlaySha256: sha256(body) });
}

export async function heavyMetalFightingBodyChoreographyOverlay(unitIdInput) {
  const unitId = String(unitIdInput ?? "").trim();
  assert(unitId, "unitId is required.");
  const order = await heavyMetalFightingProductionWorkOrder(unitId);
  assert(order.assetContract?.kind === "frame-body-cel", `${unitId} is not eligible for a body choreography overlay.`);
  const frameId = String(order.subjectContract?.id ?? "");
  const [layout, moveView] = await Promise.all([
    buildHmfFrameAtlasV3Layout(frameId),
    buildHmfFrameMoveBodyChoreography(frameId),
  ]);
  return compileOverlay(order, layout, moveView);
}

export async function buildHmfBodyChoreographyOverlayBatch(identifier) {
  const bundle = await buildHmfProductionWorkOrderBatch(identifier);
  assert(bundle.familyId === "frame-animation", `${bundle.batchId} is ${bundle.familyId}; body choreography overlays apply only to frame-animation batches.`);
  assert(bundle.workOrders.length >= 1 && bundle.workOrders.length <= 10, `${bundle.batchId} work-order cardinality is outside the governed batch limit.`);
  const frameIds = [...new Set(bundle.workOrders.map((order) => String(order.subjectContract?.id ?? "")))];
  assert(frameIds.length === 1 && frameIds[0], `${bundle.batchId} must contain exactly one Frame identity.`);
  const [layout, moveView] = await Promise.all([
    buildHmfFrameAtlasV3Layout(frameIds[0]),
    buildHmfFrameMoveBodyChoreography(frameIds[0]),
  ]);
  const overlays = freeze(bundle.workOrders.map((order) => compileOverlay(order, layout, moveView)));
  const body = {
    schema: HMF_BODY_CHOREOGRAPHY_OVERLAY_BATCH_SCHEMA,
    protocolVersion: HMF_BODY_CHOREOGRAPHY_OVERLAY_PROTOCOL_VERSION,
    projectId: bundle.projectId,
    publicTitle: overlays[0].publicTitle,
    batchId: bundle.batchId,
    frameId: frameIds[0],
    workOrderBatchSha256: bundle.workOrderBatchSha256,
    overlayCount: overlays.length,
    overlays,
    authority: freeze({
      supplementalPromptUse: true,
      baseWorkOrderMutation: false,
      receiptChainMutation: false,
      providerExecution: false,
      automaticApproval: false,
      automaticPromotion: false,
      targetRepositoryMutation: false,
      gitMutation: false,
      publication: false,
    }),
  };
  return freeze({ ...body, overlayBatchSha256: sha256(body) });
}

export async function verifyHmfBodyChoreographyOverlays() {
  const sampleUnits = freeze([
    "hmf.frame-animation.bastion.slot-000",
    "hmf.frame-animation.bastion.slot-121",
    "hmf.frame-animation.bastion.slot-155",
    "hmf.frame-animation.bastion.slot-165",
    "hmf.frame-animation.bastion.slot-174",
    "hmf.frame-animation.bastion.slot-184",
    "hmf.frame-animation.bastion.slot-192",
    "hmf.frame-animation.bastion.slot-212",
    "hmf.frame-animation.bastion.slot-223",
    "hmf.frame-animation.mirage.slot-184",
  ]);
  const overlays = await Promise.all(sampleUnits.map((unitId) => heavyMetalFightingBodyChoreographyOverlay(unitId)));
  const heavy = overlays.find((overlay) => overlay.bodySlot === 121 && overlay.frameId === "bastion");
  const overdrive = overlays.find((overlay) => overlay.bodySlot === 184 && overlay.frameId === "bastion");
  const systemDown = overlays.find((overlay) => overlay.bodySlot === 192);
  const victory = overlays.find((overlay) => overlay.bodySlot === 212);
  const defeat = overlays.find((overlay) => overlay.bodySlot === 223);
  const idle = overlays.find((overlay) => overlay.bodySlot === 0);
  const batch = await buildHmfBodyChoreographyOverlayBatch(overlays[0].batchId);
  const check = (id, passed) => freeze({ id, passed });
  const checks = freeze([
    check("sample-overlay-count", overlays.length === sampleUnits.length),
    check("hash-bound-base-orders", overlays.every((overlay) => /^[0-9a-f]{64}$/u.test(overlay.baseWorkOrderSha256) && /^[0-9a-f]{64}$/u.test(overlay.overlaySha256))),
    check("standing-heavy-role", heavy?.bodyRole.semanticId === "standing-heavy:hero-impact" && heavy.moveBinding?.publicName === "GRAVEBELL"),
    check("overdrive-role", overdrive?.bodyRole.semanticId === "overdrive:super-primary-impact" && overdrive.moveBinding?.publicName === "KILN VERDICT"),
    check("system-state-no-move", systemDown?.bodyRole.semanticId === "system-down:core-zero-warning" && systemDown.moveBinding === null),
    check("victory-no-move", victory?.bodyRole.semanticId === "victory:victory-recognition" && victory.moveBinding === null),
    check("defeat-no-move", defeat?.bodyRole.semanticId === "defeat:defeat-loop-bridge" && defeat.moveBinding === null),
    check("idle-no-move", idle?.moveBinding === null),
    check("mirage-motion", overlays.find((overlay) => overlay.frameId === "mirage")?.frameMotionRealization.motionIdentity === "phase-drift"),
    check("governed-batch", batch.overlayCount === batch.overlays.length && batch.overlayCount >= 1 && batch.overlayCount <= 10),
    check("batch-hash-binding", batch.workOrderBatchSha256 && batch.overlays.every((overlay) => overlay.batchId === batch.batchId)),
    check("supplemental-only", overlays.every((overlay) => overlay.authority.supplementalPromptUse === true && overlay.authority.baseWorkOrderMutation === false && overlay.authority.receiptChainMutation === false)),
    check("no-game-authority", overlays.every((overlay) => overlay.authority.simulationTiming === false && overlay.authority.hitboxesDamageAndInputs === false && overlay.authority.targetRepositoryMutation === false)),
    check("one-image-reminder", overlays.every((overlay) => overlay.supplementalProviderPrompt.includes("BODY ONLY") && overlay.supplementalProviderPrompt.includes("one-image work-unit boundary"))),
  ]);
  const failed = freeze(checks.filter((entry) => !entry.passed));
  return freeze({
    schema: "evavo.heavy-metal-fighting-body-choreography-overlay-verification.v1",
    status: failed.length ? "failed" : "passed",
    sampleOverlayCount: overlays.length,
    sampleBatchId: batch.batchId,
    sampleBatchOverlayCount: batch.overlayCount,
    checks,
    failed,
  });
}
