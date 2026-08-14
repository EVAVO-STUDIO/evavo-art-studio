import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  assert,
  canonical,
  canonicalTimestamp,
  freeze,
  hashBytes,
  hashValue,
  pathWithin,
  safeActorId,
  SHA256,
  safeRelativePath,
  safeWorkspacePath,
  selfHashed,
  stableWorkspaceFile,
  stableWorkspaceJson,
  workspaceRoot,
} from "./frame-body-named-human-approval-common.mjs";

export {
  assert,
  canonical,
  canonicalTimestamp,
  freeze,
  hashBytes,
  hashValue,
  pathWithin,
  safeActorId,
  SHA256,
  safeRelativePath,
  safeWorkspacePath,
  selfHashed,
  stableWorkspaceFile,
  stableWorkspaceJson,
  workspaceRoot,
};

export const HMF_FRAME_BODY_DELIVERY_READINESS_PLAN_SCHEMA =
  "evavo.heavy-metal-fighting-frame-body-delivery-readiness-plan.v1";
export const HMF_FRAME_BODY_DELIVERY_READINESS_RECORD_SCHEMA =
  "evavo.heavy-metal-fighting-frame-body-delivery-readiness-record.v1";
export const HMF_FRAME_BODY_DELIVERY_READINESS_RESULT_SCHEMA =
  "evavo.heavy-metal-fighting-frame-body-delivery-readiness-result.v1";
export const HMF_FRAME_BODY_DELIVERY_READINESS_POLICY_SCHEMA =
  "evavo.heavy-metal-fighting-frame-body-delivery-readiness-policy.v1";
export const HMF_FRAME_BODY_DELIVERY_READINESS_PROTOCOL_VERSION = "2026-08-14.1";

export const FORBIDDEN_DELIVERY_READINESS_AUTHORITY_KEYS = Object.freeze([
  "providerExecution",
  "providerRetry",
  "candidateMutation",
  "masterMutation",
  "imageTransformation",
  "automaticApproval",
  "automaticDelivery",
  "candidatePromotion",
  "gameRepositoryPromotion",
  "targetRepositoryMutation",
  "finalAtlasCompilation",
  "gitMutation",
  "deployment",
  "publication",
]);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const POLICY_PATH = path.resolve(
  HERE,
  "../../config/heavy-metal-fighting/frame-body-delivery-readiness-policy.v1.json",
);

export function fail(message) {
  throw new Error(`HEAVY_METAL_FIGHTING_FRAME_BODY_DELIVERY_READINESS_INVALID: ${message}`);
}

export function assertForbiddenDeliveryReadinessAuthorityFalse(
  authority,
  label,
  keys = FORBIDDEN_DELIVERY_READINESS_AUTHORITY_KEYS,
) {
  assert(
    authority && typeof authority === "object" && !Array.isArray(authority),
    `${label} authority must be an object.`,
  );
  for (const key of keys) {
    assert(authority[key] === false, `${label} gained forbidden authority: ${key}.`);
  }
  return authority;
}

async function readStablePolicy() {
  const before = await lstat(POLICY_PATH);
  assert(
    before.isFile() && !before.isSymbolicLink() && before.nlink === 1,
    "delivery-readiness policy must be a one-link regular non-symlink file.",
  );
  const bytes = await readFile(POLICY_PATH);
  const after = await lstat(POLICY_PATH);
  assert(
    before.dev === after.dev
      && before.ino === after.ino
      && before.nlink === after.nlink
      && before.size === after.size
      && before.mtimeMs === after.mtimeMs,
    "delivery-readiness policy changed while it was being read.",
  );
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    fail(`delivery-readiness policy is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function validatePolicy(raw) {
  assert(
    raw?.schema === HMF_FRAME_BODY_DELIVERY_READINESS_POLICY_SCHEMA,
    "delivery-readiness policy schema drifted.",
  );
  assert(
    raw.protocolVersion === HMF_FRAME_BODY_DELIVERY_READINESS_PROTOCOL_VERSION,
    "delivery-readiness policy protocol drifted.",
  );
  assert(
    raw.projectId === "heavy-metal-fighting" && raw.assetKind === "frame-body-cel",
    "delivery-readiness policy identity drifted.",
  );
  const rules = raw.readinessRules ?? {};
  assert(
    rules.predecessorState === "named-human-approved"
      && rules.receiptState === "delivery-ready"
      && rules.requiredActorClass === "system"
      && rules.nextLegalAction === "complete",
    "delivery-readiness lifecycle rules drifted.",
  );
  assert(
    rules.masterPathMustMatchWorkOrder === true
      && rules.masterPathMustLiveUnderMasters === true
      && rules.masterSha256MustMatchApproval === true
      && rules.masterBytesMustMatchApproval === true
      && rules.persistedApprovalRecordRequired === true
      && rules.persistedMasteringRecordRequired === true
      && rules.runtimeDeliveryContractRequired === true,
    "delivery-readiness evidence rules drifted.",
  );
  assert(
    Number.isInteger(rules.maximumMasterBytes)
      && rules.maximumMasterBytes >= 1
      && rules.maximumMasterBytes <= 64 * 1024 * 1024,
    "delivery-readiness maximumMasterBytes is invalid.",
  );
  const authority = raw.authority ?? {};
  assert(
    authority.masterRead === true
      && authority.approvalRecordRead === true
      && authority.masteringRecordRead === true
      && authority.readinessRecordPersistence === true
      && authority.receiptPersistence === true,
    "delivery-readiness policy lost its bounded read/write authority.",
  );
  assertForbiddenDeliveryReadinessAuthorityFalse(authority, "delivery-readiness policy");
  const body = structuredClone(raw);
  return freeze({ ...body, policySha256: hashValue(body) });
}

export async function loadDeliveryReadinessPolicy() {
  return validatePolicy(await readStablePolicy());
}

export function deliveryReadinessRecordPath(order, attempt) {
  const base = safeRelativePath(
    order.executionPaths.reviewEvidencePath,
    "delivery-readiness review evidence path",
  );
  assert(base.endsWith(".json"), "delivery-readiness review evidence path must end in .json.");
  return `${base.slice(0, -5)}-attempt-${String(attempt).padStart(2, "0")}-delivery-readiness.json`;
}
