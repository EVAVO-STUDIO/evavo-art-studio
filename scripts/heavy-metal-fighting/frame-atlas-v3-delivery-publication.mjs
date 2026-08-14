import { createHash, randomUUID } from "node:crypto";
import { link, lstat, open, readFile, realpath, unlink } from "node:fs/promises";
import path from "node:path";

import {
  assertExactHmfFrameAtlasV3Keys,
  freezeHmfFrameAtlasV3Value,
  snapshotHmfFrameAtlasV3Json,
} from "./frame-atlas-v3-delivery-admission.mjs";

export const HMF_FRAME_ATLAS_V3_PLAN_PUBLICATION_SCHEMA =
  "evavo.heavy-metal-fighting-frame-atlas-v3-plan-publication.v1";
export const HMF_FRAME_ATLAS_V3_PLAN_SCHEMA =
  "evavo.heavy-metal-fighting-frame-atlas-v3-plan.v1";
export const HMF_FRAME_ATLAS_V3_PROTOCOL_VERSION = "2026-08-12.1";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const PLAN_FIELDS = Object.freeze([
  "schema",
  "protocolVersion",
  "projectId",
  "publicTitle",
  "frameId",
  "compiledAt",
  "registrySha256",
  "layoutSha256",
  "deliveryContractSha256",
  "styleProofExecutionSha256",
  "styleProofApproval",
  "workspaceRoot",
  "allowedSourceRoot",
  "productionMaster",
  "sources",
  "reservedSlots",
  "batchEvidence",
  "outputs",
  "gameTarget",
  "authority",
  "createOnlyOutput",
  "atomicWorkspacePublication",
  "planSha256",
]);
const AUTHORITY_FIELDS = Object.freeze([
  "sourceRead",
  "workspaceExportWrite",
  "sourceMutation",
  "candidateApproval",
  "candidatePromotion",
  "targetRepositoryMutation",
  "gitMutation",
  "deployment",
  "publication",
  "forcePush",
  "namedHumanApprovalRequired",
]);
const SOURCE_FIELDS = Object.freeze([
  "slot",
  "row",
  "column",
  "x",
  "y",
  "width",
  "height",
  "bankId",
  "productionGroup",
  "unitId",
  "batchId",
  "workOrderSha256",
  "headReceiptSha256",
  "masterRelativePath",
  "sourcePath",
  "sourceBytes",
  "sourceSha256",
]);
const BATCH_EVIDENCE_FIELDS = Object.freeze([
  "batchId",
  "workOrderBatchSha256",
  "completedUnits",
  "unitReceiptHeads",
]);
const RECEIPT_HEAD_FIELDS = Object.freeze(["unitId", "headReceiptSha256"]);
const OUTPUT_FIELDS = Object.freeze([
  "image",
  "manifest",
  "receipt",
  "recommendedWorkspaceParent",
]);
const GAME_TARGET_FIELDS = Object.freeze([
  "repository",
  "technicalId",
  "contractId",
  "imagePath",
  "activationReady",
  "activationBlockers",
]);
const PRODUCTION_MASTER_FIELDS = Object.freeze([
  "contractId",
  "cell",
  "authoringCell",
  "pivot",
  "columns",
  "rows",
  "atlas",
  "slotsPerFrame",
  "authoredSlotsPerFrame",
  "reservedSlots",
  "canonicalFormat",
  "resampling",
  "runtimeFiltering",
]);
const SIZE_FIELDS = Object.freeze(["width", "height"]);
const PIVOT_FIELDS = Object.freeze(["x", "y"]);
const RESERVED_RANGE_FIELDS = Object.freeze(["start", "end", "count", "requiredAlpha"]);
const REQUIRED_ACTIVATION_BLOCKERS = Object.freeze([
  "focused-godot-atlas-v3-validation",
  "runtime-cutover-validation",
  "explicit-game-repository-delivery-authorization",
]);

