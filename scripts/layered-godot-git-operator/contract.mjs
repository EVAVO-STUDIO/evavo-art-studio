import { createHash } from "node:crypto";

export const LAYERED_GODOT_GIT_OPERATOR_PROTOCOL_VERSION = "2026-08-13.1";
export const LAYERED_GODOT_GIT_COMMIT_RECEIPT_KIND =
  "evavo.layered-production.godot-git-commit-receipt";
export const EXPECTED_REPOSITORY_REVIEW_PROTOCOL_VERSION = "2026-08-12.1";
export const EXPECTED_REPOSITORY_REVIEW_RECEIPT_KIND =
  "evavo.layered-production.godot-repository-review-receipt";
export const MAXIMUM_OPERATOR_INPUT_BYTES = 64 * 1024 * 1024;
const MAXIMUM_SNAPSHOT_NODES = 250_000;
const MAXIMUM_SNAPSHOT_DEPTH = 64;
const SHA256 = /^[0-9a-f]{64}$/u;
const GIT_OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;
const BRANCH = /^(?!.*(?:\.\.|@\{|\\|\s|~|\^|:|\?|\*|\[))[A-Za-z0-9._/-]+$/u;

export class LayeredGodotGitOperatorError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "LayeredGodotGitOperatorError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export function operatorFail(code, message, details = undefined) {
  throw new LayeredGodotGitOperatorError(
    `LAYERED_GODOT_GIT_OPERATOR_${code}`,
    message,
    details,
  );
}

export function canonicalSha256(value) {
  return createHash("sha256").update(JSON.stringify(canonicalize(value)), "utf8").digest("hex");
}

function canonicalize(value, seen = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) operatorFail("INPUT_INVALID", "Canonical payload contains a non-finite number.");
    return value;
  }
  if (typeof value !== "object" || value === undefined || ArrayBuffer.isView(value)) {
    operatorFail("INPUT_INVALID", "Canonical payload contains a non-JSON value.");
  }
  if (seen.has(value)) operatorFail("INPUT_INVALID", "Canonical payload contains a cycle.");
  seen.add(value);
  let output;
  if (Array.isArray(value)) {
    output = value.map((entry) => canonicalize(entry, seen));
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      operatorFail("INPUT_INVALID", "Canonical payload contains a non-plain object.");
    }
    output = Object.fromEntries(Object.keys(value).sort().map((key) => {
      if (value[key] === undefined) operatorFail("INPUT_INVALID", `Canonical payload property ${key} is undefined.`);
      return [key, canonicalize(value[key], seen)];
    }));
  }
  seen.delete(value);
  return output;
}

function snapshotFail(label, message) {
  operatorFail("INPUT_INVALID", `${label} ${message}`);
}

function snapshotInternal(value, label, state, depth, ancestors) {
  if (depth > MAXIMUM_SNAPSHOT_DEPTH) snapshotFail(label, "exceeds the bounded snapshot depth.");
  state.nodes += 1;
  if (state.nodes > MAXIMUM_SNAPSHOT_NODES) snapshotFail(label, "exceeds the bounded snapshot node limit.");

  if (value === null || typeof value === "string" || typeof value === "boolean") {
    state.bytes += value === null ? 4 : Buffer.byteLength(String(value), "utf8");
    if (state.bytes > MAXIMUM_OPERATOR_INPUT_BYTES) snapshotFail(label, "exceeds the bounded snapshot byte limit.");
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) snapshotFail(label, "contains a non-finite number.");
    state.bytes += 24;
    if (state.bytes > MAXIMUM_OPERATOR_INPUT_BYTES) snapshotFail(label, "exceeds the bounded snapshot byte limit.");
    return value;
  }
  if (typeof value !== "object") snapshotFail(label, "must contain JSON-compatible data only.");
  if (ancestors.has(value)) snapshotFail(label, "contains a cyclic object graph.");
  ancestors.add(value);
  try {
    let descriptors;
    let prototype;
    let isArray;
    try {
      descriptors = Object.getOwnPropertyDescriptors(value);
      prototype = Object.getPrototypeOf(value);
      isArray = Array.isArray(value);
    } catch {
      snapshotFail(label, "could not be inspected safely.");
    }
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key !== "string")) snapshotFail(label, "contains a symbolic property.");

    if (isArray) {
      if (prototype !== Array.prototype) snapshotFail(label, "must use the intrinsic Array prototype.");
      const length = descriptors.length?.value;
      if (!Number.isSafeInteger(length) || length < 0 || keys.length !== length + 1) {
        snapshotFail(label, "must be a dense bounded array without extra properties.");
      }
      const output = new Array(length);
      for (let index = 0; index < length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !Object.hasOwn(descriptor, "value") || descriptor.get || descriptor.set || !descriptor.enumerable) {
          snapshotFail(`${label}[${index}]`, "must be an enumerable data property without accessors.");
        }
        output[index] = snapshotInternal(descriptor.value, `${label}[${index}]`, state, depth + 1, ancestors);
      }
      return Object.freeze(output);
    }

    if (prototype !== Object.prototype && prototype !== null) snapshotFail(label, "must use a plain JSON object prototype.");
    const output = {};
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (!Object.hasOwn(descriptor, "value") || descriptor.get || descriptor.set || !descriptor.enumerable) {
        snapshotFail(`${label}.${key}`, "must be an enumerable data property without accessors.");
      }
      state.bytes += Buffer.byteLength(key, "utf8");
      if (state.bytes > MAXIMUM_OPERATOR_INPUT_BYTES) snapshotFail(label, "exceeds the bounded snapshot byte limit.");
      Object.defineProperty(output, key, {
        value: snapshotInternal(descriptor.value, `${label}.${key}`, state, depth + 1, ancestors),
        enumerable: true,
        configurable: false,
        writable: false,
      });
    }
    return Object.freeze(output);
  } finally {
    ancestors.delete(value);
  }
}

