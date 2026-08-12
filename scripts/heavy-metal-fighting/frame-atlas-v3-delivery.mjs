import { createHash } from "node:crypto";
import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { secureFile, sha256File, validateTimestamp } from "../project-art/atlas-contract.mjs";
import { buildHmfProductionBatchRegistry } from "./batch-registry.mjs";
import { loadHmfArtProductionWorkspace } from "./art-production-workspace.mjs";
import { heavyMetalFightingStyleProofExecutionStatus } from "./style-proof-plan.mjs";
import {
  buildHmfProductionWorkOrderBatch,
  heavyMetalFightingProductionBatchResumePlan,
} from "./work-orders.mjs";

export const HMF_FRAME_ATLAS_V3_DELIVERY_CONTRACT_SCHEMA = "evavo.heavy-metal-fighting-frame-atlas-v3-delivery-contract.v1";
export const HMF_FRAME_ATLAS_V3_LAYOUT_SCHEMA = "evavo.heavy-metal-fighting-frame-atlas-v3-layout.v1";
export const HMF_FRAME_ATLAS_V3_PLAN_SCHEMA = "evavo.heavy-metal-fighting-frame-atlas-v3-plan.v1";
export const HMF_FRAME_ATLAS_V3_PROTOCOL_VERSION = "2026-08-12.1";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const CONTRACT_PATH = path.join(ROOT, "config", "heavy-metal-fighting", "frame-atlas-v3-delivery-contract.v1.json");

