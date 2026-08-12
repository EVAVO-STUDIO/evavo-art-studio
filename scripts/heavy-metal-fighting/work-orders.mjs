import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadHmfArtProductionWorkspace } from "./art-production-workspace.mjs";
import { buildHmfProductionBatchRegistry } from "./batch-registry.mjs";
import { loadHeavyMetalFightingStudio } from "./studio-runtime.mjs";

export const HMF_WORK_ORDER_SCHEMA = "evavo.heavy-metal-fighting-work-order.v1";
export const HMF_WORK_ORDER_BATCH_SCHEMA = "evavo.heavy-metal-fighting-work-order-batch.v1";
export const HMF_PRODUCTION_RECEIPT_SCHEMA = "evavo.heavy-metal-fighting-production-receipt.v1";
export const HMF_WORK_ORDER_PROTOCOL_VERSION = "2026-08-12.1";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const POLICY_PATH = path.join(ROOT, "config", "heavy-metal-fighting", "work-order-policy.v1.json");

function fail(message) {
  throw new Error(`HEAVY_METAL_FIGHTING_WORK_ORDER_INVALID: ${message}`);
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
  const bytes = typeof value === "string" ? value : `${JSON.stringify(sortObject(value), null, 2)}\n`;
  return createHash("sha256").update(bytes).digest("hex");
}
function isSha256(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}
function safeSegment(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function pad(value, width = 3) {
  return String(value).padStart(width, "0");
}
async function readStableJson(filePath, label) {
  const before = await lstat(filePath);
  assert(before.isFile() && !before.isSymbolicLink(), `${label} must be a regular non-symlink file.`);
  const bytes = await readFile(filePath);
  const after = await lstat(filePath);
  assert(before.dev === after.dev && before.ino === after.ino && before.size === after.size && before.mtimeMs === after.mtimeMs, `${label} changed while being read.`);
  try { return JSON.parse(bytes.toString("utf8")); }
  catch (error) { fail(`${label} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`); }
}
function validatePolicy(policy, workspace) {
  assert(policy?.schema === "evavo.heavy-metal-fighting-work-order-policy.v1", "work-order policy schema drifted.");
  assert(policy.protocolVersion === HMF_WORK_ORDER_PROTOCOL_VERSION, "work-order policy protocol drifted.");
  assert(policy.projectId === workspace.layout.projectId, "work-order policy project id drifted.");
  assert(policy.candidatePolicy?.singleCandidatePerExecution === true && policy.candidatePolicy?.candidateFanout === 1, "candidate fanout must remain one-at-a-time.");
  assert(policy.candidatePolicy?.passingSiblingRegenerationForbidden === true, "passing sibling regeneration must remain forbidden.");
  assert(Number.isInteger(policy.candidatePolicy?.maximumRepairAttempts) && policy.candidatePolicy.maximumRepairAttempts >= 1, "maximum repair attempts must be a positive integer.");
  const states = policy.receiptStateMachine;
  assert(Array.isArray(states) && states.length === workspace.batchPolicy.batchStateMachine.length, "receipt state machine must match the governed batch lifecycle length.");
  assert(states.map((state) => state.id).join("|") === workspace.batchPolicy.batchStateMachine.join("|"), "receipt state machine must match the governed batch lifecycle exactly.");
  assert(states.every((state, index) => state.rank === index), "receipt state ranks must be gapless.");
  assert(states.find((state) => state.id === "generation-authorized")?.requiresHuman === true, "generation authorization must require a human actor.");
  assert(states.find((state) => state.id === "selected-or-repair-requested")?.requiresHuman === true, "selection or repair decisions must require a human actor.");
  assert(states.find((state) => state.id === "named-human-approved")?.requiresHuman === true, "named-human-approved must require a human actor.");
  assert(Array.isArray(policy.technicalFailureCodes) && new Set(policy.technicalFailureCodes).size === policy.technicalFailureCodes.length, "technical failure codes must be unique.");
  assert(policy.authority?.providerExecution === false && policy.authority?.automaticPromotion === false && policy.authority?.targetRepositoryMutation === false && policy.authority?.gitMutation === false, "work-order policy gained forbidden authority.");
  assert(policy.authority?.namedHumanApprovalRequired === true, "work-order policy must require named-human approval.");
  return freeze(policy);
}
async function loadPolicy(workspace) {
  return validatePolicy(await readStableJson(POLICY_PATH, "HMF work-order policy"), workspace);
}
function resolveBatch(registry, identifier) {
  const normalized = String(identifier ?? "").trim().toLowerCase();
  const id = /^\d+$/.test(normalized) ? `hmf-b${String(Number(normalized)).padStart(4, "0")}` : normalized;
  const batch = registry.batches.find((candidate) => candidate.id === id);
  assert(batch, `unknown batch ${identifier}; expected hmf-b0001 through hmf-b${String(registry.batches.length).padStart(4, "0")}.`);
  return batch;
}
function resolveUnit(registry, unitId) {
  for (const batch of registry.batches) {
    const unit = batch.units.find((candidate) => candidate.id === unitId);
    if (unit) return { batch, unit };
  }
  fail(`unknown production unit ${unitId}.`);
}
function deriveMasterPath(workspaceOutputPath) {
  assert(workspaceOutputPath.startsWith("working/"), `workspace output ${workspaceOutputPath} must live under working/.`);
  return `masters/${workspaceOutputPath.slice("working/".length)}`;
}
function candidatePathTemplate(policy, batch, unit) {
  const basename = path.posix.basename(unit.workspaceOutputPath).replace(/\.[^.]+$/, "");
  return `${policy.candidatePolicy.candidateRoot}/${batch.id}/${safeSegment(unit.id)}/${basename}-cand-{candidate:02}.png`;
}
function referencePaths(unit, registry, workspace) {
  const base = {
    styleNorthStar: "working/style/north-star",
    stylePalette: "working/style/palette",
    styleMaterials: "working/style/materials",
    styleLighting: "working/style/lighting",
    pixelGrammar: "working/style/pixel-grammar",
    antiGeneric: "working/style/anti-generic",
  };
  if (unit.subjectId && workspace.layout.subjects.frames.includes(unit.subjectId)) {
    base.frameConstruction = `working/frames/${unit.subjectId}/construction`;
    base.frameLandmarks = `working/frames/${unit.subjectId}/landmarks`;
    base.frameHardpoints = `working/frames/${unit.subjectId}/hardpoints`;
    base.framePalette = `working/frames/${unit.subjectId}/palette`;
  }
  if (unit.subjectId && workspace.layout.subjects.pilots.includes(unit.subjectId)) {
    base.pilotIdentity = `working/pilots/${unit.subjectId}/identity`;
  }
  if (unit.subjectId && workspace.layout.subjects.arenas.includes(unit.subjectId)) {
    base.arenaWorkingRoot = `working/arenas/${unit.subjectId}`;
  }
  if (unit.kind === "frame-body-cel") {
    const bank = workspace.census.bodyCelBanks.find((candidate) => unit.bodySlot >= candidate.start && unit.bodySlot <= candidate.end);
    assert(bank, `${unit.id} has no production body bank.`);
    const previousId = unit.bodySlot > bank.start ? `hmf.frame-animation.${unit.subjectId}.slot-${pad(unit.bodySlot - 1)}` : null;
    const nextId = unit.bodySlot < bank.end ? `hmf.frame-animation.${unit.subjectId}.slot-${pad(unit.bodySlot + 1)}` : null;
    if (previousId) base.previousCel = resolveUnit(registry, previousId).unit.workspaceOutputPath;
    if (nextId) base.nextCel = resolveUnit(registry, nextId).unit.workspaceOutputPath;
  }
  return freeze(base);
}
function subjectContract(unit, studio) {
  if (unit.subjectId) {
    const mech = studio.mechanicalContract.frames.find((candidate) => candidate.id === unit.subjectId);
    if (mech) return freeze({
      type: "frame",
      id: mech.id,
      code: mech.code,
      epithet: mech.epithet,
      motionIdentity: mech.motionIdentity,
      silhouetteLocks: mech.silhouetteLocks,
      materialRamps: mech.materialRamps,
      motionRules: mech.motionRules,
      mirrorPolicy: mech.mirrorPolicy,
      forbiddenBodyEffectSubstitutions: mech.bodyEffectBoundary?.forbidden ?? [],
    });
    const pilot = studio.combatPresentationContract.pilotDesign?.pilots?.find((candidate) => candidate.id === unit.subjectId);
    if (pilot) return freeze({
      type: "pilot",
      id: pilot.id,
      name: pilot.name,
      handle: pilot.handle,
      defaultFrameId: pilot.defaultFrameId,
      identity: pilot,
    });
    if (studio.combatPresentationContract.assetAllocation?.["arena-layers"]?.arenas?.includes(unit.subjectId)) {
      return freeze({ type: "arena", id: unit.subjectId });
    }
  }
  return freeze({ type: "project", id: "heavy-metal-fighting" });
}
function sourceUnitMap(studio) {
  const game = studio.campaignPlan.games.find((candidate) => candidate.id === "heavy-metal-fighting");
  assert(game, "compiled campaign is missing heavy-metal-fighting.");
  return new Map(game.batches.flatMap((batch) => batch.units).map((unit) => [unit.id, unit]));
}
function technicalInstruction(unit) {
  const dimensions = unit.nativeDimensions ? `${unit.nativeDimensions.width}x${unit.nativeDimensions.height}` : "declared source dimensions";
  const authoring = unit.authoringCanvas ? `${unit.authoringCanvas.width}x${unit.authoringCanvas.height}` : "declared authoring canvas";
  const alpha = unit.alpha ?? "declared alpha policy";
  const pivot = unit.pivot ? ` pivot ${unit.pivot.x},${unit.pivot.y};` : "";
  return `TECHNICAL LOCK: final asset ${dimensions}; authoring canvas ${authoring}; alpha ${alpha};${pivot} preserve integer pixel placement and nearest-neighbour final mastering.`;
}
function compileProviderPrompt(unit, batch, workspace, studio, originalUnit, references, subject) {
  const parts = [
    `ORIGINAL EVAVO GAME ART FOR HEAVY METAL FIGHTING. WORK ORDER ${batch.id} / ${unit.id}.`,
    `NORTH STAR: ${workspace.style.northStar}`,
    `PRODUCTION WAVE: ${batch.productionWave}. FAMILY: ${unit.familyId}. SUBJECT: ${unit.subjectId ?? "project"}. GROUP: ${unit.productionGroup ?? batch.productionGroup}.`,
  ];
  if (subject.type === "frame") {
    parts.push(`FRAME IDENTITY: ${subject.id.toUpperCase()} ${subject.code} ${subject.epithet}; motion identity ${subject.motionIdentity}. Silhouette locks: ${subject.silhouetteLocks.join("; ")}. Material ramps: ${subject.materialRamps.join("; ")}. Motion rules: ${subject.motionRules.join("; ")}.`);
  } else if (subject.type === "pilot") {
    parts.push(`PILOT IDENTITY: ${subject.name} / ${subject.handle}; default Frame ${subject.defaultFrameId}. Preserve the exact approved face, hair mass, clothing and permanent identity landmarks from the bound identity references.`);
  } else if (subject.type === "arena") {
    parts.push(`ARENA IDENTITY: ${subject.id}. Preserve a clean horizontal fight plane, purposeful industrial infrastructure and value separation behind the fighters.`);
  }
  if (unit.kind === "frame-body-cel") {
    parts.push(`EXACT BODY CEL: slot ${unit.bodySlot}; bank ${unit.bodyBankId}; purpose: ${unit.bodyBankPurpose}. This is one physical Frame body cel only. Effects remain separate. Do not redesign hardware between cels.`);
  } else if (originalUnit?.prompt) {
    parts.push(`SOURCE INTENT: ${originalUnit.prompt}`);
  }
  const continuity = Object.entries(references).filter(([key]) => key === "previousCel" || key === "nextCel");
  if (continuity.length) parts.push(`CONTINUITY REFERENCES: ${continuity.map(([key, value]) => `${key}=${value}`).join("; ")}. Use these as continuity authority, not as permission to merge frames.`);
  parts.push(`STYLE GRAMMAR: ${workspace.style.pixelGrammar.clusterRule} ${workspace.style.pixelGrammar.materialRule} ${workspace.style.animationGrammar.principle}`);
  parts.push(technicalInstruction(unit));
  parts.push(`HARD REJECT CODES: ${workspace.style.antiGenericFailureCodes.join("; ")}.`);
  parts.push("OUTPUT EXACTLY ONE SEPARATE IMAGE FOR THIS WORK UNIT. No grid, contact sheet, storyboard, labels, multi-panel composition, provider-packed atlas, generated typography, or extra variants. Generation is candidate creation only and is never approval or promotion.");
  return parts.join("\n\n");
}
function compileWorkOrder(registry, batch, unit, ordinal, workspace, policy, studio, originals) {
  const references = referencePaths(unit, registry, workspace);
  const subject = subjectContract(unit, studio);
  const originalUnit = unit.sourceUnitId ? originals.get(unit.sourceUnitId) : null;
  const candidateTemplate = candidatePathTemplate(policy, batch, unit);
  const basename = safeSegment(unit.id);
  const masterOutputPath = unit.masterOutputPath ?? deriveMasterPath(unit.workspaceOutputPath);
  const withoutHash = {
    schema: HMF_WORK_ORDER_SCHEMA,
    protocolVersion: HMF_WORK_ORDER_PROTOCOL_VERSION,
    projectId: registry.projectId,
    publicTitle: registry.publicTitle,
    registrySha256: registry.registrySha256,
    batchId: batch.id,
    batchSequence: batch.sequence,
    workOrderOrdinal: ordinal,
    unitId: unit.id,
    familyId: unit.familyId,
    subjectId: unit.subjectId,
    productionGroup: unit.productionGroup ?? batch.productionGroup,
    productionWave: batch.productionWave,
    styleProofCritical: batch.styleProofCritical,
    dependsOnBatchIds: batch.dependsOnBatchIds,
    approvalPrerequisites: batch.approvalPrerequisites,
    authorityBindings: registry.authority,
    assetContract: freeze({
      kind: unit.kind,
      nativeDimensions: unit.nativeDimensions ?? null,
      authoringCanvas: unit.authoringCanvas ?? null,
      alpha: unit.alpha ?? null,
      pivot: unit.pivot ?? null,
      groundLineY: unit.groundLineY ?? null,
      continuityKey: unit.continuityKey ?? null,
      reviewPreset: unit.reviewPreset ?? null,
      workspaceOutputPath: unit.workspaceOutputPath,
      masterOutputPath,
      legacyTargetPath: unit.legacyTargetPath ?? null,
      runtimeDelivery: unit.runtimeDelivery ?? null,
    }),
    referenceBindings: references,
    subjectContract: subject,
    providerPrompt: compileProviderPrompt(unit, batch, workspace, studio, originalUnit, references, subject),
    executionPaths: freeze({
      candidatePathTemplate: candidateTemplate,
      reviewEvidencePath: `${policy.candidatePolicy.reviewRoot}/${batch.id}/${basename}.json`,
      versionRoot: `${policy.candidatePolicy.versionRoot}/${batch.id}/${basename}`,
      receiptPath: `${policy.candidatePolicy.receiptRoot}/${batch.id}/${basename}.json`,
      journalPath: `${policy.candidatePolicy.journalRoot}/${batch.id}.jsonl`,
    }),
    failureCodes: freeze({
      technical: policy.technicalFailureCodes,
      style: workspace.style.antiGenericFailureCodes,
    }),
    candidatePolicy: freeze({
      candidateFanout: policy.candidatePolicy.candidateFanout,
      maximumRepairAttempts: policy.candidatePolicy.maximumRepairAttempts,
      passingSiblingRegenerationForbidden: policy.candidatePolicy.passingSiblingRegenerationForbidden,
    }),
    authority: freeze({
      providerExecution: false,
      automaticGenerationAuthorization: false,
      automaticApproval: false,
      automaticPromotion: false,
      targetRepositoryMutation: false,
      gitMutation: false,
      publication: false,
      namedHumanApprovalRequired: true,
    }),
  };
  return freeze({ ...withoutHash, workOrderSha256: sha256(withoutHash) });
}
async function loadAll() {
  const [registry, workspace, studio] = await Promise.all([
    buildHmfProductionBatchRegistry(),
    loadHmfArtProductionWorkspace(),
    loadHeavyMetalFightingStudio(),
  ]);
  const policy = await loadPolicy(workspace);
  return freeze({ registry, workspace, studio, policy });
}
export async function buildHmfProductionWorkOrderBatch(identifier) {
  const loaded = await loadAll();
  const batch = resolveBatch(loaded.registry, identifier);
  const originals = sourceUnitMap(loaded.studio);
  const workOrders = batch.units.map((unit, index) => compileWorkOrder(loaded.registry, batch, unit, index + 1, loaded.workspace, loaded.policy, loaded.studio, originals));
  assert(new Set(workOrders.map((order) => order.workOrderSha256)).size === workOrders.length, `${batch.id} work-order hashes must be unique.`);
  const withoutHash = {
    schema: HMF_WORK_ORDER_BATCH_SCHEMA,
    protocolVersion: HMF_WORK_ORDER_PROTOCOL_VERSION,
    projectId: loaded.registry.projectId,
    registrySha256: loaded.registry.registrySha256,
    batchId: batch.id,
    batchSequence: batch.sequence,
    productionWave: batch.productionWave,
    familyId: batch.familyId,
    subjectId: batch.subjectId,
    productionGroup: batch.productionGroup,
    requiredImages: batch.requiredImages,
    dependsOnBatchIds: batch.dependsOnBatchIds,
    approvalPrerequisites: batch.approvalPrerequisites,
    workOrders: freeze(workOrders),
    authority: freeze({ providerExecution: false, approval: false, promotion: false, targetRepositoryMutation: false, namedHumanApprovalRequired: true }),
  };
  return freeze({ ...withoutHash, workOrderBatchSha256: sha256(withoutHash) });
}
export async function heavyMetalFightingProductionWorkOrder(unitId) {
  const loaded = await loadAll();
  const { batch, unit } = resolveUnit(loaded.registry, String(unitId));
  const originals = sourceUnitMap(loaded.studio);
  const ordinal = batch.units.findIndex((candidate) => candidate.id === unit.id) + 1;
  return compileWorkOrder(loaded.registry, batch, unit, ordinal, loaded.workspace, loaded.policy, loaded.studio, originals);
}
export async function heavyMetalFightingProductionReceiptTemplate(unitId) {
  const [order, loaded] = await Promise.all([heavyMetalFightingProductionWorkOrder(unitId), loadAll()]);
  return freeze({
    schema: "evavo.heavy-metal-fighting-production-receipt-template.v1",
    protocolVersion: HMF_WORK_ORDER_PROTOCOL_VERSION,
    unitId: order.unitId,
    batchId: order.batchId,
    workOrderSha256: order.workOrderSha256,
    receiptPath: order.executionPaths.receiptPath,
    candidatePathTemplate: order.executionPaths.candidatePathTemplate,
    states: loaded.policy.receiptStateMachine,
    requiredFields: ["state","attempt","evidenceSha256","actorClass","actorId","occurredAt"],
    candidateFieldsRequiredFrom: "candidates-admitted",
    selectionOutcomeRequiredAt: "selected-or-repair-requested",
    authority: loaded.policy.authority,
  });
}
function stateById(policy, id) {
  const state = policy.receiptStateMachine.find((candidate) => candidate.id === id);
  assert(state, `unknown receipt state ${id}.`);
  return state;
}
function validateReceiptBasics(receipt, order, policy) {
  assert(receipt?.schema === HMF_PRODUCTION_RECEIPT_SCHEMA, "receipt schema drifted.");
  assert(receipt.protocolVersion === HMF_WORK_ORDER_PROTOCOL_VERSION, "receipt protocol drifted.");
  assert(receipt.unitId === order.unitId && receipt.batchId === order.batchId && receipt.workOrderSha256 === order.workOrderSha256, "receipt is bound to the wrong work order.");
  const state = stateById(policy, receipt.state);
  assert(Number.isInteger(receipt.attempt) && receipt.attempt >= 1 && receipt.attempt <= policy.candidatePolicy.maximumRepairAttempts + 1, "receipt attempt is outside the allowed range.");
  if (state.requiresEvidence) assert(isSha256(receipt.evidenceSha256), `${receipt.state} requires evidenceSha256.`);
  if (state.requiresCandidate) assert(isSha256(receipt.candidateSha256), `${receipt.state} requires candidateSha256.`);
  if (state.requiresHuman) assert(receipt.actorClass === "human", `${receipt.state} requires actorClass human.`);
  assert(["system","agent","human"].includes(receipt.actorClass), "receipt actorClass is invalid.");
  assert(typeof receipt.actorId === "string" && receipt.actorId.trim(), "receipt actorId is required.");
  assert(typeof receipt.occurredAt === "string" && Number.isFinite(Date.parse(receipt.occurredAt)), "receipt occurredAt must be an ISO-compatible timestamp.");
  if (state.outcomes) assert(state.outcomes.includes(receipt.outcome), `${receipt.state} requires outcome ${state.outcomes.join(" or ")}.`);
  else assert(receipt.outcome === null, `${receipt.state} may not carry a selection outcome.`);
  const withoutHash = { ...receipt };
  delete withoutHash.receiptSha256;
  assert(receipt.receiptSha256 === sha256(withoutHash), "receipt SHA-256 does not match its payload.");
  return state;
}
function validateTransition(previous, current, order, policy) {
  const currentState = validateReceiptBasics(current, order, policy);
  if (!previous) {
    assert(current.state === "references-locked", "the first explicit receipt must be references-locked.");
    assert(current.attempt === 1 && current.previousReceiptSha256 === null, "first receipt must start attempt 1 without a previous receipt.");
    return;
  }
  const previousState = validateReceiptBasics(previous, order, policy);
  assert(current.previousReceiptSha256 === previous.receiptSha256, "receipt chain is not hash-linked to its predecessor.");
  assert(previous.state !== "delivery-ready", "delivery-ready is terminal.");
  if (previous.state === "selected-or-repair-requested" && previous.outcome === "repair-requested") {
    assert(current.attempt === previous.attempt + 1, "a bounded repair must increment the attempt exactly once.");
    assert(current.state === "generation-authorized", "a bounded repair attempt restarts at generation-authorized.");
    return;
  }
  assert(current.attempt === previous.attempt, "normal receipt progression must stay within the same attempt.");
  assert(currentState.rank === previousState.rank + 1, `receipt state must advance exactly one step from ${previous.state}.`);
  if (previous.candidateSha256) assert(current.candidateSha256 === previous.candidateSha256, "candidate SHA-256 changed inside one attempt.");
  if (previous.state === "selected-or-repair-requested") assert(previous.outcome === "selected", "only a selected candidate may advance to mastering.");
}
export async function createHmfProductionReceipt(input, previousReceipt = null) {
  const [order, loaded] = await Promise.all([heavyMetalFightingProductionWorkOrder(input.unitId), loadAll()]);
  const state = stateById(loaded.policy, input.state);
  const withoutHash = {
    schema: HMF_PRODUCTION_RECEIPT_SCHEMA,
    protocolVersion: HMF_WORK_ORDER_PROTOCOL_VERSION,
    unitId: order.unitId,
    batchId: order.batchId,
    workOrderSha256: order.workOrderSha256,
    state: state.id,
    attempt: Number(input.attempt ?? 1),
    evidenceSha256: input.evidenceSha256 ?? null,
    candidateSha256: input.candidateSha256 ?? null,
    outcome: input.outcome ?? null,
    actorClass: input.actorClass,
    actorId: input.actorId,
    occurredAt: input.occurredAt,
    previousReceiptSha256: previousReceipt?.receiptSha256 ?? null,
  };
  const receipt = freeze({ ...withoutHash, receiptSha256: sha256(withoutHash) });
  validateTransition(previousReceipt, receipt, order, loaded.policy);
  return receipt;
}
export async function heavyMetalFightingProductionRepairTemplate(unitId, input = {}) {
  const [order, loaded] = await Promise.all([heavyMetalFightingProductionWorkOrder(unitId), loadAll()]);
  assert(isSha256(input.candidateSha256), "repair template requires candidateSha256.");
  const failureCodes = [...new Set(input.failureCodes ?? [])];
  assert(failureCodes.length > 0, "repair template requires at least one failure code.");
  const allowed = new Set([...loaded.policy.technicalFailureCodes, ...loaded.workspace.style.antiGenericFailureCodes]);
  for (const code of failureCodes) assert(allowed.has(code), `unknown repair failure code ${code}.`);
  const attempt = Number(input.attempt ?? 1);
  assert(Number.isInteger(attempt) && attempt >= 1 && attempt <= loaded.policy.candidatePolicy.maximumRepairAttempts, "repair attempt is outside the allowed range.");
  const withoutHash = {
    schema: "evavo.heavy-metal-fighting-bounded-repair-template.v1",
    protocolVersion: HMF_WORK_ORDER_PROTOCOL_VERSION,
    unitId: order.unitId,
    batchId: order.batchId,
    workOrderSha256: order.workOrderSha256,
    failedCandidateSha256: input.candidateSha256,
    repairAttempt: attempt,
    failureCodes: freeze(failureCodes),
    repairCandidatePath: order.executionPaths.candidatePathTemplate.replace("{candidate:02}", `repair-${String(attempt).padStart(2, "0")}`),
    repairMaskRoot: `masks/${safeSegment(order.unitId)}`,
    preservePassingSiblings: true,
    siblingUnitIdsForbiddenFromRegeneration: freeze((await buildHmfProductionWorkOrderBatch(order.batchId)).workOrders.filter((candidate) => candidate.unitId !== order.unitId).map((candidate) => candidate.unitId)),
    repairPrompt: `${order.providerPrompt}\n\nBOUNDED REPAIR ONLY. Repair this exact unit for failure codes: ${failureCodes.join("; ")}. Preserve every already-passing identity, silhouette, palette, landmark, composition, pivot and continuity property. Do not regenerate or alter sibling units.`,
    authority: freeze({ providerExecution: false, automaticApproval: false, siblingRegeneration: false, targetRepositoryMutation: false, namedHumanApprovalRequired: true }),
  };
  return freeze({ ...withoutHash, repairTemplateSha256: sha256(withoutHash) });
}
function nextAction(receipt) {
  if (!receipt) return "lock-references";
  if (receipt.state === "references-locked") return "request-generation-authorization";
  if (receipt.state === "generation-authorized") return "run-provider-once";
  if (receipt.state === "candidates-admitted") return "run-deterministic-qa";
  if (receipt.state === "deterministic-qa-passed") return "run-creative-review";
  if (receipt.state === "creative-review-passed") return "select-or-request-repair";
  if (receipt.state === "selected-or-repair-requested" && receipt.outcome === "repair-requested") return "authorize-bounded-repair";
  if (receipt.state === "selected-or-repair-requested") return "master-selected-candidate";
  if (receipt.state === "mastered") return "request-named-human-approval";
  if (receipt.state === "named-human-approved") return "compile-delivery-readiness";
  if (receipt.state === "delivery-ready") return "complete";
  return "inspect-state";
}
function verifyReceiptChain(receipts, order, policy) {
  if (receipts.length === 0) return null;
  const byHash = new Map();
  const children = new Map();
  for (const receipt of receipts) {
    validateReceiptBasics(receipt, order, policy);
    assert(!byHash.has(receipt.receiptSha256), `duplicate receipt ${receipt.receiptSha256}.`);
    byHash.set(receipt.receiptSha256, receipt);
    if (receipt.previousReceiptSha256) {
      const list = children.get(receipt.previousReceiptSha256) ?? [];
      list.push(receipt);
      children.set(receipt.previousReceiptSha256, list);
    }
  }
  const roots = receipts.filter((receipt) => receipt.previousReceiptSha256 === null);
  assert(roots.length === 1, `${order.unitId} receipt chain must contain exactly one root.`);
  let previous = null;
  let current = roots[0];
  const visited = new Set();
  while (current) {
    assert(!visited.has(current.receiptSha256), `${order.unitId} receipt chain contains a cycle.`);
    visited.add(current.receiptSha256);
    validateTransition(previous, current, order, policy);
    const next = children.get(current.receiptSha256) ?? [];
    assert(next.length <= 1, `${order.unitId} receipt chain branches.`);
    previous = current;
    current = next[0] ?? null;
  }
  assert(visited.size === receipts.length, `${order.unitId} receipt chain contains disconnected receipts.`);
  return previous;
}
export async function heavyMetalFightingProductionBatchResumePlan(identifier, receipts = []) {
  const [bundle, loaded] = await Promise.all([buildHmfProductionWorkOrderBatch(identifier), loadAll()]);
  assert(Array.isArray(receipts), "receipts must be an array.");
  const knownUnits = new Set(bundle.workOrders.map((order) => order.unitId));
  assert(receipts.every((receipt) => knownUnits.has(receipt.unitId)), "resume receipts contain a unit outside the selected batch.");
  const unitStates = bundle.workOrders.map((order) => {
    const chain = receipts.filter((receipt) => receipt.unitId === order.unitId);
    const head = verifyReceiptChain(chain, order, loaded.policy);
    return freeze({
      unitId: order.unitId,
      workOrderSha256: order.workOrderSha256,
      currentState: head?.state ?? "planned",
      currentAttempt: head?.attempt ?? 1,
      currentOutcome: head?.outcome ?? null,
      headReceiptSha256: head?.receiptSha256 ?? null,
      nextAction: nextAction(head),
      complete: head?.state === "delivery-ready",
    });
  });
  const completed = unitStates.filter((state) => state.complete).length;
  return freeze({
    schema: "evavo.heavy-metal-fighting-batch-resume-plan.v1",
    protocolVersion: HMF_WORK_ORDER_PROTOCOL_VERSION,
    projectId: bundle.projectId,
    registrySha256: bundle.registrySha256,
    batchId: bundle.batchId,
    workOrderBatchSha256: bundle.workOrderBatchSha256,
    status: completed === unitStates.length ? "delivery-ready" : receipts.length ? "in-progress" : "not-started",
    completedUnits: completed,
    totalUnits: unitStates.length,
    unitStates: freeze(unitStates),
    authority: freeze({ providerExecution: false, automaticApproval: false, automaticPromotion: false, targetRepositoryMutation: false, namedHumanApprovalRequired: true }),
  });
}
export async function verifyHmfProductionWorkOrders() {
  const loaded = await loadAll();
  const first = await buildHmfProductionWorkOrderBatch("hmf-b0001");
  const body = await heavyMetalFightingProductionWorkOrder("hmf.frame-animation.bastion.slot-000");
  const checks = [
    ["policy-project", loaded.policy.projectId === loaded.registry.projectId],
    ["registry-binding", first.registrySha256 === loaded.registry.registrySha256],
    ["batch-cardinality", first.requiredImages === first.workOrders.length && first.workOrders.length >= 1 && first.workOrders.length <= 10],
    ["unique-work-order-hashes", new Set(first.workOrders.map((order) => order.workOrderSha256)).size === first.workOrders.length],
    ["single-candidate", first.workOrders.every((order) => order.candidatePolicy.candidateFanout === 1)],
    ["candidate-scratch-root", first.workOrders.every((order) => order.executionPaths.candidatePathTemplate.startsWith("scratch/provider/"))],
    ["no-provider-authority", first.workOrders.every((order) => order.authority.providerExecution === false && order.authority.targetRepositoryMutation === false)],
    ["body-native-v3", body.assetContract.nativeDimensions?.width === 160 && body.assetContract.nativeDimensions?.height === 160],
    ["body-pivot-v3", body.assetContract.pivot?.x === 80 && body.assetContract.pivot?.y === 152],
    ["body-continuity", body.referenceBindings.nextCel?.includes("slot") || body.referenceBindings.nextCel?.includes("ready") || typeof body.referenceBindings.nextCel === "string"],
    ["anti-generic-bound", body.failureCodes.style.includes("random-greebles") && body.failureCodes.style.includes("provider-packed-final-atlas")],
    ["human-gates", loaded.policy.receiptStateMachine.find((state) => state.id === "named-human-approved")?.requiresHuman === true],
  ].map(([id, passed]) => freeze({ id, passed }));
  return freeze({
    schema: "evavo.heavy-metal-fighting-work-order-verification.v1",
    status: checks.every((check) => check.passed) ? "passed" : "failed",
    registrySha256: loaded.registry.registrySha256,
    checks,
    failed: checks.filter((check) => !check.passed),
  });
}
