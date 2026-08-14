import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export {
  SHA256,
  assert,
  boundedString,
  canonical,
  canonicalTimestamp,
  freeze,
  hashBytes,
  hashValue,
  masteringRecordPath,
  pathWithin,
  safeActorId,
  safeRelativePath,
  safeWorkspacePath,
  selfHashed,
  stableWorkspaceFile,
  stableWorkspaceJson,
  workspaceRoot,
} from "./frame-body-selected-candidate-mastering-common.mjs";

import {
  assert,
  freeze,
  hashValue,
  safeRelativePath,
} from "./frame-body-selected-candidate-mastering-common.mjs";

export const HMF_FRAME_BODY_MASTER_SIGNOFF_PLAN_SCHEMA =
  "evavo.heavy-metal-fighting-frame-body-master-signoff-plan.v1";
export const HMF_FRAME_BODY_MASTER_SIGNOFF_RECORD_SCHEMA =
  "evavo.heavy-metal-fighting-frame-body-master-signoff-record.v1";
export const HMF_FRAME_BODY_MASTER_SIGNOFF_RESULT_SCHEMA =
  "evavo.heavy-metal-fighting-frame-body-master-signoff-result.v1";
export const HMF_FRAME_BODY_MASTER_SIGNOFF_POLICY_SCHEMA =
  "evavo.heavy-metal-fighting-frame-body-master-signoff-policy.v1";
export const HMF_FRAME_BODY_MASTER_SIGNOFF_PROTOCOL_VERSION =
  "2026-08-14.1";

export const FORBIDDEN_MASTER_SIGNOFF_AUTHORITY_KEYS = Object.freeze([
  "providerExecution",
  "providerRetry",
  "candidateMutation",
  "masterMutation",
  "imageTransformation",
  "automaticSignoff",
  "gameRepositoryPromotion",
  "targetRepositoryMutation",
  "finalAtlasCompilation",
  "gitMutation",
  "deployment",
  "publication",
]);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const POLICY_PATH = path.join(
  ROOT,
  "config",
  "heavy-metal-fighting",
  "frame-body-master-signoff-policy.v1.json",
);

export function assertForbiddenMasterSignoffAuthorityFalse(
  authority,
  label,
  keys = FORBIDDEN_MASTER_SIGNOFF_AUTHORITY_KEYS,
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

async function readStableJson(filePath, label) {
  const before = await lstat(filePath);
  assert(
    before.isFile() && !before.isSymbolicLink(),
    `${label} must be a regular non-symlink file.`,
  );
  const bytes = await readFile(filePath);
  const after = await lstat(filePath);
  assert(
    before.dev === after.dev
      && before.ino === after.ino
      && before.size === after.size
      && before.mtimeMs === after.mtimeMs,
    `${label} changed while it was being read.`,
  );
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new Error(
      `HEAVY_METAL_FIGHTING_FRAME_BODY_MASTER_SIGNOFF_INVALID: ${label} is invalid UTF-8 JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function validatePolicy(raw) {
  assert(
    raw?.schema === HMF_FRAME_BODY_MASTER_SIGNOFF_POLICY_SCHEMA,
    "master signoff policy schema drifted.",
  );
  assert(
    raw.protocolVersion === HMF_FRAME_BODY_MASTER_SIGNOFF_PROTOCOL_VERSION,
    "master signoff policy protocol drifted.",
  );
  assert(
    raw.projectId === "heavy-metal-fighting" && raw.assetKind === "frame-body-cel",
    "master signoff policy identity drifted.",
  );
  const rules = raw.signoffRules ?? {};
  assert(
    rules.predecessorState === "mastered"
      && rules.receiptState === "named-human-approved",
    "master signoff lifecycle states drifted.",
  );
  assert(
    rules.requiredActorClass === "human" && rules.requiredDecision === "approved",
    "master signoff must remain an explicit named-human approved decision.",
  );
  assert(
    rules.masterPathMustMatchWorkOrder === true
      && rules.masterSha256MustMatchMasteringRecord === true
      && rules.masterBytesMustMatchMasteringRecord === true
      && rules.signoffRecordRequired === true,
    "master signoff evidence rules drifted.",
  );
  assert(
    Number.isInteger(rules.minimumRationaleCharacters)
      && rules.minimumRationaleCharacters >= 1
      && Number.isInteger(rules.maximumRationaleCharacters)
      && rules.maximumRationaleCharacters >= rules.minimumRationaleCharacters,
    "master signoff rationale bounds are invalid.",
  );
  assert(
    rules.nextLegalAction === "compile-delivery-readiness",
    "master signoff next legal action drifted.",
  );
  const authority = raw.authority ?? {};
  assert(
    authority.masterRead === true
      && authority.masteringRecordRead === true
      && authority.namedReviewerSignoffDecision === true
      && authority.signoffRecordPersistence === true
      && authority.receiptPersistence === true,
    "master signoff policy lost its bounded read, decision or persistence authority.",
  );
  assertForbiddenMasterSignoffAuthorityFalse(
    authority,
    "master signoff policy",
  );
  const body = structuredClone(raw);
  return freeze({ ...body, policySha256: hashValue(body) });
}

export async function loadMasterSignoffPolicy() {
  return validatePolicy(
    await readStableJson(
      POLICY_PATH,
      "HMF Frame body master signoff policy",
    ),
  );
}

export function masterSignoffRecordPath(order, attempt) {
  const base = safeRelativePath(
    order.executionPaths.reviewEvidencePath,
    "work-order review evidence path",
  );
  assert(base.endsWith(".json"), "work-order review evidence path must end in .json.");
  return `${base.slice(0, -5)}-attempt-${String(attempt).padStart(2, "0")}-named-reviewer-signoff.json`;
}