function fail(message) {
  throw new Error(`HEAVY_METAL_FIGHTING_FRAME_ATLAS_V3_INVALID: ${message}`);
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
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortObject(value[key])]));
  }
  return value;
}
function canonicalJson(value) {
  return `${JSON.stringify(sortObject(value), null, 2)}\n`;
}
function sha256Value(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}
function safeFrameId(value, contract) {
  const frameId = String(value ?? "").trim().toLowerCase();
  assert(contract.frames.includes(frameId), `frameId must be one of ${contract.frames.join(", ")}.`);
  return frameId;
}
async function readStableJson(filePath, label) {
  const before = await lstat(filePath);
  assert(before.isFile() && !before.isSymbolicLink(), `${label} must be a regular non-symlink file.`);
  const bytes = await readFile(filePath);
  const after = await lstat(filePath);
  assert(before.dev === after.dev && before.ino === after.ino && before.size === after.size && before.mtimeMs === after.mtimeMs, `${label} changed while being read.`);
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    fail(`${label} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}
function validateContract(contract, workspace) {
  const census = workspace.census.productionMasterV3;
  assert(contract?.schema === HMF_FRAME_ATLAS_V3_DELIVERY_CONTRACT_SCHEMA, "delivery contract schema drifted.");
  assert(contract.protocolVersion === HMF_FRAME_ATLAS_V3_PROTOCOL_VERSION, "delivery contract protocol drifted.");
  assert(contract.projectId === "heavy-metal-fighting", "delivery contract project id drifted.");
  assert(JSON.stringify(contract.frames) === JSON.stringify(workspace.layout.subjects.frames), "delivery contract Frame roster drifted from the governed workspace.");
  assert(contract.productionMaster?.contractId === "production_master_v3", "delivery contract id drifted.");
  assert(contract.productionMaster?.cell?.width === census.cell.width && contract.productionMaster.cell.height === census.cell.height, "delivery cell size drifted from the production census.");
  assert(contract.productionMaster?.pivot?.x === census.pivot.x && contract.productionMaster.pivot.y === census.pivot.y, "delivery pivot drifted from the production census.");
  assert(contract.productionMaster?.slotsPerFrame === census.slotsPerFrame, "delivery slot count drifted from the production census.");
  assert(contract.productionMaster?.authoredSlotsPerFrame === census.usedBodySlotsPerFrame, "delivery authored slot count drifted from the production census.");
  assert(contract.productionMaster?.columns === 16 && contract.productionMaster?.rows === 16, "delivery grid must remain 16x16.");
  assert(contract.productionMaster?.atlas?.width === 2560 && contract.productionMaster?.atlas?.height === 2560, "delivery atlas must remain 2560x2560.");
  assert(contract.productionMaster?.reservedSlots?.start === 224 && contract.productionMaster.reservedSlots.end === 255 && contract.productionMaster.reservedSlots.count === 32, "delivery reserved range must remain 224-255.");
  assert(contract.productionMaster?.reservedSlots?.requiredAlpha === "fully-transparent", "reserved atlas cells must remain fully transparent.");
  assert(contract.sourcePolicy?.requiresAllAuthoredSlots === true && contract.sourcePolicy?.requiresDeliveryReadyReceiptChains === true && contract.sourcePolicy?.requiresCompleteStyleProof === true, "delivery evidence gates drifted.");
  for (const forbidden of ["slotReordering", "trimming", "rotation", "extrusion", "padding", "scaling"]) {
    assert(contract.sourcePolicy?.[forbidden] === false, `delivery sourcePolicy.${forbidden} must remain false.`);
  }
  assert(contract.gameTarget?.repository === "EVAVO-STUDIO/steel-dominion", "delivery target repository drifted.");
  assert(contract.gameTarget?.root === "res://assets/fighters/final-v3", "delivery target root drifted.");
  assert(contract.gameTarget?.contractId === "production_master_v3", "delivery game contract id drifted.");
  assert(contract.gameTarget?.activationRequiresFocusedGodotValidation === true && contract.gameTarget?.activationRequiresRuntimeCutover === true, "game activation gates drifted.");
  assert(contract.gameTarget?.artStudioMayWriteTargetRepository === false, "Art Studio may not gain target-repository write authority through this contract.");
  assert(contract.authority?.workspaceExportWrite === true && contract.authority?.targetRepositoryMutation === false && contract.authority?.gitMutation === false && contract.authority?.publication === false, "delivery authority boundary drifted.");
  return freeze(contract);
}
async function loadContractAndAuthorities() {
  const [rawContract, workspace, registry] = await Promise.all([
    readStableJson(CONTRACT_PATH, "HMF Frame atlas-v3 delivery contract"),
    loadHmfArtProductionWorkspace(),
    buildHmfProductionBatchRegistry(),
  ]);
  return freeze({ contract: validateContract(rawContract, workspace), workspace, registry });
}
function bodyBatchesForFrame(registry, frameId) {
  return registry.batches
    .filter((batch) => batch.familyId === "frame-animation" && batch.subjectId === frameId)
    .sort((left, right) => left.sequence - right.sequence);
}

export async function buildHmfFrameAtlasV3Layout(frameIdInput) {
  const loaded = await loadContractAndAuthorities();
  const frameId = safeFrameId(frameIdInput, loaded.contract);
  const batches = bodyBatchesForFrame(loaded.registry, frameId);
  assert(batches.length === 26, `${frameId} must resolve exactly 26 governed body-animation batches; found ${batches.length}.`);
  const units = batches.flatMap((batch) => batch.units.map((unit) => ({ batch, unit })));
  assert(units.length === 224, `${frameId} must resolve exactly 224 authored body units; found ${units.length}.`);
  const seenSlots = new Set();
  const slots = units.map(({ batch, unit }) => {
    assert(unit.kind === "frame-body-cel" && unit.subjectId === frameId, `${unit.id} is not a ${frameId} body cel.`);
    assert(Number.isInteger(unit.bodySlot) && unit.bodySlot >= 0 && unit.bodySlot < 224, `${unit.id} has invalid body slot ${unit.bodySlot}.`);
    assert(!seenSlots.has(unit.bodySlot), `${frameId} body slot ${unit.bodySlot} is duplicated.`);
    seenSlots.add(unit.bodySlot);
    assert(unit.nativeDimensions?.width === 160 && unit.nativeDimensions?.height === 160, `${unit.id} lost 160x160 native dimensions.`);
    assert(unit.pivot?.x === 80 && unit.pivot?.y === 152, `${unit.id} lost pivot 80,152.`);
    assert(unit.masterOutputPath === `masters/frames/${frameId}/sprites/${path.posix.basename(unit.masterOutputPath)}`, `${unit.id} master path escaped the canonical Frame master root.`);
    return freeze({
      slot: unit.bodySlot,
      row: Math.floor(unit.bodySlot / 16),
      column: unit.bodySlot % 16,
      x: (unit.bodySlot % 16) * 160,
      y: Math.floor(unit.bodySlot / 16) * 160,
      width: 160,
      height: 160,
      bankId: unit.bodyBankId,
      productionGroup: unit.productionGroup,
      unitId: unit.id,
      batchId: batch.id,
      masterRelativePath: unit.masterOutputPath,
    });
  }).sort((left, right) => left.slot - right.slot);
  assert(slots.every((slot, index) => slot.slot === index), `${frameId} authored slots must cover 0-223 exactly once.`);
  const withoutHash = {
    schema: HMF_FRAME_ATLAS_V3_LAYOUT_SCHEMA,
    protocolVersion: HMF_FRAME_ATLAS_V3_PROTOCOL_VERSION,
    projectId: loaded.registry.projectId,
    publicTitle: loaded.registry.publicTitle,
    frameId,
    registrySha256: loaded.registry.registrySha256,
    deliveryContractSha256: sha256Value(loaded.contract),
    productionMaster: loaded.contract.productionMaster,
    bodyBatchIds: batches.map((batch) => batch.id),
    slots,
    reservedSlots: Array.from({ length: 32 }, (_, index) => 224 + index),
    gameTargetPath: loaded.contract.gameTarget.imagePathTemplate.replace("{frame}", frameId),
    authority: loaded.contract.authority,
  };
  return freeze({ ...withoutHash, layoutSha256: sha256Value(withoutHash) });
}

async function validatedWorkspaceRoot(workspaceRoot) {
  const root = path.resolve(String(workspaceRoot ?? ""));
  assert(root && root !== path.parse(root).root, "workspaceRoot must be a specific persistent Artist Workspace root.");
  const info = await lstat(root).catch(() => null);
  assert(info?.isDirectory() && !info.isSymbolicLink(), `workspaceRoot must be an existing non-symlink directory: ${root}`);
  return realpath(root);
}

export async function compileHmfFrameAtlasV3DeliveryPlan({
  frameId,
  workspaceRoot,
  frameReceipts = [],
  styleProofApprovalRecords = [],
  styleProofReceipts = [],
  compiledAt = new Date().toISOString(),
} = {}) {
  assert(Array.isArray(frameReceipts), "frameReceipts must be an array.");
  assert(Array.isArray(styleProofApprovalRecords), "styleProofApprovalRecords must be an array.");
  assert(Array.isArray(styleProofReceipts), "styleProofReceipts must be an array.");
  const [layout, loaded, styleProofStatus, workspaceReal] = await Promise.all([
    buildHmfFrameAtlasV3Layout(frameId),
    loadContractAndAuthorities(),
    heavyMetalFightingStyleProofExecutionStatus({ approvalRecords: styleProofApprovalRecords, receipts: styleProofReceipts }),
    validatedWorkspaceRoot(workspaceRoot),
  ]);
  assert(styleProofStatus.status === "complete" && styleProofStatus.activePhaseId === null, `style proof must be complete before final Frame atlas assembly; current status ${styleProofStatus.status}.`);

  const batchEvidence = [];
  const workOrderMap = new Map();
  for (const batchId of layout.bodyBatchIds) {
    const receipts = frameReceipts.filter((receipt) => receipt.batchId === batchId);
    const [resume, bundle] = await Promise.all([
      heavyMetalFightingProductionBatchResumePlan(batchId, receipts),
      buildHmfProductionWorkOrderBatch(batchId),
    ]);
    assert(resume.status === "delivery-ready" && resume.completedUnits === resume.totalUnits, `${batchId} is not delivery-ready.`);
    batchEvidence.push(freeze({
      batchId,
      workOrderBatchSha256: bundle.workOrderBatchSha256,
      completedUnits: resume.completedUnits,
      headReceiptSha256: resume.unitStates.map((state) => state.headReceiptSha256),
    }));
    for (const order of bundle.workOrders) workOrderMap.set(order.unitId, order);
  }
  assert(workOrderMap.size === 224, `expected 224 work orders for ${layout.frameId}; found ${workOrderMap.size}.`);

  const sources = [];
  const allowedMasterRoot = await realpath(path.join(workspaceReal, "masters", "frames", layout.frameId, "sprites")).catch(() => null);
  assert(allowedMasterRoot, `canonical master directory does not exist for ${layout.frameId}.`);
  for (const slot of layout.slots) {
    const order = workOrderMap.get(slot.unitId);
    assert(order, `missing work order for ${slot.unitId}.`);
    assert(order.assetContract.masterOutputPath === slot.masterRelativePath, `${slot.unitId} layout/master work-order path drifted.`);
    const absoluteSource = path.resolve(workspaceReal, ...slot.masterRelativePath.split("/"));
    const verified = await secureFile(absoluteSource, [allowedMasterRoot], `${slot.unitId}.master`);
    sources.push(freeze({
      slot: slot.slot,
      row: slot.row,
      column: slot.column,
      x: slot.x,
      y: slot.y,
      width: slot.width,
      height: slot.height,
      bankId: slot.bankId,
      productionGroup: slot.productionGroup,
      unitId: slot.unitId,
      batchId: slot.batchId,
      workOrderSha256: order.workOrderSha256,
      masterRelativePath: slot.masterRelativePath,
      sourcePath: verified.resolved,
      sourceBytes: verified.size,
      sourceSha256: await sha256File(verified.resolved),
    }));
  }

  const finalApproval = styleProofStatus.approvals.find((approval) => approval.id === "style-proof-approved");
  assert(finalApproval, "complete style proof is missing final style-proof-approved evidence.");
  const withoutHash = {
    schema: HMF_FRAME_ATLAS_V3_PLAN_SCHEMA,
    protocolVersion: HMF_FRAME_ATLAS_V3_PROTOCOL_VERSION,
    projectId: loaded.registry.projectId,
    publicTitle: loaded.registry.publicTitle,
    frameId: layout.frameId,
    compiledAt: validateTimestamp(compiledAt, "compiledAt"),
    registrySha256: layout.registrySha256,
    layoutSha256: layout.layoutSha256,
    deliveryContractSha256: layout.deliveryContractSha256,
    styleProofExecutionSha256: styleProofStatus.styleProofExecutionSha256,
    styleProofApproval: finalApproval,
    workspaceRoot: workspaceReal,
    allowedSourceRoot: allowedMasterRoot,
    productionMaster: loaded.contract.productionMaster,
    sources: freeze(sources),
    reservedSlots: layout.reservedSlots,
    batchEvidence: freeze(batchEvidence),
    outputs: freeze({
      image: loaded.contract.exportPolicy.imageNameTemplate.replace("{frame}", layout.frameId),
      manifest: loaded.contract.exportPolicy.manifestNameTemplate.replace("{frame}", layout.frameId),
      receipt: loaded.contract.exportPolicy.receiptNameTemplate.replace("{frame}", layout.frameId),
      recommendedWorkspaceParent: loaded.contract.exportPolicy.workspaceRootTemplate.replace("{frame}", layout.frameId),
    }),
    gameTarget: freeze({
      repository: loaded.contract.gameTarget.repository,
      technicalId: loaded.contract.gameTarget.technicalId,
      contractId: loaded.contract.gameTarget.contractId,
      imagePath: layout.gameTargetPath,
      activationReady: false,
      activationBlockers: freeze(["focused-godot-atlas-v3-validation", "runtime-cutover-validation", "explicit-game-repository-delivery-authorization"]),
    }),
    authority: loaded.contract.authority,
    createOnlyOutput: loaded.contract.exportPolicy.createOnlyDeliveryDirectory,
    atomicWorkspacePublication: loaded.contract.exportPolicy.atomicPublicationInsideWorkspace,
  };
  return freeze({ ...withoutHash, planSha256: sha256Value(withoutHash) });
}

export async function compileHmfFrameAtlasV3DeliveryPlanFile(input, outputPath) {
  const plan = await compileHmfFrameAtlasV3DeliveryPlan(input);
  await writeFile(path.resolve(outputPath), `${JSON.stringify(plan, null, 2)}\n`, { flag: "wx" });
  return plan;
}

export async function verifyHmfFrameAtlasV3Delivery() {
  const loaded = await loadContractAndAuthorities();
  const layouts = await Promise.all(loaded.contract.frames.map((frameId) => buildHmfFrameAtlasV3Layout(frameId)));
  const checks = [
    ["four-frames", layouts.length === 4],
    ["224-authored-per-frame", layouts.every((layout) => layout.slots.length === 224)],
    ["256-total-per-frame", layouts.every((layout) => layout.productionMaster.slotsPerFrame === 256)],
    ["32-reserved-per-frame", layouts.every((layout) => layout.reservedSlots.length === 32 && layout.reservedSlots[0] === 224 && layout.reservedSlots.at(-1) === 255)],
    ["160-native", layouts.every((layout) => layout.productionMaster.cell.width === 160 && layout.productionMaster.cell.height === 160)],
    ["2560-atlas", layouts.every((layout) => layout.productionMaster.atlas.width === 2560 && layout.productionMaster.atlas.height === 2560)],
    ["pivot", layouts.every((layout) => layout.productionMaster.pivot.x === 80 && layout.productionMaster.pivot.y === 152)],
    ["26-body-batches", layouts.every((layout) => layout.bodyBatchIds.length === 26)],
    ["contiguous-slots", layouts.every((layout) => layout.slots.every((slot, index) => slot.slot === index))],
    ["final-v3-target", layouts.every((layout) => layout.gameTargetPath === `res://assets/fighters/final-v3/${layout.frameId}.png`)],
    ["no-target-write", loaded.contract.authority.targetRepositoryMutation === false && loaded.contract.gameTarget.artStudioMayWriteTargetRepository === false],
    ["human-and-style-proof-gated", loaded.contract.authority.namedHumanApprovalRequired === true && loaded.contract.sourcePolicy.requiresCompleteStyleProof === true && loaded.contract.sourcePolicy.requiresDeliveryReadyReceiptChains === true],
  ].map(([id, passed]) => freeze({ id, passed }));
  return freeze({
    schema: "evavo.heavy-metal-fighting-frame-atlas-v3-verification.v1",
    status: checks.every((check) => check.passed) ? "passed" : "failed",
    deliveryContractSha256: sha256Value(loaded.contract),
    layouts: freeze(layouts.map((layout) => freeze({ frameId: layout.frameId, layoutSha256: layout.layoutSha256, bodyBatchCount: layout.bodyBatchIds.length, authoredSlots: layout.slots.length, gameTargetPath: layout.gameTargetPath }))),
    checks,
    failed: checks.filter((check) => !check.passed),
    authority: loaded.contract.authority,
  });
}