export function snapshotJsonValue(value, label = "gitOperatorInput") {
  return snapshotInternal(value, label, { bytes: 0, nodes: 0 }, 0, new WeakSet());
}

export function exactObject(value, keys, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) operatorFail("INPUT_INVALID", `${label} must be an object.`);
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) if (!allowed.has(key)) operatorFail("INPUT_INVALID", `${label} contains unsupported field ${key}.`);
  for (const key of keys) if (!Object.hasOwn(value, key)) operatorFail("INPUT_INVALID", `${label} is missing required field ${key}.`);
  return value;
}

export function repositoryName(value, label) {
  if (typeof value !== "string" || !REPOSITORY.test(value)) operatorFail("INPUT_INVALID", `${label} must be OWNER/REPOSITORY.`);
  return value;
}

export function gitOid(value, label) {
  if (typeof value !== "string" || !GIT_OID.test(value)) operatorFail("INPUT_INVALID", `${label} must be a Git object ID.`);
  return value;
}

export function sha256(value, label) {
  if (typeof value !== "string" || !SHA256.test(value)) operatorFail("INPUT_INVALID", `${label} must be lowercase SHA-256.`);
  return value;
}

export function branchName(value, label) {
  if (typeof value !== "string" || value.length < 1 || value.length > 240 || !BRANCH.test(value) || value.startsWith("/") || value.endsWith("/") || value.endsWith(".")) {
    operatorFail("INPUT_INVALID", `${label} must be a bounded named Git branch.`);
  }
  return value;
}

export function commitMessage(value) {
  if (
    typeof value !== "string" || value.length < 1 || value.length > 160 ||
    value.includes("\0") || value.includes("\n") || value.includes("\r") ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) operatorFail("INPUT_INVALID", "commitMessage must be one bounded printable line.");
  return value;
}

function canonicalUtc(value, label) {
  if (typeof value !== "string" || value.length > 64) operatorFail("REVIEW_INVALID", `${label} must be canonical UTC ISO-8601.`);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) operatorFail("REVIEW_INVALID", `${label} must be canonical UTC ISO-8601.`);
}

