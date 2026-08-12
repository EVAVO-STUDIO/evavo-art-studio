import { createHash } from "node:crypto";

export const LAYERED_GODOT_REPOSITORY_REVIEW_PROTOCOL_VERSION = "2026-08-12.1";
export const LAYERED_GODOT_REPOSITORY_REVIEW_RECEIPT_KIND =
  "evavo.layered-production.godot-repository-review-receipt";
export const EXPECTED_HANDOFF_GATE_PROTOCOL_VERSION = "2026-08-12.1";
export const EXPECTED_HANDOFF_GATE_RECEIPT_KIND =
  "evavo.layered-production.godot-handoff-gate-receipt";
export const MAXIMUM_REVIEW_INPUT_BYTES = 32 * 1024 * 1024;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;

export class LayeredGodotRepositoryReviewError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "LayeredGodotRepositoryReviewError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export function reviewFail(code, message, details = undefined) {
  throw new LayeredGodotRepositoryReviewError(
    `LAYERED_GODOT_REPOSITORY_REVIEW_${code}`,
    message,
    details,
  );
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function record(value, label) {
  if (!isRecord(value)) reviewFail("INPUT_INVALID", `${label} must be an object.`);
  return value;
}

export function text(value, label, maximum = 4096) {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum) {
    reviewFail(
      "INPUT_INVALID",
      `${label} must be a non-empty string no longer than ${maximum} characters.`,
    );
  }
  return value;
}

export function sha256(value, label) {
  const output = text(value, label, 64);
  if (!SHA256_PATTERN.test(output)) reviewFail("INPUT_INVALID", `${label} must be lowercase SHA-256.`);
  return output;
}

export function repositoryName(value, label) {
  const output = text(value, label, 256);
  if (!REPOSITORY_PATTERN.test(output)) reviewFail("INPUT_INVALID", `${label} must be OWNER/REPOSITORY.`);
  return output;
}

function canonicalize(value, seen = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) reviewFail("INPUT_INVALID", "Canonical payload contains a non-finite number.");
    return value;
  }
  if (typeof value !== "object" || value === undefined) reviewFail("INPUT_INVALID", "Canonical payload contains a non-JSON value.");
  if (seen.has(value)) reviewFail("INPUT_INVALID", "Canonical payload contains a cycle.");
  seen.add(value);
  let output;
  if (Array.isArray(value)) {
    output = value.map((entry) => canonicalize(entry, seen));
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) reviewFail("INPUT_INVALID", "Canonical payload contains a non-plain object.");
    output = Object.fromEntries(
      Object.keys(value).sort().map((key) => {
        if (value[key] === undefined) reviewFail("INPUT_INVALID", `Canonical payload property ${key} is undefined.`);
        return [key, canonicalize(value[key], seen)];
      }),
    );
  }
  seen.delete(value);
  return output;
}

export function canonicalSha256(value) {
  return createHash("sha256").update(JSON.stringify(canonicalize(value)), "utf8").digest("hex");
}

function canonicalUtc(value, label) {
  const output = text(value, label, 64);
  const parsed = new Date(output);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== output) reviewFail("INPUT_INVALID", `${label} must be canonical UTC ISO-8601.`);
  return output;
}

function assertFalseAuthority(authorityValue, label) {
  const authority = record(authorityValue, label);
  for (const key of [
    "targetRepositoryMutationPerformed",
    "godotExecutionPerformed",
    "runtimeActivationPerformed",
    "gitCommitCreated",
    "gitPushPerformed",
    "deploymentPerformed",
    "publicationPerformed",
    "forcePushPerformed",
  ]) {
    if (authority[key] !== false) reviewFail("HANDOFF_INVALID", `${label}.${key} must be false.`);
  }
  if (authority.targetRepositoryReadPerformed !== true) reviewFail("HANDOFF_INVALID", `${label}.targetRepositoryReadPerformed must be true.`);
}

export function validateSuppliedHandoffReceipt(receiptValue, repository, sameFilesystemPath, root) {
  const receipt = record(receiptValue, "handoffReceipt");
  if (
    receipt.schemaVersion !== "1.0" ||
    receipt.kind !== EXPECTED_HANDOFF_GATE_RECEIPT_KIND ||
    receipt.protocolVersion !== EXPECTED_HANDOFF_GATE_PROTOCOL_VERSION
  ) reviewFail("HANDOFF_INVALID", "Handoff receipt schema, kind or protocol is not current.");
  const gateSha256 = sha256(receipt.gateSha256, "handoffReceipt.gateSha256");
  const { gateSha256: _discarded, ...payload } = receipt;
  if (canonicalSha256(payload) !== gateSha256) reviewFail("HANDOFF_INVALID", "Handoff receipt self-hash is invalid.");
  for (const key of [
    "requestSha256", "integrationSha256", "writeReceiptSha256",
    "auditReceiptSha256", "runtimeValidationSha256", "currentAuditSha256",
  ]) sha256(receipt[key], `handoffReceipt.${key}`);
  canonicalUtc(receipt.gatedAt, "handoffReceipt.gatedAt");
  const target = record(receipt.target, "handoffReceipt.target");
  if (
    repositoryName(target.expectedRepository, "handoffReceipt.target.expectedRepository").toLowerCase() !== repository.toLowerCase() ||
    typeof target.workspaceRoot !== "string" ||
    !sameFilesystemPath(target.workspaceRoot, root.realPath)
  ) reviewFail("HANDOFF_INVALID", "Handoff receipt target does not match the selected repository root.");
  const readiness = record(receipt.readiness, "handoffReceipt.readiness");
  if (
    readiness.repositoryReviewReady !== true || readiness.gitCommitAuthorized !== false ||
    readiness.gitPushAuthorized !== false || readiness.requiresExplicitRepositoryReview !== true ||
    readiness.requiresExplicitGitOperator !== true
  ) reviewFail("HANDOFF_INVALID", "Handoff receipt readiness boundary has drifted.");
  assertFalseAuthority(receipt.authority, "handoffReceipt.authority");
  return receipt;
}

export function semanticHandoff(value) {
  const receipt = record(value, "handoffReceipt");
  const { gateSha256: _hash, gatedAt: _time, currentAuditSha256: _audit, ...stable } = receipt;
  return stable;
}

export function assertHandoffStillCurrent(supplied, recomputed) {
  if (canonicalSha256(semanticHandoff(supplied)) !== canonicalSha256(semanticHandoff(recomputed))) {
    reviewFail("HANDOFF_DRIFT", "Current handoff no longer matches the supplied promotion receipt.");
  }
}