function fail(message) {
  throw new Error(`HEAVY_METAL_FIGHTING_FRAME_ATLAS_V3_PUBLICATION_INVALID: ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
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

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

function pathIsWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function normalizedPathIdentity(value) {
  let normalized = path.resolve(value);
  if (process.platform === "win32") {
    normalized = normalized.replace(/^\\\?\\/, "").toLowerCase();
  }
  return normalized;
}

function pathsIdentifySameLocation(left, right) {
  return normalizedPathIdentity(left) === normalizedPathIdentity(right);
}

function sameIdentity(left, right) {
  return Boolean(left && right && left.dev === right.dev && left.ino === right.ino);
}

async function unlinkOwned(filePath, identity) {
  if (!identity) return;
  const current = await lstat(filePath).catch(() => null);
  if (sameIdentity(current, identity)) await unlink(filePath).catch(() => undefined);
}

async function syncDirectory(directoryPath) {
  let handle;
  try {
    handle = await open(directoryPath, "r");
    await handle.sync();
  } catch (error) {
    if (!["EINVAL", "EPERM", "EISDIR", "ENOTSUP"].includes(error?.code)) throw error;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function validateDirectoryChain(workspaceRoot, outputParent) {
  const rootResolved = path.resolve(workspaceRoot);
  assert(rootResolved !== path.parse(rootResolved).root, "plan workspaceRoot must be a specific directory.");
  const rootInfo = await lstat(rootResolved).catch(() => null);
  assert(rootInfo?.isDirectory() && !rootInfo.isSymbolicLink(), "plan workspaceRoot must be an existing non-symlink directory.");
  const rootReal = await realpath(rootResolved);
  assert(pathsIdentifySameLocation(rootReal, rootResolved), "plan workspaceRoot may not traverse symbolic directory components.");
  const parentResolved = path.resolve(outputParent);
  assert(pathIsWithin(rootReal, parentResolved), "plan output parent must remain inside the persistent Artist Workspace.");

  const relative = path.relative(rootReal, parentResolved);
  let cursor = rootReal;
  if (relative) {
    for (const segment of relative.split(path.sep)) {
      cursor = path.join(cursor, segment);
      const info = await lstat(cursor).catch(() => null);
      assert(info?.isDirectory() && !info.isSymbolicLink(), `plan output directory component must be an existing non-symlink directory: ${cursor}`);
    }
  }
  const parentReal = await realpath(parentResolved);
  assert(pathsIdentifySameLocation(parentReal, parentResolved), "plan output parent may not traverse symbolic directory components.");
  assert(pathIsWithin(rootReal, parentReal), "plan output parent escaped the persistent Artist Workspace.");
  return freezeHmfFrameAtlasV3Value({ workspaceRoot: rootReal, outputParent: parentReal });
}

function validatePlan(planInput) {
  const plan = snapshotHmfFrameAtlasV3Json(planInput, "HMF Frame atlas-v3 plan", {
    maximumBytes: 16 * 1024 * 1024,
    maximumNodes: 150_000,
  });
  assertExactHmfFrameAtlasV3Keys(plan, PLAN_FIELDS, "HMF Frame atlas-v3 plan");
  assert(plan.schema === HMF_FRAME_ATLAS_V3_PLAN_SCHEMA, "plan schema drifted.");
  assert(plan.protocolVersion === HMF_FRAME_ATLAS_V3_PROTOCOL_VERSION, "plan protocol version drifted.");
  assert(plan.projectId === "heavy-metal-fighting", "plan project id drifted.");
  assert(plan.publicTitle === "HEAVY METAL FIGHTING", "plan public title drifted.");
  assert(typeof plan.frameId === "string" && /^[a-z0-9-]+$/.test(plan.frameId), "plan frameId is invalid.");
  assert(typeof plan.compiledAt === "string" && Number.isFinite(Date.parse(plan.compiledAt)), "plan compiledAt is invalid.");
  for (const field of [
    "registrySha256",
    "layoutSha256",
    "deliveryContractSha256",
    "styleProofExecutionSha256",
  ]) {
    assert(SHA256_PATTERN.test(plan[field]), `plan ${field} is invalid.`);
  }
  assert(plan.styleProofApproval && typeof plan.styleProofApproval === "object" && !Array.isArray(plan.styleProofApproval), "plan styleProofApproval must be an object.");
  assert(plan.styleProofApproval.id === "style-proof-approved", "plan final style-proof approval drifted.");
  assert(typeof plan.workspaceRoot === "string" && plan.workspaceRoot.length > 0, "plan workspaceRoot is invalid.");
  assert(typeof plan.allowedSourceRoot === "string" && plan.allowedSourceRoot.length > 0, "plan allowedSourceRoot is invalid.");
  const expectedSourceRoot = path.resolve(plan.workspaceRoot, "masters", "frames", plan.frameId, "sprites");
  assert(pathsIdentifySameLocation(plan.allowedSourceRoot, expectedSourceRoot), "plan allowedSourceRoot drifted from the canonical Frame master root.");
  assert(pathIsWithin(path.resolve(plan.workspaceRoot), path.resolve(plan.allowedSourceRoot)), "plan allowedSourceRoot escaped the persistent Artist Workspace.");
  assert(SHA256_PATTERN.test(plan.planSha256), "plan planSha256 is invalid.");
  const { planSha256, ...body } = plan;
  assert(sha256Value(body) === planSha256, "plan self-hash does not match its complete contents.");

  assertExactHmfFrameAtlasV3Keys(plan.productionMaster, PRODUCTION_MASTER_FIELDS, "plan productionMaster");
  assertExactHmfFrameAtlasV3Keys(plan.productionMaster.cell, SIZE_FIELDS, "plan productionMaster.cell");
  assertExactHmfFrameAtlasV3Keys(plan.productionMaster.authoringCell, SIZE_FIELDS, "plan productionMaster.authoringCell");
  assertExactHmfFrameAtlasV3Keys(plan.productionMaster.pivot, PIVOT_FIELDS, "plan productionMaster.pivot");
  assertExactHmfFrameAtlasV3Keys(plan.productionMaster.atlas, SIZE_FIELDS, "plan productionMaster.atlas");
  assertExactHmfFrameAtlasV3Keys(plan.productionMaster.reservedSlots, RESERVED_RANGE_FIELDS, "plan productionMaster.reservedSlots");
  assert(plan.productionMaster.contractId === "production_master_v3", "plan production master contract drifted.");
  assert(plan.productionMaster.cell.width === 160 && plan.productionMaster.cell.height === 160, "plan production cell dimensions drifted.");
  assert(plan.productionMaster.authoringCell.width === 640 && plan.productionMaster.authoringCell.height === 640, "plan authoring cell dimensions drifted.");
  assert(plan.productionMaster.pivot.x === 80 && plan.productionMaster.pivot.y === 152, "plan production pivot drifted.");
  assert(plan.productionMaster.columns === 16 && plan.productionMaster.rows === 16, "plan production grid drifted.");
  assert(plan.productionMaster.atlas.width === 2560 && plan.productionMaster.atlas.height === 2560, "plan atlas dimensions drifted.");
  assert(plan.productionMaster.slotsPerFrame === 256 && plan.productionMaster.authoredSlotsPerFrame === 224, "plan production slot counts drifted.");
  assert(
    plan.productionMaster.reservedSlots.start === 224 &&
      plan.productionMaster.reservedSlots.end === 255 &&
      plan.productionMaster.reservedSlots.count === 32 &&
      plan.productionMaster.reservedSlots.requiredAlpha === "fully-transparent",
    "plan production reserved-slot contract drifted.",
  );
  assert(plan.productionMaster.canonicalFormat === "png", "plan production format drifted.");
  assert(plan.productionMaster.resampling === "none", "plan resampling authority drifted.");
  assert(plan.productionMaster.runtimeFiltering === "nearest-neighbour", "plan runtime filtering drifted.");

  assertExactHmfFrameAtlasV3Keys(plan.authority, AUTHORITY_FIELDS, "plan authority");
  assert(plan.authority.sourceRead === true, "plan sourceRead authority must remain true.");
  assert(plan.authority.workspaceExportWrite === true, "plan workspaceExportWrite authority must remain true.");
  assert(plan.authority.namedHumanApprovalRequired === true, "plan namedHumanApprovalRequired must remain true.");
  for (const field of [
    "sourceMutation",
    "candidateApproval",
    "candidatePromotion",
    "targetRepositoryMutation",
    "gitMutation",
    "deployment",
    "publication",
    "forcePush",
  ]) {
    assert(plan.authority[field] === false, `plan authority.${field} must remain false.`);
  }
  assert(plan.createOnlyOutput === true, "plan createOnlyOutput must remain true.");
  assert(plan.atomicWorkspacePublication === true, "plan atomicWorkspacePublication must remain true.");

  assert(Array.isArray(plan.sources) && plan.sources.length === 224, "plan must contain exactly 224 authored sources.");
  const sourceUnits = new Set();
  for (const [index, source] of plan.sources.entries()) {
    assertExactHmfFrameAtlasV3Keys(source, SOURCE_FIELDS, `plan sources[${index}]`);
    assert(source.slot === index, `plan source slot ${source.slot} must equal contiguous index ${index}.`);
    assert(source.row === Math.floor(index / 16) && source.column === index % 16, `plan source ${index} grid coordinates drifted.`);
    assert(source.x === (index % 16) * 160 && source.y === Math.floor(index / 16) * 160, `plan source ${index} pixel position drifted.`);
    assert(source.width === 160 && source.height === 160, `plan source ${index} dimensions drifted.`);
    assert(typeof source.unitId === "string" && source.unitId.length > 0, `plan source ${index} unitId is invalid.`);
    assert(typeof source.batchId === "string" && source.batchId.length > 0, `plan source ${index} batchId is invalid.`);
    assert(!sourceUnits.has(source.unitId), `plan source unit ${source.unitId} is duplicated.`);
    sourceUnits.add(source.unitId);
    const expectedRelativePath = `masters/frames/${plan.frameId}/sprites/${path.posix.basename(source.masterRelativePath)}`;
    assert(source.masterRelativePath === expectedRelativePath, `plan source ${index} masterRelativePath escaped the canonical Frame root.`);
    const expectedSourcePath = path.resolve(plan.workspaceRoot, ...source.masterRelativePath.split("/"));
    assert(pathsIdentifySameLocation(source.sourcePath, expectedSourcePath), `plan source ${index} sourcePath drifted from masterRelativePath.`);
    assert(pathIsWithin(path.resolve(plan.allowedSourceRoot), path.resolve(source.sourcePath)), `plan source ${index} escaped allowedSourceRoot.`);
    assert(SHA256_PATTERN.test(source.workOrderSha256), `plan source ${index} workOrderSha256 is invalid.`);
    assert(SHA256_PATTERN.test(source.headReceiptSha256), `plan source ${index} headReceiptSha256 is invalid.`);
    assert(SHA256_PATTERN.test(source.sourceSha256), `plan source ${index} sourceSha256 is invalid.`);
    assert(Number.isInteger(source.sourceBytes) && source.sourceBytes >= 1, `plan source ${index} sourceBytes is invalid.`);
  }

  assert(
    Array.isArray(plan.reservedSlots) &&
      plan.reservedSlots.length === 32 &&
      plan.reservedSlots.every((slot, index) => slot === 224 + index),
    "plan reserved slots must remain exactly 224-255.",
  );

  assert(Array.isArray(plan.batchEvidence) && plan.batchEvidence.length === 26, "plan must contain exactly 26 body-batch evidence records.");
  const evidenceUnits = new Set();
  const evidenceBatches = new Set();
  const evidenceByUnit = new Map();
  let evidenceCount = 0;
  for (const [batchIndex, evidence] of plan.batchEvidence.entries()) {
    assertExactHmfFrameAtlasV3Keys(evidence, BATCH_EVIDENCE_FIELDS, `plan batchEvidence[${batchIndex}]`);
    assert(typeof evidence.batchId === "string" && evidence.batchId.length > 0, `plan batchEvidence[${batchIndex}] batchId is invalid.`);
    assert(!evidenceBatches.has(evidence.batchId), `plan batch evidence ${evidence.batchId} is duplicated.`);
    evidenceBatches.add(evidence.batchId);
    assert(SHA256_PATTERN.test(evidence.workOrderBatchSha256), `plan batchEvidence[${batchIndex}] workOrderBatchSha256 is invalid.`);
    assert(Number.isInteger(evidence.completedUnits) && evidence.completedUnits >= 1, `plan batchEvidence[${batchIndex}] completedUnits is invalid.`);
    assert(Array.isArray(evidence.unitReceiptHeads) && evidence.unitReceiptHeads.length === evidence.completedUnits, `plan batchEvidence[${batchIndex}] unit receipt count drifted.`);
    for (const [headIndex, head] of evidence.unitReceiptHeads.entries()) {
      assertExactHmfFrameAtlasV3Keys(head, RECEIPT_HEAD_FIELDS, `plan batchEvidence[${batchIndex}].unitReceiptHeads[${headIndex}]`);
      assert(sourceUnits.has(head.unitId), `plan receipt head references unknown unit ${head.unitId}.`);
      assert(!evidenceUnits.has(head.unitId), `plan receipt head unit ${head.unitId} is duplicated.`);
      evidenceUnits.add(head.unitId);
      assert(SHA256_PATTERN.test(head.headReceiptSha256), `plan receipt head ${head.unitId} SHA-256 is invalid.`);
      evidenceByUnit.set(head.unitId, freezeHmfFrameAtlasV3Value({
        batchId: evidence.batchId,
        headReceiptSha256: head.headReceiptSha256,
      }));
      evidenceCount += 1;
    }
  }
  assert(evidenceCount === 224 && evidenceUnits.size === 224, "plan batch evidence must bind all 224 source units exactly once.");
  for (const source of plan.sources) {
    const binding = evidenceByUnit.get(source.unitId);
    assert(binding, `plan source ${source.unitId} has no batch-evidence binding.`);
    assert(source.batchId === binding.batchId, `plan source ${source.unitId} batchId disagrees with batch evidence.`);
    assert(source.headReceiptSha256 === binding.headReceiptSha256, `plan source ${source.unitId} receipt head disagrees with batch evidence.`);
  }

  assertExactHmfFrameAtlasV3Keys(plan.outputs, OUTPUT_FIELDS, "plan outputs");
  for (const field of OUTPUT_FIELDS) assert(typeof plan.outputs[field] === "string" && plan.outputs[field].length > 0, `plan outputs.${field} is invalid.`);
  assert(plan.outputs.image === `${plan.frameId}.png`, "plan atlas image output name drifted.");
  assert(plan.outputs.manifest === `${plan.frameId}.atlas-v3.json`, "plan atlas manifest output name drifted.");
  assert(plan.outputs.receipt === `${plan.frameId}.atlas-v3.receipt.json`, "plan atlas receipt output name drifted.");
  assert(plan.outputs.recommendedWorkspaceParent === `exports/runtime/frames/${plan.frameId}`, "plan recommended workspace parent drifted.");
  assertExactHmfFrameAtlasV3Keys(plan.gameTarget, GAME_TARGET_FIELDS, "plan gameTarget");
  assert(plan.gameTarget.repository === "EVAVO-STUDIO/steel-dominion", "plan game target repository drifted.");
  assert(plan.gameTarget.technicalId === "steel-dominion", "plan game target technical id drifted.");
  assert(plan.gameTarget.contractId === "production_master_v3", "plan game target contract drifted.");
  assert(plan.gameTarget.imagePath === `res://assets/fighters/final-v3/${plan.frameId}.png`, "plan game target image path drifted.");
  assert(plan.gameTarget.activationReady === false, "plan may not claim game activation readiness.");
  assert(
    Array.isArray(plan.gameTarget.activationBlockers) &&
      plan.gameTarget.activationBlockers.length === REQUIRED_ACTIVATION_BLOCKERS.length &&
      plan.gameTarget.activationBlockers.every((value, index) => value === REQUIRED_ACTIVATION_BLOCKERS[index]),
    "plan activation blockers drifted.",
  );

  return plan;
}

export async function publishHmfFrameAtlasV3DeliveryPlanFile(planInput, outputPathInput) {
  assert(typeof outputPathInput === "string" && outputPathInput.length > 0, "outputPath must be a non-empty string.");
  assert(outputPathInput === outputPathInput.trim(), "outputPath may not contain leading or trailing whitespace.");
  assert(!outputPathInput.includes("\0"), "outputPath may not contain NUL bytes.");
  const plan = validatePlan(planInput);
  const outputPath = path.resolve(outputPathInput);
  const basename = path.basename(outputPath);
  assert(basename.length >= 6 && basename.length <= 200 && basename.endsWith(".json"), "plan output must use a bounded .json filename.");
  assert(!/[\u0000-\u001f]/.test(basename), "plan output filename contains control characters.");
  const paths = await validateDirectoryChain(plan.workspaceRoot, path.dirname(outputPath));
  const finalPath = path.join(paths.outputParent, basename);
  assert(finalPath === outputPath, "plan output path must resolve directly beneath its validated parent.");
  assert((await lstat(finalPath).catch(() => null)) === null, "plan output destination already exists; publication is create-only.");

  const bytes = Buffer.from(`${JSON.stringify(plan, null, 2)}\n`, "utf8");
  assert(bytes.length <= 16 * 1024 * 1024, "serialized plan exceeds the publication byte limit.");
  const stagePath = path.join(paths.outputParent, `.${basename}.${process.pid}.${randomUUID()}.tmp`);
  let stageIdentity = null;
  let finalIdentity = null;
  let createdFinal = false;
  let handle = null;

  try {
    handle = await open(stagePath, "wx", 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = null;
    stageIdentity = await lstat(stagePath);
    assert(stageIdentity.isFile() && !stageIdentity.isSymbolicLink(), "staged plan must be a regular non-symlink file.");
    assert(stageIdentity.size === bytes.length, "staged plan byte count drifted.");

    await link(stagePath, finalPath);
    createdFinal = true;
    finalIdentity = await lstat(finalPath);
    assert(sameIdentity(stageIdentity, finalIdentity), "published plan did not retain the staged file identity.");
    assert(finalIdentity.nlink === 2, "published plan must have exactly two links before stage cleanup.");
    await unlink(stagePath);
    stageIdentity = null;
    await syncDirectory(paths.outputParent);

    const before = await lstat(finalPath);
    assert(before.isFile() && !before.isSymbolicLink(), "published plan must be a regular non-symlink file.");
    assert(before.nlink === 1, "published plan must have exactly one final filesystem link.");
    const observed = await readFile(finalPath);
    const after = await lstat(finalPath);
    assert(sameIdentity(before, after) && before.size === after.size && before.mtimeMs === after.mtimeMs, "published plan changed during exact readback.");
    assert(observed.equals(bytes), "published plan bytes differ from the admitted immutable plan.");

    const body = {
      schema: HMF_FRAME_ATLAS_V3_PLAN_PUBLICATION_SCHEMA,
      protocolVersion: HMF_FRAME_ATLAS_V3_PROTOCOL_VERSION,
      projectId: plan.projectId,
      frameId: plan.frameId,
      planSha256: plan.planSha256,
      outputPath: finalPath,
      bytes: observed.length,
      sha256: sha256Bytes(observed),
      createOnly: true,
      atomicNoReplace: true,
      exactPostWriteReadback: true,
      authority: freezeHmfFrameAtlasV3Value({
        workspacePlanWrite: true,
        sourceMutation: false,
        targetRepositoryMutation: false,
        gitMutation: false,
        deployment: false,
        publication: false,
        forcePush: false,
      }),
    };
    return freezeHmfFrameAtlasV3Value({
      ...body,
      publicationSha256: sha256Value(body),
    });
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await unlinkOwned(stagePath, stageIdentity);
    if (createdFinal) await unlinkOwned(finalPath, finalIdentity ?? stageIdentity);
    throw error;
  }
}

export function verifyHmfFrameAtlasV3DeliveryPlanForPublication(planInput) {
  const plan = validatePlan(planInput);
  return freezeHmfFrameAtlasV3Value({
    schema: "evavo.heavy-metal-fighting-frame-atlas-v3-plan-publication-verification.v1",
    status: "passed",
    planSha256: plan.planSha256,
    sourceCount: plan.sources.length,
    batchCount: plan.batchEvidence.length,
    reservedCount: plan.reservedSlots.length,
    targetRepositoryMutation: plan.authority.targetRepositoryMutation,
    gitMutation: plan.authority.gitMutation,
    publication: plan.authority.publication,
  });
}
