import { createHash } from "node:crypto";
import { types as utilTypes } from "node:util";

export const LAYERED_GODOT_REPOSITORY_REVIEW_PROTOCOL_VERSION = "2026-08-12.1";
export const LAYERED_GODOT_REPOSITORY_REVIEW_RECEIPT_KIND =
  "evavo.layered-production.godot-repository-review-receipt";
export const EXPECTED_HANDOFF_GATE_PROTOCOL_VERSION = "2026-08-13.1";
export const EXPECTED_HANDOFF_GATE_RECEIPT_KIND =
  "evavo.layered-production.godot-handoff-gate-receipt";
export const MAXIMUM_REVIEW_INPUT_BYTES = 32 * 1024 * 1024;

const MAXIMUM_SNAPSHOT_BYTES = MAXIMUM_REVIEW_INPUT_BYTES * 5 + 1024 * 1024;
const MAXIMUM_SNAPSHOT_NODES = 250_000;
const MAXIMUM_SNAPSHOT_DEPTH = 64;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;

const HANDOFF_RECEIPT_KEYS = [
  "schemaVersion",
  "kind",
  "protocolVersion",
  "requestSha256",
  "integrationSha256",
  "writeReceiptSha256",
  "auditReceiptSha256",
  "runtimeValidationSha256",
  "admissionAuditSha256",
  "currentAuditSha256",
  "target",
  "admission",
  "readiness",
  "gatedAt",
  "authority",
  "gateSha256",
];
const HANDOFF_TARGET_KEYS = ["expectedRepository", "workspaceRoot"];
const HANDOFF_ADMISSION_KEYS = [
  "immutableInputSnapshot",
  "exactAuditReceiptContract",
  "exactRuntimeReceiptContract",
  "unsupportedReceiptFieldsRejected",
  "targetStableAcrossGate",
];
const HANDOFF_READINESS_KEYS = [
  "repositoryReviewReady",
  "gitCommitAuthorized",
  "gitPushAuthorized",
  "requiresExplicitRepositoryReview",
  "requiresExplicitGitOperator",
];
const HANDOFF_AUTHORITY_KEYS = [
  "targetRepositoryReadPerformed",
  "targetRepositoryMutationPerformed",
  "godotExecutionPerformed",
  "runtimeActivationPerformed",
  "gitCommitCreated",
  "gitPushPerformed",
  "deploymentPerformed",
  "publicationPerformed",
  "forcePushPerformed",
];

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

function snapshotInputFail(label, message) {
  reviewFail("INPUT_INVALID", `${label} ${message}`);
}

function addSnapshotBytes(state, bytes, label) {
  state.bytes += bytes;
  if (state.bytes > MAXIMUM_SNAPSHOT_BYTES) {
    snapshotInputFail(label, "exceeds the bounded immutable-snapshot byte limit.");
  }
}

function addSnapshotNode(state, label, depth) {
  if (depth > MAXIMUM_SNAPSHOT_DEPTH) {
    snapshotInputFail(label, "exceeds the bounded immutable-snapshot depth.");
  }
  state.nodes += 1;
  if (state.nodes > MAXIMUM_SNAPSHOT_NODES) {
    snapshotInputFail(label, "exceeds the bounded immutable-snapshot node limit.");
  }
}

function inspectSnapshotObject(value, label) {
  if (utilTypes.isProxy(value)) {
    snapshotInputFail(label, "must not contain Proxy objects.");
  }
  try {
    return {
      isArray: Array.isArray(value),
      prototype: Object.getPrototypeOf(value),
      descriptors: Object.getOwnPropertyDescriptors(value),
    };
  } catch {
    snapshotInputFail(label, "could not be inspected safely.");
  }
}

function assertDataDescriptor(descriptor, label, { enumerable = true } = {}) {
  if (
    descriptor === undefined ||
    !Object.prototype.hasOwnProperty.call(descriptor, "value") ||
    descriptor.get !== undefined ||
    descriptor.set !== undefined ||
    descriptor.enumerable !== enumerable
  ) {
    snapshotInputFail(label, "must be an enumerable data property without accessors.");
  }
}

