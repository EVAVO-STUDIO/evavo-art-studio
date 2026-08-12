import { createHash } from "node:crypto";
import path from "node:path";

export const LAYERED_GODOT_GIT_PUSH_OPERATOR_PROTOCOL_VERSION = "2026-08-13.1";
export const LAYERED_GODOT_GIT_PUSH_RECEIPT_KIND =
  "evavo.layered-production.godot-git-push-receipt";
export const EXPECTED_GIT_COMMIT_OPERATOR_PROTOCOL_VERSION = "2026-08-13.1";
export const EXPECTED_GIT_COMMIT_RECEIPT_KIND =
  "evavo.layered-production.godot-git-commit-receipt";
export const MAXIMUM_PUSH_INPUT_BYTES = 32 * 1024 * 1024;
const MAXIMUM_SNAPSHOT_NODES = 100_000;
const MAXIMUM_SNAPSHOT_DEPTH = 64;
const SHA256 = /^[0-9a-f]{64}$/u;
const GIT_OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;
const BRANCH = /^(?!.*(?:\.\.|@\{|\\|\s|~|\^|:|\?|\*|\[))[A-Za-z0-9._/-]+$/u;

export class LayeredGodotGitPushOperatorError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "LayeredGodotGitPushOperatorError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export function pushFail(code, message, details = undefined) {
  throw new LayeredGodotGitPushOperatorError(
    `LAYERED_GODOT_GIT_PUSH_${code}`,
    message,
    details,
  );
}

function canonicalize(value, seen = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) pushFail("INPUT_INVALID", "Canonical payload contains a non-finite number.");
    return value;
  }
  if (typeof value !== "object" || value === undefined || ArrayBuffer.isView(value)) {
    pushFail("INPUT_INVALID", "Canonical payload contains a non-JSON value.");
  }
  if (seen.has(value)) pushFail("INPUT_INVALID", "Canonical payload contains a cycle.");
  seen.add(value);
  let output;
  if (Array.isArray(value)) {
    output = value.map((entry) => canonicalize(entry, seen));
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      pushFail("INPUT_INVALID", "Canonical payload contains a non-plain object.");
    }
    output = Object.fromEntries(Object.keys(value).sort().map((key) => {
      if (value[key] === undefined) pushFail("INPUT_INVALID", `Canonical payload property ${key} is undefined.`);
      return [key, canonicalize(value[key], seen)];
    }));
  }
  seen.delete(value);
  return output;
}

export function canonicalSha256(value) {
  return createHash("sha256").update(JSON.stringify(canonicalize(value)), "utf8").digest("hex");
}

function snapshotFail(label, message) {
  pushFail("INPUT_INVALID", `${label} ${message}`);
}

function snapshotInternal(value, label, state, depth, ancestors) {
  if (depth > MAXIMUM_SNAPSHOT_DEPTH) snapshotFail(label, "exceeds the bounded snapshot depth.");
  state.nodes += 1;
  if (state.nodes > MAXIMUM_SNAPSHOT_NODES) snapshotFail(label, "exceeds the bounded snapshot node limit.");

  if (value === null || typeof value === "string" || typeof value === "boolean") {
    state.bytes += value === null ? 4 : Buffer.byteLength(String(value), "utf8");
    if (state.bytes > MAXIMUM_PUSH_INPUT_BYTES) snapshotFail(label, "exceeds the bounded snapshot byte limit.");
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) snapshotFail(label, "contains a non-finite number.");
    state.bytes += 24;
    if (state.bytes > MAXIMUM_PUSH_INPUT_BYTES) snapshotFail(label, "exceeds the bounded snapshot byte limit.");
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
      if (state.bytes > MAXIMUM_PUSH_INPUT_BYTES) snapshotFail(label, "exceeds the bounded snapshot byte limit.");
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

export function snapshotJsonValue(value, label = "gitPushInput") {
  return snapshotInternal(value, label, { bytes: 0, nodes: 0 }, 0, new WeakSet());
}

export function exactObject(value, keys, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) pushFail("INPUT_INVALID", `${label} must be an object.`);
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) if (!allowed.has(key)) pushFail("INPUT_INVALID", `${label} contains unsupported field ${key}.`);
  for (const key of keys) if (!Object.hasOwn(value, key)) pushFail("INPUT_INVALID", `${label} is missing required field ${key}.`);
  return value;
}

