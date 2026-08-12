import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildHmfProductionBatchRegistry } from "./batch-registry.mjs";
import { loadHeavyMetalFightingStudio } from "./studio-runtime.mjs";
import { heavyMetalFightingProductionBatchResumePlan } from "./work-orders.mjs";

export const HMF_STYLE_PROOF_EXECUTION_SCHEMA = "evavo.heavy-metal-fighting-style-proof-execution-plan.v1";
export const HMF_STYLE_PROOF_EXECUTION_STATUS_SCHEMA = "evavo.heavy-metal-fighting-style-proof-execution-status.v1";
export const HMF_STYLE_PROOF_EXECUTION_PROTOCOL_VERSION = "2026-08-12.1";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const POLICY_PATH = path.join(ROOT, "config", "heavy-metal-fighting", "style-proof-execution-policy.v1.json");

function fail(message) {
  throw new Error(`HEAVY_METAL_FIGHTING_STYLE_PROOF_EXECUTION_INVALID: ${message}`);
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
function isSha256(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
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
function validatePolicy(policy, registry, studio) {
  assert(policy?.schema === "evavo.heavy-metal-fighting-style-proof-execution-policy.v1", "style-proof execution policy schema drifted.");
  assert(policy.protocolVersion === HMF_STYLE_PROOF_EXECUTION_PROTOCOL_VERSION, "style-proof execution policy protocol drifted.");
  assert(policy.projectId === registry.projectId, "style-proof execution policy project id drifted.");
  assert(policy.styleProofId === studio.studioPlan.styleProof.id, "style-proof execution policy id drifted from the mechanical contract.");
  assert(Array.isArray(policy.phases) && policy.phases.length === 4, "style-proof execution policy must define exactly four phases.");
  assert(policy.phases.every((phase, index) => phase.order === index + 1), "style-proof execution phase order must be gapless.");
  assert(new Set(policy.phases.map((phase) => phase.id)).size === policy.phases.length, "style-proof execution phase ids must be unique.");
  assert(new Set(policy.phases.map((phase) => phase.completionApprovalId)).size === policy.phases.length, "style-proof completion approval ids must be unique.");
  assert(policy.phases.at(-1)?.completionApprovalId === "style-proof-approved", "final style-proof phase must emit style-proof-approved.");
  assert(policy.runtimePromotion?.artProductionMayProceedBeforeMigration === true, "style-proof art production must remain independent from runtime promotion migration.");
  assert(policy.runtimePromotion?.finalFrameBodyPromotionRequiresGameAtlasV3Migration === true, "final Frame body promotion must remain blocked on game atlas-v3 migration.");
  assert(policy.authority?.providerExecution === false && policy.authority?.automaticApproval === false && policy.authority?.automaticPromotion === false, "style-proof execution policy gained forbidden production authority.");
  assert(policy.authority?.targetRepositoryMutation === false && policy.authority?.gitMutation === false && policy.authority?.publication === false, "style-proof execution policy gained forbidden mutation authority.");
  assert(policy.authority?.namedHumanApprovalRequired === true, "style-proof execution policy must require named-human approval.");
  return freeze(policy);
}
function compactBatch(batch) {
  return freeze({
    id: batch.id,
    sequence: batch.sequence,
    familyId: batch.familyId,
    subjectId: batch.subjectId,
    productionGroup: batch.productionGroup,
    requiredImages: batch.requiredImages,
    dependsOnBatchIds: batch.dependsOnBatchIds,
    approvalPrerequisites: batch.approvalPrerequisites,
    unitIds: batch.units.map((unit) => unit.id),
  });
}
function phaseForBatch(policy, batch) {
  const matches = policy.phases.filter((phase) => phase.families.includes(batch.familyId));
  assert(matches.length === 1, `style-proof batch ${batch.id} / ${batch.familyId} must resolve exactly one execution phase.`);
  return matches[0];
}
function validateApprovalRecord(record, knownApprovalIds) {
  assert(record && typeof record === "object", "approval record must be an object.");
  assert(knownApprovalIds.has(record.id), `unknown style-proof approval id ${record.id}.`);
  assert(record.actorClass === "human", `approval ${record.id} must be recorded by a human actor.`);
  assert(typeof record.actorId === "string" && record.actorId.trim().length > 0, `approval ${record.id} requires actorId.`);
  assert(typeof record.occurredAt === "string" && !Number.isNaN(Date.parse(record.occurredAt)), `approval ${record.id} requires an ISO-compatible occurredAt timestamp.`);
  assert(isSha256(record.evidenceSha256), `approval ${record.id} requires evidenceSha256.`);
  return freeze({
    id: record.id,
    actorClass: record.actorClass,
    actorId: record.actorId.trim(),
    occurredAt: record.occurredAt,
    evidenceSha256: record.evidenceSha256,
  });
}
function knownApprovalIds(phases) {
  return new Set([
    ...phases.flatMap((phase) => phase.requiredApprovalIds),
    ...phases.map((phase) => phase.completionApprovalId),
    "frame-construction-approved",
    "style-proof-approved",
  ]);
}

export async function buildHmfStyleProofExecutionPlan() {
  const [registry, studio, rawPolicy] = await Promise.all([
    buildHmfProductionBatchRegistry(),
    loadHeavyMetalFightingStudio(),
    readStableJson(POLICY_PATH, "HMF style-proof execution policy"),
  ]);
  const policy = validatePolicy(rawPolicy, registry, studio);
  const styleBatches = registry.batches.filter((batch) => batch.styleProofCritical);
  assert(styleBatches.length === registry.totals.styleProofBatches, "registry style-proof batch total drifted.");
  assert(styleBatches.length > 0, "registry contains no style-proof batches.");

  const phases = policy.phases.map((phase) => {
    const batches = styleBatches.filter((batch) => phaseForBatch(policy, batch).id === phase.id).map(compactBatch);
    assert(batches.length > 0, `style-proof phase ${phase.id} contains no governed batches.`);
    const sourceImages = batches.reduce((sum, batch) => sum + batch.requiredImages, 0);
    return freeze({
      id: phase.id,
      order: phase.order,
      label: phase.label,
      reviewIntent: phase.reviewIntent,
      requiredApprovalIds: phase.requiredApprovalIds,
      completionApprovalId: phase.completionApprovalId,
      batchIds: batches.map((batch) => batch.id),
      batches,
      totals: freeze({ batches: batches.length, sourceImages }),
    });
  });

  const assigned = phases.flatMap((phase) => phase.batchIds);
  assert(assigned.length === styleBatches.length, "style-proof phase coverage changed batch cardinality.");
  assert(new Set(assigned).size === assigned.length, "style-proof batch is assigned to more than one phase.");
  assert(styleBatches.every((batch) => assigned.includes(batch.id)), "style-proof phase coverage omitted a critical registry batch.");

  const withoutHash = {
    schema: HMF_STYLE_PROOF_EXECUTION_SCHEMA,
    protocolVersion: HMF_STYLE_PROOF_EXECUTION_PROTOCOL_VERSION,
    projectId: registry.projectId,
    publicTitle: registry.publicTitle,
    styleProofId: studio.studioPlan.styleProof.id,
    registrySha256: registry.registrySha256,
    studioPlanSha256: studio.studioPlan.studioPlanSha256,
    spriteProductionCensusSha256: studio.spriteProductionCensus.censusSha256,
    policySha256: sha256(policy),
    proofSubjects: freeze({
      pilotId: studio.studioPlan.styleProof.pilotId,
      frameId: studio.studioPlan.styleProof.frameId,
      arenaId: studio.studioPlan.styleProof.arenaId,
      environmentId: studio.studioPlan.styleProof.environmentId,
      titleId: studio.studioPlan.styleProof.titleId,
    }),
    legacySemanticEvidence: freeze({
      frameRequirements: studio.studioPlan.styleProof.frameRequirements.map((requirement) => freeze({
        semantic: requirement.semantic,
        sourceUnitId: requirement.sourceCell.unitId,
        currentSlots: requirement.currentSlots,
        plannedSlots: requirement.plannedSlots,
      })),
      reviewContexts: studio.studioPlan.styleProof.reviewContexts,
      currentSlotCollisions: studio.studioPlan.styleProof.currentSlotCollisions,
      plannedSlotCollisions: studio.studioPlan.styleProof.plannedSlotCollisions,
      note: "These legacy semantic requirements remain visual/readability evidence only; production-master-v3 Frame body work orders are governed by the 224-cel census and cannot be promoted into the game until atlas-v3 migration is separately validated."
    }),
    phases,
    totals: freeze({
      phases: phases.length,
      batches: styleBatches.length,
      sourceImages: styleBatches.reduce((sum, batch) => sum + batch.requiredImages, 0),
      frameBodyBatches: styleBatches.filter((batch) => batch.familyId === "frame-animation").length,
      frameBodyImages: styleBatches.filter((batch) => batch.familyId === "frame-animation").reduce((sum, batch) => sum + batch.requiredImages, 0),
    }),
    runtimePromotion: freeze({
      ...policy.runtimePromotion,
      productionMasterCell: studio.spriteProductionCensus.productionMasterV3.cell,
      productionMasterPivot: studio.spriteProductionCensus.productionMasterV3.pivot,
      productionMasterAtlasSlotsPerFrame: studio.spriteProductionCensus.productionMasterV3.slotsPerFrame,
      compatibilitySharedBoundarySlots: studio.spriteProductionCensus.compatibilityAtlas.sharedBoundarySlots,
    }),
    authority: policy.authority,
  };
  return freeze({ ...withoutHash, styleProofExecutionSha256: sha256(withoutHash) });
}

export async function heavyMetalFightingStyleProofExecutionStatus(input = {}) {
  const plan = await buildHmfStyleProofExecutionPlan();
  const rawApprovals = input.approvalRecords ?? [];
  const receipts = input.receipts ?? [];
  assert(Array.isArray(rawApprovals), "approvalRecords must be an array.");
  assert(Array.isArray(receipts), "receipts must be an array.");

  const approvalIds = knownApprovalIds(plan.phases);
  const approvals = rawApprovals.map((record) => validateApprovalRecord(record, approvalIds));
  assert(new Set(approvals.map((record) => record.id)).size === approvals.length, "style-proof approval ids must not be duplicated.");
  const approved = new Set(approvals.map((record) => record.id));
  const styleBatchIds = new Set(plan.phases.flatMap((phase) => phase.batchIds));
  assert(receipts.every((receipt) => styleBatchIds.has(receipt.batchId)), "style-proof execution receipts contain a batch outside the style-proof wave.");

  const phaseStatuses = [];
  let priorPhaseComplete = true;
  for (const phase of plan.phases) {
    const requiredApprovals = [...new Set(phase.requiredApprovalIds)];
    const missingApprovals = requiredApprovals.filter((id) => !approved.has(id));
    const batchStates = [];
    for (const batch of phase.batches) {
      const batchReceipts = receipts.filter((receipt) => receipt.batchId === batch.id);
      if (batchReceipts.length === 0) {
        batchStates.push(freeze({
          batchId: batch.id,
          status: "not-started",
          completedUnits: 0,
          totalUnits: batch.requiredImages,
          nextActions: freeze(["lock-references"]),
        }));
        continue;
      }
      const resume = await heavyMetalFightingProductionBatchResumePlan(batch.id, batchReceipts);
      batchStates.push(freeze({
        batchId: batch.id,
        status: resume.status,
        completedUnits: resume.completedUnits,
        totalUnits: resume.totalUnits,
        nextActions: freeze([...new Set(resume.unitStates.filter((state) => !state.complete).map((state) => state.nextAction))]),
      }));
    }
    const batchesComplete = batchStates.every((batch) => batch.status === "delivery-ready");
    const completionApproved = approved.has(phase.completionApprovalId);
    const prematureCompletionApproval = completionApproved && !batchesComplete;
    let status;
    let nextAction;
    if (!priorPhaseComplete) {
      status = "blocked-by-prior-phase";
      nextAction = "complete-prior-style-proof-phase";
    } else if (missingApprovals.length) {
      status = "blocked-by-approval";
      nextAction = `record-${missingApprovals[0]}`;
    } else if (prematureCompletionApproval) {
      status = "invalid-premature-approval-evidence";
      nextAction = "investigate-premature-style-proof-approval";
    } else if (!batchesComplete) {
      status = batchStates.some((batch) => batch.status === "in-progress") ? "in-progress" : "ready-to-start";
      nextAction = "resume-governed-style-proof-batches";
    } else if (!completionApproved) {
      status = "awaiting-phase-approval";
      nextAction = `request-${phase.completionApprovalId}`;
    } else {
      status = "complete";
      nextAction = "advance-to-next-style-proof-phase";
    }
    const phaseComplete = status === "complete";
    phaseStatuses.push(freeze({
      phaseId: phase.id,
      order: phase.order,
      status,
      requiredApprovalIds: requiredApprovals,
      missingApprovalIds: missingApprovals,
      completionApprovalId: phase.completionApprovalId,
      completionApproved,
      batchesComplete,
      batchStates: freeze(batchStates),
      nextAction,
    }));
    priorPhaseComplete = priorPhaseComplete && phaseComplete;
  }

  const invalid = phaseStatuses.some((phase) => phase.status === "invalid-premature-approval-evidence");
  const complete = phaseStatuses.every((phase) => phase.status === "complete");
  const active = phaseStatuses.find((phase) => phase.status !== "complete") ?? null;
  const overallStatus = invalid
    ? "invalid-evidence"
    : complete
      ? "complete"
      : receipts.length
        ? "in-progress"
        : active?.status === "ready-to-start"
          ? "ready-to-start"
          : "not-started";
  return freeze({
    schema: HMF_STYLE_PROOF_EXECUTION_STATUS_SCHEMA,
    protocolVersion: HMF_STYLE_PROOF_EXECUTION_PROTOCOL_VERSION,
    projectId: plan.projectId,
    styleProofId: plan.styleProofId,
    styleProofExecutionSha256: plan.styleProofExecutionSha256,
    status: overallStatus,
    activePhaseId: active?.phaseId ?? null,
    nextAction: active?.nextAction ?? "style-proof-complete-await-game-delivery-work",
    approvals: freeze(approvals),
    phaseStatuses: freeze(phaseStatuses),
    runtimePromotion: plan.runtimePromotion,
    authority: plan.authority,
  });
}

export async function verifyHmfStyleProofExecutionPlan() {
  const plan = await buildHmfStyleProofExecutionPlan();
  const emptyStatus = await heavyMetalFightingStyleProofExecutionStatus();
  const batchIds = plan.phases.flatMap((phase) => phase.batchIds);
  const checks = [
    ["four-phases", plan.phases.length === 4],
    ["critical-batch-coverage", batchIds.length === plan.totals.batches && new Set(batchIds).size === batchIds.length],
    ["nonempty-style-proof", plan.totals.batches > 0 && plan.totals.sourceImages > 0],
    ["bastion-body-proof", plan.totals.frameBodyBatches > 0 && plan.totals.frameBodyImages > 0],
    ["final-style-proof-gate", plan.phases.at(-1)?.completionApprovalId === "style-proof-approved"],
    ["native-v3", plan.runtimePromotion.productionMasterCell.width === 160 && plan.runtimePromotion.productionMasterCell.height === 160],
    ["pivot-v3", plan.runtimePromotion.productionMasterPivot.x === 80 && plan.runtimePromotion.productionMasterPivot.y === 152],
    ["runtime-promotion-blocked", plan.runtimePromotion.finalFrameBodyPromotionRequiresGameAtlasV3Migration === true],
    ["art-production-independent", plan.runtimePromotion.artProductionMayProceedBeforeMigration === true],
    ["read-only-authority", plan.authority.providerExecution === false && plan.authority.automaticApproval === false && plan.authority.targetRepositoryMutation === false && plan.authority.gitMutation === false],
    ["empty-status-human-gated", emptyStatus.phaseStatuses[0].status === "blocked-by-approval" && emptyStatus.phaseStatuses[0].missingApprovalIds.includes("style-north-star-approved")],
  ].map(([id, passed]) => freeze({ id, passed }));
  return freeze({
    schema: "evavo.heavy-metal-fighting-style-proof-execution-verification.v1",
    status: checks.every((check) => check.passed) ? "passed" : "failed",
    styleProofExecutionSha256: plan.styleProofExecutionSha256,
    totals: plan.totals,
    checks,
    failed: checks.filter((check) => !check.passed),
  });
}
