import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  assert,
  boundedString,
  canonical,
  canonicalTimestamp,
  freeze,
  hashBytes,
  hashValue,
  pathWithin,
  safeActorId,
  safeRelativePath,
  safeWorkspacePath,
  selfHashed,
  stableWorkspaceFile,
  stableWorkspaceJson,
  workspaceRoot,
} from "./frame-body-selected-candidate-mastering-common.mjs";

export {
  assert,
  boundedString,
  canonical,
  canonicalTimestamp,
  freeze,
  hashBytes,
  hashValue,
  pathWithin,
  safeActorId,
  safeRelativePath,
  safeWorkspacePath,
  selfHashed,
  stableWorkspaceFile,
  stableWorkspaceJson,
  workspaceRoot,
};

export const HMF_FRAME_BODY_NAMED_HUMAN_APPROVAL_PLAN_SCHEMA =
  "evavo.heavy-metal-fighting-frame-body-named-human-approval-plan.v1";
export const HMF_FRAME_BODY_NAMED_HUMAN_APPROVAL_RECORD_SCHEMA =
  "evavo.heavy-metal-fighting-frame-body-named-human-approval-record.v1";
export const HMF_FRAME_BODY_NAMED_HUMAN_APPROVAL_RESULT_SCHEMA =
  "evavo.heavy-metal-fighting-frame-body-named-human-approval-result.v1";
export const HMF_FRAME_BODY_NAMED_HUMAN_APPROVAL_POLICY_SCHEMA =
  "evavo.heavy-metal-fighting-frame-body-named-human-approval-policy.v1";
export const HMF_FRAME_BODY_NAMED_HUMAN_APPROVAL_PROTOCOL_VERSION = "2026-08-14.1";

export const FORBIDDEN_APPROVAL_AUTHORITY_KEYS = Object.freeze([
  "providerExecution",
  "providerRetry",
  "candidateMutation",
  "masterMutation",
  "imageTransformation",
  "automaticApproval",
  "gameRepositoryPromotion",
  "targetRepositoryMutation",
  "finalAtlasCompilation",
  "deliveryReadinessCompilation",
  "gitMutation",
  "deployment",
  "publication",
]);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const POLICY_PATH = path.resolve(
  HERE,
  "../../config/heavy-metal-fighting/frame-body-named-human-approval-policy.v1.json",
);

export function fail(message) {
  throw new Error(`HEAVY_METAL_FIGHTING_FRAME_BODY_NAMED_HUMAN_APPROVAL_INVALID: ${message}`);
}

export function assertForbiddenAuthorityFalse(
  authority,
  label,
  keys = FORBIDDEN_APPROVAL_AUTHORITY_KEYS,
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
  assert(before.isFile() && !before.isSymbolicLink(), "named-human approval policy must be a regular non-symlink file.");
  const bytes = await readFile(POLICY_PATH);
  const after = await lstat(POLICY_PATH);
  assert(
    before.dev === after.dev
      && before.ino === after.ino
      && before.size === after.size
      && before.mtimeMs === after.mtimeMs,
    "named-human approval policy changed while it was being read.",
  );
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    fail(`named-human approval policy is invalid UTF-8 JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function validatePolicy(raw) {
  assert(raw?.schema === HMF_FRAME_BODY_NAMED_HUMAN_APPROVAL_POLICY_SCHEMA, "named-human approval policy schema drifted.");
  assert(raw.protocolVersion === HMF_FRAME_BODY_NAMED_HUMAN_APPROVAL_PROTOCOL_VERSION, "named-human approval policy protocol drifted.");
  assert(raw.projectId === "heavy-metal-fighting" && raw.assetKind === "frame-body-cel", "named-human approval policy identity drifted.");
  const rules = raw.approvalRules ?? {};
  assert(
    rules.predecessorState === "mastered"
      && rules.receiptState === "named-human-approved"
      && rules.requiredActorClass === "human"
      && rules.requiredDecision === "approved",
    "named-human approval lifecycle rules drifted.",
  );
  assert(
    rules.masterPathMustMatchWorkOrder === true
      && rules.masterPathMustLiveUnderMasters === true
      && rules.masterSha256MustMatchCandidate === true
      && rules.masterBytesMustMatchMasteringRecord === true
      && rules.persistedMasteringRecordRequired === true
      && rules.exactMasterInspectionAttestationRequired === true,
    "named-human approval master or evidence rules drifted.",
  );
  assert(
    Number.isInteger(rules.minimumRationaleCharacters)
      && rules.minimumRationaleCharacters >= 1
      && Number.isInteger(rules.maximumRationaleCharacters)
      && rules.maximumRationaleCharacters >= rules.minimumRationaleCharacters,
    "named-human approval rationale bounds are invalid.",
  );
  assert(rules.nextLegalAction === "compile-delivery-readiness", "named-human approval next action drifted.");
  const authority = raw.authority ?? {};
  assert(
    authority.masterRead === true
      && authority.masteringRecordRead === true
      && authority.approvalRecordPersistence === true
      && authority.receiptPersistence === true
      && authority.namedHumanApproverRequired === true,
    "named-human approval policy lost its bounded read, write or human authority.",
  );
  assertForbiddenAuthorityFalse(authority, "named-human approval policy");
  const body = structuredClone(raw);
  return freeze({ ...body, policySha256: hashValue(body) });
}

export async function loadApprovalPolicy() {
  return validatePolicy(await readStablePolicy());
}

export function namedHumanApprovalRecordPath(order, attempt) {
  const base = safeRelativePath(order.executionPaths.reviewEvidencePath, "work-order review evidence path");
  assert(base.endsWith(".json"), "work-order review evidence path must end in .json.");
  return `${base.slice(0, -5)}-attempt-${String(attempt).padStart(2, "0")}-named-human-approval.json`;
}