export function repositoryName(value, label) {
  if (typeof value !== "string" || !REPOSITORY.test(value)) pushFail("INPUT_INVALID", `${label} must be OWNER/REPOSITORY.`);
  return value;
}

export function gitOid(value, label) {
  if (typeof value !== "string" || !GIT_OID.test(value)) pushFail("INPUT_INVALID", `${label} must be a Git object ID.`);
  return value;
}

export function sha256(value, label) {
  if (typeof value !== "string" || !SHA256.test(value)) pushFail("INPUT_INVALID", `${label} must be lowercase SHA-256.`);
  return value;
}

export function branchName(value, label) {
  if (typeof value !== "string" || value.length < 1 || value.length > 240 || !BRANCH.test(value) || value.startsWith("/") || value.endsWith("/") || value.endsWith(".")) {
    pushFail("INPUT_INVALID", `${label} must be a bounded named Git branch.`);
  }
  return value;
}

export function relativePath(value, label) {
  if (
    typeof value !== "string" || value.length < 1 || value.length > 8192 ||
    value.includes("\\") || value.startsWith("/") || /^[A-Za-z]:\//u.test(value) ||
    path.posix.normalize(value) !== value || value.split("/").some((part) => part === "" || part === "." || part === "..")
  ) pushFail("INPUT_INVALID", `${label} must be a canonical repository-relative path.`);
  return value;
}

function boundedText(value, label, maximum = 4096) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || value.includes("\0")) {
    pushFail("INPUT_INVALID", `${label} must be bounded non-empty text.`);
  }
  return value;
}

function canonicalUtc(value, label) {
  const output = boundedText(value, label, 64);
  const parsed = new Date(output);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== output) pushFail("COMMIT_RECEIPT_INVALID", `${label} must be canonical UTC ISO-8601.`);
  return output;
}

function strictIsoInstant(value, label) {
  const output = boundedText(value, label, 64);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(output) || !Number.isFinite(Date.parse(output))) {
    pushFail("COMMIT_RECEIPT_INVALID", `${label} must be strict ISO-8601 instant text.`);
  }
  return output;
}

function exactPerson(value, label) {
  const person = exactObject(value, ["name", "email"], label);
  boundedText(person.name, `${label}.name`, 512);
  boundedText(person.email, `${label}.email`, 512);
  return person;
}