export function validateReviewReceipt(value, repository, root, sameFilesystemPath) {
  const receipt = exactObject(value, [
    "schemaVersion", "kind", "protocolVersion", "requestSha256", "integrationSha256",
    "writeReceiptSha256", "handoffGateSha256", "target", "git", "workingTree",
    "readiness", "reviewedAt", "authority", "reviewSha256",
  ], "repositoryReviewReceipt");
  if (
    receipt.schemaVersion !== "1.0" ||
    receipt.kind !== EXPECTED_REPOSITORY_REVIEW_RECEIPT_KIND ||
    receipt.protocolVersion !== EXPECTED_REPOSITORY_REVIEW_PROTOCOL_VERSION
  ) operatorFail("REVIEW_INVALID", "Repository review schema, kind or protocol is not current.");
  sha256(receipt.reviewSha256, "repositoryReviewReceipt.reviewSha256");
  const { reviewSha256: _discard, ...payload } = receipt;
  if (canonicalSha256(payload) !== receipt.reviewSha256) operatorFail("REVIEW_INVALID", "Repository review self-hash is invalid.");
  for (const key of ["requestSha256", "integrationSha256", "writeReceiptSha256", "handoffGateSha256"]) sha256(receipt[key], `repositoryReviewReceipt.${key}`);
  canonicalUtc(receipt.reviewedAt, "repositoryReviewReceipt.reviewedAt");

  const target = exactObject(receipt.target, ["expectedRepository", "workspaceRoot"], "repositoryReviewReceipt.target");
  if (
    repositoryName(target.expectedRepository, "repositoryReviewReceipt.target.expectedRepository").toLowerCase() !== repository.toLowerCase() ||
    typeof target.workspaceRoot !== "string" || !sameFilesystemPath(target.workspaceRoot, root.realPath)
  ) operatorFail("REVIEW_INVALID", "Repository review target does not match the selected workspace.");

  const git = exactObject(receipt.git, [
    "version", "repositoryRoot", "objectFormat", "head", "branch", "originUrl",
    "originRepository", "attributesSha256", "snapshotSha256",
  ], "repositoryReviewReceipt.git");
  if (typeof git.version !== "string" || git.version.length > 128) operatorFail("REVIEW_INVALID", "Repository review Git version is invalid.");
  if (typeof git.repositoryRoot !== "string" || !sameFilesystemPath(git.repositoryRoot, root.realPath)) operatorFail("REVIEW_INVALID", "Repository review Git root drifted.");
  if (!["sha1", "sha256"].includes(git.objectFormat)) operatorFail("REVIEW_INVALID", "Repository review Git object format is invalid.");
  gitOid(git.head, "repositoryReviewReceipt.git.head");
  branchName(git.branch, "repositoryReviewReceipt.git.branch");
  if (typeof git.originUrl !== "string" || git.originUrl.length < 1 || git.originUrl.length > 2048) operatorFail("REVIEW_INVALID", "Repository review origin URL is invalid.");
  if (repositoryName(git.originRepository, "repositoryReviewReceipt.git.originRepository").toLowerCase() !== repository.toLowerCase()) operatorFail("REVIEW_INVALID", "Repository review origin repository is not selected repository.");
  sha256(git.attributesSha256, "repositoryReviewReceipt.git.attributesSha256");
  sha256(git.snapshotSha256, "repositoryReviewReceipt.git.snapshotSha256");

  const workingTree = exactObject(receipt.workingTree, [
    "stagedPaths", "modifiedExpectedPaths", "untrackedExpectedPaths", "unchangedExpectedPaths",
    "unrelatedPaths", "expectedResources", "changedExpectedResources",
  ], "repositoryReviewReceipt.workingTree");
  for (const key of ["stagedPaths", "modifiedExpectedPaths", "untrackedExpectedPaths", "unchangedExpectedPaths", "unrelatedPaths"]) {
    if (!Array.isArray(workingTree[key]) || workingTree[key].some((entry) => typeof entry !== "string")) operatorFail("REVIEW_INVALID", `repositoryReviewReceipt.workingTree.${key} must be a string array.`);
  }
  if (workingTree.stagedPaths.length !== 0 || workingTree.unrelatedPaths.length !== 0) operatorFail("REVIEW_INVALID", "Repository review must have an empty index and no unrelated paths.");
  const changed = workingTree.modifiedExpectedPaths.length + workingTree.untrackedExpectedPaths.length;
  if (workingTree.expectedResources !== 7 || workingTree.changedExpectedResources !== changed) operatorFail("REVIEW_INVALID", "Repository review working-tree totals are invalid.");
  const all = [...workingTree.modifiedExpectedPaths, ...workingTree.untrackedExpectedPaths, ...workingTree.unchangedExpectedPaths];
  if (all.length !== 7 || new Set(all).size !== 7) operatorFail("REVIEW_INVALID", "Repository review must classify exactly seven unique resources.");

  const readiness = exactObject(receipt.readiness, [
    "repositoryReviewPassed", "commitRequired", "commitCandidateReady", "alreadyIntegrated",
    "gitCommitAuthorized", "gitPushAuthorized", "requiresExplicitGitOperator",
  ], "repositoryReviewReceipt.readiness");
  if (
    readiness.repositoryReviewPassed !== true ||
    readiness.commitRequired !== (changed > 0) ||
    readiness.commitCandidateReady !== (changed > 0) ||
    readiness.alreadyIntegrated !== (changed === 0) ||
    readiness.gitCommitAuthorized !== false || readiness.gitPushAuthorized !== false ||
    readiness.requiresExplicitGitOperator !== true
  ) operatorFail("REVIEW_INVALID", "Repository review readiness boundary has drifted.");

  const authority = exactObject(receipt.authority, [
    "targetRepositoryReadPerformed", "targetRepositoryMutationPerformed", "gitReadCommandsPerformed",
    "gitIndexMutationPerformed", "gitHookExecutionPerformed", "gitCommitCreated", "gitPushPerformed",
    "deploymentPerformed", "publicationPerformed", "forcePushPerformed",
  ], "repositoryReviewReceipt.authority");
  if (
    authority.targetRepositoryReadPerformed !== true || authority.gitReadCommandsPerformed !== true ||
    ["targetRepositoryMutationPerformed", "gitIndexMutationPerformed", "gitHookExecutionPerformed",
      "gitCommitCreated", "gitPushPerformed", "deploymentPerformed", "publicationPerformed", "forcePushPerformed"]
      .some((key) => authority[key] !== false)
  ) operatorFail("REVIEW_INVALID", "Repository review authority boundary has drifted.");
  return receipt;
}

export function semanticReview(value) {
  const { reviewSha256: _hash, reviewedAt: _time, ...stable } = value;
  return stable;
}