function snapshotJsonInternal(value, label, state, depth, ancestors) {
  addSnapshotNode(state, label, depth);

  if (value === null) {
    addSnapshotBytes(state, 4, label);
    return null;
  }

  switch (typeof value) {
    case "string":
      addSnapshotBytes(state, Buffer.byteLength(value, "utf8"), label);
      return value;
    case "boolean":
      addSnapshotBytes(state, value ? 4 : 5, label);
      return value;
    case "number":
      if (!Number.isFinite(value)) {
        snapshotInputFail(label, "contains a non-finite number.");
      }
      addSnapshotBytes(state, 24, label);
      return value;
    case "object":
      break;
    default:
      snapshotInputFail(label, "must contain JSON-compatible data only.");
  }

  if (ancestors.has(value)) {
    snapshotInputFail(label, "contains a cyclic object graph.");
  }
  ancestors.add(value);

  try {
    const inspected = inspectSnapshotObject(value, label);
    const descriptorKeys = Reflect.ownKeys(inspected.descriptors);

    if (inspected.isArray) {
      if (inspected.prototype !== Array.prototype) {
        snapshotInputFail(label, "must use the intrinsic Array prototype.");
      }
      const lengthDescriptor = inspected.descriptors.length;
      if (
        lengthDescriptor === undefined ||
        !Object.prototype.hasOwnProperty.call(lengthDescriptor, "value") ||
        !Number.isSafeInteger(lengthDescriptor.value) ||
        lengthDescriptor.value < 0 ||
        lengthDescriptor.value > MAXIMUM_SNAPSHOT_NODES
      ) {
        snapshotInputFail(label, "has an invalid bounded array length.");
      }
      const length = lengthDescriptor.value;
      if (descriptorKeys.length !== length + 1) {
        snapshotInputFail(label, "must be a dense array without extra properties.");
      }
      const snapshot = new Array(length);
      for (const key of descriptorKeys) {
        if (typeof key !== "string") {
          snapshotInputFail(label, "contains a symbolic array property.");
        }
        if (key === "length") continue;
        const index = Number(key);
        if (
          !Number.isSafeInteger(index) ||
          index < 0 ||
          index >= length ||
          String(index) !== key
        ) {
          snapshotInputFail(label, `contains unsupported array property ${key}.`);
        }
      }
      for (let index = 0; index < length; index += 1) {
        const descriptor = inspected.descriptors[String(index)];
        assertDataDescriptor(descriptor, `${label}[${index}]`);
        snapshot[index] = snapshotJsonInternal(
          descriptor.value,
          `${label}[${index}]`,
          state,
          depth + 1,
          ancestors,
        );
      }
      return Object.freeze(snapshot);
    }

    if (
      inspected.prototype !== Object.prototype &&
      inspected.prototype !== null
    ) {
      snapshotInputFail(label, "must use a plain JSON object prototype.");
    }

    const snapshot = {};
    for (const key of descriptorKeys) {
      if (typeof key !== "string") {
        snapshotInputFail(label, "contains a symbolic object property.");
      }
      const descriptor = inspected.descriptors[key];
      assertDataDescriptor(descriptor, `${label}.${key}`);
      addSnapshotBytes(state, Buffer.byteLength(key, "utf8"), label);
      Object.defineProperty(snapshot, key, {
        value: snapshotJsonInternal(
          descriptor.value,
          `${label}.${key}`,
          state,
          depth + 1,
          ancestors,
        ),
        enumerable: true,
        configurable: false,
        writable: false,
      });
    }
    return Object.freeze(snapshot);
  } finally {
    ancestors.delete(value);
  }
}

export function snapshotJsonValue(value, label = "repositoryReviewInput") {
  return snapshotJsonInternal(
    value,
    label,
    { bytes: 0, nodes: 0 },
    0,
    new WeakSet(),
  );
}

export function exactObject(value, keys, label, code = "INPUT_INVALID") {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    reviewFail(code, `${label} must be an object.`);
  }
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      reviewFail(code, `${label} contains unsupported field ${key}.`);
    }
  }
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      reviewFail(code, `${label} is missing required field ${key}.`);
    }
  }
  return value;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function record(value, label) {
  if (!isRecord(value)) reviewFail("INPUT_INVALID", `${label} must be an object.`);
  return value;
}

export function text(value, label, maximum = 4096, code = "INPUT_INVALID") {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximum ||
    value.includes("\0")
  ) {
    reviewFail(
      code,
      `${label} must be a non-empty string no longer than ${maximum} characters.`,
    );
  }
  return value;
}

export function sha256(value, label, code = "INPUT_INVALID") {
  const output = text(value, label, 64, code);
  if (!SHA256_PATTERN.test(output)) {
    reviewFail(code, `${label} must be lowercase SHA-256.`);
  }
  return output;
}

export function repositoryName(value, label, code = "INPUT_INVALID") {
  const output = text(value, label, 256, code);
  if (!REPOSITORY_PATTERN.test(output)) {
    reviewFail(code, `${label} must be OWNER/REPOSITORY.`);
  }
  return output;
}

function canonicalizeSnapshot(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((entry) => canonicalizeSnapshot(entry));
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalizeSnapshot(value[key])]),
  );
}

export function canonicalSha256(value) {
  const snapshot = snapshotJsonValue(value, "canonicalPayload");
  return createHash("sha256")
    .update(JSON.stringify(canonicalizeSnapshot(snapshot)), "utf8")
    .digest("hex");
}