export function validateCommitReceipt(value, repository, root, sameFilesystemPath) {
  const receipt = exactObject(value, [
    "schemaVersion", "kind", "protocolVersion", "requestSha256", "integrationSha256",
    "writeReceiptSha256", "handoffGateSha256", "repositoryReviewSha256", "target",
    "reviewedGit", "outcome", "commitMessage", "stagedResources", "commit", "committedAt",
    "authority", "receiptSha256",
  ], "commitReceipt");
  if (
    receipt.schemaVersion !== "1.0" ||
    receipt.kind !== EXPECTED_GIT_COMMIT_RECEIPT_KIND ||
    receipt.protocolVersion !== EXPECTED_GIT_COMMIT_OPERATOR_PROTOCOL_VERSION
  ) pushFail("COMMIT_RECEIPT_INVALID", "Commit receipt schema, kind or protocol is not current.");
  sha256(receipt.receiptSha256, "commitReceipt.receiptSha256");
  const { receiptSha256: _discard, ...payload } = receipt;
  if (canonicalSha256(payload) !== receipt.receiptSha256) pushFail("COMMIT_RECEIPT_INVALID", "Commit receipt self-hash is invalid.");
  for (const key of ["requestSha256", "integrationSha256", "writeReceiptSha256", "handoffGateSha256", "repositoryReviewSha256"]) {
    sha256(receipt[key], `commitReceipt.${key}`);
  }
  const target = exactObject(receipt.target, ["expectedRepository", "workspaceRoot"], "commitReceipt.target");
  if (
    repositoryName(target.expectedRepository, "commitReceipt.target.expectedRepository").toLowerCase() !== repository.toLowerCase() ||
    typeof target.workspaceRoot !== "string" || !sameFilesystemPath(target.workspaceRoot, root.realPath)
  ) pushFail("COMMIT_RECEIPT_INVALID", "Commit receipt target does not match the selected repository workspace.");

  const reviewedGit = exactObject(receipt.reviewedGit, ["head", "branch", "originRepository", "snapshotSha256"], "commitReceipt.reviewedGit");
  gitOid(reviewedGit.head, "commitReceipt.reviewedGit.head");
  branchName(reviewedGit.branch, "commitReceipt.reviewedGit.branch");
  if (repositoryName(reviewedGit.originRepository, "commitReceipt.reviewedGit.originRepository").toLowerCase() !== repository.toLowerCase()) {
    pushFail("COMMIT_RECEIPT_INVALID", "Commit receipt reviewed origin does not match the selected repository.");
  }
  sha256(reviewedGit.snapshotSha256, "commitReceipt.reviewedGit.snapshotSha256");

  if (receipt.outcome !== "committed") pushFail("NO_COMMIT", "Only a verified committed outcome can enter the push boundary.");
  boundedText(receipt.commitMessage, "commitReceipt.commitMessage", 160);
  canonicalUtc(receipt.committedAt, "commitReceipt.committedAt");

  if (!Array.isArray(receipt.stagedResources) || receipt.stagedResources.length < 1 || receipt.stagedResources.length > 7) {
    pushFail("COMMIT_RECEIPT_INVALID", "Commit receipt must list one to seven staged resources.");
  }
  const paths = new Set();
  for (const [index, entryValue] of receipt.stagedResources.entries()) {
    const entry = exactObject(entryValue, ["path", "oid", "sha256", "bytes"], `commitReceipt.stagedResources[${index}]`);
    const resourcePath = relativePath(entry.path, `commitReceipt.stagedResources[${index}].path`);
    if (paths.has(resourcePath)) pushFail("COMMIT_RECEIPT_INVALID", `Commit receipt duplicates staged path ${resourcePath}.`);
    paths.add(resourcePath);
    gitOid(entry.oid, `commitReceipt.stagedResources[${index}].oid`);
    sha256(entry.sha256, `commitReceipt.stagedResources[${index}].sha256`);
    if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || entry.bytes > 16 * 1024 * 1024) {
      pushFail("COMMIT_RECEIPT_INVALID", `commitReceipt.stagedResources[${index}].bytes is invalid.`);
    }
  }

  const commit = exactObject(receipt.commit, ["commit", "parent", "tree", "branch", "author", "committer", "committedAt"], "commitReceipt.commit");
  gitOid(commit.commit, "commitReceipt.commit.commit");
  gitOid(commit.parent, "commitReceipt.commit.parent");
  gitOid(commit.tree, "commitReceipt.commit.tree");
  branchName(commit.branch, "commitReceipt.commit.branch");
  exactPerson(commit.author, "commitReceipt.commit.author");
  exactPerson(commit.committer, "commitReceipt.commit.committer");
  strictIsoInstant(commit.committedAt, "commitReceipt.commit.committedAt");
  if (commit.parent !== reviewedGit.head || commit.branch !== reviewedGit.branch) {
    pushFail("COMMIT_RECEIPT_INVALID", "Commit receipt child/branch binding does not match the reviewed Git state.");
  }

  const authority = exactObject(receipt.authority, [
    "targetRepositoryReadPerformed", "targetRepositoryWorkingTreeMutationPerformed",
    "gitObjectWritePerformed", "gitIndexMutationPerformed", "gitHookExecutionPerformed",
    "gitCommitCreated", "gitRefUpdated", "gitPushPerformed", "deploymentPerformed",
    "publicationPerformed", "forcePushPerformed",
  ], "commitReceipt.authority");
  if (
    authority.targetRepositoryReadPerformed !== true ||
    authority.gitObjectWritePerformed !== true || authority.gitIndexMutationPerformed !== true ||
    authority.gitCommitCreated !== true || authority.gitRefUpdated !== true ||
    ["targetRepositoryWorkingTreeMutationPerformed", "gitHookExecutionPerformed", "gitPushPerformed",
      "deploymentPerformed", "publicationPerformed", "forcePushPerformed"].some((key) => authority[key] !== false)
  ) pushFail("COMMIT_RECEIPT_INVALID", "Commit receipt authority boundary has drifted.");
  return receipt;
}
