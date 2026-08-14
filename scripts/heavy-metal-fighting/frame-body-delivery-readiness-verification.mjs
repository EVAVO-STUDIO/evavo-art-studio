import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  heavyMetalFightingProductionReceiptTemplate,
  heavyMetalFightingProductionWorkOrder,
} from "./work-orders.mjs";
import {
  assertForbiddenDeliveryReadinessAuthorityFalse,
  freeze,
  loadDeliveryReadinessPolicy,
} from "./frame-body-delivery-readiness-common.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ATLAS_CONTRACT_PATH = path.resolve(
  HERE,
  "../../config/heavy-metal-fighting/frame-atlas-v3-delivery-contract.v1.json",
);

async function readAtlasContract() {
  const before = await lstat(ATLAS_CONTRACT_PATH);
  if (!before.isFile() || before.isSymbolicLink()) {
    throw new Error("HMF Frame atlas delivery contract must be a regular non-symlink file.");
  }
  const bytes = await readFile(ATLAS_CONTRACT_PATH);
  const after = await lstat(ATLAS_CONTRACT_PATH);
  if (
    before.dev !== after.dev
    || before.ino !== after.ino
    || before.size !== after.size
    || before.mtimeMs !== after.mtimeMs
  ) {
    throw new Error("HMF Frame atlas delivery contract changed while it was being read.");
  }
  return JSON.parse(bytes.toString("utf8"));
}

export async function verifyHmfFrameBodyDeliveryReadiness() {
  const [policy, order, receiptTemplate, atlasContract] = await Promise.all([
    loadDeliveryReadinessPolicy(),
    heavyMetalFightingProductionWorkOrder("hmf.frame-animation.bastion.slot-121"),
    heavyMetalFightingProductionReceiptTemplate("hmf.frame-animation.bastion.slot-121"),
    readAtlasContract(),
  ]);
  const approvedState = receiptTemplate.states.find(
    (entry) => entry.id === policy.readinessRules.predecessorState,
  );
  const readyState = receiptTemplate.states.find(
    (entry) => entry.id === policy.readinessRules.receiptState,
  );
  const checks = freeze([
    freeze({
      id: "policy-bound-to-frame-body-cels",
      passed: policy.assetKind === order.assetContract.kind,
    }),
    freeze({
      id: "named-human-approved-predecessor-required",
      passed: approvedState?.requiresHuman === true,
    }),
    freeze({
      id: "delivery-ready-is-terminal-system-state",
      passed: readyState?.rank === approvedState?.rank + 1
        && readyState?.requiresEvidence === true
        && readyState?.requiresCandidate === true
        && readyState?.requiresHuman === false
        && readyState?.terminal === true,
    }),
    freeze({
      id: "approved-master-path-governed",
      passed: order.assetContract.masterOutputPath.startsWith("masters/"),
    }),
    freeze({
      id: "readiness-record-and-terminal-next-action-required",
      passed: policy.readinessRules.approvalRecordRequired === true
        && policy.readinessRules.deliveryDescriptorRequired === true
        && policy.readinessRules.nextLegalAction === "complete",
    }),
    freeze({
      id: "atlas-planner-requires-delivery-ready-receipt-chains",
      passed: atlasContract.sourcePolicy?.requiresDeliveryReadyReceiptChains === true,
    }),
    freeze({
      id: "atlas-target-remains-write-disabled",
      passed: atlasContract.gameTarget?.artStudioMayWriteTargetRepository === false
        && atlasContract.authority?.targetRepositoryMutation === false,
    }),
    freeze({
      id: "no-promotion-atlas-git-or-publication-authority",
      passed: policy.authority.gameRepositoryPromotion === false
        && policy.authority.finalAtlasCompilation === false
        && policy.authority.targetRepositoryMutation === false
        && policy.authority.gitMutation === false
        && policy.authority.publication === false,
    }),
  ]);
  assertForbiddenDeliveryReadinessAuthorityFalse(
    policy.authority,
    "delivery-readiness policy",
  );
  const failed = freeze(checks.filter((entry) => !entry.passed));
  return freeze({
    schema: "evavo.heavy-metal-fighting-frame-body-delivery-readiness-verification.v1",
    status: failed.length ? "failed" : "passed",
    sampleUnitId: order.unitId,
    policySha256: policy.policySha256,
    checks,
    failed,
    authority: freeze({
      masterRead: true,
      approvalRecordRead: true,
      deliveryReadinessRecordPersistence: true,
      receiptPersistence: true,
      providerExecution: false,
      providerRetry: false,
      candidateMutation: false,
      masterMutation: false,
      imageTransformation: false,
      automaticApproval: false,
      deliveryReadinessCompilation: true,
      gameRepositoryPromotion: false,
      targetRepositoryMutation: false,
      finalAtlasCompilation: false,
      gitMutation: false,
      deployment: false,
      publication: false,
    }),
  });
}