function canonicalUtc(value, label, code) {
  const output = text(value, label, 64, code);
  const parsed = new Date(output);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== output) {
    reviewFail(code, `${label} must be canonical UTC ISO-8601.`);
  }
  return output;
}

function validateHandoffReceiptContract(receiptValue, label) {
  const code = "HANDOFF_INVALID";
  const receipt = exactObject(
    snapshotJsonValue(receiptValue, label),
    HANDOFF_RECEIPT_KEYS,
    label,
    code,
  );

  if (
    receipt.schemaVersion !== "1.0" ||
    receipt.kind !== EXPECTED_HANDOFF_GATE_RECEIPT_KIND ||
    receipt.protocolVersion !== EXPECTED_HANDOFF_GATE_PROTOCOL_VERSION
  ) {
    reviewFail(code, `${label} schema, kind or protocol is not current.`);
  }

  const gateSha256 = sha256(receipt.gateSha256, `${label}.gateSha256`, code);
  const { gateSha256: _discarded, ...payload } = receipt;
  if (canonicalSha256(payload) !== gateSha256) {
    reviewFail(code, `${label} self-hash is invalid.`);
  }

  for (const key of [
    "requestSha256",
    "integrationSha256",
    "writeReceiptSha256",
    "auditReceiptSha256",
    "runtimeValidationSha256",
    "admissionAuditSha256",
    "currentAuditSha256",
  ]) {
    sha256(receipt[key], `${label}.${key}`, code);
  }
  canonicalUtc(receipt.gatedAt, `${label}.gatedAt`, code);

  const target = exactObject(
    receipt.target,
    HANDOFF_TARGET_KEYS,
    `${label}.target`,
    code,
  );
  repositoryName(
    target.expectedRepository,
    `${label}.target.expectedRepository`,
    code,
  );
  text(target.workspaceRoot, `${label}.target.workspaceRoot`, 8192, code);

  const admission = exactObject(
    receipt.admission,
    HANDOFF_ADMISSION_KEYS,
    `${label}.admission`,
    code,
  );
  for (const key of HANDOFF_ADMISSION_KEYS) {
    if (admission[key] !== true) {
      reviewFail(code, `${label}.admission.${key} must be true.`);
    }
  }

  const readiness = exactObject(
    receipt.readiness,
    HANDOFF_READINESS_KEYS,
    `${label}.readiness`,
    code,
  );
  if (
    readiness.repositoryReviewReady !== true ||
    readiness.gitCommitAuthorized !== false ||
    readiness.gitPushAuthorized !== false ||
    readiness.requiresExplicitRepositoryReview !== true ||
    readiness.requiresExplicitGitOperator !== true
  ) {
    reviewFail(code, `${label} readiness boundary has drifted.`);
  }

  const authority = exactObject(
    receipt.authority,
    HANDOFF_AUTHORITY_KEYS,
    `${label}.authority`,
    code,
  );
  if (authority.targetRepositoryReadPerformed !== true) {
    reviewFail(
      code,
      `${label}.authority.targetRepositoryReadPerformed must be true.`,
    );
  }
  for (const key of HANDOFF_AUTHORITY_KEYS.slice(1)) {
    if (authority[key] !== false) {
      reviewFail(code, `${label}.authority.${key} must be false.`);
    }
  }

  return receipt;
}

export function validateSuppliedHandoffReceipt(
  receiptValue,
  repository,
  sameFilesystemPath,
  root,
  label = "handoffReceipt",
) {
  const receipt = validateHandoffReceiptContract(receiptValue, label);
  const target = receipt.target;
  if (
    repositoryName(
      target.expectedRepository,
      `${label}.target.expectedRepository`,
      "HANDOFF_INVALID",
    ).toLowerCase() !== repository.toLowerCase() ||
    !sameFilesystemPath(target.workspaceRoot, root.realPath)
  ) {
    reviewFail(
      "HANDOFF_INVALID",
      `${label} target does not match the selected repository root.`,
    );
  }
  return receipt;
}

export function semanticHandoff(value, label = "handoffReceipt") {
  const receipt = validateHandoffReceiptContract(value, label);
  const {
    gateSha256: _hash,
    gatedAt: _time,
    admissionAuditSha256: _admissionAudit,
    currentAuditSha256: _currentAudit,
    ...stable
  } = receipt;
  return stable;
}

export function assertHandoffStillCurrent(supplied, recomputed) {
  if (
    canonicalSha256(semanticHandoff(supplied, "suppliedHandoffReceipt")) !==
    canonicalSha256(semanticHandoff(recomputed, "currentHandoffReceipt"))
  ) {
    reviewFail(
      "HANDOFF_DRIFT",
      "Current handoff no longer matches the supplied promotion receipt.",
    );
  }
}
